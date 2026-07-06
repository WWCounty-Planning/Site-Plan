// -----------------------------------------------------------------------------
// Shared 11x17 print engine for Site Plan Builder.
//   - It does not modify the runtime, tools, or existing UI modules.
//   - It only reads window.SitePlanRuntime + window.SitePlanConfig.
//   - It only handles ArcGIS extent math, offscreen map capture, scale math,
//     and small PDF delivery helpers.
//   - js/print/print-svg.js owns PDF assembly with jsPDF + svg2pdf.js.
//
// The active renderer logs each stage and returns a report object, so a real
// print run shows exactly where capture, layout, or PDF assembly failed.
//
// Exposes: window.SitePlanPrint = { run, _engine }
// -----------------------------------------------------------------------------
(function () {
  'use strict';

  const esriReady = new Promise((resolve, reject) => {
    if (typeof require !== 'function') {
      reject(new Error('ArcGIS AMD require() not available'));
      return;
    }
    require([
      'esri/Map',
      'esri/views/MapView',
      'esri/geometry/Extent',
      'esri/geometry/Point',
      'esri/core/reactiveUtils',
      'esri/geometry/projection',
      'esri/Graphic',
      'esri/layers/FeatureLayer',
      'esri/layers/GraphicsLayer',
      'esri/symbols/SimpleFillSymbol'
    ], function (EsriMap, MapView, Extent, Point, reactiveUtils, projection, Graphic, FeatureLayer, GraphicsLayer, SimpleFillSymbol) {
      resolve({ EsriMap, MapView, Extent, Point, reactiveUtils, projection, Graphic, FeatureLayer, GraphicsLayer, SimpleFillSymbol });
    }, reject);
  });

  // -----------------------------------------------------------------------------
  function RT() { return window.SitePlanRuntime; }
  function cfg() { return window.SitePlanConfig || {}; }
  function popupFields() { return (cfg().layers && cfg().layers.parcels && cfg().layers.parcels.popupFields) || {}; }
  function branding() { return cfg().branding || {}; }

  function extentToRing(e) {
    return [[e.xmin, e.ymin], [e.xmin, e.ymax], [e.xmax, e.ymax], [e.xmax, e.ymin], [e.xmin, e.ymin]];
  }

  // Safe maximum capture pixel side. 300 DPI on an 11x17 map frame is ~3600px;
  let _maxCaptureSide = 0;
  function maxCaptureSide() {
    if (_maxCaptureSide) return _maxCaptureSide;
    let maxTex = 4096;
    try {
      const cv = document.createElement('canvas');
      const gl = cv.getContext('webgl2') || cv.getContext('webgl');
      if (gl) { const m = gl.getParameter(gl.MAX_TEXTURE_SIZE); if (m) maxTex = m; }
    } catch (e) {}
    _maxCaptureSide = Math.max(1800, Math.min(5000, Math.floor(maxTex * 0.85)));
    return _maxCaptureSide;
  }

  // Build a download filename like SitePlan_360703120001_20260601.pdf
  function pdfFileName(meta, suffix) {
    const parcel = (meta && meta.parcelNumber ? String(meta.parcelNumber) : '').replace(/[^A-Za-z0-9_-]+/g, '');
    const d = new Date();
    const ymd = '' + d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
    return 'SitePlan_' + (parcel || 'plan') + '_' + ymd + (suffix ? '_' + suffix : '') + '.pdf';
  }

  // Export the PDF as a direct file download (no new tab / popup).
  function downloadPdf(bytes, fileName) {
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName || 'site-plan.pdf';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => { try { URL.revokeObjectURL(url); } catch (e) {} }, 4000);
    return fileName;
  }

  // -----------------------------------------------------------------------------
  // Handles: point geometries (no extent), support graphics, and empties.
  function computeDrawnExtent(opts, Extent) {
    const rt = RT();
    const graphics = (rt.drawLayer.graphics && rt.drawLayer.graphics.toArray)
      ? rt.drawLayer.graphics.toArray()
      : [];
    let ext = null;
    const points = [];
    let counted = 0, skippedSetback = 0, skippedAccess = 0, skippedSupport = 0;

    graphics.forEach(g => {
      const a = (g && g.attributes) || {};
      const toolType = a.toolType || g.__toolType || '';
      const category = a.sitePlanCategory || '';
      if (g.__nonSelectable) { skippedSupport++; return; }   // support/child graphics
      if (toolType === 'setback') { skippedSetback++; return; }
      if (opts.excludeAccess && category === 'access') { skippedAccess++; return; }
      const geom = g.geometry;
      if (!geom) return;
      if (geom.type === 'point') { points.push(geom); counted++; return; }
      const e = geom.extent;
      if (!e) return;
      ext = ext ? ext.union(e) : e.clone();
      counted++;
    });

    // Fold in lone points with a small padding so a points-only plan still frames.
    points.forEach(p => {
      const d = 8; // meters (view SR is Web Mercator)
      const pe = new Extent({
        xmin: p.x - d, xmax: p.x + d, ymin: p.y - d, ymax: p.y + d,
        spatialReference: p.spatialReference
      });
      ext = ext ? ext.union(pe) : pe;
    });

    return { extent: ext, stats: { counted, skippedSetback, skippedAccess, skippedSupport, total: graphics.length } };
  }

  // Grow an extent to a target aspect ratio (printedWidth/printedHeight), with margin.
  function fitExtentToAspect(ext, aspect, marginPct, Extent) {
    const cx = (ext.xmin + ext.xmax) / 2;
    const cy = (ext.ymin + ext.ymax) / 2;
    let w = ext.width * (1 + marginPct);
    let h = ext.height * (1 + marginPct);
    const MIN = 25; // meters - avoid degenerate frames (single point / tiny object)
    if (!(w > MIN)) w = MIN;
    if (!(h > MIN)) h = MIN;
    const cur = w / h;
    if (cur < aspect) w = h * aspect; else h = w / aspect;
    return new Extent({
      xmin: cx - w / 2, xmax: cx + w / 2, ymin: cy - h / 2, ymax: cy + h / 2,
      spatialReference: ext.spatialReference
    });
  }

  async function getParcelExtentInView(esri) {
    const rt = RT();
    const g = rt.activeParcelGeometry;
    if (!g) return null;
    const viewSR = rt.view.spatialReference;
    let geom = g;
    try {
      if (g.spatialReference && viewSR && !g.spatialReference.equals(viewSR)) {
        await esri.projection.load();
        geom = esri.projection.project(g, viewSR);
      }
    } catch (err) {
      console.warn('[print] parcel projection failed, using raw geometry extent', err);
    }
    return (geom && geom.extent) ? geom.extent.clone() : null;
  }

  function parcelAcres() {
    const pf = popupFields();
    const attrs = RT().activeParcelAttributes || {};
    const n = Number(attrs[pf.acreage]);
    return Number.isFinite(n) ? n : null;
  }

  function lonLatToWebMercator(lon, lat) {
    const R = 6378137;
    return { x: R * lon * Math.PI / 180, y: R * Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) };
  }

  const SECTIONS_LAYER_URL = 'https://services8.arcgis.com/COL6rRPkF9w28VGX/arcgis/rest/services/Sections/FeatureServer/0';

  // County locator: render the sections layer without a basemap and overlay a
  // fixed-size location rectangle at the parcel centroid.
  async function captureCountyLocator(esri, parcelExtViewSR, pxW, pxH) {
    try {
      return await captureSectionsLocator(esri, parcelExtViewSR, pxW, pxH);
    } catch (err) {
      console.warn('[print] clean county locator failed; falling back to basemap locator', err);
      return await captureBasemapCountyLocator(esri, parcelExtViewSR, pxW, pxH);
    }
  }

  async function captureSectionsLocator(esri, parcelExtViewSR, pxW, pxH) {
    const sectionsLayer = new esri.FeatureLayer({
      url: SECTIONS_LAYER_URL,
      popupEnabled: false,
      outFields: [],
      // Hollow fill: the print sheet shows the paper color through the grid,
      // so the locator reads as a bare county outline (no white tile).
      renderer: {
        type: 'simple',
        symbol: {
          type: 'simple-fill',
          color: [0, 0, 0, 0],
          outline: { type: 'simple-line', color: [0, 0, 0, 1], width: 0.55 }
        }
      }
    });
    await sectionsLayer.load();
    const countyExt = sectionsLayer.fullExtent && sectionsLayer.fullExtent.clone();
    if (!countyExt) throw new Error('Sections layer full extent unavailable');
    const fitted = fitExtentToAspect(countyExt, pxW / pxH, 0.04, esri.Extent);

    const markerLayer = new esri.GraphicsLayer({ listMode: 'hide' });
    const locatorMap = new esri.EsriMap({ basemap: null, layers: [sectionsLayer, markerLayer] });
    const container = document.createElement('div');
    container.style.cssText =
      'position:fixed;left:0;top:0;opacity:0;pointer-events:none;z-index:-1;' +
      'width:' + pxW + 'px;height:' + pxH + 'px;';
    document.body.appendChild(container);

    // NOTE: takeScreenshot cannot deliver a transparent background (with
    // alphaCompositingEnabled the screenshot comes back empty), so capture on
    // opaque white and key the white out afterwards via whiteToAlpha().
    const view = new esri.MapView({
      container,
      map: locatorMap,
      spatialReference: countyExt.spatialReference,
      ui: { components: [] },
      constraints: { snapToZoom: false },
      background: { color: [255, 255, 255, 1] }
    });

    try {
      await view.when();
      await addCountyLocationMarker(esri, markerLayer, countyExt, parcelExtViewSR);
      await view.goTo({ target: fitted }, { animate: false });
      const waitIdle = (ms) => Promise.race([
        esri.reactiveUtils.whenOnce(() => !view.updating),
        new Promise(r => setTimeout(r, ms))
      ]);
      await waitIdle(7000);
      await new Promise(r => setTimeout(r, 500));
      await waitIdle(2500);
      const shot = await view.takeScreenshot({ width: pxW, height: pxH, format: 'png' });
      return await whiteToAlpha(shot.dataUrl);
    } finally {
      try { view.map = null; } catch (e) {}
      try { view.container = null; } catch (e) {}
      try { view.destroy(); } catch (e) {}
      try { locatorMap.destroy(); } catch (e) {}
      try { container.remove(); } catch (e) {}
    }
  }

  function whiteToAlpha(dataUrl) {
    return new Promise(resolve => {
      const i = new Image();
      i.onload = () => {
        try {
          const cv = document.createElement('canvas');
          cv.width = i.width;
          cv.height = i.height;
          const ctx = cv.getContext('2d');
          ctx.drawImage(i, 0, 0);
          const id = ctx.getImageData(0, 0, cv.width, cv.height);
          const d = id.data;
          for (let p = 0; p < d.length; p += 4) {
            if (d[p] > 245 && d[p + 1] > 245 && d[p + 2] > 245) d[p + 3] = 0;
          }
          ctx.putImageData(id, 0, 0);
          resolve(cv.toDataURL('image/png'));
        } catch (e) {
          resolve(dataUrl);
        }
      };
      i.onerror = () => resolve(dataUrl);
      i.src = dataUrl;
    });
  }

  async function addCountyLocationMarker(esri, markerLayer, countyExt, parcelExtViewSR) {
    if (!parcelExtViewSR) return;
    let center = new esri.Point({
      x: (parcelExtViewSR.xmin + parcelExtViewSR.xmax) / 2,
      y: (parcelExtViewSR.ymin + parcelExtViewSR.ymax) / 2,
      spatialReference: parcelExtViewSR.spatialReference
    });
    try {
      if (center.spatialReference && countyExt.spatialReference && !center.spatialReference.equals(countyExt.spatialReference)) {
        await esri.projection.load();
        center = esri.projection.project(center, countyExt.spatialReference) || center;
      }
    } catch (err) {
      console.warn('[print] county locator marker projection failed', err);
    }
    if (!center || !Number.isFinite(center.x) || !Number.isFinite(center.y)) return;
    const markerSize = Math.max(countyExt.width, countyExt.height) * 0.045;
    const half = markerSize / 2;
    const ring = [
      [center.x - half, center.y - half],
      [center.x - half, center.y + half],
      [center.x + half, center.y + half],
      [center.x + half, center.y - half],
      [center.x - half, center.y - half]
    ];
    markerLayer.add(new esri.Graphic({
      geometry: { type: 'polygon', rings: [ring], spatialReference: countyExt.spatialReference },
      symbol: new esri.SimpleFillSymbol({
        color: [0, 195, 220, 0.12],
        outline: { color: [0, 195, 220, 1], width: 2.5 }
      })
    }));
  }

  async function captureBasemapCountyLocator(esri, parcelExtViewSR, pxW, pxH) {
    const cfg = window.SitePlanConfig || {};
    const ce = (cfg.map && cfg.map.extent) || { xmin: -118.64, ymin: 45.82, xmax: -117.88, ymax: 46.47 };
    const sw = lonLatToWebMercator(ce.xmin, ce.ymin);
    const ne = lonLatToWebMercator(ce.xmax, ce.ymax);
    const viewSR = RT().view.spatialReference;
    const countyExt = new esri.Extent({ xmin: sw.x, ymin: sw.y, xmax: ne.x, ymax: ne.y, spatialReference: viewSR });
    const fitted = fitExtentToAspect(countyExt, pxW / pxH, 0.05, esri.Extent);

    let tempLayer = null;
    if (parcelExtViewSR) {
      const cx = (parcelExtViewSR.xmin + parcelExtViewSR.xmax) / 2;
      const cy = (parcelExtViewSR.ymin + parcelExtViewSR.ymax) / 2;
      const half = countyExt.width / 26;  // fixed fraction of county width -> always visible
      const ring = [[cx - half, cy - half], [cx - half, cy + half], [cx + half, cy + half], [cx + half, cy - half], [cx - half, cy - half]];
      const box = new esri.Graphic({
        geometry: { type: 'polygon', rings: [ring], spatialReference: viewSR },
        symbol: new esri.SimpleFillSymbol({ color: [226, 88, 62, 0.18], outline: { color: [226, 88, 62, 1], width: 2.5 } })
      });
      tempLayer = new esri.GraphicsLayer({ listMode: 'hide' });
      tempLayer.add(box);
      RT().map.add(tempLayer);
    }
    try { return await captureExtent(esri, fitted, pxW, pxH, 'jpg'); }
    finally { if (tempLayer) { try { RT().map.remove(tempLayer); } catch (e) {} } }
  }

  function parcelField(logicalKey) {
    const pf = popupFields();
    const attrs = RT().activeParcelAttributes || {};
    const v = attrs[pf[logicalKey]];
    return (v == null || v === '') ? null : String(v);
  }

  // -----------------------------------------------------------------------------
  // Creates a temporary MapView that SHARES the live Map instance, drives it to
  // a specific extent, waits for it to settle, screenshots, then tears down the
  // view WITHOUT destroying the shared map.
  function activeBasemapId() {
    const rt = RT();
    const controls = rt && rt.basemapControls;
    if (controls && controls.activeBasemapId) return controls.activeBasemapId;
    const basemap = rt && rt.map && rt.map.basemap;
    if (typeof basemap === 'string') return basemap;
    return basemap && basemap.id ? basemap.id : null;
  }

  function printBasemapOverrideId() {
    const rt = RT();
    const controls = rt && rt.basemapControls;
    if (controls && typeof controls.isPrintBasemapSubstituted === 'function' &&
        typeof controls.getPrintBasemapId === 'function' &&
        controls.isPrintBasemapSubstituted()) {
      return controls.getPrintBasemapId();
    }
    const basemapId = activeBasemapId();
    return (basemapId === 'satellite' || basemapId === 'hybrid') ? 'gray-vector' : null;
  }

  function beginPrintBasemapOverride() {
    const rt = RT();
    const map = rt && rt.map;
    const overrideId = printBasemapOverrideId();
    if (!map || !overrideId) return function () {};
    const originalBasemap = map.basemap;
    try { map.basemap = overrideId; } catch (e) { return function () {}; }
    return function restorePrintBasemap() {
      try { map.basemap = originalBasemap; } catch (e) {}
    };
  }

  // -----------------------------------------------------------------------------
  // Print symbol scaling. Drawn symbols are authored in screen px (~96 DPI),
  function scaleCimNode(node, k) {
    if (Array.isArray(node)) { node.forEach(n => scaleCimNode(n, k)); return; }
    if (!node || typeof node !== 'object') return;
    switch (node.type) {
      case 'CIMSolidStroke':
        if (Number.isFinite(node.width)) node.width *= k;
        break;
      case 'CIMVectorMarker':
      case 'CIMCharacterMarker':
      case 'CIMPictureMarker':
        if (Number.isFinite(node.size)) node.size *= k;
        break;
      case 'CIMTextSymbol':
        if (Number.isFinite(node.height)) node.height *= k;
        if (Number.isFinite(node.haloSize)) node.haloSize *= k;
        break;
      case 'CIMMarkerPlacementAlongLineSameSize':
        if (Array.isArray(node.placementTemplate)) {
          node.placementTemplate = node.placementTemplate.map(v => (Number.isFinite(v) ? v * k : v));
        }
        break;
      case 'CIMGeometricEffectDashes':
        if (Array.isArray(node.dashTemplate)) {
          node.dashTemplate = node.dashTemplate.map(v => (Number.isFinite(v) ? v * k : v));
        }
        break;
    }
    Object.keys(node).forEach(key => {
      const v = node[key];
      if (v && typeof v === 'object') scaleCimNode(v, k);
    });
  }

  function scaledSymbolClone(symbol, k) {
    if (!symbol || typeof symbol.clone !== 'function') return null;
    let s;
    try { s = symbol.clone(); } catch (e) { return null; }
    switch (s.type) {
      case 'simple-line':
        if (Number.isFinite(s.width)) s.width *= k;
        break;
      case 'simple-marker':
        if (Number.isFinite(s.size)) s.size *= k;
        if (s.outline && Number.isFinite(s.outline.width)) s.outline.width *= k;
        if (Number.isFinite(s.xoffset)) s.xoffset *= k;
        if (Number.isFinite(s.yoffset)) s.yoffset *= k;
        break;
      case 'picture-marker':
        if (Number.isFinite(s.width)) s.width *= k;
        if (Number.isFinite(s.height)) s.height *= k;
        if (Number.isFinite(s.xoffset)) s.xoffset *= k;
        if (Number.isFinite(s.yoffset)) s.yoffset *= k;
        break;
      case 'simple-fill':
        if (s.outline && Number.isFinite(s.outline.width)) s.outline.width *= k;
        break;
      case 'picture-fill':
        if (Number.isFinite(s.width)) s.width *= k;
        if (Number.isFinite(s.height)) s.height *= k;
        break;
      case 'text':
        if (s.font && Number.isFinite(s.font.size)) s.font.size *= k;
        if (Number.isFinite(s.haloSize)) s.haloSize *= k;
        if (Number.isFinite(s.xoffset)) s.xoffset *= k;
        if (Number.isFinite(s.yoffset)) s.yoffset *= k;
        break;
      case 'cim':
        if (s.data) scaleCimNode(s.data, k);
        break;
      default:
        return null;
    }
    return s;
  }

  // `factor` is either a number applied to every graphic, or a policy function
  function beginPrintSymbolScale(factor) {
    if (typeof factor !== 'function') {
      const k = Number(factor);
      // No-op within 1% of 1 (or invalid) - nothing to scale, nothing to restore.
      if (!Number.isFinite(k) || k <= 0 || Math.abs(k - 1) < 0.01) return function () {};
    }
    const factorFor = typeof factor === 'function' ? factor : function () { return factor; };
    const rt = RT();
    const layers = [rt && rt.drawLayer, rt && rt.labelLayer].filter(Boolean);
    const originals = [];
    layers.forEach(layer => {
      const graphics = (layer.graphics && layer.graphics.toArray) ? layer.graphics.toArray() : [];
      graphics.forEach(g => {
        if (!g || !g.symbol) return;
        let k = NaN;
        try { k = Number(factorFor(g, g.symbol)); } catch (e) {}
        if (!Number.isFinite(k) || k <= 0 || Math.abs(k - 1) < 0.01) return;
        const scaled = scaledSymbolClone(g.symbol, k);
        if (!scaled) return;
        originals.push({ graphic: g, symbol: g.symbol });
        g.symbol = scaled;
      });
    });
    return function restorePrintSymbolScale() {
      originals.forEach(entry => {
        try { entry.graphic.symbol = entry.symbol; } catch (e) {}
      });
    };
  }

  async function captureExtent(esri, extent, pxW, pxH, format) {
    const restorePrintBasemap = beginPrintBasemapOverride();
    const container = document.createElement('div');
    // Rendered but invisible. NOTE: opacity:0 still renders WebGL in current
    // browsers; if a browser throttles offscreen rAF this is a suspect.
    container.style.cssText =
      'position:fixed;left:0;top:0;opacity:0;pointer-events:none;z-index:-1;' +
      'width:' + pxW + 'px;height:' + pxH + 'px;';
    document.body.appendChild(container);

    let v = null;
    try {
      v = new esri.MapView({
        container,
        map: RT().map,                 // shared live map -> same basemap + drawLayer
        ui: { components: [] },
        constraints: { snapToZoom: false }
      });
      await v.when();
      await v.goTo({ target: extent }, { animate: false });
      // An offscreen view's `updating` flag can stay `true` forever
      // (tile/layerview updates never "settle" for a non-composited surface), so
      // an unbounded whenOnce(() => !v.updating) HANGS. Bound every idle-wait with
      // a timeout - takeScreenshot works even mid-update, so the worst case is a
      // slightly-less-loaded tile set, which the settle delay mitigates.
      const waitIdle = (ms) => Promise.race([
        esri.reactiveUtils.whenOnce(() => !v.updating),
        new Promise(r => setTimeout(r, ms))
      ]);
      await waitIdle(7000);
      await new Promise(r => setTimeout(r, 400));
      await waitIdle(2500);
      const fmt = format === 'jpg' || format === 'jpeg' ? 'jpg' : 'png';
      const opts = { width: pxW, height: pxH, format: fmt };
      if (fmt === 'jpg') opts.quality = 82;
      const shot = await v.takeScreenshot(opts);
      return shot.dataUrl;
    } finally {
      // Detach the shared map BEFORE destroy so we never tear down RT().map.
      if (v) {
        try { v.map = null; } catch (e) {}
        try { v.container = null; } catch (e) {}
        try { v.destroy(); } catch (e) {}
      }
      try { container.remove(); } catch (e) {}
      restorePrintBasemap();
    }
  }

  // Capture an inset at parcelExt with a box for mainExt drawn on a temporary layer.
  async function captureInset(esri, parcelExt, mainExt, pxW, pxH, format) {
    const ring = extentToRing(mainExt);
    const box = new esri.Graphic({
      geometry: { type: 'polygon', rings: [ring], spatialReference: mainExt.spatialReference },
      symbol: new esri.SimpleFillSymbol({
        color: [240, 102, 13, 0.10],
        outline: { color: [240, 102, 13, 1], width: 2 }
      })
    });
    const tempLayer = new esri.GraphicsLayer({ listMode: 'hide' });
    tempLayer.add(box);
    RT().map.add(tempLayer);
    try {
      const fitted = fitExtentToAspect(parcelExt, pxW / pxH, 0.18, esri.Extent);
      return await captureExtent(esri, fitted, pxW, pxH, format);
    } finally {
      try { RT().map.remove(tempLayer); } catch (e) {}
    }
  }

  // Web Mercator ground units are inflated by ~1/cos(latitude). At ~46 deg N that's ~1.44x.
  function groundFeetAcross(extent) {
    const geometryEngine = RT().geometryEngine;
    const midY = (extent.ymin + extent.ymax) / 2;
    const line = {
      type: 'polyline',
      spatialReference: extent.spatialReference,
      paths: [[[extent.xmin, midY], [extent.xmax, midY]]]
    };
    try {
      const ft = geometryEngine.geodesicLength(line, 'feet');
      if (Number.isFinite(ft) && ft > 0) return ft;
    } catch (err) {
      console.warn('[print] geodesicLength failed; falling back to planar width', err);
    }
    // Fallback: planar width in meters -> feet (will be ~44% too large at 46 deg N).
    return extent.width * 3.28084;
  }

  function run(options) {
    if (window.SitePlanPrintSVG && typeof window.SitePlanPrintSVG.run === 'function') {
      return window.SitePlanPrintSVG.run(options || {});
    }
    return Promise.reject(new Error('SitePlanPrintSVG not ready - load js/print/print-svg.js after print-core.js'));
  }
  window.SitePlanPrint = {
    run,
    // Shared engine surface for the jsPDF + svg2pdf renderer.
    _engine: {
      esriReady,
      branding, popupFields,
      computeDrawnExtent, fitExtentToAspect, getParcelExtentInView,
      parcelAcres, parcelField,
      captureExtent, captureInset, captureCountyLocator, groundFeetAcross,
      beginPrintSymbolScale,
      maxCaptureSide,
      pdfFileName, downloadPdf
    }
  };
})();


