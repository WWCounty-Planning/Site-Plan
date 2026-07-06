// Fence line draw tool using js/utils/polyline-tool.js factory.

(function () {
  if (!window.SitePlanRuntimeReady) {
    console.error('[tools-draw/fence-line] window.SitePlanRuntimeReady is missing. Make sure js/runtime.js loads first.');
    return;
  }
  if (!window.SitePlanDrawShared) {
    console.error('[tools-draw/fence-line] SitePlanDrawShared is missing. Make sure js/tools-draw/draw-shared.js loads first.');
    return;
  }
  if (!window.SitePlanPolylineTool) {
    console.error('[tools-draw/fence-line] SitePlanPolylineTool is missing. Make sure js/utils/polyline-tool.js loads first.');
    return;
  }

  window.SitePlanRuntimeReady.then(RT => {
    const DS = window.SitePlanDrawShared;
    const SH = window.SitePlanPolylineTool.snap;

    const TOOL_ID               = 'fenceLine';
    const BUTTON_ID             = 'btn-fence-line';
    const BROWN                 = [127, 75, 48, 255];
    const EDGE_TOLERANCE_PX     = 10;
    const ENDPOINT_TOLERANCE_PX = 12;

    const TOOL_CAPABILITIES = DS && typeof DS.lineToolCapabilities === 'function'
      ? DS.lineToolCapabilities()
      : { reshape: true, resize: false, rotate: false, label: false, duplicate: true, delete: true };

    // Symbols — proposed mode dashes the line; existing stays solid.
    function symbol() {
      return window.SitePlanPolylineTool.makeCimTextLineSymbol({
        dashed: !!(window.SitePlanDrawingMode && window.SitePlanDrawingMode.isProposed('draw')),
        text: 'X',
        color: BROWN,
        frame: { xmin: -8, ymin: -4, xmax: 8, ymax: 4 }
      });
    }

    function previewSymbol() {
      return { type: 'simple-line', color: [139, 90, 43, 0.72], width: 2.2, style: 'short-dash', cap: 'round', join: 'round' };
    }

    function floatingPointSymbol() {
      return { type: 'simple-marker', style: 'circle', color: [255, 255, 255, 1], size: 7,
               outline: { type: 'simple-line', color: [139, 90, 43, 1], width: 1.3 } };
    }

    function snapPointSymbol() {
      return { type: 'simple-marker', style: 'circle', color: [247, 148, 30, 1], size: 9,
               outline: { type: 'simple-line', color: [255, 255, 255, 1], width: 1.2 } };
    }

    const fenceLineIcon =
      '<svg viewBox="0 0 36 22" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">' +
        '<g class="dm-existing">' +
          '<line x1="3" y1="11" x2="14" y2="11" stroke="#7F4B30" stroke-width="3" stroke-linecap="butt"/>' +
          '<line x1="22" y1="11" x2="33" y2="11" stroke="#7F4B30" stroke-width="3" stroke-linecap="butt"/>' +
          '<text x="18" y="11.6" font-family="Arial, sans-serif" font-size="7" font-weight="700" fill="#7F4B30" text-anchor="middle" dominant-baseline="middle">X</text>' +
        '</g>' +
        '<g class="dm-proposed" style="display:none">' +
          '<g fill="#7F4B30">' +
            '<rect x="3" y="9.5" width="4.9" height="3"/>' +
            '<rect x="9.1" y="9.5" width="4.9" height="3"/>' +
            '<rect x="22" y="9.5" width="4.9" height="3"/>' +
            '<rect x="28.1" y="9.5" width="4.9" height="3"/>' +
          '</g>' +
          '<text x="18" y="11.6" font-family="Arial, sans-serif" font-size="7" font-weight="700" fill="#7F4B30" text-anchor="middle" dominant-baseline="middle">X</text>' +
        '</g>' +
      '</svg>';

    function layerGraphics(layer) {
      if (!layer || !layer.graphics) return [];
      return layer.graphics.toArray ? layer.graphics.toArray() : [];
    }

    function snapCandidatePolygons() {
      return [
        ...layerGraphics(RT.drawLayer).filter(g =>
          g.geometry && g.geometry.type === 'polygon' && !g.__nonSelectable),
        ...layerGraphics(RT.highlightLayer).filter(g =>
          g.geometry && g.geometry.type === 'polygon')
      ];
    }

    function existingFenceLines() {
      return layerGraphics(RT.drawLayer).filter(g =>
        g.__toolType === TOOL_ID && g.geometry && g.geometry.type === 'polyline');
    }

    const getSnapPoint = SH.createResolver(RT, [
      { mode: 'edge',     tolerancePx: EDGE_TOLERANCE_PX, candidates: snapCandidatePolygons },
      { mode: 'endpoint', tolerancePx: ENDPOINT_TOLERANCE_PX, candidates: existingFenceLines }
    ]);

    const editSnap = window.SitePlanPolylineTool.makeEditSnap(RT, getSnapPoint, snapPointSymbol);

    const tool = window.SitePlanPolylineTool.create({
      RT,
      toolId:           TOOL_ID,
      buttonId:         BUTTON_ID,
      category:         'draw',
      label:            'Fence line',
      idPrefix:         'fenceline',
      order:            55,
      iconHtml:         fenceLineIcon,
      iconClass:        'icon-fence-line dm-line36',
      buttonTitle:      'Draw a fence line. Snaps to parcel boundaries, structures, and existing fence endpoints.',
      proposedMode:     true,
      iconApply:        window.SitePlanDrawingMode.iconSwapApply,
      symbol,
      previewSymbol,
      floatingPointSymbol,
      snapPointSymbol,
      getSnapPoint,
      toolCapabilities: TOOL_CAPABILITIES,
      onAnnounce:       () => DS.announceToolActivated(TOOL_ID),
      onCancelOthers:   () => { DS.cancelAllExcept(TOOL_ID); DS.clearActiveAllExcept(TOOL_ID); },
      onSketchUpdate:   editSnap.onSketchUpdate,
      applyExtraMetadata: graphic => {
        if (DS && typeof DS.applyToolCapabilities === 'function') {
          DS.applyToolCapabilities(RT, graphic, TOOL_CAPABILITIES);
        }
      },
      onGraphicUpdated: (graphic, event) => {
        if (event && event.state === 'complete' && typeof RT.refreshSnapSources === 'function') {
          RT.refreshSnapSources();
        }
      }
    });

    const api = Object.assign({}, tool, {
      clearPreview:        () => { tool.clearPreview(); editSnap.clearEditSnapPreview(); },
      clearEditSnapPreview: editSnap.clearEditSnapPreview
    });

    DS.registerTool(api);
    window.startFenceLineTool    = tool.start;
    window.SitePlanFenceLineTool = api;

  }).catch(err => {
    console.error('[tools-draw/fence-line] Failed to initialize after runtime ready:', err);
  });
}());
