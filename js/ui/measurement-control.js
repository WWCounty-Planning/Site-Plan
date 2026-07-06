// Measurement tool — owns both the distance/area panel UI

(function () {
  'use strict';

  function stop(e) { e.stopPropagation(); }

  function create(options) {
    const measureSketch    = options.measureSketch;
    const measureLayer     = options.measureLayer;
    const previewLayer     = options.previewLayer;
    const view             = options.view;
    const clearSelection   = options.clearSelection;
    const cancelMainSketch = options.cancelMainSketch;
    const mu               = options.measurementUtils;

    let activeMeasureMode = null;

    const control = document.createElement('div');
    control.id        = 'measure-control';
    control.className = 'measure-flyout-control esri-component';
    control.innerHTML = `
      <button type="button" class="measure-toggle-btn" id="measure-toggle-btn" title="Measurement tools" aria-label="Measurement tools">
        <svg viewBox="0 0 100 100" aria-hidden="true">
          <!-- Icon from Font-GIS by Jean-Marc Viglino - https://github.com/Viglino/font-gis/blob/main/LICENSE-CC-BY.md -->
          <path fill="currentColor" d="M2.063 51.733a4.127 4.127 0 0 0-1.51 5.637l18.34 31.768a4.127 4.127 0 0 0 5.638 1.51l73.406-42.38a4.127 4.127 0 0 0 1.51-5.638l-18.34-31.768a4.127 4.127 0 0 0-5.638-1.51Zm7.701 5.084l66.258-38.254l14.214 24.62l-4.775 2.757l-5.327-9.229l-3.574 2.064l5.327 9.228l-5.465 3.156l-5.328-9.229l-3.574 2.064l5.328 9.228l-5.459 3.152l-5.328-9.229l-3.574 2.064l5.328 9.228l-5.465 3.156l-7.404-12.823l-3.574 2.063l7.404 12.823l-5.466 3.156l-5.328-9.229l-3.574 2.064l5.328 9.228l-5.459 3.151l-5.327-9.228l-3.574 2.064l5.327 9.228l-5.465 3.155l-5.328-9.228l-3.574 2.064l5.328 9.228l-3.686 2.128z"></path>
        </svg>
      </button>
      <div class="measure-panel" role="dialog" aria-label="Measurement tools">
        <div class="measure-panel-head" id="measure-panel-head"><span>Measure</span><button type="button" class="measure-close-btn" id="measure-close-btn" aria-label="Close measurement tools">x</button></div>
        <div class="measure-panel-body">
          <div class="measure-mode-row">
            <button type="button" class="measure-check-row" id="measure-distance-row"><input type="checkbox" tabindex="-1" aria-hidden="true" /><span>Distance</span></button>
            <button type="button" class="measure-check-row" id="measure-area-row"><input type="checkbox" tabindex="-1" aria-hidden="true" /><span>Area</span></button>
            <button type="button" class="measure-clear-btn" id="measure-clear-btn">Clear measurements</button>
          </div>
        </div>
      </div>`;

    const toggle      = control.querySelector('#measure-toggle-btn');
    const panelHead   = control.querySelector('#measure-panel-head');
    const closeBtn    = control.querySelector('#measure-close-btn');
    const distanceRow = control.querySelector('#measure-distance-row');
    const areaRow     = control.querySelector('#measure-area-row');
    const clearBtn    = control.querySelector('#measure-clear-btn');

    function open()  { control.classList.add('expanded'); }
    function close() { control.classList.remove('expanded'); }

    function updateButtons() {
      const hasMeasurements = measureLayer.graphics.length > 0 ||
                              previewLayer.graphics.length > 0;
      distanceRow.classList.toggle('active', activeMeasureMode === 'distance');
      areaRow.classList.toggle('active',     activeMeasureMode === 'area');
      distanceRow.querySelector('input').checked = activeMeasureMode === 'distance';
      areaRow.querySelector('input').checked     = activeMeasureMode === 'area';
      clearBtn.disabled = !hasMeasurements;
      toggle.classList.toggle('active', !!activeMeasureMode);
    }

    function startMeasureMode(mode) {
      clearSelection();
      cancelMainSketch();
      try { if (measureSketch && measureSketch.state !== 'idle') measureSketch.cancel(); } catch (err) {}
      activeMeasureMode = mode;
      updateButtons();
      if (mode === 'distance') {
        measureSketch.create('polyline', { mode: 'click', symbol: mu.measureLineSymbol });
      } else if (mode === 'area') {
        measureSketch.create('polygon',  { mode: 'click', symbol: mu.measureFillSymbol });
      }
    }

    function clearTemporaryMeasurements() {
      try { if (measureSketch && measureSketch.state !== 'idle') measureSketch.cancel(); } catch (err) {}
      activeMeasureMode = null;
      measureLayer.removeAll();
      mu.clearLiveMeasurePreview();
      updateButtons();
    }

    measureSketch.on('create', event => {
      const geometry = event.graphic && event.graphic.geometry;
      if (event.state === 'active') {
        mu.updateLiveMeasurePreview(geometry);
        return;
      }
      if (event.state === 'cancel') {
        mu.clearLiveMeasurePreview();
        activeMeasureMode = null;
        updateButtons();
        return;
      }
      if (event.state === 'complete') {
        mu.clearLiveMeasurePreview();
        if (event.graphic) {
          event.graphic.__nonSelectable = true;
          event.graphic.__isMeasurement = true;
          event.graphic.__measureRole   = 'shape';
          mu.assignMeasureId(event.graphic);
          if (event.graphic.geometry && event.graphic.geometry.type === 'polyline')
            event.graphic.symbol = mu.measureLineSymbol;
          if (event.graphic.geometry && event.graphic.geometry.type === 'polygon')
            event.graphic.symbol = mu.measureFillSymbol;
          mu.createOrUpdateMeasureLabelForGraphic(event.graphic, measureLayer);
        }
        activeMeasureMode = null;
        updateButtons();
      }
    });

    // Keep bound measurement labels in sync if a measurement graphic is edited.
    measureSketch.on('update', event => {
      (event.graphics || []).forEach(graphic => {
        if (graphic && graphic.__isMeasurement && graphic.__measureRole !== 'label') {
          mu.createOrUpdateMeasureLabelForGraphic(graphic, measureLayer);
        }
      });
      if (event.state === 'complete' || event.state === 'cancel') updateButtons();
    });

    toggle.addEventListener('click',      e => { stop(e); open(); });
    panelHead.addEventListener('click',   e => { stop(e); close(); });
    closeBtn.addEventListener('click',    e => { stop(e); close(); });
    distanceRow.addEventListener('click', e => { stop(e); startMeasureMode('distance'); });
    areaRow.addEventListener('click',     e => { stop(e); startMeasureMode('area'); });
    clearBtn.addEventListener('click',    e => { stop(e); clearTemporaryMeasurements(); });

    // Mount and initialise button state.
    view.ui.add(control, 'top-left');
    updateButtons();

    return { clearTemporaryMeasurements };
  }

  window.SitePlanMeasurementControl = { create };
}());
