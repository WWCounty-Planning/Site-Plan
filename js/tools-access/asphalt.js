// Asphalt driveway material definition.

(function () {
  if (!window.SitePlanRuntimeReady) {
    console.error('[tools-access/asphalt] window.SitePlanRuntimeReady is missing.');
    return;
  }

  window.SitePlanRuntimeReady.then(RT => {
    const AS = window.SitePlanAccessShared = window.SitePlanAccessShared || {};
    if (typeof AS.registerDrivewayMaterial !== 'function') {
      console.warn('[tools-access/asphalt] Access material registry is unavailable.');
      return;
    }

    const ASPHALT_TILE_BASE = 26;
    const ASPHALT_TILE_MIN = 20;
    const ASPHALT_TILE_PREF = 24;
    const ASPHALT_TILE_MAX = 28;
    const ASPHALT_STROKES = [
      [5, 4, -8],
      [15, 3, 5],
      [22, 6, -12],
      [9, 10, 10],
      [20, 11, -6],
      [3, 16, 8],
      [13, 14, 12],
      [23, 19, -10],
      [7, 20, -7],
      [17, 21, 6],
      [12, 23, -15]
    ];

    function asphaltTileSize() {
      const zoom = RT && RT.view && Number.isFinite(RT.view.zoom) ? RT.view.zoom : null;
      if (zoom == null) return ASPHALT_TILE_PREF;
      return Math.max(ASPHALT_TILE_MIN, Math.min(ASPHALT_TILE_MAX,
        Math.round(ASPHALT_TILE_PREF + (zoom - 18) * 3)));
    }

    function asphaltTextureTileSvg(tilePx) {
      const size = Number.isFinite(tilePx) && tilePx > 0 ? tilePx : ASPHALT_TILE_PREF;
      const scale = size / ASPHALT_TILE_BASE;
      const halfLength = 2.5;
      const strokeWidth = Math.max(0.75, 1 * scale).toFixed(2);
      const lines = ASPHALT_STROKES.map(([cx, cy, degrees]) => {
        const x = (cx * scale).toFixed(2);
        const y1 = ((cy - halfLength) * scale).toFixed(2);
        const y2 = ((cy + halfLength) * scale).toFixed(2);
        const centerY = (cy * scale).toFixed(2);
        return '<line x1="' + x + '" y1="' + y1 + '" x2="' + x + '" y2="' + y2 + '" stroke-width="' + strokeWidth + '" transform="rotate(' + degrees + ' ' + x + ' ' + centerY + ')"/>';
      }).join('');

      return '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size + '">' +
        '<rect width="100%" height="100%" fill-opacity="0"/>' +
        '<g stroke="#646F5B" stroke-linecap="round">' +
          lines +
        '</g>' +
      '</svg>';
    }

    AS.registerDrivewayMaterial({
      id: 'asphalt',
      label: 'Asphalt',
      order: 20,
      symbol: function symbol() {
        const tilePx = asphaltTileSize();
        return {
          type: 'picture-fill',
          url: AS.svgDataUrl(asphaltTextureTileSvg(tilePx)),
          width: tilePx,
          height: tilePx,
          outline: { type: 'simple-line', color: [70, 70, 70, 0.95], width: 1.1 }
        };
      }
    });
  }).catch(err => {
    console.error('[tools-access/asphalt] Failed to initialize after runtime ready:', err);
  });
})();
