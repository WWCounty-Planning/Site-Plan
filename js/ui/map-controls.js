// Map UI controls: basemap picker. (Attribution lives in js/ui/attributions.js.)
(function () {
  'use strict';

  window.SitePlanMapControls = {
    create
  };

  function create(options) {
    const map = options.map;
    const attributions = options.attributions || null;

    let activeBasemapId = options.activeBasemapId || 'gray-vector';

    function basemapThumbSvg(basemapId) {
      if (basemapId === 'satellite' || basemapId === 'hybrid') {
        return '<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><rect width="64" height="64" fill="#2d4a1e"/><rect x="0" y="0" width="32" height="32" fill="#3a5c28" opacity=".8"/><rect x="32" y="32" width="32" height="32" fill="#3a5c28" opacity=".8"/><path d="M0 40 Q16 30 32 38 Q48 46 64 36" fill="none" stroke="#5b8cd4" stroke-width="2" opacity=".7"/></svg>';
      }
      if (basemapId === 'topo-vector') {
        return '<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><rect width="64" height="64" fill="#f0ebe0"/><ellipse cx="32" cy="36" rx="26" ry="16" fill="none" stroke="#b8a882" stroke-width="1.5"/><ellipse cx="32" cy="36" rx="18" ry="10" fill="none" stroke="#b8a882" stroke-width="1.5"/><ellipse cx="32" cy="36" rx="10" ry="5" fill="none" stroke="#b8a882" stroke-width="1.5"/></svg>';
      }
      if (basemapId === 'gray-vector') {
        return '<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><rect width="64" height="64" fill="#f0ede7"/><line x1="0" y1="32" x2="64" y2="32" stroke="#ccc9c2" stroke-width="2.5"/><line x1="32" y1="0" x2="32" y2="64" stroke="#ccc9c2" stroke-width="1.5"/><line x1="0" y1="20" x2="64" y2="20" stroke="#ccc9c2" stroke-width="1"/><line x1="0" y1="48" x2="64" y2="48" stroke="#ccc9c2" stroke-width="1"/></svg>';
      }
      return '<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><rect width="64" height="64" fill="#e8e0d0"/><rect x="0" y="28" width="64" height="8" fill="#fff" opacity=".7"/><rect x="24" y="0" width="6" height="64" fill="#fff" opacity=".5"/><circle cx="32" cy="22" r="6" fill="#c0392b" opacity=".7"/></svg>';
    }

    function refreshBasemapButtons() {
      document.querySelectorAll('#basemap-panel .basemap-option').forEach(btn => btn.classList.remove('active'));
      const buttonMap = {
        'streets-vector': 'bm-option-streets',
        'topo-vector': 'bm-option-topo',
        'gray-vector': 'bm-option-gray',
        satellite: 'bm-option-imagery',
        hybrid: 'bm-option-imagery'
      };
      const activeBtn = document.getElementById(buttonMap[activeBasemapId]);
      if (activeBtn) activeBtn.classList.add('active');
      const thumb = document.getElementById('bm-current-thumb');
      const label = document.getElementById('bm-current-label');
      if (thumb) thumb.innerHTML = basemapThumbSvg(activeBasemapId);
      if (label) label.textContent = 'Basemap';
    }

    function isImageryBasemap(basemapId) {
      return basemapId === 'satellite' || basemapId === 'hybrid';
    }

    function getPrintBasemapId() {
      return isImageryBasemap(activeBasemapId) ? 'gray-vector' : activeBasemapId;
    }

    function isPrintBasemapSubstituted() {
      return getPrintBasemapId() !== activeBasemapId;
    }

    function switchBasemap(basemapId) {
      activeBasemapId = basemapId;
      map.basemap = basemapId;
      refreshBasemapButtons();
      toggleBasemapPanel(false);
      if (attributions) setTimeout(attributions.readNativeAttribution, 750);
    }

    function toggleBasemapPanel(open) {
      const control = document.getElementById('basemap-control');
      if (!control) return;
      const shouldOpen = open == null ? !control.classList.contains('expanded') : !!open;
      control.classList.toggle('expanded', shouldOpen);
      if (shouldOpen) document.getElementById('layer-control')?.classList.remove('expanded');
    }

    function installGlobals() {
      window.switchBasemap = switchBasemap;
      window.toggleBasemapPanel = toggleBasemapPanel;
    }

    installGlobals();

    return {
      refreshBasemapButtons,
      switchBasemap,
      toggleBasemapPanel,
      getPrintBasemapId,
      isPrintBasemapSubstituted,
      get activeBasemapId() {
        return activeBasemapId;
      }
    };
  }
})();
