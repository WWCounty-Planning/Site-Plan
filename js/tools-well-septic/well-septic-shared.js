// Shared helper utilities for Well & Septic tools.

(function () {
  if (!window.SitePlanRuntimeReady) {
    console.error('[tools-well-septic/well-septic-shared] window.SitePlanRuntimeReady is missing. ' +
      'Make sure js/runtime.js is loaded before js/tools-well-septic/well-septic-shared.js.');
    return;
  }

  window.SitePlanRuntimeReady.then(RT => {
    const shared = window.SitePlanWellSepticShared = window.SitePlanWellSepticShared || {};

    shared.RT = RT;
    shared.sectionId = shared.sectionId || 'tools-well-septic';
    shared.source = shared.source || 'tools-well-septic';

    shared.tools = shared.tools || {};

    shared.registerTool = function registerTool(toolDefinition) {
      if (!toolDefinition || !toolDefinition.id) {
        console.warn('[tools-well-septic/well-septic-shared] Ignoring tool registration without an id.', toolDefinition);
        return null;
      }
      const existing = shared.tools[toolDefinition.id] || {};
      const registered = Object.assign({}, existing, toolDefinition);
      shared.tools[toolDefinition.id] = registered;
      return registered;
    };

    shared.getTool = function getTool(id) {
      if (!id || !shared.tools) return null;
      return shared.tools[id] || null;
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
        catch (err) { console.warn('[tools-well-septic/well-septic-shared] getElements failed for ' + tool.id + '.', err); }
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

    shared.applyToolCapabilities = function applyToolCapabilities(graphic, capabilities, fallbackCapabilities) {
      if (!graphic) return graphic;
      const caps = Object.assign({}, capabilities || fallbackCapabilities || {});
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
        graphic.__sitePlanId = (prefix || 'spg') + '_' + Date.now() + '_' + suffix;
      }
      graphic.attributes = Object.assign({}, graphic.attributes || {}, {
        sitePlanId: graphic.__sitePlanId
      });
      return graphic.__sitePlanId;
    };

    shared.pointFromMapPoint = function pointFromMapPoint(mapPoint) {
      if (!mapPoint) return null;
      if (mapPoint.clone) return mapPoint.clone();
      return {
        type: 'point',
        x: mapPoint.x,
        y: mapPoint.y,
        spatialReference: mapPoint.spatialReference
      };
    };

    shared.pointFromXY = function pointFromXY(x, y, spatialReference) {
      return {
        type: 'point',
        x,
        y,
        spatialReference
      };
    };


    shared.spatialReferenceJSON = function spatialReferenceJSON(spatialReference) {
      return spatialReference && spatialReference.toJSON ? spatialReference.toJSON() : spatialReference;
    };

    shared.webMercatorLatRadiansFromY = function webMercatorLatRadiansFromY(y) {
      const radius = 6378137;
      return (2 * Math.atan(Math.exp(y / radius))) - (Math.PI / 2);
    };

    shared.feetToLocalMapOffsets = function feetToLocalMapOffsets(feet, center) {
      const sr = center && center.spatialReference;
      const wkid = sr && (sr.wkid || sr.latestWkid);
      const meters = feet * 0.3048;

      if (wkid === 3857 || wkid === 102100 || wkid === 102113) {
        const latRad = shared.webMercatorLatRadiansFromY(center.y);
        const cosLat = Math.max(Math.abs(Math.cos(latRad)), 0.2);
        const units = meters / cosLat;
        return { dx: units, dy: units };
      }

      if (wkid === 4326 || (sr && sr.isGeographic)) {
        const latRad = Math.PI * center.y / 180;
        const feetPerDegreeLat = 364000;
        const feetPerDegreeLon = Math.max(Math.cos(latRad), 0.2) * 364000;
        return { dx: feet / feetPerDegreeLon, dy: feet / feetPerDegreeLat };
      }

      return { dx: feet, dy: feet };
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

    shared.polygonCenterFromRing = function polygonCenterFromRing(points) {
      if (!points || !points.length) return null;
      const sum = points.reduce((acc, p) => {
        if (!p || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) return acc;
        acc.x += p[0]; acc.y += p[1]; acc.count += 1;
        return acc;
      }, { x: 0, y: 0, count: 0 });
      if (!sum.count) return null;
      return { x: sum.x / sum.count, y: sum.y / sum.count };
    };

    shared.makeRectGeometryFromCenter = function makeRectGeometryFromCenter(center, lengthFt, widthFt) {
      if (!center) return null;
      const sr = center.spatialReference || (RT.view && RT.view.spatialReference);
      const lengthOffsets = shared.feetToLocalMapOffsets(lengthFt, center);
      const widthOffsets = shared.feetToLocalMapOffsets(widthFt, center);
      const halfLength = (lengthOffsets && Number.isFinite(lengthOffsets.dx) ? lengthOffsets.dx : 0) / 2;
      const halfWidth = (widthOffsets && Number.isFinite(widthOffsets.dy) ? widthOffsets.dy : 0) / 2;
      if (!Number.isFinite(halfLength) || !Number.isFinite(halfWidth) || halfLength <= 0 || halfWidth <= 0) return null;
      const x = center.x;
      const y = center.y;
      const ring = [
        [x - halfLength, y - halfWidth],
        [x + halfLength, y - halfWidth],
        [x + halfLength, y + halfWidth],
        [x - halfLength, y + halfWidth],
        [x - halfLength, y - halfWidth]
      ];
      return {
        type: 'polygon',
        rings: [ring],
        spatialReference: shared.spatialReferenceJSON(sr)
      };
    };

    shared.graphicsInLayer = function graphicsInLayer(layer) {
      if (!layer || !layer.graphics) return [];
      if (typeof layer.graphics.toArray === 'function') return layer.graphics.toArray();
      if (Array.isArray(layer.graphics.items)) return layer.graphics.items.slice();
      return [];
    };

    shared.removeSupportGraphics = function removeSupportGraphics(parentId) {
      if (!parentId) return;
      const supportFilter = g => g && (
        g.__supportFor === parentId ||
        (g.attributes && g.attributes.supportFor === parentId)
      );
      const labelSupport = shared.graphicsInLayer(RT.labelLayer).filter(supportFilter);
      const drawSupport = shared.graphicsInLayer(RT.drawLayer).filter(supportFilter);
      if (labelSupport.length) RT.labelLayer.removeMany(labelSupport);
      if (drawSupport.length) RT.drawLayer.removeMany(drawSupport);
    };

    shared.getAttachmentTargetId = function getAttachmentTargetId(child, options) {
      if (!child) return null;
      const opts = options || {};
      const propNames = opts.targetIdProperties || opts.childTargetIdProperties || ['__attachedToId'];
      for (const propName of propNames) {
        if (propName && child[propName]) return child[propName];
      }
      const attrs = child.attributes || {};
      const attrNames = opts.targetIdAttributes || opts.childTargetIdAttributes || ['attachedToId', 'attachmentTargetId'];
      for (const attrName of attrNames) {
        if (attrName && attrs[attrName]) return attrs[attrName];
      }
      return null;
    };

    shared.attachGraphicToTarget = function attachGraphicToTarget(child, target, options) {
      if (!child || !target) return false;
      const opts = options || {};
      const targetPrefix = opts.targetPrefix || opts.prefix || 'target';
      const targetId = shared.ensureSitePlanId(target, targetPrefix);
      if (!targetId) return false;

      const targetAttrs = target.attributes || {};
      const targetTool = opts.targetTool || target.__toolType || targetAttrs.toolType || targetAttrs.sitePlanTool || null;
      const attachmentType = opts.type || opts.attachmentType || 'attachment';
      const attachmentRole = opts.role || opts.attachmentRole || null;

      child.__attachedToId = targetId;
      child.__attachmentType = attachmentType;
      child.__attachmentRole = attachmentRole;
      child.__attachedToTool = targetTool;
      child.attributes = Object.assign({}, child.attributes || {}, {
        attachedToId: targetId,
        attachmentTargetId: targetId,
        attachmentType,
        attachmentRole,
        attachedToTool: targetTool
      }, opts.attributes || {});
      return true;
    };

    shared.detachGraphic = function detachGraphic(child, options) {
      if (!child) return child;
      const opts = options || {};
      const propNames = opts.targetIdProperties || opts.childTargetIdProperties || [];
      const attrNames = opts.targetIdAttributes || opts.childTargetIdAttributes || [];

      delete child.__attachedToId;
      delete child.__attachmentType;
      delete child.__attachmentRole;
      delete child.__attachedToTool;
      propNames.forEach(propName => {
        if (propName) delete child[propName];
      });

      const attrs = Object.assign({}, child.attributes || {});
      ['attachedToId', 'attachmentTargetId', 'attachmentType', 'attachmentRole', 'attachedToTool']
        .concat(attrNames)
        .forEach(attrName => {
          if (attrName) delete attrs[attrName];
        });
      child.attributes = attrs;
      return child;
    };

    shared.getAttachedChildren = function getAttachedChildren(target, layer, options) {
      if (!target || !layer) return [];
      const opts = options || {};
      const targetId = shared.ensureSitePlanId(target, opts.targetPrefix || opts.prefix || 'target');
      if (!targetId) return [];
      const childFilter = typeof opts.childFilter === 'function' ? opts.childFilter : null;
      return shared.graphicsInLayer(layer).filter(child => {
        if (!child) return false;
        if (childFilter && !childFilter(child)) return false;
        return shared.getAttachmentTargetId(child, opts) === targetId;
      });
    };

    shared.syncAttachedChildrenForTarget = function syncAttachedChildrenForTarget(target, layer, options) {
      const opts = options || {};
      const children = shared.getAttachedChildren(target, layer, opts);
      const sync = typeof opts.sync === 'function' ? opts.sync : null;
      if (sync) {
        children.forEach((child, index) => sync(child, target, index));
      }
      return children;
    };

    shared.detachAttachedChildrenForTarget = function detachAttachedChildrenForTarget(target, layer, options) {
      const opts = options || {};
      const children = shared.getAttachedChildren(target, layer, opts);
      const detach = typeof opts.detach === 'function' ? opts.detach : null;
      children.forEach(child => {
        if (detach) detach(child, target);
        else shared.detachGraphic(child, opts);
      });
      return children;
    };

    shared.tagSupportGraphic = function tagSupportGraphic(graphic, parentId, role, options, supportCapabilities) {
      if (!graphic) return graphic;
      const opts = options || {};
      const caps = Object.assign({}, supportCapabilities || {
        reshape: false,
        resize: false,
        rotate: false,
        label: false,
        duplicate: false,
        delete: false
      });
      graphic.__supportFor = parentId;
      graphic.__supportRole = role;
      graphic.__nonSelectable = true;
      graphic.__nonEditable = true;
      graphic.__skipMeasure = true;
      if (opts.selectParent) {
        graphic.__selectParentId = parentId;
        graphic.__selectionProxy = true;
      }
      graphic.attributes = Object.assign({}, graphic.attributes || {}, {
        supportFor: parentId,
        supportRole: role,
        nonSelectable: true,
        nonEditable: true,
        skipMeasure: true,
        selectionProxy: !!opts.selectParent,
        toolCapabilities: Object.assign({}, caps)
      });
      if (opts.selectParent) graphic.attributes.selectParentId = parentId;
      shared.applyToolCapabilities(graphic, caps);
      return graphic;
    };

    shared.addConnectionSnapSupports = function addConnectionSnapSupports(config) {
      const cfg = config || {};
      const points = Array.isArray(cfg.points)
        ? cfg.points.filter(Boolean)
        : (cfg.point ? [cfg.point] : []);
      if (!cfg.parentId || !points.length) return [];

      const role = cfg.role || 'connection-snap';
      const indexAttribute = cfg.indexAttribute || 'connectionIndex';
      const indexProperty = cfg.indexProperty || ('__' + indexAttribute);
      const supports = points.map((point, index) => {
        const symbol = typeof cfg.symbol === 'function' ? cfg.symbol(point, index) : cfg.symbol;
        const snap = shared.tagSupportGraphic(new RT.Graphic({
          geometry: point,
          symbol
        }), cfg.parentId, role, { selectParent: !!cfg.selectParent }, cfg.supportCapabilities);
        snap[indexProperty] = index;
        snap.__nativeSnapTarget = true;
        snap.attributes = Object.assign({}, snap.attributes || {}, cfg.attributes || {}, {
          nativeSnapTarget: true
        });
        snap.attributes[indexAttribute] = index;
        return snap;
      });

      if (supports.length) {
        RT.drawLayer.addMany(supports);
        if (typeof RT.refreshSnapSources === 'function') RT.refreshSnapSources();
      }
      return supports;
    };

    shared.buildDrainfieldLateralSupports = function buildDrainfieldLateralSupports(config) {
      const cfg = config || {};
      const info = cfg.axisInfo;
      const count = Number.parseInt(cfg.lateralCount, 10);
      const lateralCount = Number.isFinite(count) ? Math.max(1, count) : 1;
      const result = {
        supports: [],
        positions: [],
        spatialReference: info ? shared.spatialReferenceJSON(info.spatialReference) : null
      };
      if (!cfg.parentId || !info || !info.center || !Number.isFinite(info.span) || !Number.isFinite(info.widthSpan)) {
        return result;
      }

      const halfLength = info.span / 2;
      const halfWidth = info.widthSpan / 2;
      if (!Number.isFinite(halfLength) || !Number.isFinite(halfWidth)) return result;

      if (lateralCount <= 1) {
        result.positions.push(0);
      } else {
        for (let i = 0; i < lateralCount; i++) {
          result.positions.push(-halfWidth + (info.widthSpan * i) / (lateralCount - 1));
        }
      }

      const lateralRole = cfg.lateralRole || 'drainfield-lateral';
      const manifoldRole = cfg.manifoldRole || 'drainfield-manifold';
      const indexAttribute = cfg.indexAttribute || 'drainfieldLateralIndex';
      const indexProperty = cfg.indexProperty || '__drainfieldLateralIndex';
      const symbolFor = role => (typeof cfg.symbol === 'function' ? cfg.symbol(role) : cfg.symbol);

      result.positions.forEach((offset, index) => {
        const start = [
          info.center.x - info.ux * halfLength + info.px * offset,
          info.center.y - info.uy * halfLength + info.py * offset
        ];
        const end = [
          info.center.x + info.ux * halfLength + info.px * offset,
          info.center.y + info.uy * halfLength + info.py * offset
        ];
        const lateral = shared.tagSupportGraphic(new RT.Graphic({
          geometry: {
            type: 'polyline',
            paths: [[start, end]],
            spatialReference: result.spatialReference
          },
          symbol: symbolFor(lateralRole)
        }), cfg.parentId, lateralRole, null, cfg.supportCapabilities);
        lateral[indexProperty] = index;
        lateral.attributes = Object.assign({}, lateral.attributes || {}, {
          [indexAttribute]: index
        });
        result.supports.push(lateral);
      });

      if (result.positions.length >= 2) {
        const topOffset = result.positions[result.positions.length - 1];
        const bottomOffset = result.positions[0];
        const a = [
          info.center.x + info.ux * halfLength + info.px * bottomOffset,
          info.center.y + info.uy * halfLength + info.py * bottomOffset
        ];
        const b = [
          info.center.x + info.ux * halfLength + info.px * topOffset,
          info.center.y + info.uy * halfLength + info.py * topOffset
        ];
        result.supports.push(shared.tagSupportGraphic(new RT.Graphic({
          geometry: {
            type: 'polyline',
            paths: [[a, b]],
            spatialReference: result.spatialReference
          },
          symbol: symbolFor(manifoldRole)
        }), cfg.parentId, manifoldRole, null, cfg.supportCapabilities));
      }

      return result;
    };
  });
})();
