// ADA Parking Stall tool — thin wrapper using js/utils/rectangle-tool.js factory.

(function () {
  if (!window.SitePlanRuntimeReady) {
    console.error('[tools-parking/ada-stall] window.SitePlanRuntimeReady is missing. Make sure js/runtime.js loads first.');
    return;
  }
  if (!window.SitePlanParkingShared) {
    console.error('[tools-parking/ada-stall] SitePlanParkingShared is missing. Make sure parking-shared.js loads first.');
    return;
  }
  if (!window.SitePlanRectangleTool) {
    console.error('[tools-parking/ada-stall] SitePlanRectangleTool is missing. Make sure js/utils/rectangle-tool.js loads first.');
    return;
  }

  window.SitePlanRuntimeReady.then(RT => {
    const PS = window.SitePlanParkingShared;

    const TOOL_ID      = 'adaParkingStall';
    const EVENT_SOURCE = 'tools-parking:adaParkingStall';
    const PARKING_TYPE = 'adaStall';

    const ADA_MARK_MIN_SIZE     = 8;
    const ADA_MARK_DEFAULT_SIZE = 18;
    const ADA_MARK_MAX_SIZE     = 34;

    // ── Icon ──────────────────────────────────────────────────────────────
    const adaIconPath =
      'M423.5-743.5Q400-767 400-800t23.5-56.5Q447-880 480-880t56.5 23.5Q560-833 560-800t-23.5 56.5Q513-720 480-720t-56.5-23.5ZM680-80v-200H480q-33 0-56.5-23.5T400-360v-240q0-33 23.5-56.5T480-680q24 0 41.5 10.5T559-636q55 66 99.5 90.5T760-520v80q-53 0-107-23t-93-55v138h120q33 0 56.5 23.5T760-300v220h-80Zm-280 0q-83 0-141.5-58.5T200-280q0-72 45.5-127T360-476v82q-35 14-57.5 44.5T280-280q0 50 35 85t85 35q39 0 69.5-22.5T514-240h82q-14 69-69 114.5T400-80Z';

    const stallIcon =
      '<svg viewBox="0 0 36 22" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
        '<g class="dm-existing">' +
          '<path d="M3.5 2 H32 V20 H3.5 Q2 20 2 18.5 V3.5 Q2 2 3.5 2 Z" fill="#02639C"/>' +
          '<path d="M3.5 2 H32 M32 20 H3.5 Q2 20 2 18.5 V3.5 Q2 2 3.5 2" fill="none" stroke="#FFFFFF" stroke-width="1" stroke-linecap="butt" stroke-linejoin="round"/>' +
          '<g transform="translate(18.4 11) rotate(-90) scale(0.017) translate(-480 480)">' +
            '<path fill="#FFFFFF" d="' + adaIconPath + '"/>' +
          '</g>' +
        '</g>' +
        '<g class="dm-proposed" style="display:none">' +
          '<path d="M3.5 2 H32 V20 H3.5 Q2 20 2 18.5 V3.5 Q2 2 3.5 2 Z" fill="#02639C"/>' +
          '<g fill="none" stroke="#FFFFFF" stroke-width="1" stroke-linecap="butt" stroke-linejoin="round">' +
            '<path d="M6.5 2 H3.5 Q2 2 2 3.5 V6.5"/>' +
            '<line x1="10.5" y1="2" x2="15" y2="2"/>' +
            '<line x1="19" y1="2" x2="23.5" y2="2"/>' +
            '<line x1="27.5" y1="2" x2="32" y2="2"/>' +
            '<path d="M6.5 20 H3.5 Q2 20 2 18.5 V15.5"/>' +
            '<line x1="10.5" y1="20" x2="15" y2="20"/>' +
            '<line x1="19" y1="20" x2="23.5" y2="20"/>' +
            '<line x1="27.5" y1="20" x2="32" y2="20"/>' +
            '<line x1="2" y1="9" x2="2" y2="13"/>' +
          '</g>' +
          '<g transform="translate(18.4 11) rotate(-90) scale(0.017) translate(-480 480)">' +
            '<path fill="#FFFFFF" d="' + adaIconPath + '"/>' +
          '</g>' +
        '</g>' +
      '</svg>';

    const adaMarkerSvg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">' +
        '<g transform="translate(14 10) scale(0.075)" fill="#FFFFFF">' +
          '<path d="M161.9882813,98.1240234 c24.9628906-2.3046875,44.3574219-23.8110352,44.3574219-48.9658203C206.3457031,22.0830078,184.2626953,0,157.1875,0 s-49.1572266,22.0830078-49.1572266,49.1582031c0,8.2568359,2.3037109,16.7055664,6.1445313,23.8105469l17.515625,246.4667969 l180.3964844,0.0488281l73.9912109,173.3652344l97.1445313-38.0976563l-15.0429688-35.8203125l-54.3662109,19.625 l-71.5908203-165.2802734l-167.7294922,1.1269531l-2.3027344-31.2128906l121.4228516,0.0483398v-46.1831055l-126.0546875-0.0493164 L161.9882813,98.1240234z"/>' +
          '<path d="M343.4199219,451.5908203 c-30.4472656,60.1875-94.1748047,99.8398438-162.1503906,99.8398438C81.4296875,551.4306641,0,470.0009766,0,370.1611328 c0-70.1005859,42.4853516-135.2436523,105.8818359-164.1210938l4.1025391,53.5375977 c-37.4970703,23.628418-60.6123047,66.262207-60.6123047,110.9506836c0,72.4267578,59.0712891,131.4970703,131.4970703,131.4970703 c66.2617188,0,122.7646484-50.8515625,130.4697266-116.0869141L343.4199219,451.5908203z"/>' +
        '</g>' +
      '</svg>';

    // ── Symbols ───────────────────────────────────────────────────────────
    const stallSymbol = {
      type: 'simple-fill',
      color: [2, 99, 156, 1], // #02639C ADA blue — solid stall fill
      outline: { type: 'simple-line', color: [102, 101, 97, 0], width: 0 }
    };

    const stallBorderShadowSymbol = {
      type: 'simple-line', color: [17, 17, 17, 0.72], width: 4, cap: 'butt', join: 'miter'
    };

    const stallBorderSymbol = {
      type: 'simple-line', color: [255, 255, 255, 1], width: 2, cap: 'butt', join: 'miter'
    };

    // ── ADA mark helpers ───────────────────────────────────────────────────
    function getSnapSidesForAdaMark(graphic) {
      const attrs = graphic && graphic.attributes ? graphic.attributes : {};
      const isAda = !!(graphic &&
        (graphic.__toolType === TOOL_ID || attrs.toolType === TOOL_ID || attrs.sitePlanTool === TOOL_ID) &&
        graphic.geometry && graphic.geometry.type === 'polygon');
      if (!isAda) return [];
      const points = PS.ringWithoutDuplicateClose(graphic.geometry);
      if (points.length < 4) return [];
      const sr = PS.spatialReferenceJSON(graphic.geometry.spatialReference);
      return [
        PS.sideFromPoints('bottom', points[0], points[1], sr, 'top'),
        PS.sideFromPoints('right',  points[1], points[2], sr, 'left'),
        PS.sideFromPoints('top',    points[2], points[3], sr, 'bottom'),
        PS.sideFromPoints('left',   points[3], points[0], sr, 'right')
      ].filter(Boolean);
    }

    function adaMarkAngleDegrees(graphic) {
      const sides = getSnapSidesForAdaMark(graphic);
      const top = sides.find(s => s && s.name === 'top') || null;
      if (!top || !Number.isFinite(top.ux) || !Number.isFinite(top.uy)) return 0;
      const degrees = 180 - Math.atan2(top.uy, top.ux) * 180 / Math.PI;
      return ((degrees % 360) + 360) % 360;
    }

    function adaMarkSize(graphic) {
      const geometry = graphic && graphic.geometry;
      const ring = geometry && geometry.type === 'polygon' && geometry.rings && geometry.rings[0] ? geometry.rings[0] : null;
      if (!ring || ring.length < 4 || !RT.view || typeof RT.view.toScreen !== 'function') return ADA_MARK_DEFAULT_SIZE;
      const sr = geometry.spatialReference;
      const points = ring.slice(0, 4).map(pt => {
        try { return RT.view.toScreen({ type: 'point', x: pt[0], y: pt[1], spatialReference: sr }); }
        catch (err) { return null; }
      }).filter(Boolean);
      if (points.length < 4) return ADA_MARK_DEFAULT_SIZE;
      const xs = points.map(p => p.x), ys = points.map(p => p.y);
      const screenWidth  = Math.max.apply(null, xs) - Math.min.apply(null, xs);
      const screenHeight = Math.max.apply(null, ys) - Math.min.apply(null, ys);
      const shortSide = Math.min(screenWidth, screenHeight);
      if (!Number.isFinite(shortSide) || shortSide <= 0) return ADA_MARK_DEFAULT_SIZE;
      return PS.clamp(Math.round(shortSide * 0.55), ADA_MARK_MIN_SIZE, ADA_MARK_MAX_SIZE);
    }

    function adaMarkSymbol(graphic) {
      const size = adaMarkSize(graphic);
      return {
        type: 'picture-marker',
        url: PS.svgDataUrl(adaMarkerSvg),
        width: size,
        height: size,
        angle: adaMarkAngleDegrees(graphic)
      };
    }

    function markPointForStall(graphic) {
      const geometry = graphic && graphic.geometry;
      const points = PS.ringWithoutDuplicateClose(geometry);
      if (!points || points.length < 4) {
        return geometry && geometry.extent ? geometry.extent.center : null;
      }
      const center = points.reduce((acc, pt) => { acc.x += pt[0]; acc.y += pt[1]; return acc; }, { x: 0, y: 0 });
      center.x /= points.length; center.y /= points.length;
      return PS.pointFromXY(center.x, center.y, PS.spatialReferenceJSON(geometry.spatialReference));
    }

    // ── Support identification ─────────────────────────────────────────────
    const supportManager = PS.makeRectangleSupportManager(RT, {
      toolId: TOOL_ID,
      supportRoles: [
        'adaParkingStallBorder', 'adaParkingStallBorderShadow',
        'adaParkingStallMark',   'adaParkingStallMarkIcon'
      ],
      borderMode: 'open',
      borderShadowSymbol: stallBorderShadowSymbol,
      borderShadowRole: 'adaParkingStallBorderShadow',
      borderSymbol: PS.modeAwareBorder(stallBorderSymbol),
      borderRole: 'adaParkingStallBorder',
      extraSupportItems: graphic => {
        const markPoint = markPointForStall(graphic);
        if (!markPoint) return [];
        return [{
          geometry: markPoint,
          symbol: adaMarkSymbol(graphic),
          role: 'adaParkingStallMarkIcon'
        }];
      }
    });
    const internalRebuildSupport = supportManager.rebuildSupport;

    let adaMarkRefreshFrame = null;

    function findAdaParentById(id) {
      if (!id || !RT.drawLayer) return null;
      return PS.graphicsInLayer(RT.drawLayer).find(g => {
        const attrs = g && g.attributes ? g.attributes : {};
        const matchId = g.__sitePlanId || attrs.sitePlanId;
        return matchId === id && g.geometry && g.geometry.type === 'polygon' &&
          (g.__toolType === TOOL_ID || attrs.sitePlanTool === TOOL_ID);
      }) || null;
    }

    function refreshAdaMarkSymbols() {
      adaMarkRefreshFrame = null;
      if (!RT.labelLayer) return;
      PS.graphicsInLayer(RT.labelLayer).forEach(mark => {
        const attrs = mark && mark.attributes ? mark.attributes : {};
        const role  = mark && (mark.__supportRole || attrs.supportRole || attrs.sitePlanTool);
        if (role !== 'adaParkingStallMark' && role !== 'adaParkingStallMarkIcon') return;
        const parentId = mark.__supportFor || attrs.supportFor || attrs.parentSitePlanId || attrs.selectParentId;
        const parent   = findAdaParentById(parentId);
        if (!parent) return;
        const point = markPointForStall(parent);
        if (point) mark.geometry = point;
        mark.symbol = adaMarkSymbol(parent);
      });
    }

    function scheduleAdaMarkRefresh() {
      if (adaMarkRefreshFrame != null) return;
      if (window.requestAnimationFrame) adaMarkRefreshFrame = window.requestAnimationFrame(refreshAdaMarkSymbols);
      else adaMarkRefreshFrame = window.setTimeout(refreshAdaMarkSymbols, 16);
    }

    // ── Coordinator ────────────────────────────────────────────────────────
    let coordinator = {};

    // ── Tool creation ──────────────────────────────────────────────────────
    const tool = window.SitePlanRectangleTool.create({
      RT,
      toolId:          TOOL_ID,
      buttonId:        'btn-ada-parking-stall',
      checkboxId:      'chk-ada-parking-stall-fixed',
      widthId:         'ada-parking-stall-width',
      lengthId:        'ada-parking-stall-length',
      category:        'parking',
      label:           'ADA Parking stall',
      order:           30,
      symbol:          stallSymbol,
      symbols:         { existing: stallSymbol, proposed: stallSymbol },
      toolCapabilities: {
        reshape: false, resize: false, rotate: true,
        label: false, duplicate: true, delete: true, toolbar: true
      },
      makeGeometry:    (center, widthFt, lengthFt) =>
        PS.makeNorthSouthRectangleGeometry(center, widthFt, lengthFt),
      fixedOnly:        true,
      defaultChecked:   true,
      defaultWidthFt:   10,
      defaultLengthFt:  20,
      widthAriaLabel:  'ADA parking stall width in feet',
      lengthAriaLabel: 'ADA parking stall length in feet',
      toolTypeKey:     TOOL_ID,
      pendingKey:      TOOL_ID,
      onAnnounce:      () => PS.announceToolActivated(TOOL_ID, { source: EVENT_SOURCE }),
      isOwnEvent:      detail => detail.source === EVENT_SOURCE,
      applyExtraMetadata: graphic => {
        graphic.__preferredEditMode = 'rotate';
        graphic.__skipSideLabels    = true;
        graphic.attributes = Object.assign({}, graphic.attributes || {}, { parkingType: PARKING_TYPE });
        PS.stampParkingMode(graphic);
      },
      onPlaceFixed: graphic => {
        const fn = coordinator.applySideSnap;
        if (typeof fn === 'function') fn(graphic);
      },
      onPointerMove: probe => {
        const fn = coordinator.updateSideSnapPreview;
        if (typeof fn === 'function') fn(probe);
      },
      onCancelPlacement: () => {
        const fn = coordinator.clearSideSnapPreview;
        if (typeof fn === 'function') fn();
      },
      onGraphicCreated: (graphic, { createdByTool }) => {
        internalRebuildSupport(graphic);
        if (createdByTool) {
          const fn = coordinator.applySideSnap;
          if (typeof fn === 'function') fn(graphic);
        }
      },
      onGraphicUpdated: graphic => {
        internalRebuildSupport(graphic);
      },
      onGraphicDeleted: graphic => {
        supportManager.removeSupport(graphic);
      },
      onZoomRefresh:   scheduleAdaMarkRefresh,
      iconHtml:        stallIcon,
      iconClass:       'icon-parking-ada dm-line36',
      iconApply:       window.SitePlanDrawingMode && window.SitePlanDrawingMode.iconSwapApply,
      buttonTitle:     'Place or draw an ADA parking stall',
      logPrefix:       '[tools-parking/ada-stall]'
    });

    tool.rebuildSupport = internalRebuildSupport;
    tool.setCoordinator = ctx => { coordinator = ctx || {}; return tool; };

    // ── Register ───────────────────────────────────────────────────────────
    PS.registerTool(tool);
    window.startAdaParkingStallTool    = tool.start;
    window.SitePlanAdaParkingStallTool = tool;

  }).catch(err => {
    console.error('[tools-parking/ada-stall] Failed to initialize after runtime ready:', err);
  });
}());
