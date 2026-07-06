// Opt-in options:
//   showLengthLabel: true       — places a live "X.X ft" label at midpoint
//   labelSymbol: () => symbol   — override the default text symbol
//

(function () {
  'use strict';

  function noop() {}

  // Default label text symbol — tools override via labelSymbol option.
  const DEFAULT_LABEL_SYMBOL = {
    type: 'text', text: '',
    color: [0, 0, 0, 1],
    haloColor: [255, 255, 255, 0.95],
    haloSize: 2, yoffset: -10,
    font: { family: 'Arial', size: 9 }
  };

  // ── Shared point helpers (IIFE-level — used by create() and snap namespace) ──
  function spatialReferenceJSON(sr) {
    return sr && typeof sr.toJSON === 'function' ? sr.toJSON() : sr;
  }
  function pointFromXY(x, y, sr) {
    return { type: 'point', x, y, spatialReference: sr };
  }
  function pointFromMapPoint(mp) {
    if (!mp) return null;
    if (mp.clone) return mp.clone();
    return { type: 'point', x: mp.x, y: mp.y, spatialReference: mp.spatialReference };
  }

  // Usage:
  //   const SH = window.SitePlanPolylineTool.snap;
  //   function getSnapPoint(mapPoint) {
  //     return SH.vertexSnap(RT.view, polygons, mapPoint, 14)
  //         || SH.edgeSnap(RT.view, polygons, mapPoint, 10)
  //         || { point: mapPoint, snapped: false };
  //   }

  function screenPointValid(p) {
    return !!(p && Number.isFinite(p.x) && Number.isFinite(p.y));
  }

  // Nearest point on a map segment [aMap, bMap] to pointerScreen.
  // Returns { point (map coords), distancePx } or null.
  function nearestOnSegment(view, pointerScreen, aMap, bMap, sr) {
    const srj = spatialReferenceJSON(sr);
    const aS  = view.toScreen(pointFromXY(aMap[0], aMap[1], srj));
    const bS  = view.toScreen(pointFromXY(bMap[0], bMap[1], srj));
    if (!screenPointValid(aS) || !screenPointValid(bS)) return null;
    const vx = bS.x - aS.x, vy = bS.y - aS.y;
    const len2 = vx * vx + vy * vy;
    if (!Number.isFinite(len2) || len2 <= 0) return null;
    const t = Math.max(0, Math.min(1,
      ((pointerScreen.x - aS.x) * vx + (pointerScreen.y - aS.y) * vy) / len2));
    const d = Math.hypot(pointerScreen.x - (aS.x + vx * t), pointerScreen.y - (aS.y + vy * t));
    return {
      point: pointFromXY(aMap[0] + (bMap[0] - aMap[0]) * t,
                         aMap[1] + (bMap[1] - aMap[1]) * t, srj),
      distancePx: d
    };
  }

  // Snap to nearest polygon vertex within tolerancePx.
  function vertexSnap(view, polygons, mapPoint, tolerancePx) {
    if (!view || !mapPoint) return null;
    const ps = view.toScreen(mapPoint);
    if (!screenPointValid(ps)) return null;
    let best = null;
    polygons.forEach(graphic => {
      const sr  = graphic.geometry && graphic.geometry.spatialReference;
      const srj = spatialReferenceJSON(sr);
      (graphic.geometry.rings || []).forEach(ring => {
        ring.forEach(pt => {
          const mp = pointFromXY(pt[0], pt[1], srj);
          const s  = view.toScreen(mp);
          if (!screenPointValid(s)) return;
          const d = Math.hypot(ps.x - s.x, ps.y - s.y);
          if (d <= tolerancePx && (!best || d < best.d)) best = { point: mp, d };
        });
      });
    });
    return best ? { point: best.point, snapped: true } : null;
  }

  // Snap to nearest point on any polygon edge within tolerancePx.
  function edgeSnap(view, polygons, mapPoint, tolerancePx) {
    if (!view || !mapPoint) return null;
    const ps = view.toScreen(mapPoint);
    if (!screenPointValid(ps)) return null;
    let best = null;
    polygons.forEach(graphic => {
      const sr = graphic.geometry && graphic.geometry.spatialReference;
      (graphic.geometry.rings || []).forEach(ring => {
        if (!ring || ring.length < 2) return;
        for (let i = 0; i < ring.length - 1; i++) {
          const c = nearestOnSegment(view, ps, ring[i], ring[i + 1], sr);
          if (c && c.distancePx <= tolerancePx && (!best || c.distancePx < best.distancePx))
            best = c;
        }
      });
    });
    return best ? { point: best.point, snapped: true } : null;
  }

  // Snap to start/end endpoints of polyline graphics within tolerancePx.
  function lineEndpointSnap(view, lines, mapPoint, tolerancePx) {
    if (!view || !mapPoint) return null;
    const ps = view.toScreen(mapPoint);
    if (!screenPointValid(ps)) return null;
    let best = null;
    lines.forEach(graphic => {
      const sr  = graphic.geometry && graphic.geometry.spatialReference;
      const srj = spatialReferenceJSON(sr);
      (graphic.geometry.paths || []).forEach(path => {
        [path[0], path[path.length - 1]].forEach(pt => {
          if (!pt) return;
          const mp = pointFromXY(pt[0], pt[1], srj);
          const s  = view.toScreen(mp);
          if (!screenPointValid(s)) return;
          const d = Math.hypot(ps.x - s.x, ps.y - s.y);
          if (d <= tolerancePx && (!best || d < best.d)) best = { point: mp, d };
        });
      });
    });
    return best ? { point: best.point, snapped: true } : null;
  }

  // Snap to a typed connection point from another tool within tolerancePx.
  // candidates: [{ point, parent, snapType }] — from tool.getConnectionPoints().
  function connectionPointSnap(view, candidates, mapPoint, tolerancePx) {
    if (!view || !mapPoint || !candidates || !candidates.length) return null;
    const screen = view.toScreen(mapPoint);
    if (!screenPointValid(screen)) return null;
    let best = null;
    candidates.forEach(c => {
      if (!c || !c.point) return;
      const sp = view.toScreen(c.point);
      if (!screenPointValid(sp)) return;
      const d = Math.hypot(screen.x - sp.x, screen.y - sp.y);
      if (d <= tolerancePx && (!best || d < best.distancePx)) {
        best = { snapped: true, point: c.point, parent: c.parent,
                 distancePx: d, snapType: c.snapType || 'connection' };
      }
    });
    return best;
  }

  function createResolver(RT, rules, options) {
    const opts = options || {};
    function fallback(mapPoint) {
      if (opts.fallback === false) return null;
      if (typeof opts.fallback === 'function') return opts.fallback(mapPoint);
      if (opts.fallback) return opts.fallback;
      return { point: mapPoint, snapped: false };
    }
    return function resolveSnap(mapPoint) {
      const view = opts.view || (RT && RT.view);
      if (!view || !mapPoint) {
        return fallback(mapPoint);
      }

      for (const rule of (rules || [])) {
        if (!rule) continue;
        const candidates = typeof rule.candidates === 'function'
          ? rule.candidates(mapPoint) || []
          : rule.candidates || [];
        const tolerancePx = rule.tolerancePx;
        let snapResult = null;

        if (rule.mode === 'connection') {
          snapResult = connectionPointSnap(view, candidates, mapPoint, tolerancePx);
        } else if (rule.mode === 'edge') {
          snapResult = edgeSnap(view, candidates, mapPoint, tolerancePx);
        } else if (rule.mode === 'vertex') {
          snapResult = vertexSnap(view, candidates, mapPoint, tolerancePx);
        } else if (rule.mode === 'endpoint') {
          snapResult = lineEndpointSnap(view, candidates, mapPoint, tolerancePx);
        } else if (typeof rule.resolve === 'function') {
          snapResult = rule.resolve({ RT, view, mapPoint, candidates, tolerancePx, rule });
        }

        if (snapResult) return snapResult;
      }

      return fallback(mapPoint);
    };
  }

  const snap = { screenPointValid, nearestOnSegment, vertexSnap, edgeSnap,
                 lineEndpointSnap, connectionPointSnap, createResolver };

  function makeCimTextLineSymbol(options) {
    const opts = options || {};
    const color = opts.color || [0, 0, 0, 255];
    // Proposed mode renders the line dashed. The dash is a geometric effect on
    // the CIMLineSymbol so the lettered markers keep their placement.
    const lineSymbol = {
      type: 'CIMLineSymbol',
      symbolLayers: [
            {
              type: 'CIMVectorMarker',
              enable: true,
              size: opts.markerSize || 8,
              markerPlacement: {
                type: 'CIMMarkerPlacementAlongLineSameSize',
                endings: opts.endings || 'WithFullGap',
                placementTemplate: opts.placementTemplate || [60],
                angleToLine: opts.angleToLine === true
              },
              frame: opts.frame || { xmin: -8, ymin: -4, xmax: 8, ymax: 4 },
              markerGraphics: [
                {
                  type: 'CIMMarkerGraphic',
                  geometry: { x: 0, y: 0 },
                  textString: opts.text || '',
                  symbol: {
                    type: 'CIMTextSymbol',
                    fontFamilyName: opts.fontFamilyName || 'Arial',
                    fontStyleName: opts.fontStyleName || 'Bold',
                    height: opts.textHeight || 8,
                    horizontalAlignment: 'Center',
                    verticalAlignment: 'Center',
                    haloSize: opts.haloSize || 1.5,
                    haloSymbol: {
                      type: 'CIMPolygonSymbol',
                      symbolLayers: [
                        { type: 'CIMSolidFill', enable: true, color: opts.haloColor || [255, 255, 255, 255] }
                      ]
                    },
                    symbol: {
                      type: 'CIMPolygonSymbol',
                      symbolLayers: [
                        { type: 'CIMSolidFill', enable: true, color }
                      ]
                    }
                  }
                }
              ]
            },
            {
              type: 'CIMSolidStroke',
              enable: true,
              width: opts.lineWidth || 2.2,
              color,
              capStyle: opts.capStyle || 'Round',
              joinStyle: opts.joinStyle || 'Round'
            }
          ]
    };
    if (opts.dashed) {
      // Apply the dash to the stroke layer ONLY. Placing it on the whole
      const strokeLayer = lineSymbol.symbolLayers.find(l => l && l.type === 'CIMSolidStroke');
      if (strokeLayer) {
        strokeLayer.effects = [
          {
            type: 'CIMGeometricEffectDashes',
            dashTemplate: opts.dashTemplate || [6, 4],
            lineDashEnding: 'NoConstraint'
          }
        ];
      }
    }
    return {
      type: 'cim',
      data: {
        type: 'CIMSymbolReference',
        symbol: lineSymbol
      }
    };
  }

  function create(options) {
    const RT               = options.RT;
    const toolId           = options.toolId;
    const buttonId         = options.buttonId;
    const category         = options.category         || '';
    const label            = options.label            || '';
    const toolCapabilities = options.toolCapabilities || {
      reshape: true, resize: false, rotate: false,
      label: false, duplicate: true, delete: true
    };

    const getSymbol              = options.symbol;
    // Opt-in: when true and a Proposed/Existing toggle governs this category,
    const proposedMode           = !!options.proposedMode;
    // Optional custom button-icon transform (svg, mode); defaults to the dash.
    const iconApply              = typeof options.iconApply === 'function' ? options.iconApply : null;
    const DrawingMode            = window.SitePlanDrawingMode || null;
    const getPreviewSymbol       = options.previewSymbol       || getSymbol;
    const getFloatingPointSymbol = options.floatingPointSymbol || null;
    const getSnapPointSymbol     = options.snapPointSymbol     || null;
    const getSnapPoint           = options.getSnapPoint        || null;
    const showLengthLabel        = !!options.showLengthLabel;
    const getLabelSymbol         = options.labelSymbol         || null;

    const toolLabel          = options.toolLabel          || label;
    const iconHtml           = options.iconHtml           || '';
    const iconClass          = options.iconClass          || '';
    const buttonTitle        = options.buttonTitle        || label;
    const order              = options.order != null       ? options.order : 0;

    const onAnnounce         = options.onAnnounce         || noop;
    const onCancelOthers     = options.onCancelOthers     || noop;
    const onActiveChangedFn  = typeof options.onActiveChanged === 'function' ? options.onActiveChanged : null;
    const applyExtraMetadata = options.applyExtraMetadata || null;
    const onSketchUpdate     = options.onSketchUpdate     || null;
    const onAfterCommit      = options.onAfterCommit      || null;
    const onCreatedHook      = options.onGraphicCreated   || null;
    const onUpdatedHook      = options.onGraphicUpdated   || null;
    const onDeletedHook      = options.onGraphicDeleted   || null;

    let clickHandle  = null;
    let moveHandle   = null;
    let escHandler   = null;
    let activeTool   = false;
    let startPoint   = null;
    let previewLine  = null;
    let previewPoint = null;
    let snapPreview  = null;
    let buttonEl     = null;

    function lineGeometry(a, b) {
      return {
        type: 'polyline',
        paths: [[[a.x, a.y], [b.x, b.y]]],
        spatialReference: spatialReferenceJSON(a.spatialReference || b.spatialReference)
      };
    }
    function midpointFromGeometry(geom) {
      if (!geom || geom.type !== 'polyline' || !geom.paths || !geom.paths.length) return null;
      const path = geom.paths[0];
      if (!path || path.length < 2) return null;
      const a = path[0];
      const b = path[path.length - 1];
      return pointFromXY((a[0] + b[0]) / 2, (a[1] + b[1]) / 2,
                         spatialReferenceJSON(geom.spatialReference));
    }

    function resolveSnap(mapPoint) {
      if (typeof getSnapPoint === 'function') {
        const r = getSnapPoint(mapPoint);
        if (r && r.point) return r;
      }
      return { point: pointFromMapPoint(mapPoint), snapped: false };
    }

    function calculateLengthFt(geom) {
      if (!geom || !RT.geometryEngine) return 0;
      try {
        const len = Math.abs(RT.geometryEngine.geodesicLength(geom, 'feet') || 0);
        if (Number.isFinite(len) && len > 0) return len;
      } catch (e) {}
      try {
        const len = Math.abs(RT.geometryEngine.planarLength(geom, 'feet') || 0);
        if (Number.isFinite(len) && len > 0) return len;
      } catch (e) {}
      return 0;
    }

    function formatLengthFt(feet) {
      if (!Number.isFinite(feet) || feet <= 0) return '0.0\u00a0ft';
      return feet.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '\u00a0ft';
    }

    function createOrUpdateLabel(graphic) {
      if (!showLengthLabel || !graphic || !graphic.__sitePlanId) return;
      const anchor = midpointFromGeometry(graphic.geometry);
      if (!anchor) return;
      const textSym = Object.assign({},
        getLabelSymbol ? getLabelSymbol() : DEFAULT_LABEL_SYMBOL,
        { text: formatLengthFt(calculateLengthFt(graphic.geometry)) }
      );
      let lbl = RT.labelLayer.graphics.find(g => g.__polylineLabelFor === graphic.__sitePlanId);
      if (!lbl) {
        lbl = new RT.Graphic({ geometry: anchor, symbol: textSym });
        lbl.__nonSelectable      = true;
        lbl.__toolType           = toolId + 'Label';
        lbl.__polylineLabelFor   = graphic.__sitePlanId;
        lbl.attributes = {
          sitePlanTool:      toolId + 'Label',
          sitePlanCategory:  'annotation',
          parentGraphicId:   graphic.__sitePlanId
        };
        RT.labelLayer.add(lbl);
      } else {
        lbl.geometry = anchor;
        lbl.symbol   = textSym;
      }
    }

    function removeLabel(graphic) {
      if (!showLengthLabel || !graphic || !graphic.__sitePlanId) return;
      const lbl = RT.labelLayer.graphics.find(g => g.__polylineLabelFor === graphic.__sitePlanId);
      if (lbl) RT.labelLayer.remove(lbl);
    }

    function setPreviewGraphic(ref, geom, sym, setter) {
      if (!ref) { const g = new RT.Graphic({ geometry: geom, symbol: sym }); g.__nonSelectable = true; RT.previewLayer.add(g); setter(g); }
      else { ref.geometry = geom; ref.symbol = sym; }
    }

    function updateSnapPreview(snap) {
      if (!getSnapPointSymbol) return;
      if (snap.snapped) {
        setPreviewGraphic(snapPreview, snap.point, getSnapPointSymbol(), g => { snapPreview = g; });
      } else if (snapPreview) {
        try { RT.previewLayer.remove(snapPreview); } catch (e) {}
        snapPreview = null;
      }
    }

    function clearPreview() {
      [previewLine, previewPoint, snapPreview].forEach(g => {
        if (g && RT.previewLayer) try { RT.previewLayer.remove(g); } catch (e) {}
      });
      previewLine = previewPoint = snapPreview = null;
    }

    function buildButton() {
      if (buttonEl) return buttonEl;
      const btn = document.createElement('button');
      btn.type      = 'button';
      btn.id        = buttonId;
      btn.className = 'tool-btn draw-tool-btn icon-btn';
      btn.title     = buttonTitle;
      const spanClass = 'tool-icon' + (iconClass ? ' ' + iconClass : '');
      btn.innerHTML = '<span class="' + spanClass + '">' + iconHtml + '</span>' +
                      '<span class="tool-label">' + toolLabel + '</span>';
      btn.addEventListener('click', start);
      if (proposedMode && DrawingMode) {
        const svg = btn.querySelector('svg');
        if (svg) DrawingMode.registerIcon(svg, { category, apply: iconApply || undefined });
      }
      buttonEl = btn;
      return btn;
    }

    function getElements() {
      return [buildButton()].filter(Boolean);
    }

    function setActiveButton(active) {
      activeTool = !!active;
      if (onActiveChangedFn) onActiveChangedFn(activeTool);
      document.querySelectorAll('.draw-tool-btn.icon-btn').forEach(b => b.classList.remove('active'));
      const btn = buttonEl || document.getElementById(buttonId);
      if (btn) btn.classList.toggle('active', activeTool);
    }
    function clearActiveButton() { setActiveButton(false); }

    function cancelPlacement(clearButton) {
      if (clickHandle)  { try { clickHandle.remove();  } catch (e) {} clickHandle  = null; }
      if (moveHandle)   { try { moveHandle.remove();   } catch (e) {} moveHandle   = null; }
      if (escHandler)   { document.removeEventListener('keydown', escHandler, true); escHandler = null; }
      startPoint = null;
      clearPreview();
      if (clearButton) clearActiveButton();
      if (window.__sitePlanPendingToolType === toolId) window.__sitePlanPendingToolType = null;
    }

    function isParent(graphic) {
      const a = graphic && graphic.attributes ? graphic.attributes : {};
      return !!(graphic &&
        (graphic.__toolType === toolId || a.toolType === toolId || a.sitePlanTool === toolId) &&
        graphic.geometry && graphic.geometry.type === 'polyline');
    }

    function applyMetadata(graphic) {
      if (!graphic) return graphic;
      graphic.__toolType          = toolId;
      graphic.__label             = label;
      graphic.__measureLabel      = label;
      graphic.__preferredEditMode = toolCapabilities.reshape === false ? 'transform' : 'reshape';
      graphic.__skipEdgeLabels    = true;
      let drawingMode;
      if (proposedMode && DrawingMode) {
        const stamped = graphic.attributes && graphic.attributes.drawingMode;
        drawingMode = (stamped === 'existing' || stamped === 'proposed')
          ? stamped
          : DrawingMode.getDrawingMode(category);
      }
      graphic.attributes = Object.assign({}, graphic.attributes || {}, {
        toolType: toolId, sitePlanTool: toolId, sitePlanCategory: category,
        label, measureLabel: label, drawingMode,
        preferredEditMode: graphic.__preferredEditMode, skipEdgeLabels: true,
        toolCapabilities: Object.assign({}, toolCapabilities)
      });
      if (typeof RT.setGraphicCapabilities === 'function') RT.setGraphicCapabilities(graphic, toolCapabilities);
      if (typeof applyExtraMetadata === 'function') applyExtraMetadata(graphic);
      return graphic;
    }

    function endpointPoints(geom) {
      if (!geom || geom.type !== 'polyline' || !geom.paths || !geom.paths.length) return null;
      const path = geom.paths[0] || [];
      if (path.length < 2) return null;
      const srj = spatialReferenceJSON(geom.spatialReference);
      return {
        start: pointFromXY(path[0][0], path[0][1], srj),
        end:   pointFromXY(path[path.length - 1][0], path[path.length - 1][1], srj)
      };
    }

    function commitLine(startPt, endPt) {
      if (!startPt || !endPt) return null;
      if (Math.hypot(endPt.x - startPt.x, endPt.y - startPt.y) < 1e-9) return null;
      const graphic = new RT.Graphic({
        geometry: lineGeometry(startPt, endPt),
        symbol: getSymbol(),
        attributes: {
          toolType: toolId, sitePlanTool: toolId, sitePlanCategory: category,
          skipEdgeLabels: true, preferredEditMode: toolCapabilities.reshape === false ? 'transform' : 'reshape',
          toolCapabilities: Object.assign({}, toolCapabilities)
        }
      });
      applyMetadata(graphic);
      RT.registerDrawableGraphic(graphic);
      if (typeof RT.removeSideLabelsForGraphic === 'function') RT.removeSideLabelsForGraphic(graphic);
      if (typeof onAfterCommit === 'function') onAfterCommit(graphic);
      (window.requestAnimationFrame || (fn => window.setTimeout(fn, 0)))(() => {
        try { RT.selectGraphic(graphic); } catch (e) {}
      });
      return graphic;
    }

    function start() {
      onAnnounce();
      cancelPlacement(false);
      onCancelOthers(false);
      window.__sitePlanSuppressLiveSideLabels = false;
      if (RT.clearSelection) RT.clearSelection();
      if (RT.sketch && RT.sketch.state === 'active') try { RT.sketch.cancel(); } catch (e) {}
      setActiveButton(true);
      window.__sitePlanPendingToolType = toolId;

      moveHandle = RT.view.on('pointer-move', event => {
        const mp = RT.view.toMap({ x: event.x, y: event.y });
        if (!mp) return;
        const snap = resolveSnap(mp);
        updateSnapPreview(snap);
        if (!startPoint) return;
        const nextPt = snap.point;
        const ptSym = (snap.snapped && getSnapPointSymbol) ? getSnapPointSymbol()
                    : getFloatingPointSymbol ? getFloatingPointSymbol() : null;
        if (ptSym) setPreviewGraphic(previewPoint, nextPt, ptSym, g => { previewPoint = g; });
        setPreviewGraphic(previewLine, lineGeometry(startPoint, nextPt), getPreviewSymbol(),
          g => { previewLine = g; });
      });

      clickHandle = RT.view.on('click', event => {
        if (event && typeof event.stopPropagation === 'function') event.stopPropagation();
        const mp = event && event.mapPoint;
        if (!mp) return;
        const snap = resolveSnap(mp);
        const chosen = snap.point;
        if (!startPoint) {
          startPoint = chosen;
          const ptSym = (snap.snapped && getSnapPointSymbol) ? getSnapPointSymbol()
                      : getFloatingPointSymbol ? getFloatingPointSymbol() : null;
          if (ptSym) setPreviewGraphic(previewPoint, chosen, ptSym, g => { previewPoint = g; });
          return;
        }
        const startPt = startPoint;
        cancelPlacement(false);
        clearActiveButton();
        commitLine(startPt, chosen);
        window.__sitePlanPendingToolType = null;
      });

      escHandler = ev => {
        if (ev.key !== 'Escape') return;
        ev.preventDefault(); ev.stopPropagation();
        cancelPlacement(true);
      };
      document.addEventListener('keydown', escHandler, true);
    }

    RT.onGraphicCreated(graphic => {
      if (!isParent(graphic)) return;
      applyMetadata(graphic);
      if (getSymbol) graphic.symbol = getSymbol();
      if (typeof RT.removeSideLabelsForGraphic === 'function') RT.removeSideLabelsForGraphic(graphic);
      if (showLengthLabel) createOrUpdateLabel(graphic);
      if (typeof onCreatedHook === 'function') onCreatedHook(graphic);
    });

    RT.onGraphicUpdated((graphic, event) => {
      if (!isParent(graphic)) return;
      applyMetadata(graphic);
      if (typeof RT.removeSideLabelsForGraphic === 'function') RT.removeSideLabelsForGraphic(graphic);
      if (showLengthLabel) createOrUpdateLabel(graphic);
      if (typeof onUpdatedHook === 'function') onUpdatedHook(graphic, event);
    });

    if (showLengthLabel || typeof onDeletedHook === 'function') {
      RT.onGraphicDeleted(graphic => {
        if (!isParent(graphic)) return;
        if (showLengthLabel) removeLabel(graphic);
        if (typeof onDeletedHook === 'function') onDeletedHook(graphic);
      });
    }

    if (typeof onSketchUpdate === 'function') {
      RT.sketch.on('update', event => {
        const graphic = event && event.graphics && event.graphics[0];
        if (isParent(graphic)) onSketchUpdate(graphic, event);
      });
    }

    window.addEventListener('siteplan:tool-activated', event => {
      const detail = event && event.detail ? event.detail : {};
      if (detail.tool === toolId) return;
      cancelPlacement(false);
      clearActiveButton();
    });

    return {
      id:    toolId,
      order,
      label,
      capabilities: Object.assign({}, toolCapabilities),
      start, cancel: cancelPlacement, clearActive: clearActiveButton,
      clearPreview, isActive: () => !!activeTool,
      isParent, applyMetadata, commitLine, endpointPoints,
      geometry: lineGeometry, pointFromMapPoint, pointFromXY,
      spatialReferenceJSON, toolCapabilities,
      buildButton, getElements
    };
  }

  function makeEditSnap(RT, getSnapPoint, getSnapPointSymbol, options) {
    const onAfterSnap = (options && options.onAfterSnap) || null;
    let editSnapPreview = null;

    function clearEditSnapPreview() {
      if (editSnapPreview && RT.previewLayer) {
        try { RT.previewLayer.remove(editSnapPreview); } catch (e) {}
      }
      editSnapPreview = null;
    }

    function showEditSnapPreview(point) {
      if (!point || !RT.previewLayer) { clearEditSnapPreview(); return; }
      if (!editSnapPreview) {
        editSnapPreview = new RT.Graphic({ geometry: point, symbol: getSnapPointSymbol() });
        editSnapPreview.__nonSelectable = true;
        editSnapPreview.__skipMeasure   = true;
        RT.previewLayer.add(editSnapPreview);
      } else {
        editSnapPreview.geometry = point;
        editSnapPreview.symbol   = getSnapPointSymbol();
      }
    }

    function localEndpointPoints(geom) {
      if (!geom || geom.type !== 'polyline' || !geom.paths || !geom.paths.length) return null;
      const path = geom.paths[0];
      if (!path || path.length < 2) return null;
      const srj = spatialReferenceJSON(geom.spatialReference);
      return {
        start: pointFromXY(path[0][0], path[0][1], srj),
        end:   pointFromXY(path[path.length - 1][0], path[path.length - 1][1], srj)
      };
    }

    function snapCandidateForEndpoint(point) {
      const snap = getSnapPoint(point);
      return snap && snap.snapped ? snap : null;
    }

    function closestEndpointSnap(graphic) {
      if (!graphic || !graphic.geometry) return null;
      const ep = localEndpointPoints(graphic.geometry);
      if (!ep) return null;
      const ss = snapCandidateForEndpoint(ep.start);
      const es = snapCandidateForEndpoint(ep.end);
      if (ss && es) return ss.distancePx <= es.distancePx
        ? Object.assign({ endpoint: 'start' }, ss) : Object.assign({ endpoint: 'end' }, es);
      if (ss) return Object.assign({ endpoint: 'start' }, ss);
      if (es) return Object.assign({ endpoint: 'end' }, es);
      return null;
    }

    function snapEndpointsIfNear(graphic) {
      if (!graphic || !graphic.geometry || !graphic.geometry.paths || !graphic.geometry.paths.length) {
        clearEditSnapPreview(); return false;
      }
      const path = (graphic.geometry.paths[0] || []).map(pt => pt.slice ? pt.slice() : [pt[0], pt[1]]);
      if (path.length < 2) { clearEditSnapPreview(); return false; }
      const srj = spatialReferenceJSON(graphic.geometry.spatialReference);
      let changed = false;
      [[0], [path.length - 1]].forEach(([idx]) => {
        const pt   = pointFromXY(path[idx][0], path[idx][1], srj);
        const snap = snapCandidateForEndpoint(pt);
        if (snap) { path[idx] = [snap.point.x, snap.point.y]; changed = true; }
      });
      if (changed) graphic.geometry = { type: 'polyline', paths: [path], spatialReference: srj };
      clearEditSnapPreview();
      return changed;
    }

    function onSketchUpdate(graphic, event) {
      const state = event && event.state;
      if (state === 'active' || state === 'start') {
        const snap = closestEndpointSnap(graphic);
        if (snap && snap.point) showEditSnapPreview(snap.point);
        else clearEditSnapPreview();
        return;
      }
      if (state === 'complete') {
        (window.requestAnimationFrame || (fn => window.setTimeout(fn, 0)))(() => {
          snapEndpointsIfNear(graphic);
          if (typeof onAfterSnap === 'function') onAfterSnap(graphic);
        });
        return;
      }
      if (state === 'cancel') clearEditSnapPreview();
    }

    return {
      clearEditSnapPreview, showEditSnapPreview,
      endpointPoints: localEndpointPoints,
      snapCandidateForEndpoint, closestEndpointSnap,
      snapEndpointsIfNear, onSketchUpdate
    };
  }

  window.SitePlanPolylineTool = { create, snap, makeEditSnap, makeCimTextLineSymbol };
}());
