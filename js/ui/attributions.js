// js/ui/attributions.js
// Map attribution bar + the layer source registry.
(function () {
  'use strict';

  const SERVICE_BASE = 'https://services8.arcgis.com/COL6rRPkF9w28VGX/arcgis/rest/services';

  // credit: on-screen attribution text | printCredit: short print footer form
  const LAYER_SOURCES = {
    contours: {
      credit: 'Washington State DNR (Contours)',
      printCredit: 'DNR Contours',
      serviceUrl: SERVICE_BASE + '/Contours_10ft/FeatureServer/0'
    },
    liquefaction: {
      credit: null,
      printCredit: null,
      serviceUrl: SERVICE_BASE + '/Liquefaction_Susceptibility/FeatureServer/0'
    },
    riparian: {
      credit: null,
      printCredit: null,
      serviceUrl: SERVICE_BASE + '/Minimum_Watercourse_and_Water_Body_Riparian_Buffers/FeatureServer'
    },
    wetlands: {
      credit: 'US FWS National Wetlands Inventory (NWI)',
      printCredit: 'US FWS Wetlands',
      serviceUrl: SERVICE_BASE + '/Wetlands/FeatureServer/0'
    },
    cara: {
      credit: null,
      printCredit: null,
      serviceUrl: SERVICE_BASE + '/Aquifer_Vulnerability/FeatureServer/0'
    },
    flood: {
      credit: 'FEMA Flood Hazard Areas',
      printCredit: 'FEMA Flood',
      serviceUrl: SERVICE_BASE + '/FEMA/FeatureServer/0'
    }
  };

  let instance = null;

  function create(options) {
    const Attribution = options.Attribution;
    const view = options.view;
    const mapWrap = options.mapWrap || document.getElementById('map-wrap');
    const referenceLayerGroups = options.referenceLayerGroups || {};
    const countyName = options.countyName || 'Walla Walla County';

    let nativeAttribution = '';
    let nativeReader = null;
    let visibleAttr = null;

    function visibleLayerKeys() {
      return Object.keys(referenceLayerGroups).filter(key => {
        const group = referenceLayerGroups[key] || [];
        return group.some(layer => layer.visible);
      });
    }

    function visibleLayerCredits() {
      return visibleLayerKeys()
        .map(key => LAYER_SOURCES[key] && LAYER_SOURCES[key].credit)
        .filter(Boolean);
    }

    function printLayerCredits() {
      return visibleLayerKeys()
        .map(key => {
          const src = LAYER_SOURCES[key];
          return src && (src.printCredit || src.credit);
        })
        .filter(Boolean);
    }

    function installAttribution() {
      if (!mapWrap) return;

      nativeReader = document.createElement('div');
      nativeReader.id = 'native-attribution-reader';
      mapWrap.appendChild(nativeReader);
      new Attribution({ view, container: nativeReader });

      visibleAttr = document.createElement('div');
      visibleAttr.id = 'site-attribution';
      visibleAttr.className = 'site-attribution-map-anchored esri-attribution';
      visibleAttr.tabIndex = 0;
      visibleAttr.setAttribute('role', 'button');
      visibleAttr.setAttribute('aria-label', 'Map data acknowledgments');
      visibleAttr.innerHTML = '<div class="esri-attribution__sources"></div>';
      mapWrap.appendChild(visibleAttr);
      visibleAttr.addEventListener('click', () => visibleAttr.classList.toggle('esri-attribution--open'));
      visibleAttr.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          visibleAttr.classList.toggle('esri-attribution--open');
        }
      });

      setInterval(readNativeAttribution, 1500);
      view.watch('stationary', () => readNativeAttribution());
    }

    function readNativeAttribution() {
      if (!nativeReader) return;
      const sources = nativeReader.querySelector('.esri-attribution__sources');
      const text = sources ? sources.textContent.trim().replace(/\s+/g, ' ') : '';
      if (text) nativeAttribution = text;
      updateAttribution();
    }

    function updateAttribution() {
      if (!visibleAttr) return;
      const parts = [];
      parts.push('<a class="site-attribution-link" href="https://www.esri.com/en-us/home" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation();">Powered by Esri</a>');
      if (nativeAttribution) parts.push(nativeAttribution);
      parts.push(countyName);
      visibleLayerCredits().forEach(credit => parts.push(credit));
      const unique = [];
      parts.forEach(part => {
        if (part && !unique.includes(part)) unique.push(part);
      });
      const sources = visibleAttr.querySelector('.esri-attribution__sources');
      if (sources) sources.innerHTML = unique.join(' | ');
    }

    installAttribution();

    const api = {
      readNativeAttribution,
      updateAttribution,
      visibleLayerCredits,
      printLayerCredits
    };
    instance = api;
    return api;
  }

  window.SitePlanAttributions = {
    create,
    LAYER_SOURCES,
    printLayerCredits: function () {
      return instance ? instance.printLayerCredits() : [];
    }
  };
})();
