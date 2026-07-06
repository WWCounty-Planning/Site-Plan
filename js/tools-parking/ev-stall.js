// js/tools-parking/ev-stall.js
// EV Parking Stall tool — thin wrapper using js/utils/rectangle-tool.js factory.

(function () {
  if (!window.SitePlanRuntimeReady) {
    console.error('[tools-parking/ev-stall] window.SitePlanRuntimeReady is missing. Make sure js/runtime.js loads first.');
    return;
  }
  if (!window.SitePlanParkingShared) {
    console.error('[tools-parking/ev-stall] SitePlanParkingShared is missing. Make sure parking-shared.js loads first.');
    return;
  }
  if (!window.SitePlanRectangleTool) {
    console.error('[tools-parking/ev-stall] SitePlanRectangleTool is missing. Make sure js/utils/rectangle-tool.js loads first.');
    return;
  }

  window.SitePlanRuntimeReady.then(RT => {
    const PS = window.SitePlanParkingShared;

    const TOOL_ID      = 'evParkingStall';
    const EVENT_SOURCE = 'tools-parking:evParkingStall';
    const PARKING_TYPE = 'evStall';

    const EV_MARK_MIN_SIZE     = 8;
    const EV_MARK_DEFAULT_SIZE = 18;
    const EV_MARK_MAX_SIZE     = 34;

    // ── Icon ──────────────────────────────────────────────────────────────
    const evIconPath =
      'm340-200 100-160h-60v-120L280-320h60v120ZM240-560h240v-200H240v200Zm0 360h240v-280H240v280Zm-80 80v-640q0-33 23.5-56.5T240-840h240q33 0 56.5 23.5T560-760v280h50q29 0 49.5 20.5T680-410v185q0 17 14 31t31 14q18 0 31.5-14t13.5-31v-375h-10q-17 0-28.5-11.5T720-640v-80h20v-60h40v60h40v-60h40v60h20v80q0 17-11.5 28.5T840-600h-10v375q0 42-30.5 73.5T725-120q-43 0-74-31.5T620-225v-185q0-5-2.5-7.5T610-420h-50v300H160Zm320-80H240h240Z';

    const stallIcon =
      '<svg viewBox="0 0 36 22" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
        '<g class="dm-existing">' +
          '<path d="M3.5 2 H32 V20 H3.5 Q2 20 2 18.5 V3.5 Q2 2 3.5 2 Z" fill="#60843C"/>' +
          '<path d="M3.5 2 H32 M32 20 H3.5 Q2 20 2 18.5 V3.5 Q2 2 3.5 2" fill="none" stroke="#FFFFFF" stroke-width="1" stroke-linecap="butt" stroke-linejoin="round"/>' +
          '<g transform="translate(18.25 11) rotate(-90) scale(0.0128) translate(-480 480)">' +
            '<path fill="#FFFFFF" d="' + evIconPath + '"/>' +
          '</g>' +
        '</g>' +
        '<g class="dm-proposed" style="display:none">' +
          '<path d="M3.5 2 H32 V20 H3.5 Q2 20 2 18.5 V3.5 Q2 2 3.5 2 Z" fill="#60843C"/>' +
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
          '<g transform="translate(18.25 11) rotate(-90) scale(0.0128) translate(-480 480)">' +
            '<path fill="#FFFFFF" d="' + evIconPath + '"/>' +
          '</g>' +
        '</g>' +
      '</svg>';

    const evMarkerSvg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">' +
        '<g transform="translate(10 54) scale(0.046)" fill="#FFFFFF">' +
          '<path d="m340-200 100-160h-60v-120L280-320h60v120ZM240-560h240v-200H240v200Zm0 360h240v-280H240v280Zm-80 80v-640q0-33 23.5-56.5T240-840h240q33 0 56.5 23.5T560-760v280h50q29 0 49.5 20.5T680-410v185q0 17 14 31t31 14q18 0 31.5-14t13.5-31v-375h-10q-17 0-28.5-11.5T720-640v-80h20v-60h40v60h40v-60h40v60h20v80q0 17-11.5 28.5T840-600h-10v375q0 42-30.5 73.5T725-120q-43 0-74-31.5T620-225v-185q0-5-2.5-7.5T610-420h-50v300H160Zm320-80H240h240Z"/>' +
        '</g>' +
      '</svg>';

    // ── Symbols ───────────────────────────────────────────────────────────
    const stallSymbol = {
      type: 'simple-fill',
      color: [96, 132, 60, 1], // #60843C EV green — solid stall fill
      outline: { type: 'simple-line', color: [102, 101, 97, 0], width: 0 }
    };

    const stallBorderShadowSymbol = {
      type: 'simple-line', color: [17, 17, 17, 0.72], width: 4, cap: 'butt', join: 'miter'
    };

    const stallBorderSymbol = {
      type: 'simple-line', color: [255, 255, 255, 1], width: 2, cap: 'butt', join: 'miter'
    };

    // ── EV mark helpers ────────────────────────────────────────────────────
    function getSnapSidesForEvMark(graphic) {
      const attrs = graphic && graphic.attributes ? graphic.attributes : {};
      const isEv = !!(graphic &&
        (graphic.__toolType === TOOL_ID || attrs.toolType === TOOL_ID || attrs.sitePlanTool === TOOL_ID) &&
        graphic.geometry && graphic.geometry.type === 'polygon');
      if (!isEv) return [];
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

    function evMarkAngleDegrees(graphic) {
      const sides = getSnapSidesForEvMark(graphic);
      const top = sides.find(s => s && s.name === 'top') || null;
      if (!top || !Number.isFinite(top.ux) || !Number.isFinite(top.uy)) return 0;
      const degrees = 180 - Math.atan2(top.uy, top.ux) * 180 / Math.PI;
      return ((degrees % 360) + 360) % 360;
    }

    function evMarkFontSize(graphic) {
      const geometry = graphic && graphic.geometry;
      const ring = geometry && geometry.type === 'polygon' && geometry.rings && geometry.rings[0] ? geometry.rings[0] : null;
      if (!ring || ring.length < 4 || !RT.view || typeof RT.view.toScreen !== 'function') return EV_MARK_DEFAULT_SIZE;
      const sr = geometry.spatialReference;
      const points = ring.slice(0, 4).map(pt => {
        try { return RT.view.toScreen({ type: 'point', x: pt[0], y: pt[1], spatialReference: sr }); }
        catch (err) { return null; }
      }).filter(Boolean);
      if (points.length < 4) return EV_MARK_DEFAULT_SIZE;
      const xs = points.map(p => p.x), ys = points.map(p => p.y);
      const screenWidth  = Math.max.apply(null, xs) - Math.min.apply(null, xs);
      const screenHeight = Math.max.apply(null, ys) - Math.min.apply(null, ys);
      const shortSide = Math.min(screenWidth, screenHeight);
      if (!Number.isFinite(shortSide) || shortSide <= 0) return EV_MARK_DEFAULT_SIZE;
      return PS.clamp(Math.round(shortSide * 0.58), EV_MARK_MIN_SIZE, EV_MARK_MAX_SIZE);
    }

    function evMarkSymbol(graphic) {
      const size = evMarkFontSize(graphic);
      return {
        type: 'picture-marker',
        url: PS.svgDataUrl(evMarkerSvg),
        width: size,
        height: size,
        angle: evMarkAngleDegrees(graphic)
      };
    }

    function centerPointForStall(graphic) {
      const geometry = graphic && graphic.geometry;
      return geometry && geometry.extent ? geometry.extent.center : null;
    }

    // ── Support identification ─────────────────────────────────────────────
    const supportManager = PS.makeRectangleSupportManager(RT, {
      toolId: TOOL_ID,
      supportRoles: [
        'evParkingStallBorder', 'evParkingStallBorderShadow',
        'evParkingStallMark', 'evParkingStallMarkIcon'
      ],
      borderMode: 'open',
      borderShadowSymbol: stallBorderShadowSymbol,
      borderShadowRole: 'evParkingStallBorderShadow',
      borderSymbol: PS.modeAwareBorder(stallBorderSymbol),
      borderRole: 'evParkingStallBorder',
      extraSupportItems: graphic => {
        const markPoint = centerPointForStall(graphic);
        if (!markPoint) return [];
        return [{ geometry: markPoint, symbol: evMarkSymbol(graphic), role: 'evParkingStallMarkIcon' }];
      }
    });
    const internalRebuildSupport = supportManager.rebuildSupport;

    // ── Parent predicate (mirrors factory's attribute checks) ──────────────
    // ── Border geometry (U-shape: bottom open) ─────────────────────────────
    // ── Support helpers ────────────────────────────────────────────────────
    // ── Zoom-triggered mark refresh ────────────────────────────────────────
    let evMarkRefreshFrame = null;

    function findEvParentById(id) {
      if (!id || !RT.drawLayer) return null;
      return PS.graphicsInLayer(RT.drawLayer).find(g => {
        const attrs = g && g.attributes ? g.attributes : {};
        const matchId = g.__sitePlanId || attrs.sitePlanId;
        return matchId === id && g.geometry && g.geometry.type === 'polygon' &&
          (g.__toolType === TOOL_ID || attrs.sitePlanTool === TOOL_ID);
      }) || null;
    }

    function refreshEvMarkSymbols() {
      evMarkRefreshFrame = null;
      if (!RT.labelLayer) return;
      PS.graphicsInLayer(RT.labelLayer).forEach(mark => {
        const attrs = mark && mark.attributes ? mark.attributes : {};
        const role  = mark && (mark.__supportRole || attrs.supportRole || attrs.sitePlanTool);
        if (role !== 'evParkingStallMark' && role !== 'evParkingStallMarkIcon') return;
        const parentId = mark.__supportFor || attrs.supportFor || attrs.parentSitePlanId || attrs.selectParentId;
        const parent   = findEvParentById(parentId);
        if (!parent) return;
        const center = centerPointForStall(parent);
        if (center) mark.geometry = center;
        mark.symbol = evMarkSymbol(parent);
      });
    }

    function scheduleEvMarkRefresh() {
      if (evMarkRefreshFrame != null) return;
      if (window.requestAnimationFrame) evMarkRefreshFrame = window.requestAnimationFrame(refreshEvMarkSymbols);
      else evMarkRefreshFrame = window.setTimeout(refreshEvMarkSymbols, 16);
    }

    // ── Coordinator ────────────────────────────────────────────────────────
    let coordinator = {};

    // ── Tool creation ──────────────────────────────────────────────────────
    const tool = window.SitePlanRectangleTool.create({
      RT,
      toolId:          TOOL_ID,
      buttonId:        'btn-ev-parking-stall',
      checkboxId:      'chk-ev-parking-stall-fixed',
      widthId:         'ev-parking-stall-width',
      lengthId:        'ev-parking-stall-length',
      category:        'parking',
      label:           'EV Parking stall',
      order:           20,
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
      widthAriaLabel:  'EV parking stall width in feet',
      lengthAriaLabel: 'EV parking stall length in feet',
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
      onZoomRefresh:   scheduleEvMarkRefresh,
      iconHtml:        stallIcon,
      iconClass:       'icon-parking-ev dm-line36',
      iconApply:       window.SitePlanDrawingMode && window.SitePlanDrawingMode.iconSwapApply,
      buttonTitle:     'Place or draw an EV parking stall',
      logPrefix:       '[tools-parking/ev-stall]'
    });

    // ── Augment tool API ───────────────────────────────────────────────────
    tool.rebuildSupport = internalRebuildSupport;
    tool.setCoordinator = ctx => { coordinator = ctx || {}; return tool; };

    // ── Register ───────────────────────────────────────────────────────────
    PS.registerTool(tool);
    window.startEvParkingStallTool    = tool.start;
    window.SitePlanEvParkingStallTool = tool;

  }).catch(err => {
    console.error('[tools-parking/ev-stall] Failed to initialize after runtime ready:', err);
  });
}());
