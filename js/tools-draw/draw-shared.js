// Shared registry/helpers for the Draw Tools family.

(function () {
  const root = window;
  const existing = root.SitePlanDrawShared || {};

  const shared = existing;
  shared.sectionId = shared.sectionId || 'tools-draw';
  shared.source = shared.source || 'tools-draw';
  shared.tools = shared.tools || {};

  shared.sectionEl = shared.sectionEl || function sectionEl() {
    return document.getElementById(shared.sectionId);
  };

  // Encode an inline SVG string as a data URL for picture-fill / picture-marker.
  shared.svgDataUrl = shared.svgDataUrl || function svgDataUrl(svg) {
    return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg);
  };

  shared.registerTool = function registerTool(tool) {
    if (!tool || !tool.id) return null;
    shared.tools[tool.id] = Object.assign({}, shared.tools[tool.id] || {}, tool);
    return shared.tools[tool.id];
  };

  shared.getTool = function getTool(id) {
    return id ? (shared.tools && shared.tools[id]) || null : null;
  };

  shared.getTools = function getTools() {
    return Object.values(shared.tools || {}).sort((a, b) => {
      const ao = Number.isFinite(a.order) ? a.order : 0;
      const bo = Number.isFinite(b.order) ? b.order : 0;
      if (ao !== bo) return ao - bo;
      return String(a.id || '').localeCompare(String(b.id || ''));
    });
  };


  shared.getToolElements = function getToolElements(tool) {
    if (!tool) return [];
    let elements = [];
    if (typeof tool.getElements === 'function') {
      try { elements = tool.getElements() || []; }
      catch (err) { console.warn('[tools-draw/draw-shared] getElements failed for', tool.id, err); }
    }
    return (Array.isArray(elements) ? elements : [elements]).filter(Boolean);
  };

  shared.cancelAllExcept = function cancelAllExcept(activeId) {
    shared.getTools().forEach(tool => {
      if (!tool || tool.id === activeId || typeof tool.cancel !== 'function') return;
      try { tool.cancel(false); }
      catch (err) { console.warn('[tools-draw/draw-shared] cancel failed for', tool.id, err); }
    });
  };

  shared.clearActiveAllExcept = function clearActiveAllExcept(activeId) {
    shared.getTools().forEach(tool => {
      if (!tool || tool.id === activeId || typeof tool.clearActive !== 'function') return;
      try { tool.clearActive(); }
      catch (err) { console.warn('[tools-draw/draw-shared] clearActive failed for', tool.id, err); }
    });
  };

  shared.announceToolActivated = function announceToolActivated(toolId, detail) {
    try {
      root.dispatchEvent(new CustomEvent('siteplan:tool-activated', {
        detail: Object.assign({ source: shared.source, tool: toolId || null }, detail || {})
      }));
    } catch (err) {}
  };

  shared.buildToolButton = function buildToolButton(options) {
    const opts = options || {};
    const btn = document.createElement('button');
    btn.type = 'button';
    if (opts.id) btn.id = opts.id;
    btn.className = opts.className || 'tool-btn draw-tool-btn icon-btn';
    btn.title = opts.title || opts.label || '';
    btn.innerHTML = '<span class="tool-icon ' + (opts.iconClass || '') + '">' +
      (opts.icon || '') +
      '</span><span class="tool-label">' + (opts.label || '') + '</span>';
    if (typeof opts.onClick === 'function') btn.addEventListener('click', opts.onClick);
    return btn;
  };

  shared.applyToolCapabilities = function applyToolCapabilities(RT, graphic, capabilities) {
    if (!graphic) return graphic;
    const caps = Object.assign({}, capabilities || {});
    if (RT && typeof RT.setGraphicCapabilities === 'function') {
      RT.setGraphicCapabilities(graphic, caps);
    } else {
      graphic.__toolCapabilities = caps;
      graphic.attributes = Object.assign({}, graphic.attributes || {}, { toolCapabilities: caps });
    }
    return graphic;
  };

  shared.graphicsInLayer = function graphicsInLayer(layer) {
    return layer && layer.graphics && typeof layer.graphics.toArray === 'function'
      ? layer.graphics.toArray()
      : [];
  };

  shared.clonePoint = function clonePoint(point) {
    if (!point) return null;
    if (typeof point.clone === 'function') return point.clone();
    return {
      type: 'point',
      x: point.x,
      y: point.y,
      spatialReference: point.spatialReference
    };
  };

  shared.pointFromXY = function pointFromXY(x, y, spatialReference, RT) {
    return {
      type: 'point',
      x,
      y,
      spatialReference: spatialReference || (RT && RT.view && RT.view.spatialReference)
    };
  };

  shared.webMercatorLatRadiansFromY = shared.webMercatorLatRadiansFromY || function webMercatorLatRadiansFromY(y) {
    const radius = 6378137;
    return (2 * Math.atan(Math.exp(y / radius))) - (Math.PI / 2);
  };

  shared.feetToLocalMapUnits = shared.feetToLocalMapUnits || function feetToLocalMapUnits(feet, center, spatialReference) {
    const meters = Number(feet || 0) * 0.3048;
    const sr = spatialReference || (center && center.spatialReference);
    const wkid = sr && (sr.wkid || sr.latestWkid);

    if (wkid === 3857 || wkid === 102100 || wkid === 102113) {
      const latRad = shared.webMercatorLatRadiansFromY(center && Number.isFinite(center.y) ? center.y : 0);
      const cosLat = Math.max(Math.abs(Math.cos(latRad)), 0.2);
      return meters / cosLat;
    }

    if (wkid === 4326 || (sr && sr.isGeographic)) {
      const latRad = ((center && center.y) || 0) * Math.PI / 180;
      const feetPerDegreeLat = 364000;
      const feetPerDegreeLon = Math.max(feetPerDegreeLat * Math.cos(latRad), 1);
      return {
        dx: feet / feetPerDegreeLon,
        dy: feet / feetPerDegreeLat
      };
    }

    return meters;
  };

  shared.makeRectangleGeometryFromCenter = shared.makeRectangleGeometryFromCenter || function makeRectangleGeometryFromCenter(center, lengthFt, widthFt, RT) {
    if (!center) return null;
    const sr = center.spatialReference || (RT && RT.view && RT.view.spatialReference);
    const lengthUnits = shared.feetToLocalMapUnits(lengthFt, center, sr);
    const widthUnits = shared.feetToLocalMapUnits(widthFt, center, sr);
    const halfX = (typeof lengthUnits === 'object' ? lengthUnits.dx : lengthUnits) / 2;
    const halfY = (typeof widthUnits === 'object' ? widthUnits.dy : widthUnits) / 2;

    return {
      type: 'polygon',
      rings: [[
        [center.x - halfX, center.y - halfY],
        [center.x + halfX, center.y - halfY],
        [center.x + halfX, center.y + halfY],
        [center.x - halfX, center.y + halfY],
        [center.x - halfX, center.y - halfY]
      ]],
      spatialReference: sr && sr.toJSON ? sr.toJSON() : sr
    };
  };


  shared.lineToolCapabilities = shared.lineToolCapabilities || function lineToolCapabilities() {
    return {
      reshape: true,
      resize: false,
      rotate: false,
      label: false,
      duplicate: true,
      delete: true
    };
  };

  shared.assignGraphicUid = shared.assignGraphicUid || function assignGraphicUid(graphic, propertyName, prefix) {
    if (!graphic) return null;
    const prop = propertyName || '__sitePlanUid';
    if (!graphic[prop]) {
      graphic[prop] = String(prefix || 'graphic') + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    }
    return graphic[prop];
  };

  shared.numberWithCommas = shared.numberWithCommas || function numberWithCommas(value, decimals) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '—';
    return n.toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    });
  };

  shared.polylineLengthFeet = shared.polylineLengthFeet || function polylineLengthFeet(RT, geometry) {
    if (!geometry) return 0;
    try {
      if (RT && RT.geometryEngine && typeof RT.geometryEngine.geodesicLength === 'function') {
        const len = RT.geometryEngine.geodesicLength(geometry, 'feet');
        if (Number.isFinite(len)) return Math.abs(len);
      }
    } catch (err) {}
    try {
      if (RT && RT.geometryEngine && typeof RT.geometryEngine.planarLength === 'function') {
        const len = RT.geometryEngine.planarLength(geometry, 'feet');
        if (Number.isFinite(len)) return Math.abs(len);
      }
    } catch (err) {}
    return 0;
  };

  shared.formatPolylineDistanceFeet = shared.formatPolylineDistanceFeet || function formatPolylineDistanceFeet(RT, geometry, options) {
    const opts = options || {};
    const feet = shared.polylineLengthFeet(RT, geometry);
    if (!Number.isFinite(feet) || feet <= 0) return opts.zeroText || '0 ft';
    const decimals = Number.isFinite(opts.decimals) ? opts.decimals : (feet < 100 ? 1 : 0);
    return shared.numberWithCommas(feet, decimals) + ' ft';
  };

  root.SitePlanDrawShared = shared;
})();
