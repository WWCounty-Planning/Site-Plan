// Setback measurement tool. Uses js/utils/polyline-tool.js

(function () {
  if (!window.SitePlanRuntimeReady) {
    console.error('[setback] window.SitePlanRuntimeReady is missing.');
    return;
  }
  if (!window.SitePlanStructuresShared) {
    console.error('[setback] SitePlanStructuresShared is missing.');
    return;
  }
  if (!window.SitePlanPolylineTool) {
    console.error('[setback] SitePlanPolylineTool is missing. ' +
      'Make sure js/utils/polyline-tool.js is loaded before setback.js.');
    return;
  }

  window.SitePlanRuntimeReady.then(RT => {
    const SS = window.SitePlanStructuresShared;
    const SH = window.SitePlanPolylineTool.snap;

    const TOOL_ID   = 'setback';
    const BUTTON_ID = 'btn-setback-measurement';

    const EDGE_TOLERANCE_PX     = 10;
    const ENDPOINT_TOLERANCE_PX = 12;

    const TOOL_CAPABILITIES = {
      reshape: true, resize: false, rotate: false,
      label: false, duplicate: true, delete: true
    };

    // ── Symbols ───────────────────────────────────────────────────────────
    function symbol() {
      return {
        type: 'simple-line', color: [44, 53, 57, 1], width: 2, style: 'short-dash',
        marker: { style: 'arrow', placement: 'begin-end', color: [44, 53, 57, 1] }
      };
    }
    function previewSymbol() {
      return { type: 'simple-line', color: [0, 0, 0, 0.45], width: 1.5, style: 'short-dash' };
    }
    function floatingPointSymbol() {
      return { type: 'simple-marker', style: 'circle', color: [0, 0, 0, 0.75], size: 7,
               outline: { type: 'simple-line', color: [255, 255, 255, 1], width: 1.2 } };
    }
    function snapPointSymbol() {
      return { type: 'simple-marker', style: 'circle', color: [247, 148, 30, 1], size: 9,
               outline: { type: 'simple-line', color: [255, 255, 255, 1], width: 1.2 } };
    }
    function labelSymbol() {
      return {
        type: 'text', text: '', color: [0, 0, 0, 1],
        haloColor: [255, 255, 255, 0.95], haloSize: 2, yoffset: -10,
        font: { family: 'Arial', size: 9 }
      };
    }

    // ── Icon ──────────────────────────────────────────────────────────────
    const setbackIcon =
      '<svg viewBox="0 0 36 22" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">' +
        '<path d="M 5 11 L 11.2 8.4 Q 9.8 11 11.2 13.6 Z" fill="#2C3539"/>' +
        '<path d="M 31 11 L 24.8 8.4 Q 26.2 11 24.8 13.6 Z" fill="#2C3539"/>' +
        '<g fill="none" stroke="#2C3539" stroke-width="2" stroke-linecap="butt">' +
          '<line x1="10.3" y1="11" x2="13.6" y2="11"/>' +
          '<line x1="15.2" y1="11" x2="20.8" y2="11"/>' +
          '<line x1="22.4" y1="11" x2="25.7" y2="11"/>' +
        '</g>' +
      '</svg>';

    // ── Snap candidate sources ────────────────────────────────────────────
    function layerGraphics(layer) {
      if (!layer || !layer.graphics) return [];
      return layer.graphics.toArray ? layer.graphics.toArray() : [];
    }

    function snapCandidatePolygons() {
      return [
        ...layerGraphics(RT.drawLayer).filter(g =>
          g.geometry && g.geometry.type === 'polygon' && !g.__nonSelectable),
        ...layerGraphics(RT.highlightLayer).filter(g =>
          g.geometry && g.geometry.type === 'polygon')
      ];
    }

    function existingSetbackLines() {
      return layerGraphics(RT.drawLayer).filter(g =>
        g.__toolType === TOOL_ID && g.geometry && g.geometry.type === 'polyline');
    }

    // ── Snap function ─────────────────────────────────────────────────────
    const getSnapPoint = SH.createResolver(RT, [
      { mode: 'edge',     tolerancePx: EDGE_TOLERANCE_PX, candidates: snapCandidatePolygons },
      { mode: 'endpoint', tolerancePx: ENDPOINT_TOLERANCE_PX, candidates: existingSetbackLines }
    ]);

    // ── Geometry normalization (keep exactly two endpoints) ───────────────
    function normalizeSetbackGeometry(graphic) {
      if (!graphic || !graphic.geometry || graphic.geometry.type !== 'polyline') return;
      const paths = graphic.geometry.paths;
      if (!paths || !paths.length) return;
      const path = paths.find(p => p && p.length >= 2) || paths[0];
      if (!path || path.length < 2) return;
      const first = path[0];
      let last = null;
      for (let i = path.length - 1; i >= 0; i--) {
        const c = path[i];
        if (c && (c[0] !== first[0] || c[1] !== first[1])) { last = c; break; }
      }
      if (!last) return;
      const sr = drawing.spatialReferenceJSON(graphic.geometry.spatialReference);
      try {
        if (graphic.geometry.constructor && graphic.geometry.constructor.fromJSON) {
          graphic.geometry = graphic.geometry.constructor.fromJSON(
            { type: 'polyline', paths: [[first, last]], spatialReference: sr });
          return;
        }
      } catch (e) {}
      graphic.geometry = { type: 'polyline', paths: [[first, last]], spatialReference: sr };
    }

    // ── Edit-time endpoint snapping ───────────────────────────────────────
    function onSketchUpdate(graphic, event) {
      if (event.state !== 'complete') return;
      const geom = graphic.geometry;
      if (!geom || !geom.paths || !geom.paths.length) return;
      const path = (geom.paths[0] || []).map(pt => pt.slice ? pt.slice() : [pt[0], pt[1]]);
      if (path.length < 2) return;
      const sr = geom.spatialReference;
      let changed = false;
      [0, path.length - 1].forEach(idx => {
        const mp = { type: 'point', x: path[idx][0], y: path[idx][1],
                     spatialReference: drawing.spatialReferenceJSON(sr) };
        const snap = getSnapPoint(mp);
        if (snap.snapped) { path[idx] = [snap.point.x, snap.point.y]; changed = true; }
      });
      if (changed) graphic.geometry = { type: 'polyline', paths: [path],
                                        spatialReference: drawing.spatialReferenceJSON(sr) };
      normalizeSetbackGeometry(graphic);
    }

    // ── Drawing factory ───────────────────────────────────────────────────
    const drawing = window.SitePlanPolylineTool.create({
      RT, toolId: TOOL_ID, buttonId: BUTTON_ID,
      category: 'structure', label: 'Setback', idPrefix: 'setback',
      order: 30,
      iconHtml:    setbackIcon,
      iconClass:   'icon-setback dm-line36',
      buttonTitle: 'Draw a setback. Snaps to structure corners, edges, and parcel boundary.',
      toolCapabilities: TOOL_CAPABILITIES,

      symbol, previewSymbol, floatingPointSymbol,
      snapPointSymbol, getSnapPoint,

      showLengthLabel: true,
      labelSymbol,

      applyExtraMetadata: graphic => {
        graphic.__allowResize       = false;
        graphic.__allowLabel        = false;
        graphic.__preferredEditMode = 'reshape';
        graphic.attributes = Object.assign({}, graphic.attributes || {}, {
          preferredEditMode: 'reshape', allowResize: false, allowLabel: false
        });
        SS.applyToolCapabilities(RT, graphic, TOOL_CAPABILITIES);
      },

      onAnnounce:      ()  => SS.announceToolActivated(TOOL_ID),
      onCancelOthers:  ()  => { SS.cancelAllExcept(TOOL_ID); SS.clearActiveAllExcept(TOOL_ID); },
      onAfterCommit:   g   => normalizeSetbackGeometry(g),
      onSketchUpdate,

      onGraphicUpdated: (graphic, event) => {
        const state = event && event.state;
        if (state === 'complete' || state === 'cancel') normalizeSetbackGeometry(graphic);
      }
    });

    // ── Registration ──────────────────────────────────────────────────────
    const setbackTool = drawing;

    SS.registerTool(setbackTool);
    window.startSetbackTool    = drawing.start;
    window.SitePlanSetbackTool = setbackTool;

  }).catch(err => {
    console.error('[setback] Failed to initialize after runtime ready:', err);
  });
}());
