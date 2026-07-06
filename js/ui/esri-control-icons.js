// Replaces ArcGIS-generated zoom/home button with different svg icons.

(function () {
  'use strict';

  const ICONS = {
    zoomIn:
      '<svg class="site-esri-control-svg" viewBox="0 0 16 16" aria-hidden="true">' +
        '<!-- Icon from Gravity UI Icons by YANDEX LLC - https://github.com/gravity-ui/icons/blob/main/LICENSE -->' +
        '<path fill="currentColor" fill-rule="evenodd" d="M8 1.75a.75.75 0 0 1 .75.75v4.75h4.75a.75.75 0 0 1 0 1.5H8.75v4.75a.75.75 0 0 1-1.5 0V8.75H2.5a.75.75 0 0 1 0-1.5h4.75V2.5A.75.75 0 0 1 8 1.75" clip-rule="evenodd"></path>' +
      '</svg>',
    zoomOut:
      '<svg class="site-esri-control-svg" viewBox="0 0 16 16" aria-hidden="true">' +
        '<!-- Icon from Gravity UI Icons by YANDEX LLC - https://github.com/gravity-ui/icons/blob/main/LICENSE -->' +
        '<path fill="currentColor" fill-rule="evenodd" d="M1.75 8a.75.75 0 0 1 .75-.75h11a.75.75 0 0 1 0 1.5h-11A.75.75 0 0 1 1.75 8" clip-rule="evenodd"></path>' +
      '</svg>',
    home:
      '<svg class="site-esri-control-svg site-esri-home-svg" viewBox="0 0 16 16" aria-hidden="true">' +
        '<!-- Icon from Gravity UI Icons by YANDEX LLC - https://github.com/gravity-ui/icons/blob/main/LICENSE -->' +
        '<path fill="currentColor" fill-rule="evenodd" d="M12.5 12.618c.307-.275.5-.674.5-1.118V6.977a1.5 1.5 0 0 0-.585-1.189l-3.5-2.692a1.5 1.5 0 0 0-1.83 0l-3.5 2.692A1.5 1.5 0 0 0 3 6.978V11.5A1.496 1.496 0 0 0 4.493 13H5V9.5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2V13h.507c.381-.002.73-.146.993-.382m2-1.118a3 3 0 0 1-3 3h-7a3 3 0 0 1-3-3V6.977A3 3 0 0 1 2.67 4.6l3.5-2.692a3 3 0 0 1 3.66 0l3.5 2.692a3 3 0 0 1 1.17 2.378zm-5-2A.5.5 0 0 0 9 9H7a.5.5 0 0 0-.5.5V13h3z" clip-rule="evenodd"></path>' +
      '</svg>'
  };

  function textFor(button) {
    return [
      button.getAttribute('aria-label'),
      button.getAttribute('title'),
      button.textContent
    ].filter(Boolean).join(' ').trim().toLowerCase();
  }

  function replaceIcon(button, key) {
    if (!button || button.getAttribute('data-site-icon') === key) return;
    button.innerHTML = ICONS[key];
    button.setAttribute('data-site-icon', key);
    button.classList.add('site-esri-control-icon-btn');
  }

  function apply(root) {
    const scope = root || document.getElementById('map-wrap') || document;
    const buttons = Array.from(scope.querySelectorAll('button'));
    buttons.forEach(button => {
      const text = textFor(button);
      if (text.indexOf('zoom in') !== -1) replaceIcon(button, 'zoomIn');
      else if (text.indexOf('zoom out') !== -1) replaceIcon(button, 'zoomOut');
      else if (text.indexOf('home') !== -1 || text.indexOf('default map view') !== -1) replaceIcon(button, 'home');
    });
  }

  function install(options) {
    const root = (options && options.root) || document.getElementById('map-wrap') || document.body;
    const run = () => apply(root);
    run();
    if (window.requestAnimationFrame) {
      window.requestAnimationFrame(run);
      window.requestAnimationFrame(() => window.requestAnimationFrame(run));
    }
    window.setTimeout(run, 250);
    window.setTimeout(run, 1000);

    const observer = new MutationObserver(run);
    observer.observe(root, { childList: true, subtree: true });
    return {
      apply: run,
      destroy() { observer.disconnect(); }
    };
  }

  window.SitePlanEsriControlIcons = { install, apply };
})();
