// Septic Tank module

(function () {
  if (!window.SitePlanRuntimeReady) {
    console.error('[tools-well-septic/septic-tank] window.SitePlanRuntimeReady is missing. ' +
      'Make sure js/runtime.js and js/tools-well-septic/well-septic-shared.js load first.');
    return;
  }

  window.SitePlanRuntimeReady.then(RT => {
    const WS = window.SitePlanWellSepticShared || {};
    const RECT = window.SitePlanRectangleTool;
    const SEPTIC_TOOL_TYPE = 'septicTank';

    if (!RECT || typeof RECT.create !== 'function') {
      console.error('[tools-well-septic/septic-tank] SitePlanRectangleTool.create is missing.');
      return;
    }

    const SEPTIC_TOOL_CAPABILITIES = {
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

    const SEPTIC_BUTTON_ID = 'btn-septic-tank';
    const SEPTIC_CHECKBOX_ID = 'chk-septic-tank-fixed';
    const SEPTIC_LENGTH_ID = 'septic-tank-l';
    const SEPTIC_WIDTH_ID = 'septic-tank-w';
    const DEFAULT_SEPTIC_LENGTH_FT = 5.5;
    const DEFAULT_SEPTIC_WIDTH_FT = 10;

    const septicPorts =
      '<circle cx="12" cy="11" r="3" fill="#FEFDF9" stroke="#3F5A36" stroke-width="0.7"/>' +
      '<circle cx="24" cy="11" r="3" fill="#FEFDF9" stroke="#3F5A36" stroke-width="0.7"/>';

    const septicIcon =
      '<svg viewBox="0 0 36 22" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">' +
        // Existing: solid bordered tank + ports
        '<g class="dm-existing">' +
          '<rect x="2" y="2" width="32" height="18" rx="1" fill="#C9D7CC"/>' +
          '<rect x="2" y="2" width="32" height="18" rx="1" fill="none" stroke="#3F5A36" stroke-width="1"/>' +
          septicPorts +
        '</g>' +
        // Proposed: dashed edges with solid rounded corners + ports
        '<g class="dm-proposed" style="display:none">' +
          '<rect x="2" y="2" width="32" height="18" rx="1" fill="#C9D7CC"/>' +
          '<g fill="none" stroke="#3F5A36" stroke-width="1" stroke-linecap="butt">' +
            '<line x1="9" y1="2" x2="12" y2="2"/>' +
            '<line x1="14" y1="2" x2="17" y2="2"/>' +
            '<line x1="19" y1="2" x2="22" y2="2"/>' +
            '<line x1="24" y1="2" x2="27" y2="2"/>' +
            '<line x1="9" y1="20" x2="12" y2="20"/>' +
            '<line x1="14" y1="20" x2="17" y2="20"/>' +
            '<line x1="19" y1="20" x2="22" y2="20"/>' +
            '<line x1="24" y1="20" x2="27" y2="20"/>' +
            '<line x1="2" y1="7" x2="2" y2="10"/>' +
            '<line x1="2" y1="12" x2="2" y2="15"/>' +
            '<line x1="34" y1="7" x2="34" y2="10"/>' +
            '<line x1="34" y1="12" x2="34" y2="15"/>' +
          '</g>' +
          '<g fill="none" stroke="#3F5A36" stroke-width="1" stroke-linecap="butt" stroke-linejoin="round">' +
            '<path d="M 5 2 H 3 Q 2 2 2 3 V 5"/>' +
            '<path d="M 31 2 H 33 Q 34 2 34 3 V 5"/>' +
            '<path d="M 34 17 V 19 Q 34 20 33 20 H 31"/>' +
            '<path d="M 5 20 H 3 Q 2 20 2 19 V 17"/>' +
          '</g>' +
          septicPorts +
        '</g>' +
      '</svg>';

    function septicIconApply(svg, mode) {
      const proposed = mode === 'proposed';
      const ex = svg.querySelector('.dm-existing');
      const pr = svg.querySelector('.dm-proposed');
      if (ex) ex.style.display = proposed ? 'none' : '';
      if (pr) pr.style.display = proposed ? '' : 'none';
    }

    let coordinator = {};
    let septicTankToolApi = null;
    let rectangleTool = null;

    function setCoordinator(ctx) {
      coordinator = ctx || {};
      return septicTankToolApi;
    }

    function callCoordinator(name) {
      const fn = coordinator && coordinator[name];
      if (typeof fn !== 'function') return undefined;
      const args = Array.prototype.slice.call(arguments, 1);
      return fn.apply(null, args);
    }

    function isSepticParent(graphic) {
      return rectangleTool.isParent(graphic);
    }

    function septicTankAxisInfo(polygon) {
      const pts = WS.ringWithoutDuplicateClose(polygon);
      if (pts.length < 4) return null;
      const center = WS.polygonCenterFromRing(pts);
      if (!center) return null;

      let longest = null;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i];
        const b = pts[(i + 1) % pts.length];
        if (!a || !b) continue;
        const vx = b[0] - a[0];
        const vy = b[1] - a[1];
        const d = Math.hypot(vx, vy);
        if (Number.isFinite(d) && d > 0 && (!longest || d > longest.d)) longest = { vx, vy, d };
      }
      if (!longest || !Number.isFinite(longest.d) || longest.d <= 0) return null;

      const ux = longest.vx / longest.d;
      const uy = longest.vy / longest.d;
      const projections = pts.map(p => (p[0] - center.x) * ux + (p[1] - center.y) * uy);
      const minP = Math.min.apply(null, projections);
      const maxP = Math.max.apply(null, projections);
      const span = maxP - minP;
      if (!Number.isFinite(span) || span <= 0) return null;

      return { center, ux, uy, span, spatialReference: polygon.spatialReference };
    }

    function calcSepticLidPoints(polygon) {
      const info = septicTankAxisInfo(polygon);
      if (!info) return [];
      const offset = info.span * 0.25;
      return [
        { x: info.center.x - info.ux * offset, y: info.center.y - info.uy * offset },
        { x: info.center.x + info.ux * offset, y: info.center.y + info.uy * offset }
      ];
    }

    function calcSepticLidScreenSize(polygon) {
      const pts = WS.ringWithoutDuplicateClose(polygon);
      if (pts.length < 4 || !RT.view) return 7;
      const center = WS.polygonCenterFromRing(pts);
      if (!center) return 7;
      const info = septicTankAxisInfo(polygon);
      if (!info) return 7;
      const px = -info.uy;
      const py = info.ux;
      const projections = pts.map(p => (p[0] - center.x) * px + (p[1] - center.y) * py);
      const minP = Math.min.apply(null, projections);
      const maxP = Math.max.apply(null, projections);
      const span = maxP - minP;
      if (!Number.isFinite(span) || span <= 0) return 7;
      const sr = polygon.spatialReference;
      const a = RT.view.toScreen({ type: 'point', x: center.x + px * span / 2, y: center.y + py * span / 2, spatialReference: sr });
      const b = RT.view.toScreen({ type: 'point', x: center.x - px * span / 2, y: center.y - py * span / 2, spatialReference: sr });
      if (!a || !b || !Number.isFinite(a.x) || !Number.isFinite(a.y) || !Number.isFinite(b.x) || !Number.isFinite(b.y)) return 7;
      const screenMinor = Math.hypot(a.x - b.x, a.y - b.y);
      return Math.max(3, Math.min(8, screenMinor * 0.22));
    }

    function getSepticTankConnectionPoints(graphic) {
      if (!isSepticParent(graphic) || !graphic.geometry) return [];
      const info = septicTankAxisInfo(graphic.geometry);
      if (!info) return [];
      const half = info.span / 2;
      return [
        WS.pointFromXY(info.center.x - info.ux * half, info.center.y - info.uy * half, WS.spatialReferenceJSON(info.spatialReference)),
        WS.pointFromXY(info.center.x + info.ux * half, info.center.y + info.uy * half, WS.spatialReferenceJSON(info.spatialReference))
      ];
    }

    const SEPTIC_FILL_COLOR = [201, 215, 204, 255]; // #C9D7CC
    const SEPTIC_OUTLINE_COLOR = [63, 90, 54, 1];   // #3F5A36
    function septicTankSymbol() {
      return {
        type: 'simple-fill',
        color: SEPTIC_FILL_COLOR,
        outline: { type: 'simple-line', color: SEPTIC_OUTLINE_COLOR, width: 2 }
      };
    }
    // Per-mode tank body: existing solid outline, proposed dashed outline.
    const septicSymbols = {
      existing: septicTankSymbol(),
      proposed: {
        type: 'simple-fill',
        color: SEPTIC_FILL_COLOR,
        outline: { type: 'simple-line', color: SEPTIC_OUTLINE_COLOR, width: 2, style: 'dash' }
      }
    };

    function septicLidSymbol(sizePx) {
      const size = Number.isFinite(sizePx) ? Math.max(3, Math.min(8, sizePx)) : 7;
      const outlineWidth = size <= 4 ? 0.9 : size <= 6 ? 1.1 : 1.25;
      return {
        type: 'simple-marker',
        style: 'circle',
        color: [254, 253, 249, 1], // #FEFDF9
        size,
        outline: { type: 'simple-line', color: [63, 90, 54, 1], width: outlineWidth } // #3F5A36
      };
    }

    function septicConnectionSnapSymbol() {
      return {
        type: 'simple-marker',
        style: 'circle',
        color: [0, 0, 0, 0.001],
        size: 10,
        outline: { type: 'simple-line', color: [0, 0, 0, 0], width: 0 }
      };
    }

    function applySepticParentMetadata(parent) {
      if (!parent) return parent;
      const parentId = WS.ensureSitePlanId(parent, 'septic');
      const attrs = parent.attributes || {};
      const fixedLengthFt = parent.__fixedLengthFt != null ? parent.__fixedLengthFt : attrs.fixedLengthFt;
      const fixedWidthFt = parent.__fixedWidthFt != null ? parent.__fixedWidthFt : attrs.fixedWidthFt;

      parent.__toolType = SEPTIC_TOOL_TYPE;
      parent.__label = 'Septic tank';
      parent.__measureLabel = 'Selected shape';
      parent.__skipEdgeLabels = true;
      parent.__preferredEditMode = 'transform';
      parent.__useFixedSizeLabels = false;
      if (Number.isFinite(fixedLengthFt)) parent.__septicLengthFt = fixedLengthFt;
      if (Number.isFinite(fixedWidthFt)) parent.__septicWidthFt = fixedWidthFt;

      parent.attributes = Object.assign({}, attrs, {
        toolType: SEPTIC_TOOL_TYPE,
        sitePlanTool: SEPTIC_TOOL_TYPE,
        sitePlanCategory: 'well-septic',
        sitePlanId: parentId,
        label: 'Septic tank',
        measureLabel: 'Selected shape',
        skipEdgeLabels: true,
        preferredEditMode: 'transform',
        useFixedSizeLabels: false,
        toolCapabilities: Object.assign({}, SEPTIC_TOOL_CAPABILITIES)
      });
      if (Number.isFinite(fixedLengthFt)) parent.attributes.septicLengthFt = fixedLengthFt;
      if (Number.isFinite(fixedWidthFt)) parent.attributes.septicWidthFt = fixedWidthFt;
      WS.applyToolCapabilities(parent, SEPTIC_TOOL_CAPABILITIES);
      return parent;
    }

    function rebuildSepticSupport(parent) {
      if (!isSepticParent(parent)) return;
      applySepticParentMetadata(parent);
      const parentId = parent.__sitePlanId;
      WS.removeSupportGraphics(parentId);

      const lidPts = calcSepticLidPoints(parent.geometry);
      if (lidPts.length !== 2) return;
      const lidSize = calcSepticLidScreenSize(parent.geometry);
      const sr = parent.geometry.spatialReference;
      const lids = lidPts.map((pt, i) => WS.tagSupportGraphic(new RT.Graphic({
        geometry: { type: 'point', x: pt.x, y: pt.y, spatialReference: WS.spatialReferenceJSON(sr) },
        symbol: septicLidSymbol(lidSize)
      }), parentId, 'septic-lid', { selectParent: true }, SUPPORT_CAPABILITIES));
      lids.forEach((lid, i) => {
        lid.__septicLidIndex = i;
        lid.attributes = Object.assign({}, lid.attributes || {}, { septicLidIndex: i });
      });
      if (lids.length) RT.labelLayer.addMany(lids);

      WS.addConnectionSnapSupports({
        parentId,
        points: getSepticTankConnectionPoints(parent),
        role: 'septic-connection-snap',
        symbol: septicConnectionSnapSymbol,
        indexProperty: '__septicConnectionIndex',
        indexAttribute: 'septicConnectionIndex',
        supportCapabilities: SUPPORT_CAPABILITIES
      });
    }

    function makeRoundedRectGeometryFromCenter(center, lengthFt, widthFt, cornerSegments, radiusRatio) {
      if (!center) return null;
      const sr = center.spatialReference || (RT.view && RT.view.spatialReference);
      const lengthOffsets = WS.feetToLocalMapOffsets(lengthFt, center);
      const widthOffsets = WS.feetToLocalMapOffsets(widthFt, center);
      const halfLength = (lengthOffsets && Number.isFinite(lengthOffsets.dx) ? lengthOffsets.dx : 0) / 2;
      const halfWidth = (widthOffsets && Number.isFinite(widthOffsets.dy) ? widthOffsets.dy : 0) / 2;
      if (!Number.isFinite(halfLength) || !Number.isFinite(halfWidth) || halfLength <= 0 || halfWidth <= 0) return null;

      const segs = Math.max(3, cornerSegments || 5);
      const r = Math.max(0, Math.min(halfLength, halfWidth) * (radiusRatio == null ? 0.35 : radiusRatio));
      const x = center.x;
      const y = center.y;
      const pts = [];

      function addArc(cx, cy, startDeg, endDeg) {
        for (let i = 0; i <= segs; i++) {
          const t = i / segs;
          const a = (startDeg + (endDeg - startDeg) * t) * Math.PI / 180;
          pts.push([x + cx + r * Math.cos(a), y + cy + r * Math.sin(a)]);
        }
      }

      addArc( halfLength - r,  halfWidth - r,   0,  90);
      addArc(-halfLength + r,  halfWidth - r,  90, 180);
      addArc(-halfLength + r, -halfWidth + r, 180, 270);
      addArc( halfLength - r, -halfWidth + r, 270, 360);
      if (pts.length) pts.push(pts[0].slice());

      return {
        type: 'polygon',
        rings: [pts],
        spatialReference: sr && sr.toJSON ? sr.toJSON() : sr
      };
    }

    function septicDimensions() {
      const dims = rectangleTool && typeof rectangleTool.dimensions === 'function'
        ? rectangleTool.dimensions()
        : { widthFt: NaN, lengthFt: NaN, valid: false };
      return {
        lengthFt: dims.lengthFt,
        widthFt: dims.widthFt,
        valid: !!dims.valid
      };
    }

    function announceSepticTool() {
      callCoordinator('announceToolActivated', SEPTIC_TOOL_TYPE);
      callCoordinator('cancelSepticLinePlacement', false);
      callCoordinator('clearSepticLineButton');
    }

    function removeSepticSideLabels(graphic) {
      if (typeof RT.removeSideLabelsForGraphic === 'function') RT.removeSideLabelsForGraphic(graphic);
    }

    rectangleTool = RECT.create({
      RT,
      toolId: SEPTIC_TOOL_TYPE,
      buttonId: SEPTIC_BUTTON_ID,
      checkboxId: SEPTIC_CHECKBOX_ID,
      widthId: SEPTIC_WIDTH_ID,
      lengthId: SEPTIC_LENGTH_ID,
      category: 'well-septic',
      label: 'Septic tank',
      order: 20,
      symbols: septicSymbols,
      toolCapabilities: SEPTIC_TOOL_CAPABILITIES,
      makeGeometry: (center, widthFt, lengthFt) => makeRoundedRectGeometryFromCenter(center, lengthFt, widthFt, 5, 0.10),
      onAnnounce: announceSepticTool,
      isOwnEvent: detail => detail && detail.source === 'tools-well-septic' && detail.tool === SEPTIC_TOOL_TYPE,
      logPrefix: '[tools-well-septic/septic-tank]',
      buttonTitle: 'Place or draw a septic tank',
      iconHtml: septicIcon,
      iconApply: septicIconApply,
      iconClass: 'dm-line36',
      defaultChecked: true,
      defaultWidthFt: DEFAULT_SEPTIC_WIDTH_FT,
      defaultLengthFt: DEFAULT_SEPTIC_LENGTH_FT,
      minWidthFt: 0.1,
      minLengthFt: 0.1,
      widthStep: 0.1,
      lengthStep: 0.1,
      dimensionOrder: 'length-width',
      widthAriaLabel: 'Septic tank width in feet',
      lengthAriaLabel: 'Septic tank length in feet',
      toolTypeKey: SEPTIC_TOOL_TYPE,
      pendingKey: SEPTIC_TOOL_TYPE,
      suppressLiveSideLabelsDuringManual: true,
      applyExtraMetadata: applySepticParentMetadata,
      onActiveChanged: active => {
        callCoordinator('onActiveChanged', !!active);
        if (active) callCoordinator('clearOtherActiveButtons');
      },
      onPendingChanged: pending => {
        callCoordinator('onPendingChanged', !!pending);
      },
      onPlaceFixed: parent => {
        callCoordinator('cancelDboxPlacement', false);
        callCoordinator('cancelDrainfieldPlacement', false);
        callCoordinator('cancelReserveDrainfieldPlacement', false);
        callCoordinator('cancelSepticLinePlacement', false);
        callCoordinator('clearDboxButton');
        callCoordinator('clearDrainfieldButton');
        callCoordinator('clearReserveDrainfieldButton');
        callCoordinator('clearSepticLineButton');
        removeSepticSideLabels(parent);
      },
      onGraphicCreated: graphic => {
        rebuildSepticSupport(graphic);
        removeSepticSideLabels(graphic);
      },
      onGraphicUpdated: graphic => {
        rebuildSepticSupport(graphic);
        removeSepticSideLabels(graphic);
      },
      onGraphicDeleted: graphic => {
        const parentId = WS.ensureSitePlanId(graphic, 'septic');
        WS.removeSupportGraphics(parentId);
      }
    });

    septicTankToolApi = Object.assign({}, rectangleTool, {
      id: SEPTIC_TOOL_TYPE,
      order: 20,
      capabilities: Object.assign({}, SEPTIC_TOOL_CAPABILITIES),
      supportCapabilities: Object.assign({}, SUPPORT_CAPABILITIES),
      ownsLifecycle: true,

      setCoordinator,
      dimensions: septicDimensions,
      isParent: isSepticParent,
      axisInfo: septicTankAxisInfo,
      calcLidPoints: calcSepticLidPoints,
      calcLidScreenSize: calcSepticLidScreenSize,
      getConnectionPoints: getSepticTankConnectionPoints,
      tankSymbol: septicTankSymbol,
      lidSymbol: septicLidSymbol,
      connectionSnapSymbol: septicConnectionSnapSymbol,
      applyMetadata: applySepticParentMetadata,
      rebuildSupport: rebuildSepticSupport
    });

    window.SitePlanSepticTankTool = Object.assign({}, window.SitePlanSepticTankTool || {}, septicTankToolApi);

    if (typeof WS.registerTool === 'function') {
      WS.registerTool(window.SitePlanSepticTankTool);
    } else {
      console.warn('[tools-well-septic/septic-tank] Well & Septic registry is unavailable.');
    }
  }).catch(err => {
    console.error('[tools-well-septic/septic-tank] Failed to initialize after runtime ready:', err);
  });
})();
