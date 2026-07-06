// Reference layer panel behavior. (Layer credits live in js/ui/attributions.js.)
(function () {
  'use strict';

  window.SitePlanLayersPanel = {
    create
  };

  function create(options) {
    const referenceLayerGroups = options.referenceLayerGroups || {};
    const onVisibilityChanged = typeof options.onVisibilityChanged === 'function'
      ? options.onVisibilityChanged
      : function () {};

    function toggleLayerPanel(open) {
      const control = document.getElementById('layer-control');
      if (!control) return;
      const shouldOpen = open == null ? !control.classList.contains('expanded') : !!open;
      control.classList.toggle('expanded', shouldOpen);
      if (shouldOpen) document.getElementById('basemap-control')?.classList.remove('expanded');
    }

    function toggleMapLayer(layerName, visible) {
      const group = referenceLayerGroups[layerName];
      if (!group) return;
      group.forEach(layer => {
        layer.visible = !!visible;
      });
      onVisibilityChanged(layerName, !!visible);
    }

    function installGlobals() {
      window.toggleLayerPanel = toggleLayerPanel;
      window.toggleMapLayer = toggleMapLayer;
    }

    installGlobals();

    return {
      toggleLayerPanel,
      toggleMapLayer
    };
  }
})();
