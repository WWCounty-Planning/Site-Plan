// Septic line tool. Drawing mechanics handled by js/utils/polyline-tool.js.

(function () {
  if (!window.SitePlanRuntimeReady) {
    console.error('[tools-well-septic/septic-line] window.SitePlanRuntimeReady is missing.');
    return;
  }
  if (!window.SitePlanPolylineTool) {
    console.error('[tools-well-septic/septic-line] window.SitePlanPolylineTool is missing. ' +
      'Make sure js/utils/polyline-tool.js is loaded before septic-line.js.');
    return;
  }

  window.SitePlanRuntimeReady.then(RT => {
    const WS = window.SitePlanWellSepticShared = window.SitePlanWellSepticShared || {};
    const SH = window.SitePlanPolylineTool.snap;

    const TOOL_ID                  = 'septicLine';
    const BUTTON_ID                = 'btn-septic-line';
    const GREEN                    = [63, 90, 54, 255];
    const SNAP_TOLERANCE_PX        = 18;
    const GENERIC_SNAP_TOLERANCE_PX = 10;

    const TOOL_CAPABILITIES = {
      reshape: true, resize: false, rotate: false,
      label: false, duplicate: true, delete: true
    };

    let coordinator = {};

    function setCoordinator(ctx) { coordinator = ctx || {}; return api; }
    function callCoordinator(name) {
      const fn = coordinator && coordinator[name];
      if (typeof fn !== 'function') return undefined;
      const args = Array.prototype.slice.call(arguments, 1);
      return fn.apply(null, args);
    }

    const septicLineIcon =
      '<svg viewBox="0 0 36 22" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">' +
        '<g class="dm-existing">' +
          '<line x1="3" y1="11" x2="10.1" y2="11" stroke="#3F5A36" stroke-width="3" stroke-linecap="butt"/>' +
          '<line x1="25.9" y1="11" x2="33" y2="11" stroke="#3F5A36" stroke-width="3" stroke-linecap="butt"/>' +
          '<text x="18" y="11.6" font-family="Arial, sans-serif" font-size="7" font-weight="700" fill="#3F5A36" text-anchor="middle" dominant-baseline="middle">OSS</text>' +
        '</g>' +
        '<g class="dm-proposed" style="display:none">' +
          '<g fill="#3F5A36">' +
            '<rect x="3" y="9.5" width="3.1" height="3"/>' +
            '<rect x="7.0" y="9.5" width="3.1" height="3"/>' +
            '<rect x="25.9" y="9.5" width="3.1" height="3"/>' +
            '<rect x="29.9" y="9.5" width="3.1" height="3"/>' +
          '</g>' +
          '<text x="18" y="11.6" font-family="Arial, sans-serif" font-size="7" font-weight="700" fill="#3F5A36" text-anchor="middle" dominant-baseline="middle">OSS</text>' +
        '</g>' +
      '</svg>';

    function symbol() {
      return window.SitePlanPolylineTool.makeCimTextLineSymbol({
        dashed: !!(window.SitePlanDrawingMode && window.SitePlanDrawingMode.isProposed('well-septic')),
        text: 'OSS',
        color: GREEN,
        frame: { xmin: -12, ymin: -4, xmax: 12, ymax: 4 }
      });
    }
    function previewSymbol() {
      return { type: 'simple-line', color: [63, 90, 54, 0.72], width: 2.2, style: 'short-dash', cap: 'round', join: 'round' };
    }
    function snapPointSymbol() {
      return { type: 'simple-marker', style: 'circle', color: [247, 148, 30, 1], size: 9,
               outline: { type: 'simple-line', color: [255, 255, 255, 1], width: 1.2 } };
    }
    function floatingPointSymbol() {
      return { type: 'simple-marker', style: 'circle', color: [255, 255, 255, 1], size: 7,
               outline: { type: 'simple-line', color: [63, 90, 54, 1], width: 1.3 } };
    }

    function getTool(id) {
      return WS && typeof WS.getTool === 'function' ? WS.getTool(id) : null;
    }
    function isToolParent(toolId, graphic, methodNames) {
      const tool = getTool(toolId);
      if (!tool) return false;
      for (const name of (methodNames || ['isParent'])) {
        if (typeof tool[name] === 'function') return !!tool[name](graphic);
      }
      return false;
    }
    function getConnectionPointsFromTool(toolId, graphic) {
      const tool = getTool(toolId);
      return tool && typeof tool.getConnectionPoints === 'function' ? tool.getConnectionPoints(graphic) || [] : [];
    }
    function getConnectionPointFromTool(toolId, graphic) {
      const tool = getTool(toolId);
      return tool && typeof tool.connectionPoint === 'function' ? tool.connectionPoint(graphic) || null : null;
    }

    function allConnectionSnapCandidates() {
      const septicTankTool = getTool('septicTank');
      const dboxTool       = getTool('distributionBox') || getTool('dbox');
      const drainfieldTool = getTool('drainfield') || getTool('drainfields');

      const tankCandidates = WS.graphicsInLayer(RT.drawLayer)
        .filter(g => septicTankTool && typeof septicTankTool.isParent === 'function' && septicTankTool.isParent(g))
        .flatMap(g => getConnectionPointsFromTool('septicTank', g)
          .map(pt => ({ point: pt, parent: g, snapType: 'septic-tank-endpoint' })));

      const dboxCandidates = WS.graphicsInLayer(RT.drawLayer)
        .filter(g => dboxTool && typeof dboxTool.isParent === 'function' && dboxTool.isParent(g))
        .flatMap(g => getConnectionPointsFromTool('distributionBox', g)
          .map(pt => ({ point: pt, parent: g, snapType: 'dbox-connection' })));

      const drainfieldCandidates = WS.graphicsInLayer(RT.drawLayer)
        .filter(g => !!(drainfieldTool && typeof drainfieldTool.isParent === 'function' && drainfieldTool.isParent(g)))
        .map(g => ({ point: getConnectionPointFromTool('drainfield', g), parent: g, snapType: 'drainfield-connection' }))
        .filter(c => !!c.point);

      return tankCandidates.concat(dboxCandidates, drainfieldCandidates);
    }

    function parentSelectIdForSupportGraphic(graphic) {
      const attrs = graphic && graphic.attributes ? graphic.attributes : {};
      return graphic && (graphic.__selectParentId || attrs.selectParentId || attrs.parentSitePlanId || null);
    }

    function isGenericSnapGraphic(graphic) {
      if (!graphic || !graphic.geometry) return false;
      if (graphic.__nonSelectable || graphic.__supportFor || parentSelectIdForSupportGraphic(graphic)) return false;
      if (isToolParent('well',           graphic) || isToolParent('septicTank',    graphic) ||
          isToolParent('distributionBox', graphic) || isToolParent('dbox',         graphic) ||
          isToolParent('drainfield',      graphic) || isToolParent('reserveDrainfield', graphic) ||
          (graphic.__toolType === TOOL_ID)) return false;
      return graphic.layer === RT.drawLayer && graphic.geometry.type === 'polygon';
    }

    // Kept on public API for backward compat — wraps SH.edgeSnap.
    function genericSnapPointInfo(rawPoint) {
      const polys = WS.graphicsInLayer(RT.drawLayer).filter(g => isGenericSnapGraphic(g));
      return SH.edgeSnap(RT.view, polys, rawPoint, GENERIC_SNAP_TOLERANCE_PX) || null;
    }

    function genericSnapPolygons() {
      return WS.graphicsInLayer(RT.drawLayer).filter(g => isGenericSnapGraphic(g));
    }

    const snapPointInfo = SH.createResolver(RT, [
      { mode: 'connection', tolerancePx: SNAP_TOLERANCE_PX, candidates: allConnectionSnapCandidates },
      { mode: 'edge',       tolerancePx: GENERIC_SNAP_TOLERANCE_PX, candidates: genericSnapPolygons }
    ], {
      fallback: rawPoint => ({
        snapped: false,
        point: WS.pointFromMapPoint(rawPoint),
        parent: null,
        distancePx: Infinity
      })
    });

    const editSnap = window.SitePlanPolylineTool.makeEditSnap(RT, snapPointInfo, snapPointSymbol, {
      onAfterSnap: graphic => {
        if (typeof RT.removeSideLabelsForGraphic === 'function') RT.removeSideLabelsForGraphic(graphic);
      }
    });

    const drawing = window.SitePlanPolylineTool.create({
      RT, toolId: TOOL_ID, buttonId: BUTTON_ID,
      category: 'well-septic', label: 'Septic line', idPrefix: 'septicline',
      order:       60,
      proposedMode: true,
      iconApply:   window.SitePlanDrawingMode.iconSwapApply,
      iconClass:   'dm-line36',
      buttonTitle: 'Draw a septic line and snap its ends to septic tank, D-box, or drainfield endpoints',
      iconHtml:    septicLineIcon,
      toolCapabilities: TOOL_CAPABILITIES,

      symbol, previewSymbol, floatingPointSymbol, snapPointSymbol,
      getSnapPoint: snapPointInfo,

      applyExtraMetadata: graphic => {
        if (WS.ensureSitePlanId) {
          const id = WS.ensureSitePlanId(graphic, 'septicline');
          if (id) graphic.attributes = Object.assign({}, graphic.attributes || {}, { sitePlanId: id });
        }
      },

      onAnnounce:      () => callCoordinator('announceToolActivated', TOOL_ID),
      onActiveChanged: active => callCoordinator('onActiveChanged', active),
      onCancelOthers: () => {
        callCoordinator('cancelSepticPlacement',  false);
        callCoordinator('cancelDboxPlacement',    false);
        callCoordinator('cancelDrainfieldPlacement', false);
        callCoordinator('clearSepticButton');
        callCoordinator('clearDboxButton');
        callCoordinator('clearDrainfieldButton');
        callCoordinator('clearSepticValidation');
        callCoordinator('setSepticPendingDraw', false);
      },
      onSketchUpdate: editSnap.onSketchUpdate
    });

    const api = Object.assign({}, drawing, {
      id: TOOL_ID, order: 60,
      ownsHelpers: true, ownsLifecycle: true, toolType: TOOL_ID,
      setCoordinator,
      clearPreview:       () => { drawing.clearPreview(); editSnap.clearEditSnapPreview(); },
      clearEditSnapPreview: editSnap.clearEditSnapPreview,
      showEditSnapPreview:  editSnap.showEditSnapPreview,
      updateHoverPreview: snapPointInfo,   // backwards-compat: returns snap info for mapPoint
      allConnectionSnapCandidates, isGenericSnapGraphic,
      genericSnapPointInfo, snapPointInfo,
      endpointPoints:           editSnap.endpointPoints,
      snapCandidateForEndpoint: editSnap.snapCandidateForEndpoint,
      closestEndpointSnap:      editSnap.closestEndpointSnap,
      snapEndpointsIfNear:      editSnap.snapEndpointsIfNear
    });

    window.SitePlanSepticLineTool = Object.assign({}, window.SitePlanSepticLineTool || {}, api);
    if (typeof WS.registerTool === 'function') WS.registerTool(api);
  });
}());
