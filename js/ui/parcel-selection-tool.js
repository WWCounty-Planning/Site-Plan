// js/ui/parcel-selection-tool.js
(function () {
  'use strict';
  const TOOL_ID = 'parcel-selection';
  const EVENT_SOURCE = 'parcel-selection-tool';

  function create(options) {
    const view = options.view;
    const parcelLayer = options.parcelLayer;
    const activateParcelFeature = options.activateParcelFeature;
    const clearDrawingSelection = options.clearDrawingSelection || function () {};
    const cancelMainSketch = options.cancelMainSketch || function () {};
    const cancelMeasurement = options.cancelMeasurement || function () {};
    const setSketchGraphicClickEnabled = options.setSketchGraphicClickEnabled || function () {};
    const button = document.getElementById(options.buttonId || 'parcel-select-btn');
    const mapWrap = options.mapWrap || document.getElementById('map-wrap');

    let active = false;
    let clickHandle = null;
    let requestVersion = 0;

    function updateUi() {
      if (button) {
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', active ? 'true' : 'false');
        button.title = active
          ? 'Parcel selection active — click a parcel or press Escape to stop'
          : 'Select a parcel by clicking the map';
      }
      if (mapWrap) mapWrap.classList.toggle('parcel-selection-active', active);
    }

    function setBusy(busy) {
      if (!button) return;
      button.classList.toggle('busy', !!busy);
      button.setAttribute('aria-busy', busy ? 'true' : 'false');
    }

    function announceActivation() {
      try {
        window.dispatchEvent(new CustomEvent('siteplan:tool-activated', {
          detail: { source: EVENT_SOURCE, tool: TOOL_ID }
        }));
      } catch (err) {}
    }

    function parcelFromHitTest(response) {
      const results = response && response.results ? response.results : [];
      const hit = results.find(result =>
        result && result.graphic && result.graphic.layer === parcelLayer
      );
      return hit ? hit.graphic : null;
    }

    function handleMapClick(event) {
      if (!active) return;
      if (event && typeof event.stopPropagation === 'function') event.stopPropagation();

      const thisRequest = ++requestVersion;
      setBusy(true);
      view.hitTest(event, { include: [parcelLayer] })
        .then(parcelFromHitTest)
        .then(feature => {
          if (!active || thisRequest !== requestVersion || !feature) return null;
          return activateParcelFeature(feature, { skipZoom: true });
        })
        .catch(err => {
          if (active && thisRequest === requestVersion) {
            console.error('Parcel selection failed:', err);
          }
        })
        .finally(() => {
          if (thisRequest === requestVersion) setBusy(false);
        });
    }

    function handleKeydown(event) {
      if (!active || event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      deactivate();
    }

    function activate() {
      if (active || !view || !parcelLayer || typeof activateParcelFeature !== 'function') return;

      announceActivation();
      clearDrawingSelection();
      cancelMainSketch();
      cancelMeasurement();
      setSketchGraphicClickEnabled(false);
      active = true;
      clickHandle = view.on('click', handleMapClick);
      document.addEventListener('keydown', handleKeydown, true);
      updateUi();
    }
    function deactivate() {
      if (!active && !clickHandle) return;
      active = false;
      requestVersion++;
      setBusy(false);
      if (clickHandle) {
        try { clickHandle.remove(); } catch (err) {}
        clickHandle = null;
      }
      document.removeEventListener('keydown', handleKeydown, true);
      setSketchGraphicClickEnabled(true);
      updateUi();
    }
    function toggle() {
      if (active) deactivate();
      else activate();
    }
    if (button) {
      button.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        toggle();
      });
    }
    window.addEventListener('siteplan:tool-activated', event => {
      const detail = event && event.detail ? event.detail : {};
      if (detail.source === EVENT_SOURCE && detail.tool === TOOL_ID) return;
      deactivate();
    });
    updateUi();
    return {
      activate,
      deactivate,
      toggle,
      isActive: () => active
    };
  }
  window.SitePlanParcelSelectionTool = { create };
}());