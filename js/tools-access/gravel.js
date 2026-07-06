// Gravel driveway material definition.

(function () {
  if (!window.SitePlanRuntimeReady) {
    console.error('[tools-access/gravel] window.SitePlanRuntimeReady is missing.');
    return;
  }

  window.SitePlanRuntimeReady.then(RT => {
    const AS = window.SitePlanAccessShared = window.SitePlanAccessShared || {};
    if (typeof AS.registerDrivewayMaterial !== 'function') {
      console.warn('[tools-access/gravel] Access material registry is unavailable.');
      return;
    }

    const GRAVEL_TILE_BASE = 26;
    const GRAVEL_TILE_MIN = 20;
    const GRAVEL_TILE_PREF = 24;
    const GRAVEL_TILE_MAX = 28;
    const GRAVEL_PEBBLES = [
      [7, 6, 3.5, 2.3, 20],
      [19, 5, 1.8, 1.2, -15],
      [20, 14, 2.5, 1.7, 35],
      [4, 19, 1.8, 1.3, -20],
      [13, 13, 3.8, 2.5, 10],
      [10, 22, 1.8, 1.2, 40],
      [21, 22, 2.3, 1.6, -8]
    ];

    function gravelTileSize() {
      const zoom = RT && RT.view && Number.isFinite(RT.view.zoom) ? RT.view.zoom : null;
      if (zoom == null) return GRAVEL_TILE_PREF;
      return Math.max(GRAVEL_TILE_MIN, Math.min(GRAVEL_TILE_MAX,
        Math.round(GRAVEL_TILE_PREF + (zoom - 18) * 3)));
    }

    function gravelTextureTileSvg(tilePx) {
      const size = Number.isFinite(tilePx) && tilePx > 0 ? tilePx : GRAVEL_TILE_PREF;
      const scale = size / GRAVEL_TILE_BASE;
      const ellipses = GRAVEL_PEBBLES.map(([cx, cy, rx, ry, degrees]) => {
        const x = (cx * scale).toFixed(2);
        const y = (cy * scale).toFixed(2);
        const scaledRx = (rx * scale).toFixed(2);
        const scaledRy = (ry * scale).toFixed(2);
        return '<ellipse cx="' + x + '" cy="' + y + '" rx="' + scaledRx + '" ry="' + scaledRy + '" transform="rotate(' + degrees + ' ' + x + ' ' + y + ')"/>';
      }).join('');
      const strokeWidth = Math.max(0.8, 1.2 * scale).toFixed(2);

      return '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size + '">' +
        '<rect width="100%" height="100%" fill="#f6f6ee" fill-opacity="0"/>' +
        '<g fill="none" stroke="#646F5B" stroke-width="' + strokeWidth + '" stroke-linecap="round" stroke-linejoin="round">' +
          ellipses +
        '</g>' +
      '</svg>';
    }

    AS.registerDrivewayMaterial({
      id: 'gravel',
      label: 'Gravel',
      order: 10,
      symbol: function symbol() {
        const tilePx = gravelTileSize();
        return {
          type: 'picture-fill',
          url: AS.svgDataUrl(gravelTextureTileSvg(tilePx)),
          width: tilePx,
          height: tilePx,
          outline: { type: 'simple-line', color: [80, 80, 80, 0.9], width: 1.1 }
        };
      }
    });
  }).catch(err => {
    console.error('[tools-access/gravel] Failed to initialize after runtime ready:', err);
  });
})();
