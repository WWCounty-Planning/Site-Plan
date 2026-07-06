// Overhead power line utility polyline tool.
// Drawing lifecycle is handled by js/utils/polyline-tool.js.

(function () {
  if (!window.SitePlanRuntimeReady) {
    console.error('[tools-utilities/power-line] window.SitePlanRuntimeReady is missing. ' +
      'Make sure js/runtime.js and js/tools-utilities/utilities-shared.js load first.');
    return;
  }
  if (!window.SitePlanPolylineTool) {
    console.error('[tools-utilities/power-line] window.SitePlanPolylineTool is missing. ' +
      'Make sure js/utils/polyline-tool.js is loaded before power-line.js.');
    return;
  }

  window.SitePlanRuntimeReady.then(RT => {
    const US = window.SitePlanUtilitiesShared = window.SitePlanUtilitiesShared || {};
    const SH = window.SitePlanPolylineTool.snap;

    const TOOL_ID           = 'powerLine';
    const BUTTON_ID         = 'btn-power-line';
    const RED               = [192, 57, 43, 255];
    const SNAP_TOLERANCE_PX = 18;
    const EDGE_TOLERANCE_PX = 10;

    // ── Symbols ───────────────────────────────────────────────────────────
    function symbol() {
      return window.SitePlanPolylineTool.makeCimTextLineSymbol({
        dashed: !!(window.SitePlanDrawingMode && window.SitePlanDrawingMode.isProposed('utilities')),
        text: 'OHP',
        color: RED,
        textHeight: 7,
        haloColor: [255, 255, 255, 210],
        frame: { xmin: -12, ymin: -4, xmax: 12, ymax: 4 }
      });
    }

    function fallbackSymbol() {
      return { type: 'simple-line', color: [192, 57, 43, 1], width: 2.2, cap: 'round', join: 'round' };
    }

    function previewSymbol() {
      return { type: 'simple-line', color: [192, 57, 43, 0.72], width: 2.2, style: 'short-dash', cap: 'round', join: 'round' };
    }

    function floatingPointSymbol() {
      return { type: 'simple-marker', style: 'circle', color: [255, 255, 255, 1], size: 7,
               outline: { type: 'simple-line', color: [192, 57, 43, 1], width: 1.3 } };
    }

    function snapPointSymbol() {
      return { type: 'simple-marker', style: 'circle', color: [247, 148, 30, 1], size: 9,
               outline: { type: 'simple-line', color: [255, 255, 255, 1], width: 1.2 } };
    }

    // ── Snap candidates ───────────────────────────────────────────────────
    // Polygons that power lines can snap to: proposed/existing structures,
    // free-form polygons, and rectangles drawn on the draw layer.
    function snapCandidatePolygons() {
      return US.graphicsInLayer(RT.drawLayer).filter(g => {
        if (!g || !g.geometry || g.geometry.type !== 'polygon') return false;
        if (g.__nonSelectable) return false;
        const t = g.__toolType ||
          (g.attributes && (g.attributes.toolType || g.attributes.sitePlanTool)) || '';
        return t === 'structure' || t === 'proposedStructure' || t === 'existingStructure' ||
               t === 'polygon'           || t === 'rectangle';
      });
    }

    // Utility pole point graphics as connection-point snap candidates.
    function utilityPoleCandidates() {
      const tool = US.getTool('utilityPole');
      if (!tool || typeof tool.isParent !== 'function') return [];
      return US.graphicsInLayer(RT.drawLayer)
        .filter(g => tool.isParent(g) && g.geometry && g.geometry.type === 'point')
        .map(g => ({ point: g.geometry, parent: g, snapType: 'utility-pole' }));
    }

    // ── Snap function (used for both draw-time clicks and edit-time checks) ─
    const getSnapPoint = SH.createResolver(RT, [
      { mode: 'connection', tolerancePx: SNAP_TOLERANCE_PX, candidates: utilityPoleCandidates },
      { mode: 'edge',       tolerancePx: EDGE_TOLERANCE_PX, candidates: snapCandidatePolygons }
    ]);

    // ── Edit snap ─────────────────────────────────────────────────────────
    const editSnap = window.SitePlanPolylineTool.makeEditSnap(RT, getSnapPoint, snapPointSymbol);

    // ── Icon ──────────────────────────────────────────────────────────────
    const powerLineIcon =
      '<svg viewBox="0 0 36 22" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">' +
        '<g class="dm-existing">' +
          '<line x1="3" y1="11" x2="9.4" y2="11" stroke="#C0392B" stroke-width="3" stroke-linecap="butt"/>' +
          '<line x1="26.6" y1="11" x2="33" y2="11" stroke="#C0392B" stroke-width="3" stroke-linecap="butt"/>' +
          '<text x="18" y="11.6" font-family="Arial, sans-serif" font-size="7" font-weight="700" fill="#C0392B" text-anchor="middle" dominant-baseline="middle">OHP</text>' +
        '</g>' +
        '<g class="dm-proposed" style="display:none">' +
          '<g fill="#C0392B">' +
            '<rect x="3" y="9.5" width="2.8" height="3"/>' +
            '<rect x="6.6" y="9.5" width="2.8" height="3"/>' +
            '<rect x="26.6" y="9.5" width="2.8" height="3"/>' +
            '<rect x="30.2" y="9.5" width="2.8" height="3"/>' +
          '</g>' +
          '<text x="18" y="11.6" font-family="Arial, sans-serif" font-size="7" font-weight="700" fill="#C0392B" text-anchor="middle" dominant-baseline="middle">OHP</text>' +
        '</g>' +
      '</svg>';

    // ── Drawing factory ───────────────────────────────────────────────────
    const drawing = window.SitePlanPolylineTool.create({
      RT,
      toolId:      TOOL_ID,
      buttonId:    BUTTON_ID,
      category:    'utilities',
      label:       'Overhead power',
      idPrefix:    'powerline',
      order:       20,
      proposedMode: true,
      iconApply:   window.SitePlanDrawingMode.iconSwapApply,
      iconClass:   'dm-line36',
      buttonTitle: 'Draw an overhead power line',
      iconHtml:    powerLineIcon,

      toolCapabilities: { reshape: true, resize: false, rotate: false, label: false, duplicate: true, delete: true },

      symbol,
      previewSymbol,
      floatingPointSymbol,
      snapPointSymbol,
      getSnapPoint,

      applyExtraMetadata: graphic => {
        const id = US.ensureSitePlanId(graphic, 'powerline');
        graphic.attributes = Object.assign({}, graphic.attributes || {}, { sitePlanId: id });
        US.applyToolCapabilities(graphic, drawing.toolCapabilities);
      },

      onAnnounce:     ()          => { US.announceToolActivated(TOOL_ID); },
      onCancelOthers: clearButton => {
        US.cancelAllExcept(TOOL_ID, clearButton);
        US.clearActiveAllExcept(TOOL_ID);
      },
      onSketchUpdate: editSnap.onSketchUpdate
    });

    const api = Object.assign({}, drawing, {
      fallbackSymbol,
      clearPreview:        () => { drawing.clearPreview(); editSnap.clearEditSnapPreview(); },
      clearEditSnapPreview: editSnap.clearEditSnapPreview
    });

    window.startPowerLineTool    = drawing.start;
    window.SitePlanPowerLineTool = Object.assign({}, window.SitePlanPowerLineTool || {}, api);

    if (typeof US.registerTool === 'function') {
      US.registerTool(window.SitePlanPowerLineTool);
    } else {
      console.warn('[tools-utilities/power-line] Utilities registry unavailable.');
    }

  }).catch(err => {
    console.error('[tools-utilities/power-line] Failed to initialize after runtime ready:', err);
  });
}());
