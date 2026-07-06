(function () {
  'use strict';

  function create(options) {
    const view = options.view;
    const position = options.position || 'top-left';

    const northButton = document.createElement('button');
    northButton.type = 'button';
    northButton.className = 'north-reset-btn esri-widget--button esri-widget';
    northButton.title = 'Reset map rotation to north';
    northButton.setAttribute('aria-label', 'Reset map rotation to north');
    northButton.innerHTML = '<svg class="north-reset-icon" viewBox="0 0 100 100" aria-hidden="true">' +
      '<!-- Icon from Font-GIS by Jean-Marc Viglino - https://github.com/Viglino/font-gis/blob/main/LICENSE-CC-BY.md -->' +
      '<path fill="currentColor" d="M50.03 5a2.52 2.52 0 0 0-2.43 1.76L34.493 48.548a2.5 2.5 0 0 0-.372 1.454c-.026.51.104 1.017.372 1.452l13.105 41.782c.737 2.352 4.065 2.352 4.802 0l13.105-41.785c.27-.436.399-.945.372-1.456a2.5 2.5 0 0 0-.372-1.45L52.401 6.76A2.51 2.51 0 0 0 50.03 5M39.403 50.288h6.205c.152 2.306 2.048 4.134 4.392 4.134s4.24-1.828 4.392-4.134h6.461L50 84.078Z"></path>' +
    '</svg>';
    northButton.onclick = () => view.goTo({ rotation: 0 }, { duration: 250 }).catch(() => {});
    view.ui.add(northButton, position);

    const icon = northButton.querySelector('.north-reset-icon');
    const rotationHandle = view.watch('rotation', value => {
      if (icon) icon.style.transform = 'rotate(' + (value || 0) + 'deg)';
    });

    return {
      element: northButton,
      destroy() {
        if (rotationHandle && typeof rotationHandle.remove === 'function') rotationHandle.remove();
        view.ui.remove(northButton);
      }
    };
  }

  window.SitePlanNorthArrow = { create };
})();
