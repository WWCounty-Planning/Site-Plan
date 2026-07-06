// js/tools-well-septic/index.js — Well & Septic coordinator

(function () {
  if (!window.SitePlanRuntimeReady) {
    console.error('[tools-well-septic] window.SitePlanRuntimeReady is missing. ' +
      'Make sure js/runtime.js is loaded before js/tools-well-septic/index.js.');
    return;
  }

  window.SitePlanRuntimeReady.then(RT => {
    const WS = window.SitePlanWellSepticShared || {};

    const SEPTIC_TOOL_TYPE = 'septicTank';
    const DBOX_TOOL_TYPE = 'distributionBox';
    const DRAINFIELD_TOOL_TYPE = 'drainfield';
    const RESERVE_DRAINFIELD_TOOL_TYPE = 'reserveDrainfield';
    const SEPTIC_LINE_TOOL_TYPE = 'septicLine';
    const DBOX_DRAINFIELD_SNAP_TOLERANCE_PX = 18;
    const DEFAULT_DRAINFIELD_LATERALS = 3;

    let dboxDrainfieldSnapPreview = null;

    function getRegisteredTool() {
      if (!WS || typeof WS.getTool !== 'function') return null;
      for (let i = 0; i < arguments.length; i += 1) {
        const tool = WS.getTool(arguments[i]);
        if (tool) return tool;
      }
      return null;
    }

    function getWellTool() {
      return getRegisteredTool('well') || window.SitePlanWellTool || null;
    }

    function getSepticTankTool() {
      return getRegisteredTool(SEPTIC_TOOL_TYPE) || window.SitePlanSepticTankTool || null;
    }

    function getDboxTool() {
      return getRegisteredTool(DBOX_TOOL_TYPE, 'dbox') || window.SitePlanDboxTool || null;
    }

    function getDrainfieldsTool() {
      return getRegisteredTool(DRAINFIELD_TOOL_TYPE, 'drainfield', 'drainfields') ||
        window.SitePlanDrainfieldTool || window.SitePlanDrainfieldsTool || null;
    }

    function getReserveDrainfieldTool() {
      return getRegisteredTool(RESERVE_DRAINFIELD_TOOL_TYPE, 'reserveDrainfield') ||
        window.SitePlanReserveDrainfieldTool || null;
    }

    function getSepticLineTool() {
      return getRegisteredTool(SEPTIC_LINE_TOOL_TYPE) || window.SitePlanSepticLineTool || null;
    }

    function callTool(tool, name, args, fallback) {
      const fn = tool && name && tool[name];
      if (typeof fn === 'function') return fn.apply(tool, args || []);
      return typeof fallback === 'function' ? fallback() : undefined;
    }

    function graphicsInLayer(layer) {
      return WS.graphicsInLayer ? WS.graphicsInLayer(layer) : [];
    }

    function ensureSitePlanId(graphic, prefix) {
      return WS.ensureSitePlanId ? WS.ensureSitePlanId(graphic, prefix) : null;
    }

    function announceToolActivated(toolType) {
      WS.announceToolActivated(toolType);
    }

    function cancelSepticPlacement(clearButtonState) {
      return callTool(getSepticTankTool(), 'cancel', [clearButtonState]);
    }

    function cancelDboxPlacement(clearButtonState) {
      return callTool(getDboxTool(), 'cancel', [clearButtonState]);
    }

    function cancelDrainfieldPlacement(clearButtonState) {
      return callTool(getDrainfieldsTool(), 'cancel', [clearButtonState]);
    }

    function cancelReserveDrainfieldPlacement(clearButtonState) {
      return callTool(getReserveDrainfieldTool(), 'cancel', [clearButtonState]);
    }

    function cancelSepticLinePlacement(clearButtonState) {
      return callTool(getSepticLineTool(), 'cancel', [clearButtonState]);
    }

    function clearActiveSepticButton() {
      return callTool(getSepticTankTool(), 'clearActive');
    }

    function clearActiveDboxButton() {
      return callTool(getDboxTool(), 'clearActive');
    }

    function clearActiveDrainfieldButton() {
      return callTool(getDrainfieldsTool(), 'clearActive');
    }

    function clearActiveReserveDrainfieldButton() {
      return callTool(getReserveDrainfieldTool(), 'clearActive');
    }

    function clearActiveSepticLineButton() {
      return callTool(getSepticLineTool(), 'clearActive');
    }

    function clearSepticValidation() {
      return callTool(getSepticTankTool(), 'clearValidation');
    }

    function clearDboxValidation() {
      return callTool(getDboxTool(), 'clearValidation');
    }

    function clearDrainfieldValidation() {
      return callTool(getDrainfieldsTool(), 'clearValidation');
    }

    function clearReserveDrainfieldValidation() {
      return callTool(getReserveDrainfieldTool(), 'clearValidation');
    }

    function setSepticPendingDraw(value) {
      return callTool(getSepticTankTool(), 'setPendingDraw', [value]);
    }

    function isSepticParent(graphic) {
      return !!callTool(getSepticTankTool(), 'isParent', [graphic], () => false);
    }

    function getSepticTankConnectionPoints(graphic) {
      return callTool(getSepticTankTool(), 'getConnectionPoints', [graphic], () => []) || [];
    }

    function isDboxParent(graphic) {
      return !!callTool(getDboxTool(), 'isParent', [graphic], () => false);
    }

    function getDboxConnectionPoints(graphic) {
      return callTool(getDboxTool(), 'getConnectionPoints', [graphic], () => []) || [];
    }

    function dboxCenterPoint(graphic) {
      return callTool(getDboxTool(), 'centerPoint', [graphic], () => null);
    }

    function moveDboxCenterTo(graphic, point) {
      return callTool(getDboxTool(), 'moveCenterTo', [graphic, point]);
    }

    function isDrainfieldParent(graphic) {
      return !!callTool(getDrainfieldsTool(), 'isParent', [graphic], () => false);
    }

    function isReserveDrainfieldParent(graphic) {
      return !!callTool(getReserveDrainfieldTool(), 'isParent', [graphic], () => false);
    }

    function drainfieldConnectionPoint(graphic) {
      return callTool(getDrainfieldsTool(), 'connectionPoint', [graphic], () => null);
    }

    function pointWithinPrimaryDrainfield(point, drainfield) {
      return !!callTool(getDrainfieldsTool(), 'pointWithinPrimary', [point, drainfield], () => false);
    }

    function septicLineSnapPointSymbol() {
      return callTool(getSepticLineTool(), 'snapPointSymbol', [], () => ({
        type: 'simple-marker',
        style: 'circle',
        color: [255, 152, 0, 0.95],
        size: 9,
        outline: { type: 'simple-line', color: [255, 255, 255, 1], width: 1.5 }
      }));
    }

    function clampDrainfieldLateralCount(value) {
      return callTool(getDrainfieldsTool(), 'clampLateralCount', [value], () => {
        const n = Number.parseInt(value, 10);
        if (!Number.isFinite(n)) return DEFAULT_DRAINFIELD_LATERALS;
        return Math.max(2, Math.min(9, n));
      });
    }

    function currentDrainfieldLateralCount() {
      const input = document.getElementById('drainfield-laterals');
      return clampDrainfieldLateralCount(input ? input.value : DEFAULT_DRAINFIELD_LATERALS);
    }

    function currentReserveDrainfieldLateralCount() {
      return callTool(getReserveDrainfieldTool(), 'lateralCount', [], () => {
        const input = document.getElementById('reserve-drainfield-laterals');
        return clampDrainfieldLateralCount(input ? input.value : DEFAULT_DRAINFIELD_LATERALS);
      });
    }

    function findPrimaryDrainfieldForDboxPoint(point) {
      return callTool(getDrainfieldsTool(), 'findPrimaryForDboxPoint', [point], () => null);
    }

    function clearDboxDrainfieldSnapPreview() {
      if (dboxDrainfieldSnapPreview && RT.previewLayer) {
        try { RT.previewLayer.remove(dboxDrainfieldSnapPreview); } catch (err) {}
      }
      dboxDrainfieldSnapPreview = null;
    }

    function showDboxDrainfieldSnapPreview(point) {
      if (!point || !RT.previewLayer) {
        clearDboxDrainfieldSnapPreview();
        return;
      }
      if (!dboxDrainfieldSnapPreview) {
        dboxDrainfieldSnapPreview = new RT.Graphic({
          geometry: point,
          symbol: septicLineSnapPointSymbol()
        });
        dboxDrainfieldSnapPreview.__nonSelectable = true;
        dboxDrainfieldSnapPreview.__skipMeasure = true;
        RT.previewLayer.add(dboxDrainfieldSnapPreview);
      } else {
        dboxDrainfieldSnapPreview.geometry = point;
        dboxDrainfieldSnapPreview.symbol = septicLineSnapPointSymbol();
      }
    }

    function updateDboxDrainfieldSnapPreviewFromPoint(point) {
      const df = findPrimaryDrainfieldForDboxPoint(point);
      const previewPoint = df ? drainfieldConnectionPoint(df) : null;
      if (previewPoint) showDboxDrainfieldSnapPreview(previewPoint);
      else clearDboxDrainfieldSnapPreview();
      return previewPoint;
    }

    function dboxDrainfieldAttachmentOptions() {
      return {
        type: 'drainfield-dbox',
        role: 'distribution-box',
        targetPrefix: 'drainfield',
        targetTool: DRAINFIELD_TOOL_TYPE,
        targetIdProperties: ['__attachedDrainfieldId', '__attachedToId'],
        targetIdAttributes: ['attachedDrainfieldId', 'attachedToId', 'attachmentTargetId'],
        childFilter: isDboxParent
      };
    }

    function attachedDrainfieldIdForDbox(graphic) {
      if (!graphic) return null;
      if (WS.getAttachmentTargetId) {
        return WS.getAttachmentTargetId(graphic, dboxDrainfieldAttachmentOptions());
      }
      const attrs = graphic && graphic.attributes ? graphic.attributes : {};
      return graphic && (graphic.__attachedDrainfieldId || attrs.attachedDrainfieldId || null);
    }

    function setDboxAttachedDrainfield(graphic, drainfield) {
      if (!isDboxParent(graphic) || !isDrainfieldParent(drainfield)) return;
      const dfId = ensureSitePlanId(drainfield, 'drainfield');
      if (WS.attachGraphicToTarget) {
        WS.attachGraphicToTarget(graphic, drainfield, dboxDrainfieldAttachmentOptions());
      }
      graphic.__attachedDrainfieldId = dfId;
      graphic.attributes = Object.assign({}, graphic.attributes || {}, {
        attachedDrainfieldId: dfId,
        attachedDrainfieldTool: DRAINFIELD_TOOL_TYPE
      });
    }

    function clearDboxAttachedDrainfield(graphic) {
      if (!isDboxParent(graphic)) return;
      if (WS.detachGraphic) {
        WS.detachGraphic(graphic, dboxDrainfieldAttachmentOptions());
      }
      graphic.__attachedDrainfieldId = null;
      const attrs = Object.assign({}, graphic.attributes || {});
      delete attrs.attachedDrainfieldId;
      delete attrs.attachedDrainfieldTool;
      graphic.attributes = attrs;
    }

    function attachDboxToDrainfield(graphic, drainfield) {
      if (!isDboxParent(graphic) || !isDrainfieldParent(drainfield)) return false;
      const connection = drainfieldConnectionPoint(drainfield);
      if (!connection) return false;
      setDboxAttachedDrainfield(graphic, drainfield);
      moveDboxCenterTo(graphic, connection);
      return true;
    }

    function updateDboxDrainfieldAttachment(graphic) {
      if (!isDboxParent(graphic)) return false;
      const center = dboxCenterPoint(graphic);
      const targetDrainfield = findPrimaryDrainfieldForDboxPoint(center);
      if (targetDrainfield) return attachDboxToDrainfield(graphic, targetDrainfield);
      clearDboxAttachedDrainfield(graphic);
      return false;
    }

    function syncAttachedDboxesForDrainfield(drainfield) {
      if (!isDrainfieldParent(drainfield)) return;
      const connection = drainfieldConnectionPoint(drainfield);
      if (!connection) return;
      const syncOne = dbox => {
        moveDboxCenterTo(dbox, connection);
        setDboxAttachedDrainfield(dbox, drainfield);
      };
      if (WS.syncAttachedChildrenForTarget) {
        WS.syncAttachedChildrenForTarget(drainfield, RT.drawLayer, Object.assign({}, dboxDrainfieldAttachmentOptions(), {
          sync: syncOne
        }));
        return;
      }
      const dfId = ensureSitePlanId(drainfield, 'drainfield');
      graphicsInLayer(RT.drawLayer)
        .filter(g => isDboxParent(g) && attachedDrainfieldIdForDbox(g) === dfId)
        .forEach(syncOne);
    }

    function detachDboxesForDrainfield(drainfield) {
      if (!isDrainfieldParent(drainfield)) return;
      const detachOne = dbox => clearDboxAttachedDrainfield(dbox);
      if (WS.detachAttachedChildrenForTarget) {
        WS.detachAttachedChildrenForTarget(drainfield, RT.drawLayer, Object.assign({}, dboxDrainfieldAttachmentOptions(), {
          detach: detachOne
        }));
        return;
      }
      const dfId = ensureSitePlanId(drainfield, 'drainfield');
      graphicsInLayer(RT.drawLayer)
        .filter(g => isDboxParent(g) && attachedDrainfieldIdForDbox(g) === dfId)
        .forEach(detachOne);
    }

    if (WS) {
      WS.updateDboxDrainfieldAttachment = updateDboxDrainfieldAttachment;
      WS.syncAttachedDboxesForDrainfield = syncAttachedDboxesForDrainfield;
      WS.detachDboxesForDrainfield = detachDboxesForDrainfield;
      WS.findPrimaryDrainfieldForDboxPoint = findPrimaryDrainfieldForDboxPoint;
      WS.updateDboxDrainfieldSnapPreviewFromPoint = updateDboxDrainfieldSnapPreviewFromPoint;
      WS.clearDboxDrainfieldSnapPreview = clearDboxDrainfieldSnapPreview;
    }

    window.addEventListener('siteplan:tool-activated', event => {
      const detail = event && event.detail ? event.detail : {};
      if (detail.source === 'tools-well-septic') return;
      cancelSepticPlacement(false);
      cancelDboxPlacement(false);
      cancelDrainfieldPlacement(false);
      cancelReserveDrainfieldPlacement(false);
      cancelSepticLinePlacement(false);
      clearActiveSepticButton();
      clearActiveDboxButton();
      clearActiveDrainfieldButton();
      clearActiveReserveDrainfieldButton();
      clearActiveSepticLineButton();
      clearSepticValidation();
      clearDboxValidation();
      clearDrainfieldValidation();
      clearReserveDrainfieldValidation();
      setSepticPendingDraw(false);
      window.__sitePlanSuppressLiveSideLabels = false;
    });

    const septicTankToolForCoordinator = getSepticTankTool();
    if (septicTankToolForCoordinator && typeof septicTankToolForCoordinator.setCoordinator === 'function') {
      septicTankToolForCoordinator.setCoordinator({
        announceToolActivated,
        cancelDboxPlacement,
        cancelDrainfieldPlacement,
        cancelReserveDrainfieldPlacement,
        cancelSepticLinePlacement,
        clearDboxButton: clearActiveDboxButton,
        clearDrainfieldButton: clearActiveDrainfieldButton,
        clearReserveDrainfieldButton: clearActiveReserveDrainfieldButton,
        clearSepticLineButton: clearActiveSepticLineButton,
        clearOtherActiveButtons: function () {
          clearActiveDboxButton();
          clearActiveDrainfieldButton();
          clearActiveReserveDrainfieldButton();
          clearActiveSepticLineButton();
        },
        updateDboxDrainfieldAttachment
      });
    }

    const dboxToolForCoordinator = getDboxTool();
    if (dboxToolForCoordinator && typeof dboxToolForCoordinator.setCoordinator === 'function') {
      dboxToolForCoordinator.setCoordinator({
        announceToolActivated,
        cancelSepticPlacement,
        cancelSepticLinePlacement,
        clearSepticButton: clearActiveSepticButton,
        clearSepticLineButton: clearActiveSepticLineButton,
        clearSepticValidation,
        clearDboxDrainfieldSnapPreview,
        updateDboxDrainfieldSnapPreviewFromPoint,
        updateDboxDrainfieldAttachment,
        clearOtherActiveButtons: function () {
          clearActiveSepticButton();
          clearActiveDrainfieldButton();
          clearActiveReserveDrainfieldButton();
          clearActiveSepticLineButton();
        }
      });
    }

    const drainfieldsToolForCoordinator = getDrainfieldsTool();
    if (drainfieldsToolForCoordinator && typeof drainfieldsToolForCoordinator.setCoordinator === 'function') {
      drainfieldsToolForCoordinator.setCoordinator({
        announceToolActivated,
        cancelSepticPlacement,
        cancelDboxPlacement,
        cancelSepticLinePlacement,
        clearSepticButton: clearActiveSepticButton,
        clearDboxButton: clearActiveDboxButton,
        clearSepticLineButton: clearActiveSepticLineButton,
        clearSepticValidation,
        clearDboxValidation,
        syncAttachedDboxesForDrainfield,
        detachDboxesForDrainfield,
        currentDrainfieldLateralCount,
        currentReserveDrainfieldLateralCount,
        clearOtherActiveButtons: function (sourceTool) {
          clearActiveSepticButton();
          clearActiveDboxButton();
          clearActiveSepticLineButton();
          if (sourceTool !== DRAINFIELD_TOOL_TYPE) {
            clearActiveDrainfieldButton();
          }
          if (sourceTool !== RESERVE_DRAINFIELD_TOOL_TYPE) {
            clearActiveReserveDrainfieldButton();
          }
        }
      });
    }

    const reserveDrainfieldToolForCoordinator = getReserveDrainfieldTool();
    if (reserveDrainfieldToolForCoordinator && typeof reserveDrainfieldToolForCoordinator.setCoordinator === 'function') {
      reserveDrainfieldToolForCoordinator.setCoordinator({
        announceToolActivated,
        cancelSepticPlacement,
        cancelDboxPlacement,
        cancelDrainfieldPlacement,
        cancelSepticLinePlacement,
        clearSepticButton: clearActiveSepticButton,
        clearDboxButton: clearActiveDboxButton,
        clearDrainfieldButton: clearActiveDrainfieldButton,
        clearSepticLineButton: clearActiveSepticLineButton,
        clearSepticValidation,
        clearDboxValidation,
        clearDrainfieldValidation,
        currentReserveDrainfieldLateralCount,
        clearOtherActiveButtons: function (sourceTool) {
          clearActiveSepticButton();
          clearActiveDboxButton();
          clearActiveDrainfieldButton();
          clearActiveSepticLineButton();
          if (sourceTool !== RESERVE_DRAINFIELD_TOOL_TYPE) {
            clearActiveReserveDrainfieldButton();
          }
        }
      });
    }

    const septicLineToolForCoordinator = getSepticLineTool();
    if (septicLineToolForCoordinator && typeof septicLineToolForCoordinator.setCoordinator === 'function') {
      septicLineToolForCoordinator.setCoordinator({
        announceToolActivated,
        cancelSepticPlacement,
        cancelDboxPlacement,
        cancelDrainfieldPlacement,
        cancelReserveDrainfieldPlacement,
        clearSepticButton: clearActiveSepticButton,
        clearDboxButton: clearActiveDboxButton,
        clearDrainfieldButton: clearActiveDrainfieldButton,
        clearReserveDrainfieldButton: clearActiveReserveDrainfieldButton,
        clearSepticValidation,
        clearDboxValidation,
        clearDrainfieldValidation,
        clearReserveDrainfieldValidation,
        setSepticPendingDraw,
        clearOtherActiveButtons: function () {
          clearActiveSepticButton();
          clearActiveDboxButton();
          clearActiveDrainfieldButton();
          clearActiveReserveDrainfieldButton();
        }
      });
    }

    const section = document.getElementById('tools-well-septic');
    if (!section) {
      console.warn('[tools-well-septic] Sidebar section #tools-well-septic not found.');
      return;
    }

    function mountRegisteredTools() {
      const tools = WS && typeof WS.getTools === 'function'
        ? WS.getTools()
        : [
            getWellTool(),
            getSepticTankTool(),
            getDboxTool(),
            getDrainfieldsTool(),
            getReserveDrainfieldTool(),
            getSepticLineTool()
          ].filter(Boolean);

      tools.forEach(tool => {
        const elements = WS && typeof WS.getToolElements === 'function'
          ? WS.getToolElements(tool)
          : (typeof tool.buildButton === 'function' ? [tool.buildButton()].filter(Boolean) : []);

        elements.forEach(node => {
          if (node && node.parentNode !== section) section.appendChild(node);
        });

        if (typeof tool.wireControls === 'function' && !tool.__wellSepticControlsWired) {
          tool.wireControls();
          tool.__wellSepticControlsWired = true;
        }
      });
    }

    mountRegisteredTools();
    callTool(drainfieldsToolForCoordinator, 'ensureDrainfieldLateralToolbar');

    window.addEventListener('siteplan:selection-changed', event => {
      const detail = event && event.detail ? event.detail : {};
      callTool(drainfieldsToolForCoordinator, 'handleSelectionChangedForDrainfield', [detail.graphic || null]);
    });
    window.startSepticTool = function () {
      return callTool(getSepticTankTool(), 'start');
    };
    window.startDboxTool = function () {
      return callTool(getDboxTool(), 'start');
    };
    window.startDrainfieldTool = function () {
      return callTool(getDrainfieldsTool(), 'start');
    };
    window.startReserveDrainfieldTool = function () {
      return callTool(getReserveDrainfieldTool(), 'start');
    };
    window.startSepticLineTool = function () {
      return callTool(getSepticLineTool(), 'start');
    };

    window.SitePlanWellSeptic = Object.assign({}, window.SitePlanWellSeptic || {}, {
      getSepticTankConnectionPoints,
      getDboxConnectionPoints,
      drainfieldConnectionPoint,
      updateDboxDrainfieldAttachment,
      syncAttachedDboxesForDrainfield,
      detachDboxesForDrainfield,
      startReserveDrainfieldTool: window.startReserveDrainfieldTool,
      startSepticLineTool: window.startSepticLineTool,
      mountRegisteredTools,
      isSepticParent,
      isDboxParent,
      isDrainfieldParent,
      isReserveDrainfieldParent
    });

  }).catch(err => {
    console.error('[tools-well-septic] Failed to initialize after runtime ready:', err);
  });
}());
