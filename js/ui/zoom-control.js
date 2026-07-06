// Custom zoom buttons so the app controls the glyphs instead of ArcGIS internals.

(function () {
  'use strict';

  const PLUS_ICON =
    '<svg class="site-map-control-icon" viewBox="0 0 16 16" aria-hidden="true">' +
      '<!-- Icon from Gravity UI Icons by YANDEX LLC - https://github.com/gravity-ui/icons/blob/main/LICENSE -->' +
      '<path fill="currentColor" fill-rule="evenodd" d="M8 1.75a.75.75 0 0 1 .75.75v4.75h4.75a.75.75 0 0 1 0 1.5H8.75v4.75a.75.75 0 0 1-1.5 0V8.75H2.5a.75.75 0 0 1 0-1.5h4.75V2.5A.75.75 0 0 1 8 1.75" clip-rule="evenodd"></path>' +
    '</svg>';

  const MINUS_ICON =
    '<svg class="site-map-control-icon" viewBox="0 0 16 16" aria-hidden="true">' +
      '<!-- Icon from Gravity UI Icons by YANDEX LLC - https://github.com/gravity-ui/icons/blob/main/LICENSE -->' +
      '<path fill="currentColor" fill-rule="evenodd" d="M1.75 8a.75.75 0 0 1 .75-.75h11a.75.75 0 0 1 0 1.5h-11A.75.75 0 0 1 1.75 8" clip-rule="evenodd"></path>' +
    '</svg>';

  function createButton(label, iconHtml, onClick) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'site-map-control-btn esri-widget--button esri-widget';
    button.title = label;
    button.setAttribute('aria-label', label);
    button.innerHTML = iconHtml;
    button.addEventListener('click', onClick);
    return button;
  }

  function create(options) {
    const view = options.view;
    const position = options.position || 'top-left';
    const group = document.createElement('div');
    group.className = 'site-zoom-control esri-component';
    const zoomIn = createButton('Zoom in', PLUS_ICON, () => {
      if (!view || typeof view.goTo !== 'function') return;
      view.goTo({ zoom: view.zoom + 1 }, { duration: 160 }).catch(() => {});
    });
    const zoomOut = createButton('Zoom out', MINUS_ICON, () => {
      if (!view || typeof view.goTo !== 'function') return;
      view.goTo({ zoom: view.zoom - 1 }, { duration: 160 }).catch(() => {});
    });
    group.appendChild(zoomIn);
    group.appendChild(zoomOut);
    view.ui.add(group, position);
    return {
      element: group,
      destroy() { view.ui.remove(group); }
    };
  }

  window.SitePlanZoomControl = { create };
})();
