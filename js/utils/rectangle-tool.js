// Usage:
//   logPrefix, buttonTitle, iconHtml, iconClass,
//   defaultChecked,           // checkbox default (false); parking passes true
//   fixedOnly,                // always use fixed placement; disables checkbox
//   manualOnly,               // always use sketch placement; no fixed-size row
//   showControls,             // false hides fixed-size controls
//   defaultWidthFt,           // pre-fill width input value
//   defaultLengthFt,          // pre-fill length input value
//   widthAriaLabel, lengthAriaLabel,
//   toolTypeKey,              // graphic.__toolType value (default: toolId)
//   pendingKey,               // window.__sitePlanPendingToolType value (default: toolId)
//   applyExtraMetadata(graphic),
//   validateOnCreate(RT, graphic, logPrefix),  // called after manual draw only
//   onPlaceFixed(graphic),                     // hook after fixed placement registered
//   onPointerMove(probeGraphic),               // enables hover snap preview
//   onCancelPlacement(),                       // hook on placement cancel
//   onActiveChanged(active),
//   onPendingChanged(pending),
//   onGraphicCreated(graphic, { createdByTool, isCopy }),
//   onGraphicUpdated(graphic, event),
//   onGraphicDeleted(graphic),                  // called 4×: immediately, rAF, rAF+rAF, ~80ms — must be idempotent
//   onZoomRefresh(),                           // watches extent + scale
//   extraSettingsSignature(),                  // append tool-specific restart state
//   getSnapSides(graphic, isParent)            // override default 4-side impl

