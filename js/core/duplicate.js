// Duplicate selected graphics while preserving tool metadata and labels.
(function () {
  'use strict';

  window.SitePlanDuplicate = {
    create
  };

  function create(options) {
    const Graphic = options.Graphic;
    const view = options.view;
    const drawLayer = options.drawLayer;
    const assignGraphicId = options.assignGraphicId;
    const isSelectableGraphic = options.isSelectableGraphic;
    const getGraphicCapabilities = options.getGraphicCapabilities;
    const getSelectedGraphic = options.getSelectedGraphic;
    const rawObjectLabelText = options.rawObjectLabelText;
    const createOrUpdateObjectLabel = options.createOrUpdateObjectLabel;
    const selectGraphic = options.selectGraphic;
    const refreshSnapSources = options.refreshSnapSources;
    const fireGraphicCreated = options.fireGraphicCreated;
    const refreshSideLabelsForGraphic = options.refreshSideLabelsForGraphic;

    function cloneSymbol(symbol) {
      if (!symbol) return symbol;
      if (symbol.clone) return symbol.clone();
      try { return JSON.parse(JSON.stringify(symbol)); }
      catch (err) { return Object.assign({}, symbol); }
    }

    function offsetCoordinates(coords, dx, dy) {
      if (typeof coords[0] === 'number') return [coords[0] + dx, coords[1] + dy];
      return coords.map(part => offsetCoordinates(part, dx, dy));
    }

    function cloneGeometryWithOffset(geometry, dx, dy) {
      const json = geometry.toJSON ? geometry.toJSON() : JSON.parse(JSON.stringify(geometry));
      if (json.x != null && json.y != null) {
        json.x += dx;
        json.y += dy;
      }
      if (json.paths) json.paths = offsetCoordinates(json.paths, dx, dy);
      if (json.rings) json.rings = offsetCoordinates(json.rings, dx, dy);
      return geometry.constructor.fromJSON ? geometry.constructor.fromJSON(json) : json;
    }

    function duplicateSelectedGraphic() {
      const source = getSelectedGraphic();
      if (!isSelectableGraphic(source) || getGraphicCapabilities(source).duplicate === false) return;
      const extent = view.extent;
      const offset = extent ? Math.max(extent.width, extent.height) * 0.015 : 25;
      const copy = new Graphic({
        geometry: cloneGeometryWithOffset(source.geometry, offset, -offset),
        symbol: cloneSymbol(source.symbol || {}),
        attributes: Object.assign({}, source.attributes || {})
      });
      Object.keys(source).forEach(key => {
        if (key.startsWith('__') && key !== '__sitePlanId') copy[key] = source[key];
      });
      assignGraphicId(copy);
      drawLayer.add(copy);
      if (source.__labelText || source.__labelRawText) {
        createOrUpdateObjectLabel(copy, rawObjectLabelText(source));
      }
      selectGraphic(copy);
      refreshSnapSources();
      fireGraphicCreated(copy);
      if (copy.geometry && copy.geometry.type === 'polygon') refreshSideLabelsForGraphic(copy);
    }

    return {
      duplicateSelectedGraphic
    };
  }
})();
