(function () {
  'use strict';

  function create(options) {
    const view = options.view;
    const position = options.position || 'top-left';

    let homeViewpoint = null;
    if (view && view.when) {
      view.when(() => {
        try { if (!homeViewpoint && view.viewpoint) homeViewpoint = view.viewpoint.clone(); } catch (err) {}
      }).catch(() => {});
    }

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'site-home-btn site-map-control-btn esri-widget--button esri-widget';
    button.title = 'Default map view';
    button.setAttribute('aria-label', 'Default map view');
    button.innerHTML =
      '<svg class="site-map-control-icon site-home-icon" viewBox="0 0 16 16" aria-hidden="true">' +
        '<!-- Icon from Gravity UI Icons by YANDEX LLC - https://github.com/gravity-ui/icons/blob/main/LICENSE -->' +
        '<path fill="currentColor" fill-rule="evenodd" d="M12.5 12.618c.307-.275.5-.674.5-1.118V6.977a1.5 1.5 0 0 0-.585-1.189l-3.5-2.692a1.5 1.5 0 0 0-1.83 0l-3.5 2.692A1.5 1.5 0 0 0 3 6.978V11.5A1.496 1.496 0 0 0 4.493 13H5V9.5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2V13h.507c.381-.002.73-.146.993-.382m2-1.118a3 3 0 0 1-3 3h-7a3 3 0 0 1-3-3V6.977A3 3 0 0 1 2.67 4.6l3.5-2.692a3 3 0 0 1 3.66 0l3.5 2.692a3 3 0 0 1 1.17 2.378zm-5-2A.5.5 0 0 0 9 9H7a.5.5 0 0 0-.5.5V13h3z" clip-rule="evenodd"></path>' +
      '</svg>';
    button.addEventListener('click', () => {
      const target = homeViewpoint || (view && view.viewpoint);
      if (view && target && typeof view.goTo === 'function') {
        view.goTo(target, { duration: 250 }).catch(() => {});
      }
    });
    view.ui.add(button, position);

    return {
      setViewpoint(nextViewpoint) {
        try {
          homeViewpoint = nextViewpoint && nextViewpoint.clone ? nextViewpoint.clone() : nextViewpoint;
        } catch (err) {}
      },
      destroy() {
        view.ui.remove(button);
      }
    };
  }

  window.SitePlanHomeButton = { create };
})();
