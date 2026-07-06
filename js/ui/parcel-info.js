// active-parcel state, feature layer queries

(function () {
  'use strict';

  window.SitePlanParcelInfo = { create };

  function create(options) {
    const pf             = options.pf || {};
    const Graphic        = options.Graphic;
    const view           = options.view;
    const parcelLayer    = options.parcelLayer;
    const geoParam       = options.geoParam || '';
    const highlightLayer = options.highlightLayer;
    const homeButton     = options.homeButton;
    const Viewpoint      = options.Viewpoint;

    let selectedParcelGeometry = null;
    let currentParcelAttrs     = null;

    function fmt(value, fallback) {
      const s = value == null ? '' : String(value).trim();
      return s && s !== '0' && s.toLowerCase() !== 'null' ? s : (fallback || '\u2014');
    }

    function resolveParcelNumber(attrs) {
      if (!attrs) return '';
      return attrs[pf.parcelNumber] || attrs.geo_id || attrs.GEO_ID ||
             attrs.PARCEL || attrs.PIN || attrs.APN || '';
    }

    function populateInfoPanel(attrs) {
      // All attribute values pass through escapeHtml before entering innerHTML.
      const escapeHtml = v => String(v ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
      const f = (v, fallback) => escapeHtml(fmt(v, fallback));
      const fmtSetback = v => {
        const s = v == null ? '' : String(v).trim();
        return s && s !== '0' && s.toLowerCase() !== 'null'
          ? escapeHtml(s) + ' ft'
          : '\u2014';
      };
      const zoning = f(attrs[pf.zoningAbbrev]) !== '\u2014'
        ? f(attrs[pf.zoningAbbrev]) + (f(attrs[pf.zoningName]) !== '\u2014'
            ? ' \u2014 ' + f(attrs[pf.zoningName]) : '')
        : f(attrs[pf.zoningName]);
      const acreage = f(attrs[pf.acreage]) !== '\u2014' &&
                      !Number.isNaN(parseFloat(attrs[pf.acreage]))
        ? parseFloat(attrs[pf.acreage]).toFixed(2) + ' ac'
        : '\u2014';

      document.getElementById('ip-basic').innerHTML = `
        <div class="ip-row"><span class="ip-label">Parcel Number</span><span class="ip-value">${f(resolveParcelNumber(attrs))}</span></div>
        <div class="ip-row"><span class="ip-label">Site Address</span><span class="ip-value">${f(attrs[pf.siteAddress])}</span></div>
        <div class="ip-row"><span class="ip-label">Owner</span><span class="ip-value">${f(attrs[pf.ownerName])}</span></div>
        <div class="ip-row"><span class="ip-label">Area</span><span class="ip-value">${acreage}</span></div>
        <div class="ip-row"><span class="ip-label">Zoning</span><span class="ip-value">${zoning}</span></div>
        <div class="ip-row"><span class="ip-label">Front Setback</span><span class="ip-value">${fmtSetback(attrs[pf.setbackFront])}</span></div>
        <div class="ip-row"><span class="ip-label">Side Setback</span><span class="ip-value">${fmtSetback(attrs[pf.setbackSide])}</span></div>
        <div class="ip-row"><span class="ip-label">Rear Setback</span><span class="ip-value">${fmtSetback(attrs[pf.setbackRear])}</span></div>
        <div class="ip-row"><span class="ip-label">Setback Note</span><span class="ip-value" style="white-space:pre-line;">${f(attrs[pf.setbackNote]) !== '\u2014' ? f(attrs[pf.setbackNote]).replace(/\s*(\(\d+\))/g, '\n$1').trim() : '\u2014'}</span></div>`;

      const caFields = [
        { label: 'Flood Hazard Risk',                    key: pf.caFloodRisk },
        { label: 'Flood Hazard Zone',                    key: pf.caFloodZone },
        { label: 'CARA High Recharge Vulnerability',     key: pf.caCaraHigh },
        { label: 'CARA Moderate Recharge Vulnerability', key: pf.caCaraMod },
        { label: 'Ferruginous Hawk Habitat',             key: pf.caHawkHab },
        { label: 'Neotropical Migrant Songbird Habitat', key: pf.caSongbird },
        { label: 'Wintering Birds of Prey Habitat',      key: pf.caWinterBirds },
        { label: 'Shrubsteppe Habitat',                  key: pf.caShrubsteppe },
        { label: 'Slope / Erosion Hazard',               key: pf.caErosion },
        { label: 'Faults',                               key: pf.caFaults },
        { label: 'Liquefaction',                         key: pf.caLiquefaction },
        { label: 'Wetlands',                             key: pf.caWetland },
        { label: 'Riparian Buffer',                      key: pf.caRipName, extra: pf.caRipBuffer }
      ];
      const caHead = document.getElementById('ip-ca-head');
      const caBody = document.getElementById('ip-ca');
      caHead.style.display = '';
      caBody.style.display = '';
      caBody.innerHTML = caFields.map(ca => {
        let val = f(attrs[ca.key], 'NO');
        if (ca.extra) {
          const extraVal = f(attrs[ca.extra]);
          if (extraVal !== '\u2014') val += ' (' + extraVal + ' ft)';
        }
        const isYes    = val !== 'NO' && val !== '\u2014';
        const isNo     = val === 'NO';
        const valColor = isYes ? '#b33' : isNo ? '#2a7a2a' : '#1a1f2e';
        return `<div class="ca-item"><span class="ip-label">${ca.label}</span><span class="ip-value" style="color:${valColor};">${val}</span></div>`;
      }).join('');
    }

    function setActiveParcel(feature, opts) {
      opts = opts || {};
      if (!feature || !feature.geometry || !feature.attributes) {
        return Promise.reject(new Error('Invalid parcel feature.'));
      }

      const attrs            = feature.attributes || {};
      currentParcelAttrs     = attrs;
      selectedParcelGeometry = feature.geometry || null;

      highlightLayer.removeAll();
      if (selectedParcelGeometry) {
        highlightLayer.add(new Graphic({
          geometry: selectedParcelGeometry,
          symbol: {
            type: 'simple-fill',
            color: [0, 0, 0, 0],
            outline: { type: 'simple-line', color: [226, 88, 62, 1], width: 3 }
          }
        }));
      }

      populateInfoPanel(attrs);

      if (opts.skipZoom || opts.skipGoTo ||
          !selectedParcelGeometry || !selectedParcelGeometry.extent) {
        return Promise.resolve(feature);
      }

      return view.goTo(selectedParcelGeometry.extent.expand(1.18), { duration: 800 })
        .catch(() => {})
        .then(() => feature);
    }

    function loadParcelByGeo(geoId) {
      const cleanGeo = String(geoId || '').trim();
      if (!cleanGeo) return Promise.reject(new Error('No parcel number provided.'));

      const parcelField = pf.parcelNumber || 'geo_id';

      return parcelLayer.queryFeatures({
        where: parcelField + " = '" + cleanGeo.replace(/'/g, "''") + "'",
        outFields: ['*'],
        returnGeometry: true,
        outSpatialReference: view.spatialReference
      }).then(result => {
        if (!result.features || !result.features.length) throw new Error('Parcel not found.');
        return setActiveParcel(result.features[0]);
      }).catch(err => {
        console.error(err);
        throw err;
      });
    }

    function fetchFeatureInViewSpatialReference(feature) {
      const oidField = parcelLayer.objectIdField;
      const oid = feature && feature.attributes && oidField
        ? feature.attributes[oidField] : null;
      if (oid == null) return Promise.resolve(feature);

      return parcelLayer.queryFeatures({
        objectIds: [oid],
        outFields: ['*'],
        returnGeometry: true,
        outSpatialReference: view.spatialReference
      }).then(result => {
        return (result.features && result.features[0]) ? result.features[0] : feature;
      }).catch(() => feature);
    }

    function setCountyHomeExtent() {
      return parcelLayer.when(() => {
        const countyExtent = parcelLayer.fullExtent;
        if (countyExtent) {
          const target = countyExtent.expand(1.02);
          homeButton.setViewpoint(new Viewpoint({ targetGeometry: target }));
          if (!geoParam) view.goTo(target, { duration: 0 }).catch(() => {});
        }
      });
    }

    return {
      setActiveParcel,
      loadParcelByGeo,
      fetchFeatureInViewSpatialReference,
      setCountyHomeExtent,
      get activeParcelGeometry() { return selectedParcelGeometry; },
      get activeParcelAttributes() { return currentParcelAttrs; }
    };
  }
}());
