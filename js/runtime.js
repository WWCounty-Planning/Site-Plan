// Load order: config.js → ArcGIS API → runtime.js

(function () {
  const params = new URLSearchParams(window.location.search);
  const geoParam = (params.get('geo') || '').trim();
  let resolveRuntimeReady;
  window.SitePlanRuntimeReady = new Promise(resolve => {
    resolveRuntimeReady = resolve;
  });

  require([
    'esri/Map', 'esri/views/MapView',
    'esri/layers/FeatureLayer', 'esri/layers/GraphicsLayer',
    'esri/Graphic', 'esri/widgets/Home', 'esri/widgets/ScaleBar',
    'esri/widgets/Search', 'esri/widgets/Attribution', 'esri/widgets/Sketch', 'esri/geometry/geometryEngine', 'esri/Viewpoint'
  ], function (
    EsriMap, MapView,
    FeatureLayer, GraphicsLayer,
    Graphic, Home, ScaleBar,
    Search, Attribution, Sketch, geometryEngine, Viewpoint
  ) {
    const cfg = window.SitePlanConfig;
    if (!cfg || !cfg.layers || !cfg.layers.parcels) {
      return;
    }

    const pf = cfg.layers.parcels.popupFields || {};
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' });

    const agencyEl = document.getElementById('agency');
    agencyEl.innerHTML = '';
    const line1 = document.createElement('div'); line1.textContent = cfg.branding?.countyName || 'Walla Walla County';
    const line2 = document.createElement('div'); line2.textContent = cfg.branding?.agencyName || 'Community Development';
    agencyEl.appendChild(line1); agencyEl.appendChild(line2);
    document.getElementById('title').textContent = (cfg.branding?.toolTitle || 'Site Plan Builder') + ' - Generated - ' + dateStr;
    if (cfg.branding?.sealUrl) document.getElementById('seal-img').src = cfg.branding.sealUrl;

    let activeBasemapId = cfg.map?.basemap || 'gray-vector';

    const layers = window.SitePlanLayers.create({
      FeatureLayer,
      GraphicsLayer,
      cfg
    });
    const {
      parcelLayer,
      highlightLayer,
      drawingShadowLayer,
      drawLayer,
      labelLayer,
      measureLayer,
      previewLayer,
      referenceLayerGroups,
      mapLayers
    } = layers;

    const map = new EsriMap({
      basemap: activeBasemapId,
      layers: mapLayers
    });

    const view = new MapView({
      container:'viewDiv',
      map,
      center: cfg.map?.center || [-118.26, 46.14],
      zoom: 12,
      constraints:{ snapToZoom:false },
      ui:{ components:[] }
    });

    if (window.SitePlanZoomControl) window.SitePlanZoomControl.create({ view });
    const homeButton = window.SitePlanHomeButton.create({ Home, view });
    window.SitePlanScaleBar.create({ ScaleBar, view, unit: 'dual' });
    window.SitePlanNorthArrow.create({ view });
    if (window.SitePlanEsriControlIcons) {
      window.SitePlanEsriControlIcons.install({ root: document.getElementById('map-wrap') });
    }


    // ── Core editing / selection infrastructure ───────────────────────────
    const sketch = new Sketch({
      view,
      layer: drawLayer,
      updateOnGraphicClick: true,
      creationMode: 'update',
      defaultUpdateOptions: {
        tool: 'transform',
        enableRotation: true,
        enableScaling: true,
        preserveAspectRatio: false,
        toggleToolOnClick: false
      },
      snappingOptions: { enabled: true, selfEnabled: true, featureEnabled: true, featureSources: [] }
    });

    const measureSketch = new Sketch({
      view,
      layer: measureLayer,
      updateOnGraphicClick: false,
      creationMode: 'single',
      snappingOptions: { enabled: true, selfEnabled: true, featureEnabled: true, featureSources: [] }
    });

    let selectedEditMode = 'resize';
    let userPreferredEditMode = 'resize';
    let selectedGraphic = null;
    let sitePlanGraphicCounter = 1;
    let preferredEditRestartInProgress = false;

    function assignGraphicId(graphic) {
      if (graphic && !graphic.__sitePlanId) graphic.__sitePlanId = 'spg-' + (sitePlanGraphicCounter++);
      return graphic;
    }

    // opt out of controls such as label, rotate, or resize without hard-coding, etc
    const DEFAULT_GRAPHIC_CAPABILITIES = {
      reshape: true,
      resize: true,
      rotate: true,
      label: true,
      duplicate: true,
      delete: true,
      toolbar: true
    };

    function normalizeCapabilities(capabilities) {
      const out = {};
      if (!capabilities || typeof capabilities !== 'object') return out;
      Object.keys(DEFAULT_GRAPHIC_CAPABILITIES).forEach(key => {
        if (capabilities[key] === true || capabilities[key] === false) out[key] = capabilities[key];
      });
      const rotationSnapDegrees = Number(capabilities.rotationSnapDegrees);
      if (Number.isFinite(rotationSnapDegrees) && rotationSnapDegrees > 0) {
        out.rotationSnapDegrees = rotationSnapDegrees;
      }
      if (capabilities.rotationGuideMode === 'delta' || capabilities.rotationGuideMode === 'edge') {
        out.rotationGuideMode = capabilities.rotationGuideMode;
      }
      return out;
    }

    function getGraphicCapabilities(graphic) {
      const attrs = graphic && graphic.attributes ? graphic.attributes : {};
      const attrCaps = normalizeCapabilities(attrs.toolCapabilities);
      const propCaps = normalizeCapabilities(graphic && graphic.__toolCapabilities);
      const caps = Object.assign({}, DEFAULT_GRAPHIC_CAPABILITIES, attrCaps, propCaps);

      if (graphic && (graphic.__allowResize === false || attrs.allowResize === false)) caps.resize = false;
      if (graphic && (graphic.__allowLabel === false || attrs.allowLabel === false)) caps.label = false;
      return caps;
    }

    function setGraphicCapabilities(graphic, capabilities) {
      if (!graphic) return graphic;
      const caps = normalizeCapabilities(capabilities);
      graphic.__toolCapabilities = Object.assign({}, graphic.__toolCapabilities || {}, caps);
      graphic.attributes = Object.assign({}, graphic.attributes || {}, {
        toolCapabilities: Object.assign({}, (graphic.attributes || {}).toolCapabilities || {}, caps)
      });

      if (caps.resize === false) {
        graphic.__allowResize = false;
        graphic.attributes.allowResize = false;
      }
      if (caps.label === false) {
        graphic.__allowLabel = false;
        graphic.attributes.allowLabel = false;
      }
      if (caps.reshape === true && caps.resize === false) {
        graphic.__preferredEditMode = 'reshape';
        graphic.attributes.preferredEditMode = 'reshape';
      }
      return graphic;
    }

    function refreshSnapSources() {
      const sources = [
        { layer: drawLayer, enabled: true },
        { layer: parcelLayer, enabled: true },
        { layer: highlightLayer, enabled: true }
      ];
      sketch.snappingOptions.featureSources = sources;
      measureSketch.snappingOptions.featureSources = sources;
    }
    refreshSnapSources();

    function updateEditModeButtons() {
      const reshape = document.getElementById('edit-mode-reshape');
      const resize = document.getElementById('edit-mode-resize');
      const caps = selectedGraphic ? getGraphicCapabilities(selectedGraphic) : DEFAULT_GRAPHIC_CAPABILITIES;
      if (reshape) {
        const disabled = !!selectedGraphic && caps.reshape === false;
        reshape.disabled = disabled;
        reshape.classList.toggle('disabled', disabled);
        reshape.classList.toggle('active', !disabled && selectedEditMode === 'reshape');
        reshape.setAttribute('aria-pressed', !disabled && selectedEditMode === 'reshape' ? 'true' : 'false');
      }
      if (resize) {
        const disabled = !!selectedGraphic && caps.resize === false && caps.rotate === false;
        resize.disabled = disabled;
        resize.classList.toggle('disabled', disabled);
        resize.classList.toggle('active', !disabled && selectedEditMode === 'resize');
        resize.setAttribute('aria-pressed', !disabled && selectedEditMode === 'resize' ? 'true' : 'false');
      }
    }

    function isSelectableGraphic(graphic) {
      // A selection proxy, such as the invisible well hit area, is clickable
      // but must never become the editable/duplicable/deletable object.
      return !!(graphic &&
        graphic.layer === drawLayer &&
        !graphic.__nonSelectable &&
        !parentSelectIdForGraphic(graphic)
      );
    }

    function graphicsInLayer(layer) {
      if (!layer || !layer.graphics) return [];
      if (typeof layer.graphics.toArray === 'function') return layer.graphics.toArray();
      if (Array.isArray(layer.graphics.items)) return layer.graphics.items.slice();
      return [];
    }

    function findSelectableGraphicBySitePlanId(sitePlanId) {
      if (!sitePlanId) return null;
      return graphicsInLayer(drawLayer).find(g => {
        const attrs = g && g.attributes ? g.attributes : {};
        const id = g && (g.__sitePlanId || attrs.sitePlanId);
        return id === sitePlanId && isSelectableGraphic(g);
      }) || null;
    }

    function parentSelectIdForGraphic(graphic) {
      const attrs = graphic && graphic.attributes ? graphic.attributes : {};
      return graphic && (graphic.__selectParentId || attrs.selectParentId || attrs.parentSitePlanId || null);
    }

    function linkedSupportIdsForGraphic(graphic) {
      const attrs = graphic && graphic.attributes ? graphic.attributes : {};
      return [
        graphic && graphic.__sitePlanId,
        attrs.sitePlanId
      ].filter(Boolean);
    }

    function supportParentIdForGraphic(graphic) {
      const attrs = graphic && graphic.attributes ? graphic.attributes : {};
      return graphic && (
        graphic.__supportFor ||
        attrs.supportFor ||
        attrs.parentSitePlanId ||
        attrs.selectParentId ||
        null
      );
    }

    function removeLinkedSupportGraphics(graphic) {
      const ids = linkedSupportIdsForGraphic(graphic);
      if (!ids.length) return;
      const layers = [drawingShadowLayer, drawLayer, labelLayer, previewLayer].filter(
        (layer, idx, arr) => layer && arr.indexOf(layer) === idx
      );
      layers.forEach(layer => {
        const linked = graphicsInLayer(layer).filter(candidate => {
          const parentId = supportParentIdForGraphic(candidate);
          return parentId && ids.indexOf(parentId) !== -1;
        });
        if (!linked.length) return;
        if (typeof layer.removeMany === 'function') layer.removeMany(linked);
        else linked.forEach(candidate => layer.remove(candidate));
      });
    }

    function scheduleLinkedSupportCleanup(graphic) {
      if (!graphic) return;
      const cleanup = () => removeLinkedSupportGraphics(graphic);
      if (window.requestAnimationFrame) {
        window.requestAnimationFrame(() => {
          cleanup();
          window.requestAnimationFrame(cleanup);
        });
      }
      window.setTimeout(cleanup, 80);
    }

    function selectionTargetForGraphic(graphic) {
      const parentId = parentSelectIdForGraphic(graphic);
      if (!parentId) return graphic;
      const parent = findSelectableGraphicBySitePlanId(parentId);
      return parent || null;
    }

    function getGraphicAnchorPoint(graphic) {
      if (!graphic || !graphic.geometry) return null;
      if (graphic.geometry.type === 'point') return graphic.geometry;
      return graphic.geometry.extent ? graphic.geometry.extent.center : null;
    }

    const objectLabels = window.SitePlanObjectLabels.create({
      Graphic,
      labelLayer,
      assignGraphicId,
      getGraphicAnchorPoint,
      fireGraphicUpdated
    });
    const labelForGraphic = objectLabels.labelForGraphic;
    const removeLabelForGraphic = objectLabels.removeLabelForGraphic;
    const rawObjectLabelText = objectLabels.rawObjectLabelText;
    const isSymbolTextEditable = objectLabels.isSymbolTextEditable;
    const textEditorMaxLength = objectLabels.textEditorMaxLength;
    const editorRawText = objectLabels.editorRawText;
    const updateSymbolText = objectLabels.updateSymbolText;
    const createOrUpdateObjectLabel = objectLabels.createOrUpdateObjectLabel;

    function emitSelectionChanged(graphic) {
      try {
        window.dispatchEvent(new CustomEvent('siteplan:selection-changed', {
          detail: { graphic: graphic || null }
        }));
      } catch (err) {}
    }

    let selectionToolbar = null;
    function positionSelectionToolbar() {
      if (!selectionToolbar) return;
      selectionToolbar.position(selectedGraphic);
    }

    function showSelectionToolbar(graphic) {
      selectedGraphic = graphic || selectedGraphic;
      if (!selectedGraphic || !selectionToolbar) return;
      selectionToolbar.show(selectedGraphic);
      updateSelectedShapeBox();
      emitSelectionChanged(selectedGraphic);
    }

    function hideSelectionToolbar() {
      if (selectionToolbar) selectionToolbar.hide();
      selectedGraphic = null;
      updateSelectedShapeBox();
      emitSelectionChanged(null);
    }

    function selectedShapeBoxEl() { return document.getElementById('selected-shape-box'); }

    function updateSelectedShapeBox() {
      const box = selectedShapeBoxEl();
      if (!box) return;
      const g = selectedGraphic;
      const show = !!(g && g.geometry && g.geometry.type === 'polygon');
      if (!show) {
        box.classList.remove('visible');
        box.setAttribute('aria-hidden', 'true');
        return;
      }
      const sqFt = geometryAreaSqFt(g.geometry);
      const valueEl = document.getElementById('ssb-value');
      if (valueEl) {
        if (!Number.isFinite(sqFt) || sqFt <= 0) {
          valueEl.textContent = '—';
        } else {
          valueEl.textContent = numberWithCommas(sqFt, 0) + ' sq ft / ' +
                                numberWithCommas(sqFt / 43560, 2) + ' ac';
        }
      }
      box.classList.add('visible');
      box.setAttribute('aria-hidden', 'false');
    }

    function preferredEditModeForGraphic(graphic, requestedMode) {
      const mode = requestedMode === 'resize' ? 'resize' : 'reshape';
      const type = graphic && graphic.geometry && graphic.geometry.type;
      const supportsReshape = !type || type === 'polygon' || type === 'polyline';
      const attrs = graphic && graphic.attributes ? graphic.attributes : {};
      const preferred = graphic && (graphic.__preferredEditMode || attrs.preferredEditMode);
      const caps = getGraphicCapabilities(graphic);

      if (preferred === 'move' && type === 'point') return 'move';

      if (preferred === 'transform' || preferred === 'rotate') return 'resize';

      if (caps.reshape === false && caps.resize === false && caps.rotate !== false) return 'resize';

      if (supportsReshape && preferred === 'reshape' && caps.reshape !== false && caps.resize === false) return 'reshape';
      if (supportsReshape && mode === 'resize' && caps.resize === false && caps.reshape !== false) return 'reshape';
      if (supportsReshape && mode === 'reshape' && caps.reshape === false && caps.resize !== false) return 'resize';
      return mode;
    }

    function sketchUpdateOptionsForGraphic(graphic) {
      const type = graphic && graphic.geometry && graphic.geometry.type;
      const effectiveMode = preferredEditModeForGraphic(graphic, selectedEditMode);
      const caps = getGraphicCapabilities(graphic);
      if (effectiveMode === 'move') {
        return { tool: 'move', toggleToolOnClick: false };
      }
      const useReshape = effectiveMode === 'reshape' && (!type || type === 'polygon' || type === 'polyline');
      return useReshape
        ? { tool: 'reshape', toggleToolOnClick: false }
        : {
            tool: 'transform',
            enableRotation: caps.rotate !== false,
            enableScaling: caps.resize !== false,
            preserveAspectRatio: false,
            toggleToolOnClick: false
          };
    }

    function syncSketchDefaultUpdateOptions(graphic) {
      try {
        sketch.defaultUpdateOptions = sketchUpdateOptionsForGraphic(graphic || selectedGraphic);
      } catch (err) {}
    }

    function startSketchUpdate(graphic) {
      if (!graphic || !graphic.geometry) return;
      assignGraphicId(graphic);
      const options = sketchUpdateOptionsForGraphic(graphic);
      syncSketchDefaultUpdateOptions(graphic);
      try { sketch.update([graphic], options); }
      catch (err) { console.warn('Unable to start edit session for selected graphic.', err); }
    }

    function shouldRestartUpdateForPreferredMode(graphic, event) {
      if (!graphic || !graphic.geometry || preferredEditRestartInProgress) return false;
      if (!event || event.state !== 'start') return false;

      const effectiveMode = preferredEditModeForGraphic(graphic, selectedEditMode);
      const attrs = graphic && graphic.attributes ? graphic.attributes : {};
      const preferred = graphic && (graphic.__preferredEditMode || attrs.preferredEditMode);
      const caps = getGraphicCapabilities(graphic);
      const requiresTransform = preferred === 'transform' ||
        preferred === 'rotate' ||
        (caps.reshape === false && effectiveMode === 'resize');
      if (effectiveMode === selectedEditMode) {
        // exposes the active tool and it is not the graphic's required mode
        if (requiresTransform && caps.resize === false) return true;
        const tool = String(event.tool || '').toLowerCase();
        if (effectiveMode === 'reshape') return !!(tool && tool !== 'reshape');
        if (effectiveMode === 'move') return !!(tool && tool !== 'move');
        if (requiresTransform) return !!(tool && tool !== 'transform');
        return false;
      }
      return effectiveMode === 'reshape' || effectiveMode === 'move' || requiresTransform;
    }

    function restartUpdateWithPreferredMode(graphic) {
      if (!graphic || !graphic.geometry || preferredEditRestartInProgress) return;
      preferredEditRestartInProgress = true;
      selectedGraphic = assignGraphicId(graphic);
      const preferredMode = preferredEditModeForGraphic(selectedGraphic, userPreferredEditMode);
      if (preferredMode !== 'move') selectedEditMode = preferredMode;
      updateEditModeButtons();
      showSelectionToolbar(selectedGraphic);
      syncSketchDefaultUpdateOptions(selectedGraphic);

      const finish = () => {
        try { if (sketch && sketch.state !== 'idle') sketch.cancel(); } catch (err) {}
        startSketchUpdate(selectedGraphic);
        window.setTimeout(() => { preferredEditRestartInProgress = false; }, 80);
      };

      if (window.requestAnimationFrame) window.requestAnimationFrame(finish);
      else window.setTimeout(finish, 0);
    }

    function selectGraphic(graphic) {
      const target = selectionTargetForGraphic(graphic);
      if (!isSelectableGraphic(target)) return false;
      selectedGraphic = assignGraphicId(target);
      const effectiveMode = preferredEditModeForGraphic(selectedGraphic, userPreferredEditMode);
      if (effectiveMode !== 'move') selectedEditMode = effectiveMode;
      updateEditModeButtons();
      startSketchUpdate(selectedGraphic);
      showSelectionToolbar(selectedGraphic);
      return true;
    }

    function clearSelection() {
      try { if (sketch && sketch.state !== 'idle') sketch.cancel(); } catch (err) {}
      hideSelectionToolbar();
      selectedEditMode = userPreferredEditMode;
      updateEditModeButtons();
    }

    window.setEditMode = function (mode) {
      const requested = mode === 'resize' ? 'resize' : 'reshape';
      if (selectedGraphic) {
        const caps = getGraphicCapabilities(selectedGraphic);
        if (requested === 'resize' && caps.resize === false && caps.rotate === false) return;
        if (requested === 'reshape' && caps.reshape === false) return;
      }
      selectedEditMode = requested;
      userPreferredEditMode = requested; // remember the user's explicit choice
      if (selectedGraphic) selectedEditMode = preferredEditModeForGraphic(selectedGraphic, selectedEditMode);
      updateEditModeButtons();
      syncSketchDefaultUpdateOptions(selectedGraphic);
      if (selectedGraphic) startSketchUpdate(selectedGraphic);
    };

    window.toggleSnapping = function (enabled) {
      const isEnabled = !!enabled;
      sketch.snappingOptions.enabled = isEnabled;
      sketch.snappingOptions.selfEnabled = isEnabled;
      sketch.snappingOptions.featureEnabled = isEnabled;
      measureSketch.snappingOptions.enabled = isEnabled;
      measureSketch.snappingOptions.selfEnabled = isEnabled;
      measureSketch.snappingOptions.featureEnabled = isEnabled;
      refreshSnapSources();
    };


    window.deleteSelected = function () {
      if (!selectedGraphic || getGraphicCapabilities(selectedGraphic).delete === false) return;
      const g = selectedGraphic;
      // Suppress side-label recreation during teardown
      g.__skipEdgeLabels = true;
      g.__skipSideLabels = true;
      try { if (sketch && sketch.state !== 'idle') sketch.cancel(); } catch (err) {}
      removeLabelForGraphic(g);
      removeSideLabelsForGraphic(g);
      removeLinkedSupportGraphics(g);
      drawLayer.remove(g);
      fireGraphicDeleted(g);
      removeLinkedSupportGraphics(g);
      scheduleLinkedSupportCleanup(g);
      clearSelection();
    };

    function sketchCreateToolIsActive() {
      return !!window.__sitePlanPendingToolType;
    }

    view.on('click', event => {
      if (measureSketch && measureSketch.state === 'active') return;

      const sketchIsActive = !!(sketch && sketch.state === 'active');
      if (sketchIsActive && sketchCreateToolIsActive()) return;
      if (sketchIsActive && !selectedGraphic) return;

      view.hitTest(event).then(response => {
        const results = response.results || [];
        const parentHit = results.find(r => r.graphic && parentSelectIdForGraphic(r.graphic));
        if (parentHit) {
          if (selectGraphic(parentHit.graphic)) return;
        }
        const selectHit = results.find(r =>
          r.graphic && r.graphic.layer === drawLayer && isSelectableGraphic(r.graphic)
        );
        if (selectHit) {
          if (selectHit.graphic !== selectedGraphic) selectGraphic(selectHit.graphic);
          return;
        }
        const hitProtected = results.some(r =>
          r.graphic && (
            r.graphic.layer === labelLayer ||
            r.graphic.layer === measureLayer ||
            r.graphic.layer === previewLayer ||
            (r.graphic.layer === drawLayer && r.graphic.__nonSelectable)
          )
        );
        if (selectedGraphic && !hitProtected) clearSelection();
      }).catch(() => {});
    });

    view.watch('stationary', () => positionSelectionToolbar());
    view.watch('extent', () => positionSelectionToolbar());
    view.watch('rotation', () => positionSelectionToolbar());

    sketch.on('update', event => {
      const g = event.graphics && event.graphics[0];
      if (g && isSelectableGraphic(g)) {
        if (shouldRestartUpdateForPreferredMode(g, event)) {
          restartUpdateWithPreferredMode(g);
          return;
        }
        if (event.state === 'start') rememberRectangleUpdateStart(g);
        if (event.state === 'start') rotationGuides.beginUpdate(g);
        selectedGraphic = g;
        if (g.__labelText || g.__labelRawText) createOrUpdateObjectLabel(g, rawObjectLabelText(g));
        if (g.geometry && g.geometry.type === 'polygon') {
          if (shouldDisableFixedSizeLabelsFromUpdate(event, g)) disableFixedSizeLabels(g);
          if (shouldMarkRectangleAllSidesFromUpdate(event, g)) markRectangleAllSideLabels(g);
          refreshSideLabelsForGraphic(g);
        }
        updateSelectedShapeBox();
        showSelectionToolbar(g);
        fireGraphicUpdated(g, event);
        if (event.state === 'active') rotationGuides.updateDuringSketch(g, event);
        if (event.state === 'complete') rotationGuides.completeUpdate(g, event);
        if (event.state === 'complete' || event.state === 'cancel') clearRectangleUpdateStart(g);
      }
      if (event.state === 'complete' || event.state === 'cancel') {
        if (event.state === 'cancel') rotationGuides.cancelUpdate();
        if (selectedGraphic) showSelectionToolbar(selectedGraphic);
      }
    });

    sketch.on('create', event => {
      if (event.state === 'start') {
        clearLiveSideLabels();
        measurementUtils.beginLiveSideLabelPreview(window.__sitePlanPendingToolType || null);
        return;
      }
      if (event.state === 'active') {
        if (event.graphic && event.graphic.geometry) {
          refreshLiveSideLabels(event.graphic.geometry);
        }
        return;
      }
      if (event.state === 'cancel') {
        clearLiveSideLabels();
        return;
      }
      if (event.state !== 'complete') return;
      clearLiveSideLabels();
      const g = event.graphic;
      if (!g) return;
      assignGraphicId(g);
      refreshSnapSources();
      fireGraphicCreated(g);
      if (g.geometry && g.geometry.type === 'polygon') {
        refreshSideLabelsForGraphic(g);
      }
      const selectAfterCreate = () => {
        if (isSelectableGraphic(g)) selectGraphic(g);
      };
      if (window.requestAnimationFrame) window.requestAnimationFrame(selectAfterCreate);
      else setTimeout(selectAfterCreate, 0);
    });

    updateEditModeButtons();
    syncSketchDefaultUpdateOptions(selectedGraphic);

    const measurementUtils = window.SitePlanMeasurementUtils.create({
      Graphic,
      geometryEngine,
      labelLayer,
      measureLayer,
      previewLayer,
      assignGraphicId,
      getSelectedEditMode: () => selectedEditMode
    });

    const measureLineSymbol = measurementUtils.measureLineSymbol;
    const measureFillSymbol = measurementUtils.measureFillSymbol;
    const numberWithCommas = measurementUtils.numberWithCommas;
    const geometryAreaSqFt = measurementUtils.geometryAreaSqFt;
    const formatDistance = measurementUtils.formatDistance;
    const formatArea = measurementUtils.formatArea;
    const measurementTextForGeometry = measurementUtils.measurementTextForGeometry;
    const measureLabelAnchor = measurementUtils.measureLabelAnchor;
    const assignMeasureId = measurementUtils.assignMeasureId;
    const createMeasureLabel = measurementUtils.createMeasureLabel;
    const createOrUpdateMeasureLabelForGraphic = measurementUtils.createOrUpdateMeasureLabelForGraphic;
    const removeMeasureLabelForGraphic = measurementUtils.removeMeasureLabelForGraphic;
    const rememberRectangleUpdateStart = measurementUtils.rememberRectangleUpdateStart;
    const clearRectangleUpdateStart = measurementUtils.clearRectangleUpdateStart;
    const shouldDisableFixedSizeLabelsFromUpdate = measurementUtils.shouldDisableFixedSizeLabelsFromUpdate;
    const disableFixedSizeLabels = measurementUtils.disableFixedSizeLabels;
    const shouldMarkRectangleAllSidesFromUpdate = measurementUtils.shouldMarkRectangleAllSidesFromUpdate;
    const markRectangleAllSideLabels = measurementUtils.markRectangleAllSideLabels;
    const refreshSideLabelsForGraphic = measurementUtils.refreshSideLabelsForGraphic;
    const removeSideLabelsForGraphic = measurementUtils.removeSideLabelsForGraphic;
    const refreshLiveSideLabels = measurementUtils.refreshLiveSideLabels;
    const clearLiveSideLabels = measurementUtils.clearLiveSideLabels;
    const updateLiveMeasurePreview = measurementUtils.updateLiveMeasurePreview;
    const clearLiveMeasurePreview = measurementUtils.clearLiveMeasurePreview;

    selectionToolbar = window.SitePlanSelectionToolbar.create({
      view,
      getGraphicAnchorPoint,
      getGraphicCapabilities,
      defaultGraphicCapabilities: DEFAULT_GRAPHIC_CAPABILITIES,
      updateEditModeButtons
    });

    const labelEditorUi = window.SitePlanLabelEditor.create({
      getSelectedGraphic:        () => selectedGraphic,
      getSelectionToolbar:       () => selectionToolbar,
      getGraphicCapabilities,
      positionSelectionToolbar,
      isSymbolTextEditable,
      textEditorMaxLength,
      editorRawText,
      updateSymbolText,
      removeLabelForGraphic,
      createOrUpdateObjectLabel
    });
    window.openLabelEditor = labelEditorUi.openLabelEditor;

    const duplicateAction = window.SitePlanDuplicate.create({
      Graphic,
      view,
      drawLayer,
      assignGraphicId,
      isSelectableGraphic,
      getGraphicCapabilities,
      getSelectedGraphic: () => selectedGraphic,
      rawObjectLabelText,
      createOrUpdateObjectLabel,
      selectGraphic,
      refreshSnapSources,
      fireGraphicCreated,
      refreshSideLabelsForGraphic
    });
    window.duplicateSelectedGraphic = duplicateAction.duplicateSelectedGraphic;

    const rotateAction = window.SitePlanRotate.create({
      getSelectedGraphic: () => selectedGraphic,
      getGraphicCapabilities,
      createOrUpdateObjectLabel,
      rawObjectLabelText,
      refreshSideLabelsForGraphic,
      updateSelectedShapeBox,
      fireGraphicUpdated,
      startSketchUpdate,
      positionSelectionToolbar
    });
    window.rotateSelectedBy = rotateAction.rotateSelectedBy;

    const rotationGuides = window.SitePlanRotationGuides.create({
      Graphic,
      previewLayer,
      getGraphicCapabilities,
      preferredEditModeForGraphic,
      getSelectedEditMode: () => selectedEditMode,
      getSelectedGraphic: () => selectedGraphic,
      rotateGraphicGeometry: rotateAction.rotateGraphicGeometry,
      createOrUpdateObjectLabel,
      rawObjectLabelText,
      refreshSideLabelsForGraphic,
      updateSelectedShapeBox,
      fireGraphicUpdated,
      startSketchUpdate,
      showSelectionToolbar,
      positionSelectionToolbar
    });

    const measureControl = window.SitePlanMeasurementControl.create({
      measureSketch,
      measureLayer,
      previewLayer,
      view,
      clearSelection,
      cancelMainSketch: () => { try { if (sketch && sketch.state !== 'idle') sketch.cancel(); } catch (err) {} },
      measurementUtils
    });

    const attributions = window.SitePlanAttributions.create({
      Attribution,
      view,
      mapWrap: document.getElementById('map-wrap'),
      referenceLayerGroups,
      countyName: cfg.branding?.countyName
    });

    window.SitePlanLayersPanel.create({
      referenceLayerGroups,
      onVisibilityChanged: () => {
        attributions.updateAttribution();
      }
    });

    const mapControls = window.SitePlanMapControls.create({
      map,
      activeBasemapId,
      attributions
    });

    const parcelInfoUi = window.SitePlanParcelInfo.create({
      pf, Graphic, view, parcelLayer, geoParam,
      highlightLayer, homeButton, Viewpoint
    });

    const parcelSearchUi = window.SitePlanSearch.create({
      Search,
      view,
      parcelLayer,
      pf,
      setActiveParcel: parcelInfoUi.setActiveParcel,
      fetchFeatureInViewSpatialReference: parcelInfoUi.fetchFeatureInViewSpatialReference
    });

    window.printPlan = function () {
      alert('Print / Save PDF placeholder. The print workflow has not been built yet.');
    };

    function performClearAll() {
      try { if (sketch && sketch.state !== 'idle') sketch.cancel(); } catch (err) {}
      try { if (measureSketch && measureSketch.state !== 'idle') measureSketch.cancel(); } catch (err) {}
      drawLayer.graphics.toArray().forEach(fireGraphicDeleted);
      drawingShadowLayer.removeAll();
      drawLayer.removeAll();
      labelLayer.removeAll();
      measureControl.clearTemporaryMeasurements();
      previewLayer.removeAll();
      measurementUtils.clearSideLabelMap();
      hideSelectionToolbar();
    }

    const clearDrawingsUi = window.SitePlanClearDrawings.create({
      modalId: 'clear-modal',
      onConfirm: performClearAll
    });
    window.clearAll = clearDrawingsUi.open;  // opens the clear-all confirm modal
    window.closeClearAllModal = clearDrawingsUi.close;
    window.confirmClearAllModal = clearDrawingsUi.confirm;

    const graphicCreatedCallbacks = [];
    const graphicUpdatedCallbacks = [];
    const graphicDeletedCallbacks = [];

    function fireGraphicCreated(graphic) {
      if (!graphic) return;
      graphicCreatedCallbacks.forEach(cb => {
        try { cb(graphic); }
        catch (err) { console.error('onGraphicCreated callback failed:', err); }
      });
    }

    function fireGraphicUpdated(graphic, sketchEvent) {
      if (!graphic) return;
      graphicUpdatedCallbacks.forEach(cb => {
        try { cb(graphic, sketchEvent); }
        catch (err) { console.error('onGraphicUpdated callback failed:', err); }
      });
    }

    function fireGraphicDeleted(graphic) {
      if (!graphic) return;
      graphicDeletedCallbacks.forEach(cb => {
        try { cb(graphic); }
        catch (err) { console.error('onGraphicDeleted callback failed:', err); }
      });
    }

    window.SitePlanRuntime = {
      map,
      view,
      basemapControls: mapControls,
      Graphic,
      geometryEngine,
      GraphicsLayer,
      parcelLayer,
      highlightLayer,
      drawingShadowLayer,
      drawLayer,
      labelLayer,
      measureLayer,
      previewLayer,
      sketch,
      get activeParcelGeometry() { return parcelInfoUi.activeParcelGeometry; },
      get activeParcelAttributes() { return parcelInfoUi.activeParcelAttributes; },
      clearDrawings: performClearAll,
      clearTemporaryMeasurements: measureControl.clearTemporaryMeasurements,
      clearSelection,
      selectGraphic,
      refreshSnapSources,
      getGraphicCapabilities,
      setGraphicCapabilities,
      isSymbolTextEditable,
      updateSymbolText,
      refreshSideLabelsForGraphic,
      removeSideLabelsForGraphic,
      onGraphicCreated(callback) {
        if (typeof callback === 'function') graphicCreatedCallbacks.push(callback);
      },
      onGraphicUpdated(callback) {
        if (typeof callback === 'function') graphicUpdatedCallbacks.push(callback);
      },
      onGraphicDeleted(callback) {
        if (typeof callback === 'function') graphicDeletedCallbacks.push(callback);
      },
      measurements: {
        formatDistance,
        formatArea,
        measurementTextForGeometry,
        measureLabelAnchor,
        createMeasureLabel,
        createOrUpdateMeasureLabelForGraphic,
        removeMeasureLabelForGraphic,
        clearTemporaryMeasurements: measureControl.clearTemporaryMeasurements,
        clearLiveMeasurePreview
      },
      registerDrawableGraphic(graphic) {
        if (!graphic) return null;
        assignGraphicId(graphic);
        drawLayer.add(graphic);
        refreshSnapSources();
        fireGraphicCreated(graphic);
        return graphic;
      }
    };

    resolveRuntimeReady(window.SitePlanRuntime);
    window.dispatchEvent(new CustomEvent('siteplan:ready', {
      detail: window.SitePlanRuntime
    }));

    mapControls.refreshBasemapButtons();
    attributions.updateAttribution();

    Promise.all([view.when(), parcelLayer.when()]).then(() => {
      parcelSearchUi.initParcelSearch();
      return parcelInfoUi.setCountyHomeExtent();
    }).then(() => {
      if (geoParam) return parcelInfoUi.loadParcelByGeo(geoParam);
    }).catch(err => {
      console.error(err);
    }).finally(() => {
      document.getElementById('loading')?.classList.add('hidden');
      setTimeout(attributions.readNativeAttribution, 1200);
    });
  });
})();
