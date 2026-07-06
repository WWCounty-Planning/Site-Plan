// Shared registry and helpers for Utilities tools.

(function () {
  if (!window.SitePlanRuntimeReady) {
    console.error('[tools-utilities/shared] window.SitePlanRuntimeReady is missing. ' +
      'Make sure js/runtime.js is loaded before js/tools-utilities/utilities-shared.js.');
    return;
  }

  window.SitePlanRuntimeReady.then(RT => {
    const shared = window.SitePlanUtilitiesShared = window.SitePlanUtilitiesShared || {};

    shared.RT = RT;
    shared.sectionId = shared.sectionId || 'tools-utilities';
    shared.source = shared.source || 'tools-utilities';
    shared.tools = shared.tools || {};

    shared.registerTool = function registerTool(toolDefinition) {
      if (!toolDefinition || !toolDefinition.id) {
        console.warn('[tools-utilities/shared] Ignoring tool registration without an id.', toolDefinition);
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
        catch (err) { console.warn('[tools-utilities/shared] getElements failed for ' + tool.id + '.', err); }
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

    shared.cancelAllExcept = function cancelAllExcept(activeToolId, clearButtonState) {
      shared.getTools().forEach(tool => {
        if (!tool || tool.id === activeToolId || typeof tool.cancel !== 'function') return;
        try {
          tool.cancel(!!clearButtonState);
        } catch (err) {
          console.warn('[tools-utilities/shared] Tool cancel failed for ' + tool.id + '.', err);
        }
      });
    };

    shared.clearActiveAllExcept = function clearActiveAllExcept(activeToolId) {
      shared.getTools().forEach(tool => {
        if (!tool || tool.id === activeToolId || typeof tool.clearActive !== 'function') return;
        try {
          tool.clearActive();
        } catch (err) {
          console.warn('[tools-utilities/shared] Tool clearActive failed for ' + tool.id + '.', err);
        }
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
        graphic.__sitePlanId = (prefix || 'utility') + '_' + Date.now() + '_' + suffix;
      }
      graphic.attributes = Object.assign({}, graphic.attributes || {}, {
        sitePlanId: graphic.__sitePlanId
      });
      return graphic.__sitePlanId;
    };

    shared.graphicsInLayer = function graphicsInLayer(layer) {
      if (!layer || !layer.graphics) return [];
      if (typeof layer.graphics.toArray === 'function') return layer.graphics.toArray();
      if (Array.isArray(layer.graphics.items)) return layer.graphics.items.slice();
      return [];
    };

    shared.svgDataUrl = function svgDataUrl(svg) {
      return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg);
    };

    shared.clamp = function clamp(value, min, max) {
      return Math.max(min, Math.min(max, value));
    };

    // Computes a zoom-responsive marker size in pixels.
    // Defaults: min=8, default=10, max=16, calibrated for zoom 18 at ~1:1128–1:18056.
    shared.markerSize = function markerSize() {
      const view = shared.RT && shared.RT.view;
      const min = 8, def = 10, max = 16;
      const zoom = view && Number.isFinite(view.zoom) ? view.zoom : null;
      if (zoom != null) return shared.clamp(Math.round(def + (zoom - 18) * 1.2), min, max);
      const scale = view && Number.isFinite(view.scale) ? view.scale : null;
      if (!scale || scale <= 0) return def;
      const lowScale = 18056, midScale = 4514, highScale = 1128;
      if (scale >= lowScale) return min;
      if (scale <= highScale) return max;
      if (scale >= midScale) {
        const t = (lowScale - scale) / (lowScale - midScale);
        return Math.round(min + t * (def - min));
      }
      const t = (midScale - scale) / (midScale - highScale);
      return Math.round(def + t * (max - def));
    };

    shared.bringToFront = function bringToFront(graphic) {
      const RT = shared.RT;
      if (!graphic || !RT.drawLayer || !RT.drawLayer.graphics) return;
      const graphics = RT.drawLayer.graphics;
      try {
        if (typeof graphics.reorder === 'function') {
          graphics.reorder(graphic, graphics.length - 1);
          return;
        }
      } catch (err) {}
      try {
        if (graphic.layer === RT.drawLayer) {
          RT.drawLayer.remove(graphic);
          RT.drawLayer.add(graphic);
        }
      } catch (err) {}
    };

    shared.isUtilityLine = function isUtilityLine(graphic) {
      const attrs = graphic && graphic.attributes ? graphic.attributes : {};
      const t = (graphic && graphic.__toolType) || attrs.toolType || attrs.sitePlanTool || '';
      const category = attrs.sitePlanCategory || '';
      return !!(graphic &&
        (t === 'waterLine' || t === 'powerLine' || t === 'gasLine' || category === 'utilities') &&
        graphic.geometry && graphic.geometry.type === 'polyline');
    };
  }).catch(err => {
    console.error('[tools-utilities/shared] Failed to initialize after runtime ready:', err);
  });
})();
