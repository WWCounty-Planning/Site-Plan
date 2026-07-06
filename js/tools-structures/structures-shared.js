// Shared registry/helpers for the Structures tool family.

(function () {
  const SS = window.SitePlanStructuresShared = window.SitePlanStructuresShared || {};
  SS.sectionId = SS.sectionId || 'tools-structures';
  SS.source = SS.source || 'tools-structures';
  SS.tools = SS.tools || {};

  SS.sectionEl = SS.sectionEl || function sectionEl() {
    return document.getElementById(SS.sectionId);
  };

  SS.registerTool = function registerTool(tool) {
    if (!tool || !tool.id) return null;
    SS.tools[tool.id] = Object.assign({}, SS.tools[tool.id] || {}, tool);
    return SS.tools[tool.id];
  };

  SS.getTool = function getTool(id) {
    return id ? (SS.tools && SS.tools[id]) || null : null;
  };

  SS.getTools = function getTools() {
    return Object.values(SS.tools || {}).sort((a, b) => {
      const ao = Number.isFinite(a.order) ? a.order : 0;
      const bo = Number.isFinite(b.order) ? b.order : 0;
      if (ao !== bo) return ao - bo;
      return String(a.id || '').localeCompare(String(b.id || ''));
    });
  };

  SS.getToolElements = function getToolElements(tool) {
    if (!tool) return [];
    let elements = [];
    if (typeof tool.getElements === 'function') {
      try { elements = tool.getElements() || []; }
      catch (err) { console.warn('[tools-structures/structures-shared] getElements failed for', tool.id, err); }
    }
    return (Array.isArray(elements) ? elements : [elements]).filter(Boolean);
  };

  SS.cancelAllExcept = function cancelAllExcept(id) {
    SS.getTools().forEach(tool => {
      if (!tool || tool.id === id || typeof tool.cancel !== 'function') return;
      try { tool.cancel(false); }
      catch (err) { console.warn('[tools-structures/structures-shared] cancel failed for', tool.id, err); }
    });
  };

  SS.clearActiveAllExcept = function clearActiveAllExcept(id) {
    SS.getTools().forEach(tool => {
      if (!tool || tool.id === id || typeof tool.clearActive !== 'function') return;
      try { tool.clearActive(); }
      catch (err) { console.warn('[tools-structures/structures-shared] clearActive failed for', tool.id, err); }
    });
  };

  SS.announceToolActivated = function announceToolActivated(toolId, detail) {
    try {
      window.dispatchEvent(new CustomEvent('siteplan:tool-activated', {
        detail: Object.assign({ source: SS.source, tool: toolId || null }, detail || {})
      }));
    } catch (err) {}
  };

  const DEFAULT_CAPABILITIES = {
    reshape: true,
    resize: true,
    rotate: true,
    rotationSnapDegrees: 5,
    rotationGuideMode: 'delta',
    label: true,
    duplicate: true,
    delete: true
  };

  const MIN_RECT_SIDE_FT = 2;
  const MIN_RECT_AREA_SQFT = 4;
  const DEFAULT_RECT_SIDE_FT = 10;

  function cloneCapabilities(capabilities) {
    return Object.assign({}, capabilities || DEFAULT_CAPABILITIES);
  }

  SS.applyToolCapabilities = function applyToolCapabilities(RT, graphic, capabilities) {
    if (!graphic) return graphic;
    const caps = cloneCapabilities(capabilities);
    if (RT && typeof RT.setGraphicCapabilities === 'function') {
      RT.setGraphicCapabilities(graphic, caps);
    } else {
      graphic.__toolCapabilities = caps;
      graphic.attributes = Object.assign({}, graphic.attributes || {}, { toolCapabilities: caps });
    }
    return graphic;
  };

  SS.webMercatorLatRadiansFromY = function webMercatorLatRadiansFromY(y) {
    const radius = 6378137;
    return (2 * Math.atan(Math.exp(y / radius))) - (Math.PI / 2);
  };

  SS.feetToLocalMapUnits = function feetToLocalMapUnits(feet, center, spatialReference) {
    const meters = feet * 0.3048;
    const wkid = spatialReference && (spatialReference.wkid || spatialReference.latestWkid);
    if (wkid === 3857 || wkid === 102100 || wkid === 102113) {
      const latRad = SS.webMercatorLatRadiansFromY(center.y);
      const cosLat = Math.max(Math.abs(Math.cos(latRad)), 0.2);
      return meters / cosLat;
    }
    if (wkid === 4326 || (spatialReference && spatialReference.isGeographic)) {
      const latRad = (center.y || 0) * Math.PI / 180;
      const feetPerDegreeLat = 364000;
      const feetPerDegreeLon = Math.max(feetPerDegreeLat * Math.cos(latRad), 1);
      return { dx: feet / feetPerDegreeLon, dy: feet / feetPerDegreeLat };
    }
    return meters;
  };

  SS.makeRectangleGeometryFromCenter = function makeRectangleGeometryFromCenter(RT, center, lengthFt, widthFt) {
    if (!center) return null;
    const sr = center.spatialReference || (RT && RT.view && RT.view.spatialReference);
    const lengthUnits = SS.feetToLocalMapUnits(lengthFt, center, sr);
    const widthUnits = SS.feetToLocalMapUnits(widthFt, center, sr);
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

  SS.ringWithoutDuplicateClose = function ringWithoutDuplicateClose(geometry) {
    if (!geometry || geometry.type !== 'polygon' || !geometry.rings || !geometry.rings.length) return [];
    const ring = geometry.rings[0] || [];
    if (ring.length > 2) {
      const first = ring[0];
      const last = ring[ring.length - 1];
      if (first && last && first[0] === last[0] && first[1] === last[1]) return ring.slice(0, -1);
    }
    return ring.slice();
  };

  SS.segmentLengthFt = function segmentLengthFt(RT, a, b, spatialReference) {
    if (!a || !b || !RT || !RT.geometryEngine) return 0;
    const segment = { type: 'polyline', paths: [[a, b]], spatialReference };
    let length = 0;
    try { length = Math.abs(RT.geometryEngine.geodesicLength(segment, 'feet') || 0); } catch (err) {}
    if (!Number.isFinite(length) || length <= 0) {
      try { length = Math.abs(RT.geometryEngine.planarLength(segment, 'feet') || 0); } catch (err) {}
    }
    return Number.isFinite(length) ? length : 0;
  };

  SS.polygonAreaSqFt = function polygonAreaSqFt(RT, geometry) {
    if (!RT || !RT.geometryEngine) return 0;
    let area = 0;
    try { area = Math.abs(RT.geometryEngine.geodesicArea(geometry, 'square-feet') || 0); } catch (err) {}
    if (!Number.isFinite(area) || area <= 0) {
      try { area = Math.abs(RT.geometryEngine.planarArea(geometry, 'square-feet') || 0); } catch (err) {}
    }
    return Number.isFinite(area) ? area : 0;
  };

  SS.rectangleDimensionsFt = function rectangleDimensionsFt(RT, geometry) {
    const pts = SS.ringWithoutDuplicateClose(geometry);
    if (pts.length < 4) return { widthFt: 0, heightFt: 0, areaSqFt: SS.polygonAreaSqFt(RT, geometry) };
    return {
      widthFt: SS.segmentLengthFt(RT, pts[0], pts[1], geometry.spatialReference),
      heightFt: SS.segmentLengthFt(RT, pts[1], pts[2], geometry.spatialReference),
      areaSqFt: SS.polygonAreaSqFt(RT, geometry)
    };
  };

  SS.isTooSmallRectangle = function isTooSmallRectangle(RT, geometry) {
    const dims = SS.rectangleDimensionsFt(RT, geometry);
    return dims.widthFt < MIN_RECT_SIDE_FT ||
           dims.heightFt < MIN_RECT_SIDE_FT ||
           dims.areaSqFt < MIN_RECT_AREA_SQFT;
  };

  SS.makeDefaultRectangleGeometry = function makeDefaultRectangleGeometry(RT, sourceGeometry) {
    const center = sourceGeometry && sourceGeometry.extent && sourceGeometry.extent.center;
    if (!center) return null;
    const sr = sourceGeometry.spatialReference || (center && center.spatialReference);
    const units = SS.feetToLocalMapUnits(DEFAULT_RECT_SIDE_FT, center, sr);
    const halfX = (typeof units === 'object' ? units.dx : units) / 2;
    const halfY = (typeof units === 'object' ? units.dy : units) / 2;
    const json = {
      rings: [[
        [center.x - halfX, center.y - halfY],
        [center.x + halfX, center.y - halfY],
        [center.x + halfX, center.y + halfY],
        [center.x - halfX, center.y + halfY],
        [center.x - halfX, center.y - halfY]
      ]],
      spatialReference: sr && sr.toJSON ? sr.toJSON() : sr
    };
    try {
      if (sourceGeometry.constructor && sourceGeometry.constructor.fromJSON) {
        return sourceGeometry.constructor.fromJSON(json);
      }
    } catch (err) {}
    return Object.assign({ type: 'polygon' }, json);
  };

  SS.replaceInvalidRectangleIfNeeded = function replaceInvalidRectangleIfNeeded(RT, graphic, logPrefix) {
    if (!graphic || graphic.__toolType !== 'rectangle' || !graphic.geometry) return false;
    if (!SS.isTooSmallRectangle(RT, graphic.geometry)) return false;
    const replacement = SS.makeDefaultRectangleGeometry(RT, graphic.geometry);
    if (!replacement) return false;
    graphic.geometry = replacement;
    graphic.__usedDefaultRectangleSize = true;
    graphic.attributes = Object.assign({}, graphic.attributes || {}, {
      usedDefaultRectangleSize: true,
      defaultRectangleSizeFt: DEFAULT_RECT_SIDE_FT
    });
    if (RT && typeof RT.refreshSnapSources === 'function') RT.refreshSnapSources();
    const reselect = () => {
      try { RT.selectGraphic(graphic); }
      catch (err) { console.warn((logPrefix || '[tools-structures]') + ' Unable to reselect default structure rectangle.', err); }
    };
    if (window.requestAnimationFrame) window.requestAnimationFrame(reselect);
    else setTimeout(reselect, 0);
    return true;
  };
})();
