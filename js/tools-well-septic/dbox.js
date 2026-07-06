// Distribution box (D-box) module. Generic rectangle placement is delegated to js/utils/rectangle-tool.js

(function () {
  if (!window.SitePlanRuntimeReady) {
    console.error('[tools-well-septic/dbox] window.SitePlanRuntimeReady is missing. ' +
      'Make sure js/runtime.js and js/tools-well-septic/well-septic-shared.js load first.');
    return;
  }

  window.SitePlanRuntimeReady.then(RT => {
    const WS = window.SitePlanWellSepticShared || {};
    const RECT = window.SitePlanRectangleTool;
    const DBOX_TOOL_TYPE = 'distributionBox';

    if (!RECT || typeof RECT.create !== 'function') {
      console.error('[tools-well-septic/dbox] SitePlanRectangleTool.create is missing.');
      return;
    }

    const DBOX_TOOL_CAPABILITIES = {
      reshape: false,
      resize: false,
      rotate: true,
      rotationSnapDegrees: 5,
      rotationGuideMode: 'delta',
      label: false,
      duplicate: true,
      delete: true
    };

    const SUPPORT_CAPABILITIES = {
      reshape: false,
      resize: false,
      rotate: false,
      label: false,
      duplicate: false,
      delete: false
    };

    const DBOX_BUTTON_ID = 'btn-dbox';
    const DBOX_CHECKBOX_ID = 'chk-dbox-fixed';
    const DBOX_LENGTH_ID = 'dbox-l';
    const DBOX_WIDTH_ID = 'dbox-w';
    const DEFAULT_DBOX_LENGTH_FT = 3;
    const DEFAULT_DBOX_WIDTH_FT = 3;

    const dboxGlyph =
      '<rect x="11" y="4" width="14" height="14" rx="1" fill="#C9D7CC" stroke="#3F5A36" stroke-width="1"></rect>' +
      '<rect x="14.25" y="7.25" width="7.5" height="7.5" rx="0.5" fill="#6F9B6A" stroke="#3F5A36" stroke-width="0.8"></rect>';

    const dboxIcon =
      '<svg viewBox="0 0 36 22" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">' +
        '<g class="dm-existing">' + dboxGlyph + '</g>' +
        '<g class="dm-proposed" style="display:none">' + dboxGlyph + '</g>' +
      '</svg>';

    let dboxToolApi = null;
    let rectangleTool = null;
    let coordinator = {};

    function setCoordinator(ctx) {
      coordinator = ctx || {};
      return dboxToolApi;
    }

    function callCoordinator(name) {
      const fn = coordinator && coordinator[name];
      if (typeof fn !== 'function') return undefined;
      const args = Array.prototype.slice.call(arguments, 1);
      return fn.apply(null, args);
    }

    function getSepticTankTool() {
      if (WS && typeof WS.getTool === 'function') {
        const registeredTool = WS.getTool('septicTank');
        if (registeredTool) return registeredTool;
      }
      return window.SitePlanSepticTankTool || null;
    }

    function septicConnectionSnapSymbol() {
      const septicTankTool = getSepticTankTool();
      const fn = septicTankTool && septicTankTool.connectionSnapSymbol;
      if (typeof fn === 'function') return fn();
      return {
        type: 'simple-marker',
        style: 'circle',
        color: [0, 0, 0, 0.001],
        size: 10,
        outline: { type: 'simple-line', color: [0, 0, 0, 0], width: 0 }
      };
    }

    function dboxSymbol() {
      return {
        type: 'simple-fill',
        color: [201, 215, 204, 255], // #C9D7CC
        outline: { type: 'simple-line', color: [63, 90, 54, 1], width: 2 } // #3F5A36
      };
    }

    function dboxInnerSymbol() {
      return {
        type: 'simple-fill',
        color: [111, 155, 106, 255], // #6F9B6A
        outline: { type: 'simple-line', color: [63, 90, 54, 1], width: 1.2 } // #3F5A36
      };
    }

    function isDboxParent(graphic) {
      return rectangleTool.isParent(graphic);
    }

    function applyDboxParentMetadata(parent) {
      if (!parent) return parent;
      const parentId = WS.ensureSitePlanId(parent, 'dbox');
      const attrs = parent.attributes || {};
      const fixedLengthFt = parent.__fixedLengthFt != null ? parent.__fixedLengthFt : attrs.fixedLengthFt;
      const fixedWidthFt = parent.__fixedWidthFt != null ? parent.__fixedWidthFt : attrs.fixedWidthFt;

      parent.__toolType = DBOX_TOOL_TYPE;
      parent.__label = 'Distribution box';
      parent.__measureLabel = 'Distribution box';
      parent.__skipEdgeLabels = true;
      parent.__preferredEditMode = 'transform';
      parent.__useFixedSizeLabels = false;
      if (Number.isFinite(fixedLengthFt)) parent.__dboxLengthFt = fixedLengthFt;
      if (Number.isFinite(fixedWidthFt)) parent.__dboxWidthFt = fixedWidthFt;

      const stampedMode = attrs.drawingMode;
      const drawingMode = (stampedMode === 'existing' || stampedMode === 'proposed')
        ? stampedMode
        : (window.SitePlanDrawingMode
            ? window.SitePlanDrawingMode.getDrawingMode('well-septic')
            : 'existing');

      parent.attributes = Object.assign({}, attrs, {
        toolType: DBOX_TOOL_TYPE,
        drawingMode,
        sitePlanTool: DBOX_TOOL_TYPE,
        sitePlanCategory: 'well-septic',
        sitePlanId: parentId,
        label: 'Distribution box',
        measureLabel: 'Distribution box',
        skipEdgeLabels: true,
        preferredEditMode: 'transform',
        useFixedSizeLabels: false,
        toolCapabilities: Object.assign({}, DBOX_TOOL_CAPABILITIES)
      });
      if (Number.isFinite(fixedLengthFt)) parent.attributes.dboxLengthFt = fixedLengthFt;
      if (Number.isFinite(fixedWidthFt)) parent.attributes.dboxWidthFt = fixedWidthFt;
      WS.applyToolCapabilities(parent, DBOX_TOOL_CAPABILITIES);
      return parent;
    }

    function dboxAxisInfo(polygon) {
      const pts = WS.ringWithoutDuplicateClose(polygon);
      if (pts.length < 4) return null;
      const center = WS.polygonCenterFromRing(pts);
      if (!center) return null;

      const a = pts[0];
      const b = pts[1];
      if (!a || !b) return null;
      let vx = b[0] - a[0];
      let vy = b[1] - a[1];
      let length = Math.hypot(vx, vy);
      if (!Number.isFinite(length) || length <= 0) {
        const septicTankTool = getSepticTankTool();
        const axisFn = septicTankTool && (septicTankTool.axisInfo || septicTankTool.septicTankAxisInfo);
        const info = typeof axisFn === 'function' ? axisFn(polygon) : null;
        return info ? Object.assign({}, info, { widthSpan: info.span }) : null;
      }
      const ux = vx / length;
      const uy = vy / length;
      const px = -uy;
      const py = ux;
      const projectionsU = pts.map(p => (p[0] - center.x) * ux + (p[1] - center.y) * uy);
      const projectionsP = pts.map(p => (p[0] - center.x) * px + (p[1] - center.y) * py);
      const minU = Math.min.apply(null, projectionsU);
      const maxU = Math.max.apply(null, projectionsU);
      const minP = Math.min.apply(null, projectionsP);
      const maxP = Math.max.apply(null, projectionsP);
      const span = maxU - minU;
      const widthSpan = maxP - minP;
      if (!Number.isFinite(span) || !Number.isFinite(widthSpan) || span <= 0 || widthSpan <= 0) return null;
      return { center, ux, uy, px, py, span, widthSpan, spatialReference: polygon.spatialReference };
    }

    function getDboxConnectionPoints(graphic) {
      if (!isDboxParent(graphic) || !graphic.geometry) return [];
      const info = dboxAxisInfo(graphic.geometry);
      if (!info) return [];
      const halfLength = info.span / 2;
      const halfWidth = info.widthSpan / 2;
      return [
        WS.pointFromXY(info.center.x + info.ux * halfLength, info.center.y + info.uy * halfLength, WS.spatialReferenceJSON(info.spatialReference)),
        WS.pointFromXY(info.center.x - info.ux * halfLength, info.center.y - info.uy * halfLength, WS.spatialReferenceJSON(info.spatialReference)),
        WS.pointFromXY(info.center.x + info.px * halfWidth, info.center.y + info.py * halfWidth, WS.spatialReferenceJSON(info.spatialReference)),
        WS.pointFromXY(info.center.x - info.px * halfWidth, info.center.y - info.py * halfWidth, WS.spatialReferenceJSON(info.spatialReference))
      ];
    }

    function dboxInnerGeometry(parent) {
      if (!isDboxParent(parent) || !parent.geometry) return null;
      const info = dboxAxisInfo(parent.geometry);
      if (!info) return null;
      const halfLength = info.span * 0.25;
      const halfWidth = info.widthSpan * 0.25;
      const c = info.center;
      const corners = [
        [c.x - info.ux * halfLength - info.px * halfWidth, c.y - info.uy * halfLength - info.py * halfWidth],
        [c.x + info.ux * halfLength - info.px * halfWidth, c.y + info.uy * halfLength - info.py * halfWidth],
        [c.x + info.ux * halfLength + info.px * halfWidth, c.y + info.uy * halfLength + info.py * halfWidth],
        [c.x - info.ux * halfLength + info.px * halfWidth, c.y - info.uy * halfLength + info.py * halfWidth]
      ];
      corners.push(corners[0].slice());
      return {
        type: 'polygon',
        rings: [corners],
        spatialReference: WS.spatialReferenceJSON(info.spatialReference)
      };
    }

    function rebuildDboxSupport(parent) {
      if (!isDboxParent(parent)) return;
      applyDboxParentMetadata(parent);
      const parentId = parent.__sitePlanId;
      WS.removeSupportGraphics(parentId);

      const innerGeom = dboxInnerGeometry(parent);
      if (innerGeom) {
        const inner = WS.tagSupportGraphic(new RT.Graphic({
          geometry: innerGeom,
          symbol: dboxInnerSymbol()
        }), parentId, 'dbox-inner', null, SUPPORT_CAPABILITIES);
        RT.labelLayer.add(inner);
      }

      WS.addConnectionSnapSupports({
        parentId,
        points: getDboxConnectionPoints(parent),
        role: 'dbox-connection-snap',
        symbol: septicConnectionSnapSymbol,
        indexProperty: '__dboxConnectionIndex',
        indexAttribute: 'dboxConnectionIndex',
        supportCapabilities: SUPPORT_CAPABILITIES
      });
    }

    function dboxCenterPoint(graphic) {
      if (!isDboxParent(graphic) || !graphic.geometry) return null;
      const info = dboxAxisInfo(graphic.geometry);
      if (!info || !info.center) return null;
      return WS.pointFromXY(info.center.x, info.center.y, WS.spatialReferenceJSON(info.spatialReference));
    }

    function translateDboxGeometry(geometry, dx, dy) {
      return rectangleTool.translateGeometry(geometry, dx, dy);
    }

    function moveDboxCenterTo(graphic, targetPoint) {
      if (!isDboxParent(graphic) || !targetPoint) return false;
      const center = dboxCenterPoint(graphic);
      if (!center) return false;
      const dx = targetPoint.x - center.x;
      const dy = targetPoint.y - center.y;
      if (!Number.isFinite(dx) || !Number.isFinite(dy)) return false;
      return rectangleTool.moveByOffset(graphic, dx, dy);
    }

    function dboxDimensions() {
      const dims = rectangleTool && typeof rectangleTool.dimensions === 'function'
        ? rectangleTool.dimensions()
        : { widthFt: NaN, lengthFt: NaN, valid: false };
      return {
        lengthFt: dims.lengthFt,
        widthFt: dims.widthFt,
        valid: !!dims.valid
      };
    }

    function announceDboxTool() {
      callCoordinator('announceToolActivated', DBOX_TOOL_TYPE);
      callCoordinator('cancelSepticPlacement', false);
      callCoordinator('clearSepticButton');
      callCoordinator('cancelSepticLinePlacement', false);
      callCoordinator('clearSepticLineButton');
      callCoordinator('clearSepticValidation');
    }

    function removeDboxSideLabels(graphic) {
      if (typeof RT.removeSideLabelsForGraphic === 'function') RT.removeSideLabelsForGraphic(graphic);
    }

    rectangleTool = RECT.create({
      RT,
      toolId: DBOX_TOOL_TYPE,
      buttonId: DBOX_BUTTON_ID,
      checkboxId: DBOX_CHECKBOX_ID,
      widthId: DBOX_WIDTH_ID,
      lengthId: DBOX_LENGTH_ID,
      category: 'well-septic',
      label: 'Distribution box (D-box)',
      order: 30,
      symbol: dboxSymbol(),
      toolCapabilities: DBOX_TOOL_CAPABILITIES,
      makeGeometry: (center, widthFt, lengthFt) => WS.makeRectGeometryFromCenter(center, lengthFt, widthFt),
      onAnnounce: announceDboxTool,
      isOwnEvent: detail => detail && detail.source === 'tools-well-septic' && detail.tool === DBOX_TOOL_TYPE,
      logPrefix: '[tools-well-septic/dbox]',
      buttonTitle: 'Place or draw a distribution box',
      iconHtml: dboxIcon,
      iconApply: window.SitePlanDrawingMode && window.SitePlanDrawingMode.iconSwapApply,
      iconClass: 'dm-line36',
      defaultChecked: true,
      defaultWidthFt: DEFAULT_DBOX_WIDTH_FT,
      defaultLengthFt: DEFAULT_DBOX_LENGTH_FT,
      minWidthFt: 0.1,
      minLengthFt: 0.1,
      widthStep: 0.1,
      lengthStep: 0.1,
      dimensionOrder: 'length-width',
      widthAriaLabel: 'Distribution box width in feet',
      lengthAriaLabel: 'Distribution box length in feet',
      toolTypeKey: DBOX_TOOL_TYPE,
      pendingKey: DBOX_TOOL_TYPE,
      suppressLiveSideLabelsDuringManual: true,
      applyExtraMetadata: applyDboxParentMetadata,
      onPointerMove: probe => {
        callCoordinator('updateDboxDrainfieldSnapPreviewFromPoint', dboxCenterPoint(probe));
      },
      onCancelPlacement: () => {
        callCoordinator('clearDboxDrainfieldSnapPreview');
      },
      onActiveChanged: active => {
        callCoordinator('onActiveChanged', !!active);
        if (active) callCoordinator('clearOtherActiveButtons');
      },
      onPendingChanged: pending => {
        callCoordinator('onPendingChanged', !!pending);
      },
      onPlaceFixed: parent => {
        callCoordinator('updateDboxDrainfieldAttachment', parent);
        removeDboxSideLabels(parent);
      },
      onGraphicCreated: graphic => {
        rebuildDboxSupport(graphic);
        callCoordinator('updateDboxDrainfieldAttachment', graphic);
        removeDboxSideLabels(graphic);
      },
      onGraphicUpdated: graphic => {
        rebuildDboxSupport(graphic);
        removeDboxSideLabels(graphic);
      },
      onGraphicDeleted: graphic => {
        const parentId = WS.ensureSitePlanId(graphic, 'dbox');
        WS.removeSupportGraphics(parentId);
      }
    });

    RT.sketch.on('update', event => {
      const graphic = event && event.graphics && event.graphics[0];
      if (!isDboxParent(graphic)) return;

      if (event.state === 'active' || event.state === 'start') {
        callCoordinator('updateDboxDrainfieldSnapPreviewFromPoint', dboxCenterPoint(graphic));
        return;
      }

      if (event.state === 'complete') {
        const commit = () => {
          callCoordinator('updateDboxDrainfieldAttachment', graphic);
          callCoordinator('clearDboxDrainfieldSnapPreview');
          removeDboxSideLabels(graphic);
        };
        if (window.requestAnimationFrame) window.requestAnimationFrame(commit);
        else window.setTimeout(commit, 0);
        return;
      }

      if (event.state === 'cancel') {
        callCoordinator('clearDboxDrainfieldSnapPreview');
      }
    });

    dboxToolApi = Object.assign({}, rectangleTool, {
      id: DBOX_TOOL_TYPE,
      alias: 'dbox',
      order: 30,
      capabilities: DBOX_TOOL_CAPABILITIES,
      supportCapabilities: SUPPORT_CAPABILITIES,
      ownsLifecycle: true,

      setCoordinator,
      dimensions: dboxDimensions,
      isParent: isDboxParent,
      symbol: dboxSymbol,
      innerSymbol: dboxInnerSymbol,
      applyMetadata: applyDboxParentMetadata,
      axisInfo: dboxAxisInfo,
      getConnectionPoints: getDboxConnectionPoints,
      innerGeometry: dboxInnerGeometry,
      rebuildSupport: rebuildDboxSupport,
      centerPoint: dboxCenterPoint,
      translateGeometry: translateDboxGeometry,
      moveCenterTo: moveDboxCenterTo
    });

    window.SitePlanDboxTool = Object.assign({}, window.SitePlanDboxTool || {}, dboxToolApi);

    if (typeof WS.registerTool === 'function') {
      WS.registerTool(window.SitePlanDboxTool);
    } else {
      console.warn('[tools-well-septic/dbox] Well & Septic registry is unavailable.');
    }
  }).catch(err => {
    console.error('[tools-well-septic/dbox] Failed to initialize after runtime ready:', err);
  });
})();
