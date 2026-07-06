// Shared registry and helpers for Access / Driveway tools.

(function () {
  if (!window.SitePlanRuntimeReady) {
    console.error('[tools-access/shared] window.SitePlanRuntimeReady is missing. Make sure js/runtime.js loads first.');
    return;
  }

  window.SitePlanRuntimeReady.then(RT => {
    const shared = window.SitePlanAccessShared = window.SitePlanAccessShared || {};

    shared.RT = RT;
    shared.sectionId = shared.sectionId || 'tools-access';
    shared.source = shared.source || 'tools-access';
    shared.tools = shared.tools || {};
    shared.drivewayMaterials = shared.drivewayMaterials || {};
    shared.selectedDrivewayMaterialId = shared.selectedDrivewayMaterialId || 'asphalt';

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
        const ao = Number.isFinite(a && a.order) ? a.order : 0;
        const bo = Number.isFinite(b && b.order) ? b.order : 0;
        if (ao !== bo) return ao - bo;
        return String((a && a.id) || '').localeCompare(String((b && b.id) || ''));
      });
    };

    shared.getToolElements = function getToolElements(tool) {
      if (!tool) return [];
      if (typeof tool.getElements === 'function') return (tool.getElements() || []).filter(Boolean);
      const elements = [];
      if (typeof tool.buildButton === 'function') elements.push(tool.buildButton());
      if (typeof tool.buildControls === 'function') elements.push(tool.buildControls());
      return elements.filter(Boolean);
    };

    shared.registerDrivewayMaterial = function registerDrivewayMaterial(material) {
      if (!material || !material.id) {
        console.warn('[tools-access/shared] Ignoring driveway material registration without an id.', material);
        return null;
      }
      const existing = shared.drivewayMaterials[material.id] || {};
      const registered = Object.assign({}, existing, material);
      shared.drivewayMaterials[material.id] = registered;
      if (!shared.selectedDrivewayMaterialId) {
        shared.selectedDrivewayMaterialId = material.id;
      }
      return registered;
    };

    shared.getDrivewayMaterial = function getDrivewayMaterial(id) {
      const materialId = id || shared.selectedDrivewayMaterialId || 'asphalt';
      return (shared.drivewayMaterials && shared.drivewayMaterials[materialId]) ||
        (shared.drivewayMaterials && shared.drivewayMaterials.asphalt) ||
        (shared.drivewayMaterials && shared.drivewayMaterials.gravel) ||
        null;
    };

    shared.getDrivewayMaterials = function getDrivewayMaterials() {
      return Object.values(shared.drivewayMaterials || {}).sort((a, b) => {
        const ao = Number.isFinite(a && a.order) ? a.order : 0;
        const bo = Number.isFinite(b && b.order) ? b.order : 0;
        if (ao !== bo) return ao - bo;
        return String((a && a.label) || '').localeCompare(String((b && b.label) || ''));
      });
    };

    shared.setSelectedDrivewayMaterial = function setSelectedDrivewayMaterial(id) {
      if (!id || !shared.drivewayMaterials || !shared.drivewayMaterials[id]) return shared.selectedDrivewayMaterialId;
      shared.selectedDrivewayMaterialId = id;
      shared.updateDrivewayMaterialControl();
      return shared.selectedDrivewayMaterialId;
    };

    shared.drivewaySurfaceSymbol = function drivewaySurfaceSymbol(materialId) {
      const material = shared.getDrivewayMaterial(materialId);
      if (material && typeof material.symbol === 'function') return material.symbol();
      return {
        type: 'simple-fill',
        color: [80, 80, 80, 0.35],
        outline: { type: 'simple-line', color: [80, 80, 80, 0.9], width: 1.1 }
      };
    };

    shared.updateDrivewayMaterialControl = function updateDrivewayMaterialControl() {
      const wrap = document.getElementById('driveway-material-control');
      if (!wrap) return;
      wrap.querySelectorAll('.driveway-material-btn').forEach(btn => {
        const active = btn.getAttribute('data-material-id') === shared.selectedDrivewayMaterialId;
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
    };

    shared.buildDrivewayMaterialControl = function buildDrivewayMaterialControl() {
      const materials = shared.getDrivewayMaterials();
      if (!materials.length) return null;
      const wrap = document.createElement('div');
      wrap.id = 'driveway-material-control';
      wrap.className = 'edit-mode-row driveway-material-row';
      wrap.setAttribute('role', 'group');
      wrap.setAttribute('aria-label', 'Driveway material');
      materials.forEach(material => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'tool-btn edit-mode-btn driveway-material-btn';
        btn.setAttribute('data-material-id', material.id);
        const active = material.id === shared.selectedDrivewayMaterialId;
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-pressed', active ? 'true' : 'false');
        btn.textContent = material.label || material.id;
        btn.addEventListener('click', () => shared.setSelectedDrivewayMaterial(material.id));
        wrap.appendChild(btn);
      });
      shared.updateDrivewayMaterialControl();
      return wrap;
    };

    shared.announceToolActivated = function announceToolActivated(toolId, detail) {
      try {
        window.dispatchEvent(new CustomEvent('siteplan:tool-activated', {
          detail: Object.assign({ source: shared.source, tool: toolId || null }, detail || {})
        }));
      } catch (err) {}
    };

    shared.cancelAllExcept = function cancelAllExcept(activeToolId, clearButtonState) {
      shared.getTools().forEach(tool => {
        if (!tool || tool.id === activeToolId || typeof tool.cancel !== 'function') return;
        try { tool.cancel(!!clearButtonState); }
        catch (err) { console.warn('[tools-access/shared] Tool cancel failed for ' + tool.id + '.', err); }
      });
    };

    shared.clearActiveAllExcept = function clearActiveAllExcept(activeToolId) {
      shared.getTools().forEach(tool => {
        if (!tool || tool.id === activeToolId || typeof tool.clearActive !== 'function') return;
        try { tool.clearActive(); }
        catch (err) { console.warn('[tools-access/shared] Tool clearActive failed for ' + tool.id + '.', err); }
      });
    };

    shared.applyToolCapabilities = function applyToolCapabilities(graphic, capabilities) {
      if (!graphic) return graphic;
      const caps = Object.assign({}, capabilities || {});
      if (typeof RT.setGraphicCapabilities === 'function') {
        RT.setGraphicCapabilities(graphic, caps);
      } else {
        graphic.__toolCapabilities = caps;
        graphic.attributes = Object.assign({}, graphic.attributes || {}, { toolCapabilities: caps });
      }
      return graphic;
    };

    shared.ensureSitePlanId = function ensureSitePlanId(graphic, prefix) {
      if (!graphic) return null;
      if (!graphic.__sitePlanId) {
        const suffix = Math.random().toString(36).slice(2, 8);
        graphic.__sitePlanId = (prefix || 'access') + '_' + Date.now() + '_' + suffix;
      }
      graphic.attributes = Object.assign({}, graphic.attributes || {}, { sitePlanId: graphic.__sitePlanId });
      return graphic.__sitePlanId;
    };

    shared.svgDataUrl = shared.svgDataUrl || function svgDataUrl(svg) {
      return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg);
    };

    shared.spatialReferenceJSON = function spatialReferenceJSON(spatialReference) {
      return spatialReference && spatialReference.toJSON ? spatialReference.toJSON() : spatialReference;
    };

    shared.graphicsInLayer = function graphicsInLayer(layer) {
      if (!layer || !layer.graphics) return [];
      if (typeof layer.graphics.toArray === 'function') return layer.graphics.toArray();
      if (Array.isArray(layer.graphics.items)) return layer.graphics.items.slice();
      return [];
    };

    shared.webMercatorLatRadiansFromY = function webMercatorLatRadiansFromY(y) {
      const radius = 6378137;
      return (2 * Math.atan(Math.exp(y / radius))) - (Math.PI / 2);
    };

    shared.feetToLocalMapUnits = function feetToLocalMapUnits(feet, center, spatialReference) {
      const meters = feet * 0.3048;
      const wkid = spatialReference && (spatialReference.wkid || spatialReference.latestWkid);
      if (wkid === 3857 || wkid === 102100 || wkid === 102113) {
        const latRad = shared.webMercatorLatRadiansFromY(center.y);
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

    // Normalizes feetToLocalMapUnits to always return a scalar. Geographic
    // coordinates return {dx,dy}; all other projections return a number.
    shared.feetToMapScalar = function feetToMapScalar(feet, point, spatialReference) {
      const units = shared.feetToLocalMapUnits(feet, point, spatialReference);
      if (units && typeof units === 'object') return Math.max(Math.abs(units.dx || 0), Math.abs(units.dy || 0));
      return Number.isFinite(units) ? units : feet;
    };

    shared.pointFromXY = function pointFromXY(x, y, spatialReference) {
      return { type: 'point', x, y, spatialReference: shared.spatialReferenceJSON(spatialReference) };
    };

    // Returns unit vector and normal for a segment [a, b] (2-element arrays).
    // Returns null for degenerate (zero-length) segments.
    shared.segmentInfo = function segmentInfo(a, b) {
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const len = Math.hypot(dx, dy);
      if (!Number.isFinite(len) || len <= 1e-9) return null;
      const ux = dx / len;
      const uy = dy / len;
      return { ux, uy, nx: -uy, ny: ux };
    };

    // Finds the intersection of two infinite lines defined by point + direction.
    // p and q are {x, y}; u and v are {x, y} direction vectors.
    // Returns a [x, y] array or null when lines are parallel.
    shared.lineIntersection = function lineIntersection(p, u, q, v) {
      const cross = u.x * v.y - u.y * v.x;
      if (Math.abs(cross) < 1e-9) return null;
      const t = ((q.x - p.x) * v.y - (q.y - p.y) * v.x) / cross;
      return [p.x + u.x * t, p.y + u.y * t];
    };
  }).catch(err => {
    console.error('[tools-access/shared] Failed to initialize after runtime ready:', err);
  });
})();
