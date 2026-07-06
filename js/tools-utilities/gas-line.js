// Gas line utility polyline tool.
// Drawing lifecycle is handled by js/utils/polyline-tool.js.

(function () {
  if (!window.SitePlanRuntimeReady) {
    console.error('[tools-utilities/gas-line] window.SitePlanRuntimeReady is missing. ' +
      'Make sure js/runtime.js and js/tools-utilities/utilities-shared.js load first.');
    return;
  }
  if (!window.SitePlanPolylineTool) {
    console.error('[tools-utilities/gas-line] window.SitePlanPolylineTool is missing. ' +
      'Make sure js/utils/polyline-tool.js is loaded before gas-line.js.');
    return;
  }

  window.SitePlanRuntimeReady.then(RT => {
    const US = window.SitePlanUtilitiesShared = window.SitePlanUtilitiesShared || {};
    const SH = window.SitePlanPolylineTool.snap;

    const TOOL_ID           = 'gasLine';
    const BUTTON_ID         = 'btn-gas-line';
    const BLACK             = [44, 53, 57, 255];
    const EDGE_TOLERANCE_PX = 10;

    // Symbols
    function symbol() {
      return window.SitePlanPolylineTool.makeCimTextLineSymbol({
        dashed: !!(window.SitePlanDrawingMode && window.SitePlanDrawingMode.isProposed('utilities')),
        text: 'G',
        color: BLACK,
        frame: { xmin: -8, ymin: -4, xmax: 8, ymax: 4 }
      });
    }

    function fallbackSymbol() {
      return { type: 'simple-line', color: [0, 0, 0, 1], width: 2.2, cap: 'round', join: 'round' };
    }

    function previewSymbol() {
      return { type: 'simple-line', color: [0, 0, 0, 0.72], width: 2.2, style: 'short-dash', cap: 'round', join: 'round' };
    }

    function floatingPointSymbol() {
      return { type: 'simple-marker', style: 'circle', color: [255, 255, 255, 1], size: 7,
               outline: { type: 'simple-line', color: [0, 0, 0, 1], width: 1.3 } };
    }

    function snapPointSymbol() {
      return { type: 'simple-marker', style: 'circle', color: [247, 148, 30, 1], size: 9,
               outline: { type: 'simple-line', color: [255, 255, 255, 1], width: 1.2 } };
    }

    // Polygons that gas lines can snap to: proposed/existing structures,
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

    // Snap function (used for both draw-time clicks and edit-time checks).
    const getSnapPoint = SH.createResolver(RT, [
      { mode: 'edge', tolerancePx: EDGE_TOLERANCE_PX, candidates: snapCandidatePolygons }
    ]);

    const editSnap = window.SitePlanPolylineTool.makeEditSnap(RT, getSnapPoint, snapPointSymbol);

    const gasLineIcon =
      '<svg viewBox="0 0 36 22" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">' +
        '<g class="dm-existing">' +
          '<line x1="3" y1="11" x2="14.4" y2="11" stroke="#2C3539" stroke-width="3" stroke-linecap="butt"/>' +
          '<line x1="21.6" y1="11" x2="33" y2="11" stroke="#2C3539" stroke-width="3" stroke-linecap="butt"/>' +
          '<text x="18" y="11.6" font-family="Arial, sans-serif" font-size="7" font-weight="700" fill="#2C3539" text-anchor="middle" dominant-baseline="middle">G</text>' +
        '</g>' +
        '<g class="dm-proposed" style="display:none">' +
          '<g fill="#2C3539">' +
            '<rect x="3" y="9.5" width="5.1" height="3"/>' +
            '<rect x="9.3" y="9.5" width="5.1" height="3"/>' +
            '<rect x="21.6" y="9.5" width="5.1" height="3"/>' +
            '<rect x="27.9" y="9.5" width="5.1" height="3"/>' +
          '</g>' +
          '<text x="18" y="11.6" font-family="Arial, sans-serif" font-size="7" font-weight="700" fill="#2C3539" text-anchor="middle" dominant-baseline="middle">G</text>' +
        '</g>' +
      '</svg>';

    const drawing = window.SitePlanPolylineTool.create({
      RT,
      toolId:      TOOL_ID,
      buttonId:    BUTTON_ID,
      category:    'utilities',
      label:       'Gas line',
      idPrefix:    'gasline',
      order:       30,
      proposedMode: true,
      iconApply:   window.SitePlanDrawingMode.iconSwapApply,
      iconClass:   'dm-line36',
      buttonTitle: 'Draw a gas line',
      iconHtml:    gasLineIcon,

      toolCapabilities: { reshape: true, resize: false, rotate: false, label: false, duplicate: true, delete: true },

      symbol,
      previewSymbol,
      floatingPointSymbol,
      snapPointSymbol,
      getSnapPoint,

      applyExtraMetadata: graphic => {
        if (US.ensureSitePlanId) {
          const id = US.ensureSitePlanId(graphic, 'gasline');
          graphic.attributes = Object.assign({}, graphic.attributes || {}, { sitePlanId: id });
        }
        if (US.applyToolCapabilities) US.applyToolCapabilities(graphic, drawing.toolCapabilities);
      },

      onAnnounce:     ()          => { if (US.announceToolActivated) US.announceToolActivated(TOOL_ID); },
      onCancelOthers: clearButton => {
        if (US.cancelAllExcept) US.cancelAllExcept(TOOL_ID, clearButton);
        if (US.clearActiveAllExcept) US.clearActiveAllExcept(TOOL_ID);
      },
      onSketchUpdate: editSnap.onSketchUpdate
    });

    const api = Object.assign({}, drawing, {
      fallbackSymbol,
      clearPreview:        () => { drawing.clearPreview(); editSnap.clearEditSnapPreview(); },
      clearEditSnapPreview: editSnap.clearEditSnapPreview
    });

    window.startGasLineTool    = drawing.start;
    window.SitePlanGasLineTool = Object.assign({}, window.SitePlanGasLineTool || {}, api);

    if (typeof US.registerTool === 'function') {
      US.registerTool(window.SitePlanGasLineTool);
    } else {
      console.warn('[tools-utilities/gas-line] Utilities registry unavailable.');
    }

  }).catch(err => {
    console.error('[tools-utilities/gas-line] Failed to initialize after runtime ready:', err);
  });
}());