(function () {
  'use strict';

  function noop() {}

  function create(opts) {
    const RT               = opts.RT;
    const toolId           = opts.toolId;
    const buttonId         = opts.buttonId;
    const checkboxId       = opts.checkboxId;
    const widthId          = opts.widthId;
    const lengthId         = opts.lengthId;
    const category         = opts.category         || '';
    const label            = opts.label            || '';
    const order            = opts.order != null     ? opts.order : 0;
    const symbol           = opts.symbol           || null;
    const symbols          = opts.symbols          || null;
    const iconApply        = typeof opts.iconApply === 'function' ? opts.iconApply : null;
    const DrawingMode      = window.SitePlanDrawingMode || null;

    function symbolForMode(mode) {
      if (symbols) {
        const picked = mode === 'proposed' ? symbols.proposed : symbols.existing;
        if (picked != null) return picked;
        return symbols.existing != null ? symbols.existing : symbols.proposed;
      }
      return symbol;
    }

    function currentSymbol() {
      if (symbols && DrawingMode) return symbolForMode(DrawingMode.getDrawingMode(category));
      return symbol;
    }

    function graphicDrawnMode(graphic) {
      const stamped = graphic && graphic.attributes && graphic.attributes.drawingMode;
      if (stamped === 'existing' || stamped === 'proposed') return stamped;
      return (symbols && DrawingMode) ? DrawingMode.getDrawingMode(category) : 'existing';
    }
    const toolCapabilities = Object.assign({}, opts.toolCapabilities || {});
    const makeGeometry     = opts.makeGeometry     || null;
    const onAnnounce       = opts.onAnnounce       || noop;
    const isOwnEvent       = opts.isOwnEvent       || function () { return false; };

    const logPrefix        = opts.logPrefix        || ('[utils/rectangle-tool:' + toolId + ']');
    const buttonTitle      = opts.buttonTitle      || label;
    const iconHtml         = opts.iconHtml         || '';
    const iconClass        = opts.iconClass        || '';
    const fixedOnly        = !!opts.fixedOnly;
    const manualOnly       = !!opts.manualOnly;
    const showControls     = opts.showControls !== false && !manualOnly;
    const defaultChecked   = !!opts.defaultChecked;
    const defaultWidthFt   = opts.defaultWidthFt  != null ? opts.defaultWidthFt  : null;
    const defaultLengthFt  = opts.defaultLengthFt != null ? opts.defaultLengthFt : null;
    const minWidthFt       = opts.minWidthFt       != null ? opts.minWidthFt       : 1;
    const minLengthFt      = opts.minLengthFt      != null ? opts.minLengthFt      : 1;
    const widthStep        = opts.widthStep        != null ? opts.widthStep        : 1;
    const lengthStep       = opts.lengthStep       != null ? opts.lengthStep       : 1;
    const dimensionOrder   = opts.dimensionOrder === 'length-width' ? 'length-width' : 'width-length';
    const widthAriaLabel   = opts.widthAriaLabel   || (label + ' width in feet');
    const lengthAriaLabel  = opts.lengthAriaLabel  || (label + ' length in feet');
    const toolTypeKey      = opts.toolTypeKey      || toolId;
    const pendingKey       = opts.pendingKey       || toolId;
    const sketchType       = opts.sketchType       || 'rectangle';
    const suppressLiveSideLabelsDuringManual = !!opts.suppressLiveSideLabelsDuringManual;

    const applyExtraMetadataFn = typeof opts.applyExtraMetadata === 'function' ? opts.applyExtraMetadata : null;
    const validateOnCreateFn   = typeof opts.validateOnCreate   === 'function' ? opts.validateOnCreate   : null;
    const onPlaceFixedFn       = typeof opts.onPlaceFixed       === 'function' ? opts.onPlaceFixed       : null;
    const onPointerMoveFn      = typeof opts.onPointerMove      === 'function' ? opts.onPointerMove      : null;
    const onCancelPlacementFn  = typeof opts.onCancelPlacement  === 'function' ? opts.onCancelPlacement  : null;
    const onActiveChangedFn    = typeof opts.onActiveChanged    === 'function' ? opts.onActiveChanged    : null;
    const onPendingChangedFn   = typeof opts.onPendingChanged   === 'function' ? opts.onPendingChanged   : null;
    const onCreatedFn          = typeof opts.onGraphicCreated   === 'function' ? opts.onGraphicCreated   : null;
    const onUpdatedFn          = typeof opts.onGraphicUpdated   === 'function' ? opts.onGraphicUpdated   : null;
    const onDeletedFn          = typeof opts.onGraphicDeleted   === 'function' ? opts.onGraphicDeleted   : null;
    const extraSettingsSignatureFn = typeof opts.extraSettingsSignature === 'function' ? opts.extraSettingsSignature : null;
    const getSnapSidesFn       = typeof opts.getSnapSides       === 'function' ? opts.getSnapSides       : null;

    let activeTool             = false;
    let pendingManualDraw      = false;
    let ignoreNextSketchCancel = false;
    let fixedClickHandle       = null;
    let fixedMoveHandle        = null;
    let fixedEscHandler        = null;
    let lastSettingsSignature  = null;
    let buttonEl               = null;
    let controlsEl             = null;
    let controlsWired          = false;

    function els() {
      return {
        checkbox: document.getElementById(checkboxId),
        width:    document.getElementById(widthId),
        length:   document.getElementById(lengthId)
      };
    }

    function isFixedMode() {
      if (manualOnly) return false;
      if (fixedOnly) return true;
      const p = els();
      return !!(p.checkbox && p.checkbox.checked);
    }

    function dimensions() {
      const p = els();
      const widthFt  = p.width  ? Number.parseFloat(p.width.value)  : NaN;
      const lengthFt = p.length ? Number.parseFloat(p.length.value) : NaN;
      return {
        widthFt, lengthFt,
        valid: Number.isFinite(widthFt)  && widthFt  >= minWidthFt &&
               Number.isFinite(lengthFt) && lengthFt >= minLengthFt
      };
    }

    function markValidity() {
      const p = els(); const d = dimensions();
      const wv = Number.isFinite(d.widthFt)  && d.widthFt  >= minWidthFt;
      const lv = Number.isFinite(d.lengthFt) && d.lengthFt >= minLengthFt;
      if (p.width)  p.width.classList.toggle('invalid',  !wv);
      if (p.length) p.length.classList.toggle('invalid', !lv);
      return d.valid;
    }

    function clearValidation() {
      const p = els();
      if (p.width)  p.width.classList.remove('invalid');
      if (p.length) p.length.classList.remove('invalid');
    }

    function focusFirstInvalidInput() {
      const p = els(); const d = dimensions();
      if (!(Number.isFinite(d.widthFt) && d.widthFt >= minWidthFt) && p.width) { p.width.focus(); return; }
      if (p.length) p.length.focus();
    }

    function setActiveButton(active) {
      activeTool = !!active;
      if (onActiveChangedFn) onActiveChangedFn(activeTool);
      document.querySelectorAll('.draw-tool-btn.icon-btn').forEach(b => b.classList.remove('active'));
      if (!buttonEl) buttonEl = document.getElementById(buttonId);
      if (buttonEl) buttonEl.classList.toggle('active', activeTool);
    }
    function clearActiveButton() { setActiveButton(false); }

    function setPendingDraw(value) {
      pendingManualDraw = !!value;
      if (onPendingChangedFn) onPendingChangedFn(pendingManualDraw);
    }

    function setLiveSideLabelSuppression(value) {
      if (suppressLiveSideLabelsDuringManual) {
        window.__sitePlanSuppressLiveSideLabels = !!value;
      }
    }

    function isParent(graphic) {
      if (!graphic || !graphic.geometry || graphic.geometry.type !== 'polygon') return false;
      const attrs = graphic.attributes || {};
      if (attrs.sitePlanTool === toolId) return true;
      if (attrs.toolType     === toolId) return true;
      if (toolTypeKey === toolId && graphic.__toolType === toolId) return true;
      return false;
    }

    function applyMetadata(graphic) {
      if (!graphic) return graphic;
      graphic.__toolType          = toolTypeKey;
      graphic.__label             = label;
      graphic.__measureLabel      = label;
      graphic.__preferredEditMode = toolCapabilities.reshape === false ? 'transform' : 'reshape';
      const drawnMode = graphicDrawnMode(graphic);
      const resolvedSymbol = symbolForMode(drawnMode);
      if (resolvedSymbol) graphic.symbol = resolvedSymbol;
      graphic.attributes = Object.assign({}, graphic.attributes || {}, {
        toolType:         toolId,
        sitePlanTool:     toolId,
        sitePlanCategory: category,
        // Capture the mode this graphic was drawn in (for legend/export later).
        drawingMode:      (symbols && DrawingMode) ? drawnMode : undefined,
        toolCapabilities: Object.assign({}, toolCapabilities)
      });
      if (typeof RT.setGraphicCapabilities === 'function') {
        RT.setGraphicCapabilities(graphic, toolCapabilities);
      }
      if (applyExtraMetadataFn) applyExtraMetadataFn(graphic);
      return graphic;
    }

    function cancelActiveSketchForRestart() {
      if (RT.sketch && RT.sketch.state === 'active') {
        ignoreNextSketchCancel = true;
        try { RT.sketch.cancel(); } catch (err) { ignoreNextSketchCancel = false; }
      }
    }

    function cancelPlacement(clearButtonState) {
      if (fixedClickHandle) { try { fixedClickHandle.remove(); } catch (e) {} fixedClickHandle = null; }
      if (fixedMoveHandle)  { try { fixedMoveHandle.remove();  } catch (e) {} fixedMoveHandle  = null; }
      if (fixedEscHandler) {
        document.removeEventListener('keydown', fixedEscHandler, true);
        fixedEscHandler = null;
      }
      if (onCancelPlacementFn) onCancelPlacementFn();
      setPendingDraw(false);
      setLiveSideLabelSuppression(false);
      if (window.__sitePlanPendingToolType === pendingKey) window.__sitePlanPendingToolType = null;
      if (clearButtonState) clearActiveButton();
    }

    function placeFixedAt(mapPoint) {
      const d = dimensions();
      if (!d.valid) { markValidity(); focusFirstInvalidInput(); return; }
      const geom = makeGeometry ? makeGeometry(mapPoint, d.widthFt, d.lengthFt) : null;
      if (!geom) return;

      const graphic = new RT.Graphic({
        geometry: geom,
        symbol: currentSymbol(),
        attributes: {
          sitePlanTool:       toolId,
          sitePlanCategory:   category,
          fixedSize:          true,
          fixedWidthFt:       d.widthFt,
          fixedLengthFt:      d.lengthFt,
          useFixedSizeLabels: true,
          toolCapabilities:   Object.assign({}, toolCapabilities)
        }
      });
      graphic.__fixedSize          = true;
      graphic.__fixedWidthFt       = d.widthFt;
      graphic.__fixedLengthFt      = d.lengthFt;
      graphic.__useFixedSizeLabels = true;
      applyMetadata(graphic);

      cancelPlacement(false);
      clearActiveButton();
      RT.registerDrawableGraphic(graphic);
      if (onPlaceFixedFn) onPlaceFixedFn(graphic);

      const reselect = function () {
        try { RT.selectGraphic(graphic); }
        catch (err) { console.warn(logPrefix, 'Unable to select fixed placement.', err); }
      };
      if (window.requestAnimationFrame) window.requestAnimationFrame(reselect);
      else window.setTimeout(reselect, 0);
    }

    function startFixedPlacement() {
      onAnnounce();
      if (!markValidity()) { setActiveButton(true); focusFirstInvalidInput(); return; }
      clearValidation();
      cancelPlacement(false);
      setPendingDraw(false);
      setLiveSideLabelSuppression(false);
      window.__sitePlanPendingToolType = null;
      if (RT.clearSelection) RT.clearSelection();
      cancelActiveSketchForRestart();
      setActiveButton(true);

      fixedClickHandle = RT.view.on('click', function (event) {
        if (event && typeof event.stopPropagation === 'function') event.stopPropagation();
        placeFixedAt(event.mapPoint);
      });

      if (onPointerMoveFn) {
        fixedMoveHandle = RT.view.on('pointer-move', function (event) {
          const d = dimensions(); if (!d.valid) return;
          const mp = RT.view.toMap({ x: event.x, y: event.y }); if (!mp) return;
          const geom = makeGeometry ? makeGeometry(mp, d.widthFt, d.lengthFt) : null; if (!geom) return;
          const probe = new RT.Graphic({ geometry: geom, symbol: currentSymbol() });
          applyMetadata(probe);
          onPointerMoveFn(probe);
        });
      }

      fixedEscHandler = function (ev) {
        if (ev.key !== 'Escape') return;
        ev.preventDefault(); ev.stopPropagation();
        cancelPlacement(true);
      };
      document.addEventListener('keydown', fixedEscHandler, true);
    }

    function startManualDraw() {
      onAnnounce();
      clearValidation();
      cancelPlacement(false);
      if (RT.clearSelection) RT.clearSelection();
      cancelActiveSketchForRestart();
      setPendingDraw(true);
      setLiveSideLabelSuppression(true);
      window.__sitePlanPendingToolType = pendingKey;
      setActiveButton(true);
      try {
        RT.sketch.viewModel.polygonSymbol = currentSymbol();
        RT.sketch.create(sketchType);
      } catch (err) {
        setPendingDraw(false);
        setLiveSideLabelSuppression(false);
        window.__sitePlanPendingToolType = null;
        clearActiveButton();
        console.error(logPrefix, 'sketch.create failed:', err);
      }
    }

    function settingsSignature() {
      const d = dimensions();
      return [
        toolId,
        isFixedMode() ? 'fixed' : 'manual',
        Number.isFinite(d.widthFt)  ? d.widthFt  : '',
        Number.isFinite(d.lengthFt) ? d.lengthFt : '',
        d.valid ? 'valid' : 'invalid',
        extraSettingsSignatureFn ? extraSettingsSignatureFn() : ''
      ].join('|');
    }

    function start() {
      lastSettingsSignature = settingsSignature();
      if (manualOnly) { startManualDraw(); return; }
      if (isFixedMode()) { startFixedPlacement(); return; }
      startManualDraw();
    }

    function restartIfActive(options) {
      if (!activeTool) return;
      const ropts = options || {};
      const sig = settingsSignature();
      if (!ropts.force && sig === lastSettingsSignature) return;
      lastSettingsSignature = sig;
      cancelPlacement(false);
      setActiveButton(true);
      if (manualOnly) {
        startManualDraw();
        return;
      }
      if (isFixedMode()) {
        if (!markValidity()) { if (ropts.focusInvalid) focusFirstInvalidInput(); return; }
        startFixedPlacement();
        return;
      }
      startManualDraw();
    }

    RT.sketch.on('create', function (event) {
      if (!pendingManualDraw) return;
      if (event.state === 'cancel') {
        if (ignoreNextSketchCancel) { ignoreNextSketchCancel = false; return; }
        setPendingDraw(false);
        setLiveSideLabelSuppression(false);
        if (window.__sitePlanPendingToolType === pendingKey) window.__sitePlanPendingToolType = null;
        clearActiveButton();
        return;
      }
      if (event.state === 'complete') {
        setLiveSideLabelSuppression(false);
        clearActiveButton();
      }
    });

    RT.onGraphicCreated(function (graphic) {
      const createdByTool = pendingManualDraw &&
        !!graphic && !!graphic.geometry && graphic.geometry.type === 'polygon';
      const isCopy = !createdByTool && isParent(graphic);

      if (!createdByTool && !isCopy) return;
      applyMetadata(graphic);
      if (createdByTool && validateOnCreateFn) validateOnCreateFn(RT, graphic, logPrefix);
      if (onCreatedFn) onCreatedFn(graphic, { createdByTool: !!createdByTool, isCopy: !!isCopy });

      if (createdByTool) {
        setPendingDraw(false);
        setLiveSideLabelSuppression(false);
        clearActiveButton();
        if (window.__sitePlanPendingToolType === pendingKey) window.__sitePlanPendingToolType = null;
      }
    });

    RT.onGraphicUpdated(function (graphic, event) {
      if (!isParent(graphic)) return;
      applyMetadata(graphic);
      if (onUpdatedFn) onUpdatedFn(graphic, event);
    });

    function runDeletedHook(graphic) {
      if (onDeletedFn) onDeletedFn(graphic);
    }

    function scheduleDeletedHook(graphic) {
      if (!onDeletedFn) return;
      if (window.requestAnimationFrame) {
        window.requestAnimationFrame(function () {
          runDeletedHook(graphic);
          window.requestAnimationFrame(function () { runDeletedHook(graphic); });
        });
      }
      window.setTimeout(function () { runDeletedHook(graphic); }, 80);
    }

    RT.onGraphicDeleted(function (graphic) {
      if (!isParent(graphic)) return;
      runDeletedHook(graphic);
      scheduleDeletedHook(graphic);
    });

    if (typeof opts.onZoomRefresh === 'function' && RT.view && typeof RT.view.watch === 'function') {
      RT.view.watch('extent', opts.onZoomRefresh);
      RT.view.watch('scale',  opts.onZoomRefresh);
    }

    window.addEventListener('siteplan:tool-activated', function (event) {
      const detail = event && event.detail ? event.detail : {};
      if (isOwnEvent(detail)) return;
      cancelPlacement(false);
      clearActiveButton();
      clearValidation();
    });

    function getSnapSides(graphic) {
      if (getSnapSidesFn) return getSnapSidesFn(graphic, isParent);
      if (!isParent(graphic)) return [];
      const geom = graphic.geometry;
      const rawRing = geom && geom.rings && geom.rings[0] ? geom.rings[0].slice() : [];
      if (rawRing.length > 4) {
        const f = rawRing[0]; const l = rawRing[rawRing.length - 1];
        if (f && l && f[0] === l[0] && f[1] === l[1]) rawRing.pop();
      }
      if (rawRing.length < 4) return [];
      const sr = geom.spatialReference && geom.spatialReference.toJSON
        ? geom.spatialReference.toJSON() : geom.spatialReference;
      function sp(pt) { return pt ? { type: 'point', x: pt[0], y: pt[1], spatialReference: sr } : null; }
      function side(name, a, b, opposite) {
        const pa = sp(a); const pb = sp(b); if (!pa || !pb) return null;
        const dx = pb.x - pa.x; const dy = pb.y - pa.y;
        const len = Math.hypot(dx, dy); if (!len) return null;
        return { name, opposite, a: pa, b: pb, dx, dy, ux: dx / len, uy: dy / len, length: len, spatialReference: sr };
      }
      return [
        side('bottom', rawRing[0], rawRing[1], 'top'),
        side('right',  rawRing[1], rawRing[2], 'left'),
        side('top',    rawRing[2], rawRing[3], 'bottom'),
        side('left',   rawRing[3], rawRing[0], 'right')
      ].filter(Boolean);
    }

    function translateGeometry(geometry, dx, dy) {
      if (!geometry || geometry.type !== 'polygon' || !geometry.rings) return geometry;
      const sr = geometry.spatialReference && geometry.spatialReference.toJSON
        ? geometry.spatialReference.toJSON() : geometry.spatialReference;
      return {
        type: 'polygon',
        rings: geometry.rings.map(ring => (ring || []).map(pt => [pt[0] + dx, pt[1] + dy])),
        spatialReference: sr
      };
    }

    function moveByOffset(graphic, dx, dy) {
      if (!isParent(graphic) || !Number.isFinite(dx) || !Number.isFinite(dy)) return false;
      if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) return false;
      graphic.geometry = translateGeometry(graphic.geometry, dx, dy);
      if (onUpdatedFn) onUpdatedFn(graphic);
      if (typeof RT.removeSideLabelsForGraphic === 'function') RT.removeSideLabelsForGraphic(graphic);
      return true;
    }

    function buildButton() {
      if (buttonEl) return buttonEl;
      buttonEl = document.createElement('button');
      buttonEl.type      = 'button';
      buttonEl.id        = buttonId;
      buttonEl.className = 'tool-btn draw-tool-btn icon-btn';
      buttonEl.title     = buttonTitle;
      const spanClass    = 'tool-icon' + (iconClass ? ' ' + iconClass : '');
      buttonEl.innerHTML = '<span class="' + spanClass + '">' + iconHtml + '</span>' +
                           '<span class="tool-label">' + label + '</span>';
      buttonEl.addEventListener('click', start);
      // Mode-aware tools: keep the button icon in sync with the section toggle.
      if ((symbols || iconApply) && DrawingMode) {
        const svg = buttonEl.querySelector('svg');
        if (svg) DrawingMode.registerIcon(svg, { category, apply: iconApply || undefined });
      }
      return buttonEl;
    }

    function buildControls() {
      if (!showControls) return null;
      if (controlsEl) return controlsEl;
      controlsEl = document.createElement('div');
      controlsEl.className = 'size-row';
      const chk  = (fixedOnly || defaultChecked) ? ' checked' : '';
      const dis  = fixedOnly ? ' disabled aria-disabled="true"' : '';
      const wVal = defaultWidthFt  != null ? ' value="' + defaultWidthFt  + '"' : '';
      const lVal = defaultLengthFt != null ? ' value="' + defaultLengthFt + '"' : '';
      const widthInput =
        '<input id="' + widthId  + '" type="number" min="' + minWidthFt + '" step="' + widthStep + '"' + wVal +
          ' class="dim-input" placeholder="W" aria-label="' + widthAriaLabel  + '">';
      const lengthInput =
        '<input id="' + lengthId + '" type="number" min="' + minLengthFt + '" step="' + lengthStep + '"' + lVal +
          ' class="dim-input" placeholder="L" aria-label="' + lengthAriaLabel + '">';
      const firstInput = dimensionOrder === 'length-width' ? lengthInput : widthInput;
      const secondInput = dimensionOrder === 'length-width' ? widthInput : lengthInput;
      controlsEl.innerHTML =
        '<input type="checkbox" id="' + checkboxId + '"' + chk + dis + '>' +
        '<label for="' + checkboxId + '" class="size-lbl">Fixed size (ft)</label>' +
        firstInput +
        '<span class="dim-sep">x</span>' +
        secondInput;
      return controlsEl;
    }

    function wireControls() {
      if (!showControls) return;
      if (controlsWired) return;
      const p = els();
      [p.width, p.length].forEach(input => {
        if (!input) return;
        input.addEventListener('input',   () => { if (isFixedMode()) markValidity(); else clearValidation(); });
        input.addEventListener('change',  () => restartIfActive({ force: false }));
        input.addEventListener('blur',    () => restartIfActive({ force: false }));
        input.addEventListener('keydown', ev => ev.stopPropagation());
      });
      if (p.checkbox) {
        if (fixedOnly) {
          p.checkbox.checked = true;
          p.checkbox.disabled = true;
          p.checkbox.setAttribute('aria-disabled', 'true');
        }
        p.checkbox.addEventListener('change', () => {
          if (fixedOnly) {
            p.checkbox.checked = true;
            return;
          }
          if (!p.checkbox.checked) clearValidation();
          if (activeTool) {
            restartIfActive({ force: true, focusInvalid: p.checkbox.checked });
          } else if (!p.checkbox.checked) {
            cancelPlacement(true);
          }
        });
      }
      controlsWired = true;
    }

    function mount(section) {
      if (!section) return false;
      const btn  = buildButton();
      const ctrl = buildControls();
      if (btn  && btn.parentNode  !== section) section.appendChild(btn);
      if (ctrl && ctrl.parentNode !== section) section.appendChild(ctrl);
      wireControls();
      return true;
    }

    function getElements() {
      return [buildButton(), buildControls()].filter(Boolean);
    }

    return {
      id:           toolId,
      order,
      label,
      capabilities: Object.assign({}, toolCapabilities),
      start,
      cancel:       cancelPlacement,
      clearActive:  clearActiveButton,
      isActive:     () => !!activeTool,
      isPendingManualDraw: () => !!pendingManualDraw,
      isParent,
      applyMetadata,
      restartIfActive,
      dimensions,
      isFixedMode,
      settingsSignature,
      markValidity,
      setPendingDraw,
      clearValidation,
      focusFirstInvalidInput,
      placeFixedAt,
      startFixedPlacement,
      startManualDraw,
      cancelActiveSketchForRestart,
      buildButton,
      buildControls,
      getElements,
      wireControls,
      mount,
      getSnapSides,
      translateGeometry,
      moveByOffset
    };
  }

  window.SitePlanRectangleTool = { create };
}());
