// Rotate selected graphics and expose geometry rotation for rotation guides.
(function () {
  'use strict';

  window.SitePlanRotate = {
    create
  };

  function create(options) {
    const getSelectedGraphic = options.getSelectedGraphic;
    const getGraphicCapabilities = options.getGraphicCapabilities;
    const createOrUpdateObjectLabel = options.createOrUpdateObjectLabel;
    const rawObjectLabelText = options.rawObjectLabelText;
    const refreshSideLabelsForGraphic = options.refreshSideLabelsForGraphic;
    const updateSelectedShapeBox = options.updateSelectedShapeBox;
    const fireGraphicUpdated = options.fireGraphicUpdated;
    const startSketchUpdate = options.startSketchUpdate;
    const positionSelectionToolbar = options.positionSelectionToolbar;

    function rotateCoordinates(coords, cx, cy, radians) {
      if (typeof coords[0] === 'number') {
        const x = coords[0] - cx;
        const y = coords[1] - cy;
        return [
          cx + x * Math.cos(radians) - y * Math.sin(radians),
          cy + x * Math.sin(radians) + y * Math.cos(radians)
        ];
      }
      return coords.map(part => rotateCoordinates(part, cx, cy, radians));
    }

    function rotateGraphicGeometry(graphic, degrees) {
      if (!graphic || !graphic.geometry) return false;
      const geom = graphic.geometry;
      if (geom.type === 'point') {
        const symbol = graphic.symbol && graphic.symbol.clone ? graphic.symbol.clone() : Object.assign({}, graphic.symbol || {});
        symbol.angle = ((Number(symbol.angle || 0) + degrees) % 360 + 360) % 360;
        graphic.symbol = symbol;
        return true;
      }
      if (!geom.extent) return false;
      const center = geom.extent.center;
      const json = geom.toJSON ? geom.toJSON() : JSON.parse(JSON.stringify(geom));
      const radians = degrees * Math.PI / 180;
      if (json.paths) json.paths = rotateCoordinates(json.paths, center.x, center.y, radians);
      if (json.rings) json.rings = rotateCoordinates(json.rings, center.x, center.y, radians);
      graphic.geometry = geom.constructor.fromJSON ? geom.constructor.fromJSON(json) : json;
      return true;
    }

    function rotateSelectedBy(deltaDegrees) {
      const selectedGraphic = getSelectedGraphic();
      if (!selectedGraphic || getGraphicCapabilities(selectedGraphic).rotate === false) return;
      const rotateDeltaDegrees = Number(deltaDegrees || 0);
      try {
        window.dispatchEvent(new CustomEvent('siteplan:before-toolbar-rotate', {
          detail: { graphic: selectedGraphic, deltaDegrees: rotateDeltaDegrees }
        }));
      } catch (err) {}
      if (rotateGraphicGeometry(selectedGraphic, rotateDeltaDegrees)) {
        try {
          window.dispatchEvent(new CustomEvent('siteplan:after-toolbar-rotate', {
            detail: { graphic: selectedGraphic, deltaDegrees: rotateDeltaDegrees }
          }));
        } catch (err) {}
        if (selectedGraphic.__labelText || selectedGraphic.__labelRawText) {
          createOrUpdateObjectLabel(selectedGraphic, rawObjectLabelText(selectedGraphic));
        }
        if (selectedGraphic.geometry && selectedGraphic.geometry.type === 'polygon') {
          refreshSideLabelsForGraphic(selectedGraphic);
        }
        updateSelectedShapeBox();
        fireGraphicUpdated(selectedGraphic, {
          state: 'complete',
          toolEventInfo: {
            type: 'rotate',
            deltaDegrees: rotateDeltaDegrees
          }
        });
        startSketchUpdate(selectedGraphic);
        requestAnimationFrame(positionSelectionToolbar);
      }
    }

    return {
      rotateGraphicGeometry,
      rotateSelectedBy
    };
  }
})();
