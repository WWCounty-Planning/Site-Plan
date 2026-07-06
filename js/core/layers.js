// Layer construction and draw-stack ordering.
(function () {
  'use strict';

  window.SitePlanLayers = {
    create
  };

  function create(options) {
    const FeatureLayer = options.FeatureLayer;
    const GraphicsLayer = options.GraphicsLayer;
    const cfg = options.cfg;

    const parcelLayer = new FeatureLayer({
      url: cfg.layers.parcels.url,
      outFields: cfg.layers.parcels.outFields || ['*'],
      popupEnabled: false,
      renderer: {
        type: 'simple',
        symbol: {
          type: 'simple-fill',
          color: [0, 0, 0, 0],
          outline: { type: 'simple-line', color: [44, 53, 57, 0.85], width: 1.5 }
        }
      }
    });

    const contourLayer = new FeatureLayer({
      url: 'https://services8.arcgis.com/COL6rRPkF9w28VGX/arcgis/rest/services/Contours_10ft/FeatureServer/0',
      title: 'Contours',
      visible: false,
      popupEnabled: false,
      listMode: 'hide',
      renderer: { type: 'simple', symbol: { type: 'simple-line', color: [120, 95, 65, 0.72], width: 0.8 } }
    });

    const liquefactionLayer = new FeatureLayer({
      url: 'https://services8.arcgis.com/COL6rRPkF9w28VGX/arcgis/rest/services/Liquefaction_Susceptibility/FeatureServer/0',
      title: 'Liquefaction Susceptibility',
      visible: false,
      popupEnabled: false,
      listMode: 'hide',
      opacity: 1,
      definitionExpression: "LIQUEFAC_1 IN ('Moderate to High', 'High')",
      renderer: { type: 'simple', symbol: { type: 'simple-fill', style: 'backward-diagonal', color: [214, 83, 32, 0.55], outline: { type: 'simple-line', color: [174, 63, 25, 0.9], width: 0.9 } } }
    });

    const riparianWaterBodyLayer = new FeatureLayer({
      url: 'https://services8.arcgis.com/COL6rRPkF9w28VGX/arcgis/rest/services/Minimum_Watercourse_and_Water_Body_Riparian_Buffers/FeatureServer/0',
      title: 'Riparian Buffer - Water Bodies',
      visible: false,
      popupEnabled: false,
      listMode: 'hide',
      opacity: 1,
      renderer: { type: 'simple', symbol: { type: 'simple-fill', color: [37, 150, 190, 0.16], outline: { type: 'simple-line', color: [0, 95, 130, 0.85], width: 0.8 } } }
    });

    const riparianWatercourseLayer = new FeatureLayer({
      url: 'https://services8.arcgis.com/COL6rRPkF9w28VGX/arcgis/rest/services/Minimum_Watercourse_and_Water_Body_Riparian_Buffers/FeatureServer/1',
      title: 'Riparian Buffer - Watercourses',
      visible: false,
      popupEnabled: false,
      listMode: 'hide',
      opacity: 1,
      renderer: { type: 'simple', symbol: { type: 'simple-fill', color: [37, 150, 190, 0.16], outline: { type: 'simple-line', color: [0, 95, 130, 0.85], width: 0.8 } } }
    });

    const wetlandsLayer = new FeatureLayer({
      url: 'https://services8.arcgis.com/COL6rRPkF9w28VGX/arcgis/rest/services/Wetlands/FeatureServer/0',
      title: 'Wetlands',
      visible: false,
      popupEnabled: false,
      listMode: 'hide',
      opacity: 1,
      renderer: { type: 'simple', symbol: { type: 'simple-fill', color: [36, 166, 108, 0.18], outline: { type: 'simple-line', color: [0, 111, 68, 0.9], width: 0.9 } } }
    });

    const caraLayer = new FeatureLayer({
      url: 'https://services8.arcgis.com/COL6rRPkF9w28VGX/arcgis/rest/services/Aquifer_Vulnerability/FeatureServer/0',
      title: 'Critical Aquifer Recharge Area (CARA)',
      visible: false,
      popupEnabled: false,
      listMode: 'hide',
      opacity: 1,
      renderer: {
        type: 'unique-value',
        field: 'aqvul_zone',
        defaultSymbol: { type: 'simple-fill', style: 'none', outline: { type: 'simple-line', color: [120, 120, 120, 0.45], width: 0.6 } },
        uniqueValueInfos: [
          { value: 'Zone I', label: 'CARA High Recharge Vulnerability', symbol: { type: 'simple-fill', style: 'backward-diagonal', color: [255, 0, 0, 0.62], outline: { type: 'simple-line', color: [230, 0, 0, 0.9], width: 0.8 } } },
          { value: 'Zone II', label: 'CARA Moderate Recharge Vulnerability', symbol: { type: 'simple-fill', style: 'backward-diagonal', color: [255, 170, 0, 0.62], outline: { type: 'simple-line', color: [255, 170, 0, 0.9], width: 0.8 } } }
        ]
      }
    });

    const floodLayer = new FeatureLayer({
      url: 'https://services8.arcgis.com/COL6rRPkF9w28VGX/arcgis/rest/services/FEMA/FeatureServer/0',
      title: 'Flood Hazard Areas',
      visible: false,
      popupEnabled: false,
      listMode: 'hide',
      opacity: 1,
      definitionExpression: "zone IN ('A', 'AE', 'AO')",
      renderer: { type: 'simple', symbol: { type: 'simple-fill', color: [0, 105, 180, 0.16], outline: { type: 'simple-line', color: [0, 75, 150, 0.9], width: 0.9 } } }
    });

    const highlightLayer = new GraphicsLayer({ title: 'Selected Parcel', listMode: 'hide' });
    const drawingShadowLayer = new GraphicsLayer({ title: 'Drawing Shadows', listMode: 'hide' });
    const drawLayer = new GraphicsLayer({ title: 'Site Plan Drawings', listMode: 'hide' });
    const labelLayer = new GraphicsLayer({ title: 'Site Plan Labels', listMode: 'hide' });
    const measureLayer = new GraphicsLayer({ title: 'Temporary Measurements', listMode: 'hide' });
    const previewLayer = new GraphicsLayer({ title: 'Drawing / Measurement Preview', listMode: 'hide' });

    const referenceLayerGroups = {
      contours: [contourLayer],
      liquefaction: [liquefactionLayer],
      riparian: [riparianWaterBodyLayer, riparianWatercourseLayer],
      wetlands: [wetlandsLayer],
      cara: [caraLayer],
      flood: [floodLayer]
    };

    return {
      parcelLayer,
      highlightLayer,
      drawingShadowLayer,
      drawLayer,
      labelLayer,
      measureLayer,
      previewLayer,
      referenceLayerGroups,
      mapLayers: [
        floodLayer, liquefactionLayer, caraLayer, wetlandsLayer,
        riparianWaterBodyLayer, riparianWatercourseLayer, contourLayer,
        parcelLayer, highlightLayer, drawingShadowLayer, drawLayer, labelLayer, measureLayer, previewLayer
      ]
    };
  }
})();
