// Usage:
//   const tool = window.SitePlanPointTool.create({
//     RT, toolId, buttonId, category, label,
//     toolCapabilities, idPrefix,
//     symbol:            () => symbolObject,
//     refreshSymbolOnZoom: true,             // re-applies symbol() on zoom/scale change
//     applyExtraMetadata: graphic => { ... },
//     rebuildSupport:    graphic => { ... },
//     removeSupport:     graphic => { ... },
//     coordinateRow: {
//       checkboxId, xId, yId, checkboxLabelHtml, xPlaceholder, yPlaceholder,
//       xAriaLabel, yAriaLabel, rowClassName
//     },
//     isCoordinateMode:  () => bool,
//     getCoordinatePoint: () => point | null,
//     onAnnounce:        () => { ... },      // dispatch siteplan:tool-activated
//     onDeactivate:      () => { ... },      // clear coordinate validation, etc.
//     iconHtml:          '<span>...</span>',
//     buttonTitle:       'Place a widget',
//     toolLabel:         'Widget',           // button label (defaults to label)
//     order:             10,
//   });

(function () {
  'use strict';

  function noop() {}

  function generateId(prefix) {
    return (prefix || 'spg') + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  }

  function create(options) {
    const RT               = options.RT;
    const toolId           = options.toolId;
    const buttonId         = options.buttonId;
    const category         = options.category  || '';
    const label            = options.label     || '';
    const toolLabel        = options.toolLabel || label;
    const idPrefix         = options.idPrefix  || toolId;
    const logPrefix        = options.logPrefix || ('[utils/point-tool:' + toolId + ']');
    const toolCapabilities = options.toolCapabilities || {
      reshape: false, resize: false, rotate: false,
      label: false, duplicate: true, delete: true
    };

    const getSymbol            = options.symbol            || null;
    // Opt-in: when true and a Proposed/Existing toggle governs this category,
    const proposedMode         = !!options.proposedMode;
    // Optional custom button-icon transform (svg, mode); defaults to the dash.
    const iconApply            = typeof options.iconApply === 'function' ? options.iconApply : null;
    const DrawingMode          = window.SitePlanDrawingMode || null;
    const applyExtraMetadata   = options.applyExtraMetadata || null;
    const rebuildSupport       = options.rebuildSupport     || null;
    const removeSupport        = options.removeSupport      || null;
    const refreshSymbolOnZoom  = !!options.refreshSymbolOnZoom;
    const coordinateRowConfig  = options.coordinateRow      || null;

    const isCoordinateModeCallback  = options.isCoordinateMode
      || (coordinateRowConfig ? isCoordinateModeFromRow : null);
    const getCoordinatePointCallback = options.getCoordinatePoint
      || (coordinateRowConfig ? getCoordinatePointFromRow : null);

    const onAnnounce    = options.onAnnounce    || noop;
    const onDeactivate  = options.onDeactivate  || noop;
    const onCreatedHook = options.onGraphicCreated || null;
    const onUpdatedHook = options.onGraphicUpdated || null;
    const onDeletedHook = options.onGraphicDeleted || null;

    const iconHtml    = options.iconHtml    || '';
    const buttonTitle = options.buttonTitle || label;
    const order       = options.order != null ? options.order : 10;

    let clickHandle   = null;
    let escHandler    = null;
    let activeTool    = false;
    let refreshFrame  = null;
    let buttonEl      = null;
    let controlsEl    = null;
    let controlsWired = false;

    function coordinateRowElements() {
      const cfg = coordinateRowConfig || {};
      return {
        checkbox: document.getElementById(cfg.checkboxId),
        x: document.getElementById(cfg.xId),
        y: document.getElementById(cfg.yId)
      };
    }

    function isCoordinateModeFromRow() {
      const parts = coordinateRowElements();
      return !!(parts.checkbox && parts.checkbox.checked);
    }

    function parseCoordinateValue(value) {
      if (value == null) return NaN;
      const cleaned = String(value).trim().replace(/,/g, '');
      if (!cleaned) return NaN;
      return Number.parseFloat(cleaned);
    }

    function spatialReferenceJSON(spatialReference) {
      return spatialReference && spatialReference.toJSON ? spatialReference.toJSON() : spatialReference;
    }

    function pointFromXY(x, y, spatialReference) {
      return {
        type: 'point',
        x,
        y,
        spatialReference
      };
    }

    function coordinatePointFromInputs(xValue, yValue) {
      const x = parseCoordinateValue(xValue);
      const y = parseCoordinateValue(yValue);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

      const looksLikeLonLat = x >= -180 && x <= 180 && y >= -90 && y <= 90;
      const spatialReference = looksLikeLonLat
        ? { wkid: 4326 }
        : (RT.view && RT.view.spatialReference);

      return pointFromXY(x, y, spatialReferenceJSON(spatialReference));
    }

    function markCoordinateRowValidity() {
      const parts = coordinateRowElements();
      const x = parseCoordinateValue(parts.x && parts.x.value);
      const y = parseCoordinateValue(parts.y && parts.y.value);
      const xValid = Number.isFinite(x);
      const yValid = Number.isFinite(y);
      if (parts.x) parts.x.classList.toggle('invalid', !xValid);
      if (parts.y) parts.y.classList.toggle('invalid', !yValid);
      return xValid && yValid;
    }

    function clearCoordinateRowValidation() {
      const parts = coordinateRowElements();
      if (parts.x) parts.x.classList.remove('invalid');
      if (parts.y) parts.y.classList.remove('invalid');
    }

    function focusFirstInvalidCoordinate() {
      const parts = coordinateRowElements();
      const x = parseCoordinateValue(parts.x && parts.x.value);
      const y = parseCoordinateValue(parts.y && parts.y.value);
      if (!Number.isFinite(x) && parts.x) {
        parts.x.focus();
        return;
      }
      if (!Number.isFinite(y) && parts.y) parts.y.focus();
    }

    function getCoordinatePointFromRow() {
      if (!markCoordinateRowValidity()) {
        focusFirstInvalidCoordinate();
        return null;
      }
      const parts = coordinateRowElements();
      const point = coordinatePointFromInputs(parts.x && parts.x.value, parts.y && parts.y.value);
      if (!point) focusFirstInvalidCoordinate();
      return point || null;
    }

    function buildControls() {
      if (!coordinateRowConfig) return null;
      if (controlsEl) return controlsEl;
      const cfg = Object.assign({
        checkboxLabelHtml: 'Place by<br>coordinates',
        xPlaceholder: 'X, Long',
        yPlaceholder: 'Y, Lat',
        xAriaLabel: 'X or longitude coordinate',
        yAriaLabel: 'Y or latitude coordinate',
        rowClassName: 'size-row coordinate-placement-row'
      }, coordinateRowConfig || {});
      const row = document.createElement('div');
      row.className = cfg.rowClassName;
      row.innerHTML =
        '<input type="checkbox" id="' + cfg.checkboxId + '">' +
        '<label for="' + cfg.checkboxId + '" class="size-lbl coordinate-label">' + cfg.checkboxLabelHtml + '</label>' +
        '<input id="' + cfg.xId + '" type="text" inputmode="decimal" autocomplete="off" spellcheck="false" class="dim-input" placeholder="' + cfg.xPlaceholder + '" aria-label="' + cfg.xAriaLabel + '">' +
        '<span class="dim-sep coordinate-layout-spacer" aria-hidden="true">&times;</span>' +
        '<input id="' + cfg.yId + '" type="text" inputmode="decimal" autocomplete="off" spellcheck="false" class="dim-input" placeholder="' + cfg.yPlaceholder + '" aria-label="' + cfg.yAriaLabel + '">';
      controlsEl = row;
      return controlsEl;
    }

    function wireControls() {
      if (!coordinateRowConfig || controlsWired) return;
      const parts = coordinateRowElements();
      [parts.x, parts.y].forEach(input => {
        if (!input) return;
        input.addEventListener('input', () => {
          if (isCoordinateModeFromRow()) markCoordinateRowValidity();
          else clearCoordinateRowValidation();
        });
        input.addEventListener('keydown', event => {
          event.stopPropagation();
          if (event.key === 'Enter' && isCoordinateModeFromRow()) {
            event.preventDefault();
            start();
          }
        });
      });
      if (parts.checkbox) {
        parts.checkbox.addEventListener('change', () => {
          if (parts.checkbox.checked) markCoordinateRowValidity();
          else clearCoordinateRowValidation();
        });
      }
      controlsWired = true;
    }

    function setActiveButton(active) {
      activeTool = !!active;
      document.querySelectorAll('.draw-tool-btn.icon-btn').forEach(b => b.classList.remove('active'));
      if (!buttonEl) buttonEl = document.getElementById(buttonId);
      if (buttonEl) buttonEl.classList.toggle('active', activeTool);
    }
    function clearActiveButton() { setActiveButton(false); }

    function isParent(graphic) {
      const a = graphic && graphic.attributes ? graphic.attributes : {};
      return !!(graphic &&
        (graphic.__toolType === toolId || a.toolType === toolId || a.sitePlanTool === toolId) &&
        graphic.geometry && graphic.geometry.type === 'point');
    }

    function applyMetadata(graphic) {
      if (!graphic) return graphic;
      if (!graphic.__sitePlanId) graphic.__sitePlanId = generateId(idPrefix);
      graphic.__toolType          = toolId;
      graphic.__label             = label;
      graphic.__measureLabel      = label;
      graphic.__preferredEditMode = 'move';
      let drawingMode;
      if (proposedMode && DrawingMode) {
        const stamped = graphic.attributes && graphic.attributes.drawingMode;
        drawingMode = (stamped === 'existing' || stamped === 'proposed')
          ? stamped
          : DrawingMode.getDrawingMode(category);
      }
      graphic.attributes = Object.assign({}, graphic.attributes || {}, {
        toolType:         toolId,
        sitePlanTool:     toolId,
        sitePlanCategory: category,
        sitePlanId:       graphic.__sitePlanId,
        label,
        measureLabel:     label,
        drawingMode,
        preferredEditMode: 'move',
        toolCapabilities: Object.assign({}, toolCapabilities)
      });
      if (typeof RT.setGraphicCapabilities === 'function') RT.setGraphicCapabilities(graphic, toolCapabilities);
      if (typeof applyExtraMetadata === 'function') applyExtraMetadata(graphic);
      // After extra metadata (which may stamp a per-graphic drawing mode) so the
      // symbol can lock to the mode the graphic was drawn in.
      if (getSymbol) graphic.symbol = getSymbol(graphic);
      return graphic;
    }

    function cancelPlacement(clearButtonState) {
      if (clickHandle) { try { clickHandle.remove(); } catch (e) {} clickHandle = null; }
      if (escHandler)  { document.removeEventListener('keydown', escHandler, true); escHandler = null; }
      if (clearButtonState) clearActiveButton();
    }

    function placeAtPoint(point) {
      if (!point) return null;
      const graphic = new RT.Graphic({
        geometry: point,
        symbol: getSymbol ? getSymbol() : undefined,
        attributes: {
          toolType: toolId,
          sitePlanTool: toolId,
          sitePlanCategory: category,
          toolCapabilities: Object.assign({}, toolCapabilities)
        }
      });
      applyMetadata(graphic);

      cancelPlacement(false);
      clearActiveButton();
      RT.registerDrawableGraphic(graphic);

      (window.requestAnimationFrame || (fn => window.setTimeout(fn, 0)))(() => {
        try { RT.selectGraphic(graphic); }
        catch (err) { console.warn(logPrefix, 'Unable to select placed graphic.', err); }
      });
      return graphic;
    }

    function start() {
      onAnnounce();
      if (RT.clearSelection) RT.clearSelection();
      if (RT.sketch && RT.sketch.state === 'active') try { RT.sketch.cancel(); } catch (e) {}
      window.__sitePlanSuppressLiveSideLabels = false;
      setActiveButton(true);

      // Coordinate mode: place immediately from inputs.
      if (typeof isCoordinateModeCallback === 'function' && isCoordinateModeCallback()) {
        const point = typeof getCoordinatePointCallback === 'function'
          ? getCoordinatePointCallback()
          : null;
        if (point) {
          placeAtPoint(point);
        } else {
          clearActiveButton();
        }
        return;
      }

      cancelPlacement(false);
      clickHandle = RT.view.on('click', event => {
        if (event && typeof event.stopPropagation === 'function') event.stopPropagation();
        const mp = event && event.mapPoint;
        if (!mp) return;
        const point = mp.clone ? mp.clone()
          : { type: 'point', x: mp.x, y: mp.y, spatialReference: mp.spatialReference };
        placeAtPoint(point);
      });

      escHandler = function (ev) {
        if (ev.key !== 'Escape') return;
        ev.preventDefault();
        ev.stopPropagation();
        cancelPlacement(true);
      };
      document.addEventListener('keydown', escHandler, true);
    }

    function refreshSymbols() {
      refreshFrame = null;
      if (!RT.drawLayer || !RT.drawLayer.graphics) return;
      RT.drawLayer.graphics.forEach(graphic => {
        if (!isParent(graphic)) return;
        if (getSymbol) graphic.symbol = getSymbol(graphic);
      });
    }

    function scheduleRefresh() {
      if (refreshFrame != null) return;
      refreshFrame = window.requestAnimationFrame
        ? window.requestAnimationFrame(refreshSymbols)
        : window.setTimeout(refreshSymbols, 16);
    }

    RT.onGraphicCreated(graphic => {
      if (!isParent(graphic)) return;
      applyMetadata(graphic);
      if (typeof rebuildSupport === 'function') rebuildSupport(graphic);
      if (typeof onCreatedHook === 'function') onCreatedHook(graphic);
    });

    RT.onGraphicUpdated(graphic => {
      if (!isParent(graphic)) return;
      applyMetadata(graphic);
      if (typeof rebuildSupport === 'function') rebuildSupport(graphic);
      if (typeof onUpdatedHook === 'function') onUpdatedHook(graphic);
    });

    RT.onGraphicDeleted(graphic => {
      if (!isParent(graphic)) return;
      if (typeof removeSupport === 'function') removeSupport(graphic);
      if (typeof onDeletedHook === 'function') onDeletedHook(graphic);
    });

    if (refreshSymbolOnZoom && RT.view && typeof RT.view.watch === 'function') {
      RT.view.watch('zoom',  scheduleRefresh);
      RT.view.watch('scale', scheduleRefresh);
    }

    window.addEventListener('siteplan:tool-activated', event => {
      const detail = event && event.detail ? event.detail : {};
      if (detail.tool === toolId) return;
      cancelPlacement(false);
      clearActiveButton();
      if (coordinateRowConfig) clearCoordinateRowValidation();
      if (typeof onDeactivate === 'function') onDeactivate();
    });

    function buildButton() {
      const btn = document.createElement('button');
      btn.type      = 'button';
      btn.id        = buttonId;
      btn.className = 'tool-btn draw-tool-btn icon-btn';
      btn.title     = buttonTitle;
      btn.innerHTML = iconHtml + '<span class="tool-label">' + toolLabel + '</span>';
      btn.addEventListener('click', start);
      if (proposedMode && DrawingMode) {
        const svg = btn.querySelector('svg');
        if (svg) DrawingMode.registerIcon(svg, { category, apply: iconApply || undefined });
      }
      buttonEl = btn;
      return btn;
    }

    function getElements() {
      return [buildButton(), buildControls()].filter(Boolean);
    }

    function placeAtCoordinates() {
      const point = getCoordinatePointFromRow();
      if (point) placeAtPoint(point);
      return !!point;
    }

    const api = {
      id:           toolId,
      order,
      label,
      capabilities: Object.assign({}, toolCapabilities),
      start,
      cancel:       cancelPlacement,
      clearActive:  clearActiveButton,
      isActive:     () => !!activeTool,
      isParent,
      applyMetadata,
      placeAtPoint,
      buildButton,
      getElements
    };
    if (coordinateRowConfig) {
      api.buildControls     = buildControls;
      api.wireControls      = wireControls;
      api.placeAtCoordinates = placeAtCoordinates;
    }
    return api;
  }

  window.SitePlanPointTool = { create };
}());
