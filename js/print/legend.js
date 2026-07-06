// -----------------------------------------------------------------------------
// Dynamic Existing/Proposed print legend.
// Builds the legend as an SVG fragment, populated ONLY with the element types
// actually drawn, sorted into two equal underlined segments (Existing | Proposed)
// based on each graphic's attributes.drawingMode. One entry per distinct
// (toolType, mode). Each swatch is the tool's REAL sidebar icon (cloned from the
// cached button) rendered in the correct mode via the app's drawing-mode icon
// transform - so the legend matches the sidebar and the on-map symbology.
//
// Layout lives in js/print/template.js (legendBand/legendSegment), which
// consumes drawnEntries() + iconMarkup() from here.
//
// Exposes: window.SitePlanPrintLegend = { drawnEntries, iconMarkup, _registry }
// -----------------------------------------------------------------------------
(function () {
  'use strict';

  // Family shared registries that expose getTools().
  const FAMILIES = [
    'SitePlanStructuresShared', 'SitePlanWellSepticShared', 'SitePlanParkingShared',
    'SitePlanAccessShared', 'SitePlanUtilitiesShared', 'SitePlanDrawShared'
  ];

  // Tool types that never appear in the print legend. Setback and text/callout.
  const EXCLUDED_TOOL_TYPES = { setback: true, text: true, callout: true };

  // toolId -> registered tool API (has .id, .label, .buildButton)
  function registry() {
    const map = {};
    FAMILIES.forEach(name => {
      const shared = window[name];
      if (!shared || typeof shared.getTools !== 'function') return;
      let tools = [];
      try { tools = shared.getTools() || []; } catch (e) {}
      tools.forEach(t => { if (t && t.id) map[t.id] = t; });
    });
    return map;
  }

  // Clone the tool's icon SVG from its cached sidebar button (non-destructive).
  function iconClone(tool) {
    try {
      const btn = typeof tool.buildButton === 'function' ? tool.buildButton() : null;
      const svg = btn && btn.querySelector('.tool-icon svg');
      return svg ? svg.cloneNode(true) : null;
    } catch (e) { return null; }
  }

  // Distinct (toolId, mode) pairs present on drawLayer. Support/child graphics
  // (__nonSelectable) are ignored. Tools with no Existing/Proposed concept have
  // no drawingMode attribute -> bucketed as 'existing' for now (refine later).
  function drawnEntries() {
    const RT = window.SitePlanRuntime;
    const graphics = (RT && RT.drawLayer && RT.drawLayer.graphics && RT.drawLayer.graphics.toArray)
      ? RT.drawLayer.graphics.toArray() : [];
    const reg = registry();
    const seen = {};
    graphics.forEach(g => {
      if (!g || g.__nonSelectable) return;
      const a = g.attributes || {};
      const toolId = a.toolType || g.__toolType;
      if (!toolId || EXCLUDED_TOOL_TYPES[toolId]) return;
      const tool = reg[toolId];
      if (!tool) return;
      const mode = a.drawingMode === 'proposed' ? 'proposed' : 'existing';
      const key = toolId + '|' + mode;
      if (seen[key]) return;
      seen[key] = { toolId, mode, label: tool.label || toolId, tool };
    });
    return Object.keys(seen).map(k => seen[k]);
  }

  function applyModeToClone(icon, mode) {
    const proposed = mode === 'proposed';
    const ex = icon.querySelectorAll('[class*="existing"]');
    const pr = icon.querySelectorAll('[class*="proposed"]');
    if (ex.length || pr.length) {
      (proposed ? ex : pr).forEach(el => el.remove());
      (proposed ? pr : ex).forEach(el => {
        el.style.display = '';
        el.removeAttribute('display');
      });
      return;
    }
    const DM = window.SitePlanDrawingMode;
    if (DM && DM.applyDrawingModeToIcon) DM.applyDrawingModeToIcon(icon, mode);
  }

  // Serialize a cloned icon, mode-transformed, aspect-preserved to height `h`.
  function iconMarkup(tool, mode, x, y, h) {
    const icon = iconClone(tool);
    if (!icon) return { markup: '', width: 0 };
    try { applyModeToClone(icon, mode); } catch (e) {}
    const vb = (icon.getAttribute('viewBox') || '0 0 16 16').trim().split(/[\s,]+/).map(Number);
    const aspect = (vb[2] && vb[3]) ? vb[2] / vb[3] : 1;
    const w = Math.max(10, Math.min(30, Math.round(h * aspect)));
    icon.setAttribute('width', w);
    icon.setAttribute('height', h);
    icon.removeAttribute('class');
    let s = '';
    try { s = new XMLSerializer().serializeToString(icon); } catch (e) { return { markup: '', width: 0 }; }
    return { markup: '<g transform="translate(' + x + ',' + y + ')">' + s + '</g>', width: w };
  }

  // _registry is a console-debugging affordance (no code callers) - keep it.
  window.SitePlanPrintLegend = { drawnEntries, iconMarkup, _registry: registry };
})();
