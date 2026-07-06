// Shared registry/helpers for Parking tools.

(function () {
  const shared = window.SitePlanParkingShared = window.SitePlanParkingShared || {};
  shared.sectionId = shared.sectionId || 'tools-parking';
  shared.source = shared.source || 'tools-parking';
  shared.tools = shared.tools || {};

  if (!window.SitePlanRuntimeReady) {
    console.error('[tools-parking/parking-shared] window.SitePlanRuntimeReady is missing. Make sure js/runtime.js loads first.');
    return;
  }

  window.SitePlanRuntimeReady.then(RT => {
    shared.RT = RT;

    shared.supportCapabilities = shared.supportCapabilities || Object.freeze({
      selectable: false,
      editable: false,
      duplicate: false,
      delete: false,
      toolbar: false
    });

    shared.svgDataUrl = shared.svgDataUrl || function svgDataUrl(svg) {
      return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg);
    };

    shared.parkingSpeckleTile = shared.parkingSpeckleTile ||
      '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 60 60">' +
        '<rect width="60" height="60" fill="#2E3035"/>' +
        '<path d="M 5 10 L 8 6 L 12 9 Z" fill="#0A0B0E"/>' +
        '<circle cx="25" cy="15" r="2.5" fill="#0A0B0E"/>' +
        '<circle cx="50" cy="8" r="1.5" fill="#0A0B0E"/>' +
        '<path d="M 40 25 L 45 27 L 38 33 Z" fill="#0A0B0E"/>' +
        '<circle cx="10" cy="40" r="3" fill="#0A0B0E"/>' +
        '<path d="M 28 50 L 33 45 L 36 53 Z" fill="#0A0B0E"/>' +
        '<circle cx="52" cy="45" r="2" fill="#0A0B0E"/>' +
        '<circle cx="20" cy="5" r="1.5" fill="#0A0B0E"/>' +
        '<path d="M 55 20 L 58 17 L 59 22 Z" fill="#0A0B0E"/>' +
        '<circle cx="15" cy="25" r="1.5" fill="#9BA0AA"/>' +
        '<path d="M 45 15 L 48 11 L 51 16 Z" fill="#B0B5C0"/>' +
        '<circle cx="8" cy="52" r="1.5" fill="#C5C9D1"/>' +
        '<circle cx="35" cy="10" r="1.2" fill="#9BA0AA"/>' +
        '<path d="M 20 35 L 23 31 L 26 36 Z" fill="#B0B5C0"/>' +
        '<circle cx="45" cy="38" r="2" fill="#C5C9D1"/>' +
        '<circle cx="25" cy="55" r="1.5" fill="#9BA0AA"/>' +
        '<circle cx="35" cy="28" r="1" fill="#C5C9D1"/>' +
        '<path d="M 5 30 L 7 28 L 8 32 Z" fill="#9BA0AA"/>' +
      '</svg>';

    shared.parkingSpeckleDataUrl = shared.parkingSpeckleDataUrl || shared.svgDataUrl(shared.parkingSpeckleTile);

    shared.makeSupportGraphic = function makeSupportGraphic(options) {
      const opts = options || {};
      const caps = Object.assign({}, shared.supportCapabilities);
      const graphic = new RT.Graphic({
        geometry: opts.geometry,
        symbol: opts.symbol,
        attributes: {
          sitePlanTool: opts.sitePlanTool,
          sitePlanCategory: 'parking-support',
          supportFor: opts.supportFor,
          supportRole: opts.supportRole,
          toolCapabilities: caps
        }
      });
      graphic.__nonSelectable = true;
      graphic.__supportFor = opts.supportFor;
      graphic.__supportRole = opts.supportRole;
      graphic.__toolCapabilities = caps;
      return graphic;
    };

    shared.hasSupportRole = function hasSupportRole(graphic, roles) {
      if (!graphic) return false;
      const roleList = Array.isArray(roles) ? roles : [roles];
      const attrs = graphic.attributes || {};
      return roleList.some(role => role && (
        graphic.__supportRole === role ||
        attrs.supportRole === role ||
        attrs.sitePlanTool === role
      ));
    };

    shared.sectionEl = shared.sectionEl || function sectionEl() {
      return document.getElementById(shared.sectionId);
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
        const ao = Number.isFinite(a && a.order) ? a.order : 0;
        const bo = Number.isFinite(b && b.order) ? b.order : 0;
        if (ao !== bo) return ao - bo;
        return String((a && a.id) || '').localeCompare(String((b && b.id) || ''));
      });
    };

    shared.getToolElements = function getToolElements(tool) {
      if (!tool) return [];
      let elements = [];
      if (typeof tool.getElements === 'function') {
        try { elements = tool.getElements() || []; }
        catch (err) { console.warn('[tools-parking/parking-shared] getElements failed for ' + tool.id + '.', err); }
      }
      return (Array.isArray(elements) ? elements : [elements]).filter(Boolean);
    };

    shared.announceToolActivated = function announceToolActivated(toolId, detail) {
      try {
        window.dispatchEvent(new CustomEvent('siteplan:tool-activated', {
          detail: Object.assign({ source: shared.source, tool: toolId || null }, detail || {})
        }));
      } catch (err) {}
    };

    shared.cancelAllExcept = function cancelAllExcept(id) {
      shared.getTools().forEach(tool => {
        if (!tool || tool.id === id || typeof tool.cancel !== 'function') return;
        try { tool.cancel(false); }
        catch (err) { console.warn('[tools-parking/parking-shared] cancel failed for ' + tool.id + '.', err); }
      });
    };

    shared.clearActiveAllExcept = function clearActiveAllExcept(id) {
      shared.getTools().forEach(tool => {
        if (!tool || tool.id === id || typeof tool.clearActive !== 'function') return;
        try { tool.clearActive(); }
        catch (err) { console.warn('[tools-parking/parking-shared] clearActive failed for ' + tool.id + '.', err); }
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

    shared.graphicsInLayer = function graphicsInLayer(layer) {
      if (!layer || !layer.graphics) return [];
      if (typeof layer.graphics.toArray === 'function') return layer.graphics.toArray();
      if (Array.isArray(layer.graphics.items)) return layer.graphics.items.slice();
      return [];
    };

    shared.pointFromXY = function pointFromXY(x, y, spatialReference) {
      return { type: 'point', x, y, spatialReference };
    };

    shared.spatialReferenceJSON = function spatialReferenceJSON(spatialReference) {
      return spatialReference && spatialReference.toJSON ? spatialReference.toJSON() : spatialReference;
    };

    shared.ringWithoutDuplicateClose = function ringWithoutDuplicateClose(geometry) {
      if (!geometry || geometry.type !== 'polygon' || !geometry.rings || !geometry.rings.length) return [];
      const ring = geometry.rings[0] || [];
      if (ring.length > 2) {
        const first = ring[0];
        const last = ring[ring.length - 1];
        if (first && last && first[0] === last[0] && first[1] === last[1]) return ring.slice(0, -1);
      }
      return ring.slice();
    };

    shared.clamp = shared.clamp || function clamp(value, min, max) {
      return Math.max(min, Math.min(max, value));
    };

    shared.sidePoint = shared.sidePoint || function sidePoint(pt, spatialReference) {
      return pt ? shared.pointFromXY(pt[0], pt[1], spatialReference) : null;
    };

    shared.sideFromPoints = shared.sideFromPoints || function sideFromPoints(name, a, b, spatialReference, opposite) {
      const pa = shared.sidePoint(a, spatialReference);
      const pb = shared.sidePoint(b, spatialReference);
      if (!pa || !pb) return null;
      const dx = pb.x - pa.x;
      const dy = pb.y - pa.y;
      const length = Math.hypot(dx, dy);
      if (!Number.isFinite(length) || length <= 0) return null;
      return { name, opposite, a: pa, b: pb, dx, dy, ux: dx / length, uy: dy / length, length, spatialReference };
    };

    shared.ensureSitePlanId = function ensureSitePlanId(graphic, prefix) {
      if (!graphic) return null;
      if (!graphic.__sitePlanId) {
        graphic.__sitePlanId = (prefix || 'parking') + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
      }
      graphic.attributes = Object.assign({}, graphic.attributes || {}, { sitePlanId: graphic.__sitePlanId });
      return graphic.__sitePlanId;
    };

    shared.sideMidpoint = function sideMidpoint(side) {
      if (!side || !side.a || !side.b) return null;
      return shared.pointFromXY(
        (side.a.x + side.b.x) / 2,
        (side.a.y + side.b.y) / 2,
        side.spatialReference || side.a.spatialReference || side.b.spatialReference
      );
    };

    shared.screenDistanceBetweenPoints = function screenDistanceBetweenPoints(a, b) {
      if (!a || !b || !RT.view) return Infinity;
      try {
        const as = RT.view.toScreen(a);
        const bs = RT.view.toScreen(b);
        if (!as || !bs || !Number.isFinite(as.x) || !Number.isFinite(as.y) ||
            !Number.isFinite(bs.x) || !Number.isFinite(bs.y)) return Infinity;
        return Math.hypot(as.x - bs.x, as.y - bs.y);
      } catch (err) {
        return Infinity;
      }
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

    shared.makeSupportHelpers = function makeSupportHelpers(runtime, isParent, isSupport) {
      const app = runtime || RT;

      function supportLayers() {
        const layers = [];
        [app && app.drawingShadowLayer, app && app.labelLayer, app && app.drawLayer].forEach(layer => {
          if (layer && layers.indexOf(layer) === -1) layers.push(layer);
        });
        return layers;
      }

      function graphicId(graphic) {
        const attrs = graphic && graphic.attributes ? graphic.attributes : {};
        return graphic ? (graphic.__sitePlanId || attrs.sitePlanId || null) : null;
      }

      function supportParentId(graphic) {
        const attrs = graphic && graphic.attributes ? graphic.attributes : {};
        return graphic ? (graphic.__supportFor || attrs.supportFor || attrs.parentSitePlanId || attrs.selectParentId || null) : null;
      }

      function removeFromLayer(layer, graphics) {
        if (!layer || !graphics || !graphics.length) return;
        if (typeof layer.removeMany === 'function') {
          layer.removeMany(graphics);
          return;
        }
        graphics.forEach(graphic => {
          if (typeof layer.remove === 'function') layer.remove(graphic);
        });
      }

      function removeSupport(parentOrId) {
        const parentId = typeof parentOrId === 'string' ? parentOrId : graphicId(parentOrId);
        if (!parentId) return;
        supportLayers().forEach(layer => {
          const matches = shared.graphicsInLayer(layer).filter(graphic =>
            graphic && supportParentId(graphic) === parentId &&
            (typeof isSupport !== 'function' || isSupport(graphic))
          );
          removeFromLayer(layer, matches);
        });
      }

      function pruneOrphanSupport() {
        const parentIds = new Set(shared.graphicsInLayer(app && app.drawLayer)
          .filter(graphic => typeof isParent === 'function' && isParent(graphic))
          .map(graphicId)
          .filter(Boolean));

        supportLayers().forEach(layer => {
          const orphans = shared.graphicsInLayer(layer).filter(graphic => {
            if (!graphic || (typeof isSupport === 'function' && !isSupport(graphic))) return false;
            const parentId = supportParentId(graphic);
            return parentId && !parentIds.has(parentId);
          });
          removeFromLayer(layer, orphans);
        });
      }

      return { supportLayers, removeSupport, pruneOrphanSupport };
    };

    shared.makeRectangleParentPredicate = function makeRectangleParentPredicate(toolId) {
      return function isRectangleParent(graphic) {
        const attrs = graphic && graphic.attributes ? graphic.attributes : {};
        return !!(graphic &&
          (attrs.sitePlanTool === toolId || attrs.toolType === toolId) &&
          graphic.geometry && graphic.geometry.type === 'polygon');
      };
    };

    shared.rectangleBorderGeometry = function rectangleBorderGeometry(graphic, mode) {
      const geometry = graphic && graphic.geometry;
      const ring = shared.ringWithoutDuplicateClose(geometry);
      if (!geometry || geometry.type !== 'polygon' || ring.length < 4) return null;
      const path = mode === 'closed'
        ? [ring[0], ring[1], ring[2], ring[3], ring[0]]
        : [ring[0], ring[3], ring[2], ring[1]];
      return { type: 'polyline', paths: [path], spatialReference: geometry.spatialReference };
    };

    // Proposed/Existing mode for a parking graphic. Stalls lock to the mode they
    // were drawn in (stamped on attributes); unstamped graphics use the live
    // section mode.
    shared.parkingDrawnMode = function parkingDrawnMode(graphic) {
      const m = graphic && graphic.attributes && graphic.attributes.drawingMode;
      if (m === 'existing' || m === 'proposed') return m;
      return window.SitePlanDrawingMode ? window.SitePlanDrawingMode.getDrawingMode('parking') : 'existing';
    };
    shared.stampParkingMode = function stampParkingMode(graphic) {
      if (!graphic) return;
      const stamped = graphic.attributes && graphic.attributes.drawingMode;
      const mode = (stamped === 'existing' || stamped === 'proposed')
        ? stamped
        : (window.SitePlanDrawingMode ? window.SitePlanDrawingMode.getDrawingMode('parking') : 'existing');
      graphic.attributes = Object.assign({}, graphic.attributes || {}, { drawingMode: mode });
    };
    // Wrap a border line symbol so it dashes for proposed graphics.
    shared.modeAwareBorder = function modeAwareBorder(baseSymbol) {
      return function (graphic) {
        return shared.parkingDrawnMode(graphic) === 'proposed'
          ? Object.assign({}, baseSymbol, { style: 'dash' })
          : baseSymbol;
      };
    };

    shared.makeRectangleSupportManager = function makeRectangleSupportManager(runtime, options) {
      const app = runtime || RT;
      const opts = options || {};
      const supportRoles = opts.supportRoles || [];
      const isParent = opts.isParent || shared.makeRectangleParentPredicate(opts.toolId);
      const isSupport = opts.isSupport || function rectangleSupportPredicate(graphic) {
        return shared.hasSupportRole(graphic, supportRoles);
      };
      const helpers = shared.makeSupportHelpers(app, isParent, isSupport);

      function supportItem(item) {
        if (!item || !item.geometry || !item.symbol || !item.role) return null;
        return {
          layer: item.layer || 'label',
          graphic: shared.makeSupportGraphic({
            geometry: item.geometry,
            symbol: item.symbol,
            sitePlanTool: item.sitePlanTool || item.role,
            supportFor: item.supportFor,
            supportRole: item.role
          })
        };
      }

      function rebuildSupport(graphic) {
        const id = shared.ensureSitePlanId(graphic, opts.idPrefix || 'parking');
        if (!id) return;
        const borderGeometry = (typeof opts.borderGeometry === 'function')
          ? opts.borderGeometry(graphic)
          : shared.rectangleBorderGeometry(graphic, opts.borderMode);
        if (!borderGeometry) return;

        helpers.removeSupport(graphic);

        const extras = typeof opts.extraSupportItems === 'function'
          ? opts.extraSupportItems(graphic, id, borderGeometry) || []
          : [];
        const baseItems = [supportItem({
          layer: 'shadow',
          geometry: borderGeometry,
          symbol: opts.borderShadowSymbol,
          role: opts.borderShadowRole,
          supportFor: id
        })];
        const borderItem = supportItem({
          layer: 'label',
          geometry: borderGeometry,
          symbol: (typeof opts.borderSymbol === 'function') ? opts.borderSymbol(graphic) : opts.borderSymbol,
          role: opts.borderRole,
          supportFor: id
        });

        if (opts.extraSupportPosition === 'beforeBorder') {
          extras.forEach(item => baseItems.push(supportItem(Object.assign({ supportFor: id }, item))));
        }
        baseItems.push(borderItem);
        if (opts.extraSupportPosition !== 'beforeBorder') {
          extras.forEach(item => baseItems.push(supportItem(Object.assign({ supportFor: id }, item))));
        }

        baseItems.forEach(item => {
          if (!item) return;
          const layer = item.layer === 'shadow'
            ? (app.drawingShadowLayer || app.labelLayer)
            : app.labelLayer;
          if (layer && typeof layer.add === 'function') layer.add(item.graphic);
        });
      }

      return {
        isParent,
        isSupport,
        removeSupport: helpers.removeSupport,
        pruneOrphanSupport: helpers.pruneOrphanSupport,
        rebuildSupport
      };
    };

    shared.makeNorthSouthRectangleGeometry = function makeNorthSouthRectangleGeometry(center, widthFt, lengthFt) {
      if (!center) return null;
      const sr = center.spatialReference || (RT && RT.view && RT.view.spatialReference);
      const widthUnits = shared.feetToLocalMapUnits(widthFt, center, sr);
      const lengthUnits = shared.feetToLocalMapUnits(lengthFt, center, sr);
      const halfX = (typeof widthUnits === 'object' ? widthUnits.dx : widthUnits) / 2;
      const halfY = (typeof lengthUnits === 'object' ? lengthUnits.dy : lengthUnits) / 2;
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


  }).catch(err => {
    console.error('[tools-parking/parking-shared] Failed to initialize after runtime ready:', err);
  });
})();
