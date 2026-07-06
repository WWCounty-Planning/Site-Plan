// Water line utility polyline tool.
// Drawing lifecycle is handled by js/utils/polyline-tool.js.

(function () {
  if (!window.SitePlanRuntimeReady) {
    console.error('[tools-utilities/water-line] window.SitePlanRuntimeReady is missing. ' +
      'Make sure js/runtime.js and js/tools-utilities/utilities-shared.js load first.');
    return;
  }
  if (!window.SitePlanPolylineTool) {
    console.error('[tools-utilities/water-line] window.SitePlanPolylineTool is missing. ' +
      'Make sure js/utils/polyline-tool.js is loaded before water-line.js.');
    return;
  }

  window.SitePlanRuntimeReady.then(RT => {
    const US = window.SitePlanUtilitiesShared = window.SitePlanUtilitiesShared || {};
    const SH = window.SitePlanPolylineTool.snap;

    const TOOL_ID              = 'waterLine';
    const BUTTON_ID            = 'btn-water-line';
    const BLUE                 = [2, 54, 129, 255];
    const SNAP_TOLERANCE_PX    = 18;
    const EDGE_TOLERANCE_PX    = 10;

    // Proposed mode dashes the line; existing stays solid.
    function isProposed() {
      return !!(window.SitePlanDrawingMode && window.SitePlanDrawingMode.isProposed('utilities'));
    }

    function symbol() {
      return window.SitePlanPolylineTool.makeCimTextLineSymbol({
        text: 'W',
        color: BLUE,
        textHeight: 7,
        haloColor: [255, 255, 255, 210],
        frame: { xmin: -8, ymin: -4, xmax: 8, ymax: 4 },
        dashed: isProposed()
      });
    }

    function fallbackSymbol() {
      return { type: 'simple-line', color: [2, 54, 129, 1], width: 2.2, cap: 'round', join: 'round' };
    }

    function previewSymbol() {
      return { type: 'simple-line', color: [2, 54, 129, 0.72], width: 2.2, style: 'short-dash', cap: 'round', join: 'round' };
    }

    function floatingPointSymbol() {
      return { type: 'simple-marker', style: 'circle', color: [255, 255, 255, 1], size: 7,
               outline: { type: 'simple-line', color: [2, 54, 129, 1], width: 1.3 } };
    }

    function snapPointSymbol() {
      return { type: 'simple-marker', style: 'circle', color: [247, 148, 30, 1], size: 9,
               outline: { type: 'simple-line', color: [255, 255, 255, 1], width: 1.2 } };
    }

    // Polygons that water lines can snap to: proposed/existing structures,
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

    // Water meter point graphics as connection-point snap candidates.
    function waterMeterCandidates() {
      const tool = US.getTool('waterMeter');
      if (!tool || typeof tool.isParent !== 'function') return [];
      return US.graphicsInLayer(RT.drawLayer)
        .filter(g => tool.isParent(g) && g.geometry && g.geometry.type === 'point')
        .map(g => ({ point: g.geometry, parent: g, snapType: 'water-meter' }));
    }

    // ── Snap function (used for both draw-time clicks and edit-time checks) ─
    const getSnapPoint = SH.createResolver(RT, [
      { mode: 'connection', tolerancePx: SNAP_TOLERANCE_PX, candidates: waterMeterCandidates },
      { mode: 'edge',       tolerancePx: EDGE_TOLERANCE_PX, candidates: snapCandidatePolygons }
    ]);

    // ── Edit snap ─────────────────────────────────────────────────────────
    const editSnap = window.SitePlanPolylineTool.makeEditSnap(RT, getSnapPoint, snapPointSymbol);

    // ── Icon ──────────────────────────────────────────────────────────────
    const waterLineIcon =
      '<svg viewBox="0 0 36 22" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">' +
        '<g class="dm-existing">' +
          '<line x1="3" y1="11" x2="13.6" y2="11" stroke="#023681" stroke-width="3" stroke-linecap="butt"/>' +
          '<line x1="22.4" y1="11" x2="33" y2="11" stroke="#023681" stroke-width="3" stroke-linecap="butt"/>' +
          '<text x="18" y="11.6" font-family="Arial, sans-serif" font-size="7" font-weight="700" fill="#023681" text-anchor="middle" dominant-baseline="middle">W</text>' +
        '</g>' +
        '<g class="dm-proposed" style="display:none">' +
          '<g fill="#023681">' +
            '<rect x="3" y="9.5" width="4.7" height="3"/>' +
            '<rect x="8.9" y="9.5" width="4.7" height="3"/>' +
            '<rect x="22.4" y="9.5" width="4.7" height="3"/>' +
            '<rect x="28.3" y="9.5" width="4.7" height="3"/>' +
          '</g>' +
          '<text x="18" y="11.6" font-family="Arial, sans-serif" font-size="7" font-weight="700" fill="#023681" text-anchor="middle" dominant-baseline="middle">W</text>' +
        '</g>' +
      '</svg>';

    // ── Drawing factory ───────────────────────────────────────────────────
    const drawing = window.SitePlanPolylineTool.create({
      RT,
      toolId:      TOOL_ID,
      buttonId:    BUTTON_ID,
      category:    'utilities',
      label:       'Water line',
      idPrefix:    'waterline',
      order:       10,
      buttonTitle: 'Draw a water line',
      iconHtml:    waterLineIcon,
      iconClass:   'dm-line36',
      proposedMode: true,
      iconApply:   window.SitePlanDrawingMode.iconSwapApply,

      toolCapabilities: { reshape: true, resize: false, rotate: false, label: false, duplicate: true, delete: true },

      symbol,
      previewSymbol,
      floatingPointSymbol,
      snapPointSymbol,
      getSnapPoint,

      applyExtraMetadata: graphic => {
        if (US.ensureSitePlanId) {
          const id = US.ensureSitePlanId(graphic, 'waterline');
          graphic.attributes = Object.assign({}, graphic.attributes || {}, { sitePlanId: id });
        }
        if (US.applyToolCapabilities) US.applyToolCapabilities(graphic, drawing.toolCapabilities);
      },

      onAnnounce:     ()          => { if (US.announceToolActivated) US.announceToolActivated(TOOL_ID); },
      onCancelOthers: clearButton => {
        if (US.cancelAllExcept)    US.cancelAllExcept(TOOL_ID, clearButton);
        if (US.clearActiveAllExcept) US.clearActiveAllExcept(TOOL_ID);
      },
      onSketchUpdate: editSnap.onSketchUpdate
    });

    // ── Registration ──────────────────────────────────────────────────────
    const api = Object.assign({}, drawing, {
      fallbackSymbol,
      clearPreview:        () => { drawing.clearPreview(); editSnap.clearEditSnapPreview(); },
      clearEditSnapPreview: editSnap.clearEditSnapPreview
    });

    window.startWaterLineTool   = drawing.start;
    window.SitePlanWaterLineTool = Object.assign({}, window.SitePlanWaterLineTool || {}, api);

    if (typeof US.registerTool === 'function') {
      US.registerTool(window.SitePlanWaterLineTool);
    } else {
      console.warn('[tools-utilities/water-line] Utilities registry unavailable.');
    }

  }).catch(err => {
    console.error('[tools-utilities/water-line] Failed to initialize after runtime ready:', err);
  });
}());
