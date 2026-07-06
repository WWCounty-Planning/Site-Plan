(function () {
  'use strict';

  function create(options) {
    const Search = options.Search;
    const view = options.view;
    const parcelLayer = options.parcelLayer;
    const pf = options.pf || {};
    const setActiveParcel = options.setActiveParcel;
    const fetchFeatureInViewSpatialReference = options.fetchFeatureInViewSpatialReference;

    let parcelSearch = null;

    function clearParcelSearchWidget() {
      if (!parcelSearch) return;
      setTimeout(() => {
        try {
          if (parcelSearch.resultGraphics) parcelSearch.resultGraphics.removeAll();
          if (typeof parcelSearch.clear === 'function') parcelSearch.clear();
        } catch (e) {}
        try {
          if (parcelSearch.viewModel) {
            parcelSearch.viewModel.searchTerm = '';
            if (parcelSearch.viewModel.highlightHandle) {
              parcelSearch.viewModel.highlightHandle.remove();
              parcelSearch.viewModel.highlightHandle = null;
            }
          }
        } catch (e) {}
        try {
          const input = document.querySelector('#header-search .esri-search__input');
          if (input) {
            const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
            nativeSetter.call(input, '');
            input.dispatchEvent(new Event('input', { bubbles: true }));
          }
        } catch (e) {}
      }, 100);
    }

    function blockSearchEnterAutoSelect() {
      const attach = () => {
        const input = document.querySelector('#header-search .esri-search__input');
        if (!input || input.__sitePlanEnterBlocked) return false;
        input.__sitePlanEnterBlocked = true;
        input.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') {
            e.stopImmediatePropagation();
            e.preventDefault();
          }
        }, true);
        return true;
      };

      if (attach()) return;
      const observer = new MutationObserver(() => {
        if (attach()) observer.disconnect();
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }

    function installSearchSubmitIcon() {
      const icon =
        '<svg class="site-search-submit-icon" viewBox="0 0 16 16" aria-hidden="true">' +
          '<!-- Icon from HeroIcons by Refactoring UI Inc - https://github.com/tailwindlabs/heroicons/blob/master/LICENSE -->' +
          '<path fill="currentColor" fill-rule="evenodd" d="M9.965 11.026a5 5 0 1 1 1.06-1.06l2.755 2.754a.75.75 0 1 1-1.06 1.06zM10.5 7a3.5 3.5 0 1 1-7 0a3.5 3.5 0 0 1 7 0" clip-rule="evenodd"></path>' +
        '</svg>';

      function apply() {
        const button = document.querySelector('#header-search .esri-search__submit-button');
        if (!button || button.getAttribute('data-site-search-icon') === 'magnifier') return;
        button.innerHTML = icon;
        button.setAttribute('data-site-search-icon', 'magnifier');
      }

      apply();
      if (window.requestAnimationFrame) window.requestAnimationFrame(apply);
      window.setTimeout(apply, 250);
      const target = document.getElementById('header-search');
      if (!target) return;
      const observer = new MutationObserver(apply);
      observer.observe(target, { childList: true, subtree: true });
    }

    function initParcelSearch() {
      const searchFields = [pf.parcelNumber, pf.siteAddress].filter(Boolean);
      if (!Search || !view || !parcelLayer || !searchFields.length) return null;

      parcelSearch = new Search({
        view,
        container: 'header-search',
        includeDefaultSources: false,
        searchAllEnabled: false,
        popupEnabled: false,
        resultGraphicEnabled: false,
        locationEnabled: false,
        allPlaceholder: 'Search by parcel number or address',
        suggestionsEnabled: true,
        sources: [{
          layer: parcelLayer,
          name: 'Parcels',
          placeholder: 'Search by parcel number or address',
          searchFields,
          displayField: pf.siteAddress || pf.parcelNumber || searchFields[0],
          suggestionTemplate: (pf.parcelNumber && pf.siteAddress)
            ? '{' + pf.parcelNumber + '}, {' + pf.siteAddress + '}'
            : '{' + searchFields[0] + '}',
          exactMatch: false,
          outFields: ['*'],
          maxResults: 8,
          maxSuggestions: 8,
          minSuggestCharacters: 1
        }]
      });

      parcelSearch.on('select-result', function (event) {
        const feature = event.result && event.result.feature;
        if (!feature) return;

        fetchFeatureInViewSpatialReference(feature)
          .then(setActiveParcel)
          .then(() => {
            clearParcelSearchWidget();
          })
          .catch(err => {
            console.error(err);
          });
      });

      blockSearchEnterAutoSelect();
      installSearchSubmitIcon();
      return parcelSearch;
    }

    return {
      initParcelSearch
    };
  }

  window.SitePlanSearch = { create };
})();
