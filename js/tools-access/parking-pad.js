// js/tools-access/parking-pad.js
// Freeform parking-pad area with optional fixed-size placement and driveway materials.

(function () {
  'use strict';

  if (!window.SitePlanRuntimeReady) {
    console.error('[tools-access/parking-pad] window.SitePlanRuntimeReady is missing. Make sure js/runtime.js loads first.');
    return;
  }
  if (!window.SitePlanRectangleTool) {
    console.error('[tools-access/parking-pad] SitePlanRectangleTool is missing. Make sure js/utils/rectangle-tool.js loads first.');
    return;
  }

  window.SitePlanRuntimeReady.then(RT => {
    const AS = window.SitePlanAccessShared = window.SitePlanAccessShared || {};

    const TOOL_ID = 'parkingPad';
    const BUTTON_ID = 'btn-parking-pad';
    const MATERIAL_ID = 'parking-pad-material';
    const CHECKBOX_ID = 'chk-parking-pad-fixed';
    const WIDTH_ID = 'parking-pad-w';
    const LENGTH_ID = 'parking-pad-l';
    const CATEGORY = 'access';
    const DEFAULT_MATERIAL_ID = 'asphalt';
    const BORDER_COLOR = [100, 111, 91, 1]; // #646F5B

    let selectedMaterial = DEFAULT_MATERIAL_ID;
    let buttonEl = null;
    let materialControlsEl = null;
    let controlsWired = false;
    let unregisterIcon = null;

    function drawingModeForGraphic(graphic) {
      const attrs = graphic && graphic.attributes ? graphic.attributes : {};
      if (attrs.drawingMode === 'proposed' || attrs.drawingMode === 'existing') return attrs.drawingMode;
      return window.SitePlanDrawingMode
        ? window.SitePlanDrawingMode.getDrawingMode(CATEGORY)
        : 'existing';
    }

    function materialForGraphic(graphic) {
      const attrs = graphic && graphic.attributes ? graphic.attributes : {};
      return attrs.parkingPadMaterial || selectedMaterial || DEFAULT_MATERIAL_ID;
    }

    function parkingPadSymbol(materialId, mode) {
      const base = typeof AS.drivewaySurfaceSymbol === 'function'
        ? AS.drivewaySurfaceSymbol(materialId)
        : {
            type: 'simple-fill',
            color: [80, 80, 80, 0.35],
            outline: { type: 'simple-line', color: BORDER_COLOR, width: 1.1 }
          };
      return Object.assign({}, base, {
        outline: {
          type: 'simple-line',
          color: BORDER_COLOR,
          width: 2.5,
          style: mode === 'proposed' ? 'long-dash' : 'solid',
          cap: 'butt',
          join: 'round'
        }
      });
    }

    const symbols = {
      existing: parkingPadSymbol(selectedMaterial, 'existing'),
      proposed: parkingPadSymbol(selectedMaterial, 'proposed')
    };

    function refreshSelectedSymbols() {
      symbols.existing = parkingPadSymbol(selectedMaterial, 'existing');
      symbols.proposed = parkingPadSymbol(selectedMaterial, 'proposed');
    }

    function makeFixedGeometry(center, widthFt, lengthFt) {
      if (!center || typeof AS.feetToLocalMapUnits !== 'function') return null;
      const sr = center.spatialReference || (RT.view && RT.view.spatialReference);
      const lengthUnits = AS.feetToLocalMapUnits(lengthFt, center, sr);
      const widthUnits = AS.feetToLocalMapUnits(widthFt, center, sr);
      const halfX = (typeof lengthUnits === 'object' ? lengthUnits.dx : lengthUnits) / 2;
      const halfY = (typeof widthUnits === 'object' ? widthUnits.dy : widthUnits) / 2;
      return {
        type: 'polygon',
        rings: [[
          [center.x - halfX, center.y - halfY],
          [center.x + halfX, center.y - halfY],
          [center.x + halfX, center.y + halfY],
          [center.x - halfX, center.y + halfY],
          [center.x - halfX, center.y - halfY]
        ]],
        spatialReference: sr && sr.toJSON ? sr.toJSON() : sr
      };
    }

    function removeMeasurements(graphic) {
      if (typeof RT.removeSideLabelsForGraphic === 'function') {
        RT.removeSideLabelsForGraphic(graphic);
      }
    }

    function applyParkingPadMetadata(graphic) {
      if (!graphic) return;
      const materialId = materialForGraphic(graphic);
      const mode = drawingModeForGraphic(graphic);
      graphic.__toolType = 'polygon';
      graphic.__skipEdgeLabels = true;
      graphic.__skipSideLabels = true;
      graphic.__useFixedSizeLabels = false;
      graphic.attributes = Object.assign({}, graphic.attributes || {}, {
        parkingPadMaterial: materialId,
        skipEdgeLabels: true,
        skipSideLabels: true,
        useFixedSizeLabels: false
      });
      graphic.symbol = parkingPadSymbol(materialId, mode);
    }

    function refreshParkingPadSymbols() {
      if (typeof AS.graphicsInLayer !== 'function') return;
      AS.graphicsInLayer(RT.drawLayer).forEach(graphic => {
        const attrs = graphic && graphic.attributes ? graphic.attributes : {};
        if (attrs.sitePlanTool !== TOOL_ID && attrs.toolType !== TOOL_ID) return;
        applyParkingPadMetadata(graphic);
        removeMeasurements(graphic);
      });
    }

    function materialOptionsHtml() {
      const registered = typeof AS.getDrivewayMaterials === 'function'
        ? AS.getDrivewayMaterials()
        : [];
      const materials = registered.filter(material => material &&
        (material.id === 'gravel' || material.id === 'asphalt'));
      const list = materials.length ? materials : [
        { id: 'gravel', label: 'Gravel' },
        { id: 'asphalt', label: 'Asphalt' }
      ];
      return list.map(material => {
        const selected = material.id === selectedMaterial ? ' selected' : '';
        return '<option value="' + material.id + '"' + selected + '>' +
          (material.label || material.id) + '</option>';
      }).join('');
    }

    function parkingPadIconPattern(materialId) {
      const asphalt = materialId === 'asphalt';
      return '<defs>' +
        '<pattern id="parking-pad-material-pat" patternUnits="userSpaceOnUse" width="10" height="10" x="2" y="2">' +
          (asphalt
            ? '<g stroke="#646F5B" stroke-width="0.40" stroke-linecap="round">' +
              '<line x1="1.92" y1="0.54" x2="1.92" y2="2.54" transform="rotate(-8 1.92 1.54)"/>' +
              '<line x1="5.77" y1="0.15" x2="5.77" y2="2.15" transform="rotate(5 5.77 1.15)"/>' +
              '<line x1="8.46" y1="1.31" x2="8.46" y2="3.31" transform="rotate(-12 8.46 2.31)"/>' +
              '<line x1="3.46" y1="2.85" x2="3.46" y2="4.85" transform="rotate(10 3.46 3.85)"/>' +
              '<line x1="7.69" y1="3.23" x2="7.69" y2="5.23" transform="rotate(-6 7.69 4.23)"/>' +
              '<line x1="1.15" y1="5.15" x2="1.15" y2="7.15" transform="rotate(8 1.15 6.15)"/>' +
              '<line x1="5.00" y1="4.38" x2="5.00" y2="6.38" transform="rotate(12 5.00 5.38)"/>' +
              '<line x1="8.85" y1="6.31" x2="8.85" y2="8.31" transform="rotate(-10 8.85 7.31)"/>' +
              '<line x1="2.69" y1="6.69" x2="2.69" y2="8.69" transform="rotate(-7 2.69 7.69)"/>' +
              '<line x1="6.54" y1="7.08" x2="6.54" y2="9.08" transform="rotate(6 6.54 8.08)"/>' +
              '<line x1="4.62" y1="7.85" x2="4.62" y2="9.85" transform="rotate(-15 4.62 8.85)"/>' +
            '</g>'
            : '<g fill="none" stroke="#646F5B" stroke-width="0.45" stroke-linecap="round" stroke-linejoin="round">' +
              '<ellipse cx="2.5" cy="2.0" rx="1.40" ry="0.80" transform="rotate(20 2.5 2.0)"/>' +
              '<ellipse cx="7.5" cy="1.8" rx="0.70" ry="0.45" transform="rotate(-15 7.5 1.8)"/>' +
              '<ellipse cx="7.8" cy="5.5" rx="1.00" ry="0.65" transform="rotate(35 7.8 5.5)"/>' +
              '<ellipse cx="1.5" cy="7.0" rx="0.70" ry="0.50" transform="rotate(-20 1.5 7.0)"/>' +
              '<ellipse cx="5.0" cy="5.0" rx="1.50" ry="0.95" transform="rotate(10 5.0 5.0)"/>' +
              '<ellipse cx="3.8" cy="8.5" rx="0.70" ry="0.45" transform="rotate(40 3.8 8.5)"/>' +
              '<ellipse cx="8.2" cy="8.5" rx="0.90" ry="0.60" transform="rotate(-8 8.2 8.5)"/>' +
            '</g>') +
        '</pattern>' +
      '</defs>';
    }

    function parkingPadIcon(materialId) {
      const field =
        '<rect x="2" y="2" width="32" height="18" rx="1" fill="#E9DDCC" fill-opacity="0.30"/>' +
        '<rect x="2" y="2" width="32" height="18" rx="1" fill="url(#parking-pad-material-pat)"/>';
      const proposedBorder =
        '<g fill="none" stroke="#646F5B" stroke-width="1" stroke-linecap="butt">' +
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
        '<g fill="none" stroke="#646F5B" stroke-width="1" stroke-linecap="butt" stroke-linejoin="round">' +
          '<path d="M 5 2 H 3 Q 2 2 2 3 V 5"/>' +
          '<path d="M 31 2 H 33 Q 34 2 34 3 V 5"/>' +
          '<path d="M 34 17 V 19 Q 34 20 33 20 H 31"/>' +
          '<path d="M 5 20 H 3 Q 2 20 2 19 V 17"/>' +
        '</g>';
      return '<svg viewBox="0 0 36 22" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">' +
        parkingPadIconPattern(materialId) +
        '<g class="dm-existing">' +
          field +
          '<rect x="2" y="2" width="32" height="18" rx="1" fill="none" stroke="#646F5B" stroke-width="1"/>' +
        '</g>' +
        '<g class="dm-proposed" style="display:none">' + field + proposedBorder + '</g>' +
      '</svg>';
    }

    const tool = window.SitePlanRectangleTool.create({
      RT,
      toolId: TOOL_ID,
      buttonId: BUTTON_ID,
      checkboxId: CHECKBOX_ID,
      widthId: WIDTH_ID,
      lengthId: LENGTH_ID,
      category: CATEGORY,
      label: 'Parking Pad',
      order: 15,
      symbols,
      toolCapabilities: {
        reshape: true,
        resize: true,
        rotate: true,
        rotationSnapDegrees: 5,
        rotationGuideMode: 'delta',
        label: true,
        duplicate: true,
        delete: true
      },
      makeGeometry: makeFixedGeometry,
      defaultChecked: false,
      widthAriaLabel: 'Parking pad width in feet',
      lengthAriaLabel: 'Parking pad length in feet',
      toolTypeKey: 'polygon',
      sketchType: 'polygon',
      pendingKey: 'polygon',
      suppressLiveSideLabelsDuringManual: true,
      extraSettingsSignature: () => selectedMaterial,
      onAnnounce: () => AS.announceToolActivated(TOOL_ID),
      isOwnEvent: detail => detail.source === AS.source && detail.tool === TOOL_ID,
      applyExtraMetadata: applyParkingPadMetadata,
      onPlaceFixed: removeMeasurements,
      onGraphicCreated: removeMeasurements,
      onGraphicUpdated: removeMeasurements,
      onZoomRefresh: refreshParkingPadSymbols,
      logPrefix: '[tools-access/parking-pad]'
    });

    function refreshButtonIcon() {
      const button = buttonEl || document.getElementById(BUTTON_ID);
      const icon = button && button.querySelector('.tool-icon');
      if (!icon) return;
      if (typeof unregisterIcon === 'function') unregisterIcon();
      icon.innerHTML = parkingPadIcon(selectedMaterial);
      const svg = icon.querySelector('svg');
      if (svg && window.SitePlanDrawingMode) {
        unregisterIcon = window.SitePlanDrawingMode.registerIcon(svg, {
          category: CATEGORY,
          apply: window.SitePlanDrawingMode.iconSwapApply
        });
      }
    }

    function buildButton() {
      if (buttonEl) return buttonEl;
      buttonEl = document.createElement('button');
      buttonEl.type = 'button';
      buttonEl.id = BUTTON_ID;
      buttonEl.className = 'tool-btn draw-tool-btn icon-btn';
      buttonEl.title = 'Outline a parking pad area';
      buttonEl.innerHTML = '<span class="tool-icon icon-driveway">' + parkingPadIcon(selectedMaterial) + '</span>' +
        '<span class="tool-label">Parking Pad</span>';
      buttonEl.addEventListener('click', tool.start);
      refreshButtonIcon();
      return buttonEl;
    }

    function buildMaterialControls() {
      if (materialControlsEl) return materialControlsEl;
      materialControlsEl = document.createElement('div');
      materialControlsEl.className = 'size-row driveway-material-select-row';
      materialControlsEl.innerHTML =
        '<label for="' + MATERIAL_ID + '" class="size-lbl">Material</label>' +
        '<select id="' + MATERIAL_ID + '" class="dim-input driveway-material-select" aria-label="Parking pad material">' +
          materialOptionsHtml() +
        '</select>';
      return materialControlsEl;
    }

    const wireBaseControls = tool.wireControls;
    tool.wireControls = function wireControls() {
      wireBaseControls();
      if (controlsWired) return;
      const material = document.getElementById(MATERIAL_ID);
      if (material) {
        material.addEventListener('change', () => {
          selectedMaterial = material.value === 'gravel' ? 'gravel' : DEFAULT_MATERIAL_ID;
          refreshSelectedSymbols();
          refreshButtonIcon();
          tool.restartIfActive({ force: true });
        });
        material.addEventListener('keydown', event => event.stopPropagation());
      }
      controlsWired = true;
    };
    tool.buildButton = buildButton;
    tool.getElements = () => [buildButton(), buildMaterialControls(), tool.buildControls()].filter(Boolean);

    AS.registerTool(tool);
    window.startParkingPadTool = tool.start;
    window.SitePlanParkingPadTool = tool;
  }).catch(err => {
    console.error('[tools-access/parking-pad] Failed to initialize after runtime ready:', err);
  });
})();
