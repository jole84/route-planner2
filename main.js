import './style.css';
import { Feature, Map, View } from "ol";
import { Modify } from "ol/interaction.js";
import { Stroke, Style, Icon, Fill, Text } from "ol/style.js";
import { fromLonLat, toLonLat } from "ol/proj.js";
import { toStringXY } from "ol/coordinate";
import { Vector as VectorLayer } from "ol/layer.js";
import { GPX, GeoJSON, KML } from 'ol/format.js';
import Collection from 'ol/Collection.js';
import { Polygon, MultiPolygon, Point, MultiLineString, LineString } from 'ol/geom';
import OSM from "ol/source/OSM.js";
import Overlay from "ol/Overlay.js";
import TileLayer from "ol/layer/Tile";
import TileWMS from "ol/source/TileWMS.js";
import { getLength } from 'ol/sphere';
import VectorSource from "ol/source/Vector.js";
import XYZ from "ol/source/XYZ.js";
import VectorTileLayer from 'ol/layer/VectorTile.js';
import VectorTileSource from 'ol/source/VectorTile.js';
import MVT from 'ol/format/MVT.js';
import { styleStuff } from "./styleTileFunctions.js"

const addPositionButton = document.getElementById("addPositionButton");
const removePositionButton = document.getElementById("removePositionButton");
const contextPopupButton = document.getElementById("contextPopupButton");
const menuDivcontent = document.getElementById("menuDivContent");
const menuItems = document.getElementById("menuItems");
const helpDiv = document.getElementById("helpDiv");
const exportLinks = document.getElementById("exportLinks");
const routeStorageMenu = document.getElementById("routeStorageMenu");
// const gpxFileName = document.getElementById("gpxFileName");
const savePoiNameInput = document.getElementById("savePoiNameInput");
const loadFileDialog = document.getElementById("loadFileDialog");
const poiFileName = document.getElementById("poiFileName");

let trackLength = 0;
let poiPosition;
let enableVoiceHint = false;
let qrCodeLink = new QRCode("qrRoutePlanner", {
  text: "https://jole84.se/nav-app/index.html",
  correctLevel: QRCode.CorrectLevel.M,
  // width: 512,
  // height: 512,
});

localStorage.routeMode = document.getElementById("routeModeSelector").value = localStorage.routeMode || "driving";
document.getElementById("routeModeSelector").addEventListener("change", function (event) {
  localStorage.routeMode = document.getElementById("routeModeSelector").value;
  routeMe();
});

localStorage.centerCoordinate = localStorage.centerCoordinate || "[1650000, 8000000]";
localStorage.centerZoom = localStorage.centerZoom || 7;
localStorage.mapMode = localStorage.mapMode || 0; // default map

document.getElementById("openInfoButton").addEventListener("click", () => {
  menuDivcontent.replaceChildren(menuItems);
  document.getElementById("enableVoiceHint").checked = enableVoiceHint;
});
let enableTouchControls = document.getElementById("enableTouchControls").checked;
document.getElementById("enableTouchControls").addEventListener("change", function () {
  enableTouchControls = document.getElementById("enableTouchControls").checked;
  document.getElementById("crosshair").style.display = enableTouchControls ? "unset" : "none";
  document.getElementById("lowerRightGroup").style.display = enableTouchControls ? "inline" : "none";
});
document.getElementById("enableVoiceHint").addEventListener("change", function () {
  enableVoiceHint = document.getElementById("enableVoiceHint").checked;
  routeMe();
});
document.getElementById("menuDivCloseButton").addEventListener("click", () => {
  menuDivcontent.replaceChildren();
});

// document.getElementById("clickFileButton").onclick = function () {
//   menuDivcontent.replaceChildren(loadFileDialog);
// }

// document.getElementById("mouseClickAdd").addEventListener("change", () => {
//   localStorage.mouseClickAdd = document.getElementById("mouseClickAdd").checked;
// });
// document.getElementById("mouseClickAdd").checked = JSON.parse(localStorage.mouseClickAdd || "false");

const fileFormats = {
  "gpx": new GPX(),
  "kml": new KML({ extractStyles: false }),
  "geojson": new GeoJSON(),
}

// PWA file browser file handler
if ("launchQueue" in window) {
  launchQueue.setConsumer(async (launchParams) => {
    for (const file of launchParams.files) {
      const fileData = await file.getFile();
      fileLoader(fileData);
    }
  });
}

const pickerOpts = {
  types: [
    {
      // description: "Images",
      accept: {
        "application/text": [".gpx", ".gpx.txt", ".geojson", ".kml"],
      },
    },
  ],
  excludeAcceptAllOption: true,
  multiple: true,
};

async function getTheFile() {
  // Open file picker and destructure the result the first handle
  const fileHandle = await window.showOpenFilePicker(pickerOpts);
  // get file contents

  for (let i = 0; i < fileHandle.length; i++) {
    const fileData = await fileHandle[i].getFile();
    fileLoader(fileData);
  }
}
document.getElementById("loadProjectButton").addEventListener("click", evt => {
  loadAsProject = true;
  getTheFile();
});

document.getElementById("selectFileButton").addEventListener("click", evt => {
  loadAsProject = false;
  getTheFile();
});

// document.getElementById("customFileButton").addEventListener("change", evt => {
//   const files = evt.target.files; // FileList object
//   for (let i = 0; i < files.length; i++) {
//     fileLoader(files[i]);
//   }
// menuDivcontent.replaceChildren();
// });

let loadAsProject = false;
function fileLoader(fileData) {
  const reader = new FileReader();
  reader.readAsText(fileData, "UTF-8");
  reader.onload = function (evt) {
    const fileFormat = fileFormats[fileData.name.toLowerCase().replace(".gpx.txt", ".gpx").split(".").pop()];
    const gpxFeatures = fileFormat.readFeatures(evt.target.result, {
      dataProjection: "EPSG:4326",
      featureProjection: "EPSG:3857",
    });
    gpxFeatures.forEach(feature => {
      console.log(feature.getGeometry().getType());
      if (loadAsProject) {
        if (feature.get("drawing")) {
          drawLayer.getSource().addFeature(feature);
        } else if (feature.get("routePointsLineString")) {
          feature.getGeometry().getCoordinates().forEach(function (coordinate) {
            routePointsLineString.appendCoordinate(coordinate);
          });
        } else if (feature.getGeometry().getType() === "Point") {
          addPoi(feature.getGeometry().getCoordinates(), feature.get("name"));
        } else {
          if (feature.getGeometry().getType() === "LineString") {
            feature.getGeometry().simplify(500).getCoordinates().forEach(function (coordinate) {
              routePointsLineString.appendCoordinate(coordinate);
            });
          }
          if (feature.getGeometry().getType() === "MultiLineString") {
            feature.getGeometry().getLineString(0).simplify(500).getCoordinates().forEach(function (coordinate) {
              routePointsLineString.appendCoordinate(coordinate);
            });
          }
        }
        routeMe();
      } else {
        if (feature.getGeometry().getType() == "LineString" || feature.getGeometry().getType() == "MultiLineString") {
          feature.setId(lineStringId++);
        }
        if (!feature.get("routePointsLineString") && !feature.get("drawing")) {
          gpxLayer.getSource().addFeature(feature);
        }
        feature.set("gpxFeature", true);
      }
    });
  }
}

function toCoordinateString(coordinate) {
  if (coordinate[1] > 100) {
    coordinate = toLonLat(coordinate);
  }
  return [(Number(coordinate[0].toFixed(5))), Number(coordinate[1].toFixed(5))];
}

document.getElementById("exportRouteButton").onclick = function () {
  menuDivcontent.replaceChildren(exportLinks);

  const routePoints = [];
  const poiPoints = [];
  let linkCode = "https://jole84.se/nav-app/index.html?";
  let trackPointLink = "https://jole84.se/nav-app/index.html?";

  routePointsLayer.getSource().forEachFeature(function (feature) {
    routePoints[feature.getId()] = toCoordinateString(feature.getGeometry().getCoordinates());
  });
  if (routePoints.length > 0) {
    linkCode += "destinationPoints64=" + btoa(JSON.stringify(routePoints));
  }
  if (routePoints.length > 1) {
    trackPointLink += "trackPoints=" + encodeURIComponent(JSON.stringify(routeLineString.getLineString(0).simplify(25).getCoordinates().map(each => [Math.round(each[0]), Math.round(each[1])])));
  }

  poiLayer.getSource().forEachFeature(function (feature) {
    poiPoints.push([toCoordinateString(feature.getGeometry().getCoordinates()), encodeURI(feature.get("name"))]);
  });
  if (poiPoints.length > 0) {
    linkCode += "&poiPoints64=" + btoa(JSON.stringify(poiPoints));
    trackPointLink += "&poiPoints64=" + btoa(JSON.stringify(poiPoints));
  }

  document.getElementById("linkCodeDiv").innerHTML = linkCode;
  document.getElementById("linkCodeDiv").title = "Klicka för att kopiera";
  document.getElementById("trackPointLinkDiv").innerHTML = trackPointLink;
  document.getElementById("navAppButton").setAttribute("href", linkCode);
  document.getElementById("navAppButton").title = linkCode;
  document.getElementById("navAppButton2").setAttribute("href", trackPointLink);
  document.getElementById("navAppButton2").title = trackPointLink;

  document.getElementById("linkCodeDiv").addEventListener("click", function () {
    navigator.clipboard.writeText(linkCode);
  })

  qrCodeLink.clear();
  try {
    qrCodeLink.makeCode(linkCode);
  } catch {
    console.log("qr error")
  }
}

async function saveFile(data, fileName) {
  try {
    // create a new handle
    const newHandle = await window.showSaveFilePicker({ suggestedName: fileName });

    // create a FileSystemWritableFileStream to write to
    const writableStream = await newHandle.createWritable();

    // write our file
    await writableStream.write(data);

    // close the file and write the contents to disk.
    await writableStream.close();

    // alert("Fil sparad!");
  } catch (e) {
    // alert("Något gick snett :( \n" + e.message);
    console.log(e.message)
  }
}

function getNonEmptyFeatures(inputLayer) {
  const returnArray = [];
  inputLayer.getSource().forEachFeature(feature => {
    if (feature.getGeometry().getCoordinates().length > 0) {
      returnArray.push(feature);
    }
  });
  return returnArray;
}

document.getElementById("exportGPXButton").onclick = () => {
  const fileFormat = new GPX();
  const collection = new Collection();
  const fileName = "Rutt_" + new Date().toLocaleDateString().replaceAll(" ", "_") + "_" + trackLength.toFixed(2) + "km";
  collection.extend(poiLayer.getSource().getFeatures());
  collection.extend(getNonEmptyFeatures(routeLineLayer));
  collection.extend(getNonEmptyFeatures(voiceHintsLayer));

  const gpxFile = fileFormat.writeFeatures(collection.getArray(), {
    dataProjection: "EPSG:4326",
    featureProjection: "EPSG:3857",
    decimals: 5,
  });
  const blob = new Blob([gpxFile], { type: "application/gpx+xml" });
  saveFile(blob, fileName + ".gpx");
}

document.getElementById("saveGeoJsonButton").onclick = () => {
  const fileName = "Projekt_" + new Date().toLocaleString().replaceAll(" ", "_");
  const fileFormat = new GeoJSON();
  const collection = new Collection();

  collection.extend(poiLayer.getSource().getFeatures());
  collection.extend(getNonEmptyFeatures(routePointsLineStringLayer));
  collection.extend(getNonEmptyFeatures(drawLayer));

  const geoJsonFile = fileFormat.writeFeatures(collection.getArray(), {
    dataProjection: "EPSG:4326",
    featureProjection: "EPSG:3857",
    decimals: 5,
  });
  const blob = new Blob([geoJsonFile], { type: "application/json" });
  saveFile(blob, fileName + ".geojson");
  // menuDivcontent.replaceChildren();
}

document.getElementById("gpxOpacity").addEventListener("change", function () {
  gpxLayer.setOpacity(parseFloat(document.getElementById("gpxOpacity").value));
});
document.getElementById("clearMapButton").onclick = clearMap;

function clearMap() {
  document.getElementById("currentLoadedName").innerHTML = "";
  document.getElementById("totalTime").innerHTML = "";
  document.getElementById("trackLength").innerHTML = "";
  routePointsLineString.setCoordinates([]);
  routeLineString.setCoordinates([]);
  routePointsLayer.getSource().clear();
  voiceHintsLayer.getSource().clear();
  poiLayer.getSource().clear();
  gpxLayer.getSource().clear();
  drawLayer.getSource().clear();
  drawLayer.getSource().addFeature(newDrawFeature);
  localStorage.removeItem("poiString");
  localStorage.removeItem("routePoints");
  localStorage.removeItem("gpxLayer");
  localStorage.removeItem("drawFeatures");
  lineStringId = 0;
  // document.location.reload();
};

document.getElementById("reverseRoute").addEventListener("click", function () {
  routePointsLineString.setCoordinates(routePointsLineString.getCoordinates().reverse());
  contextPopup.setPosition();
  routeMe();
});

const newTileLayer = new VectorTileLayer({
  source: new VectorTileSource({
    format: new MVT(),
    // url: './tiles/{z}/{x}/{y}.pbf',
    url: 'https://jole84.se/tiles/{z}/{x}/{y}.pbf',
    minZoom: 6,
    maxZoom: 14,
  }),
  maxZoom: 16.5,
  newTileLayer: true,
  style: styleStuff,
  declutter: true,
});

const ortofoto = new TileLayer({
  source: new TileWMS({
    url: "https://minkarta.lantmateriet.se/map/ortofoto/",
    params: {
      layers: "Ortofoto_0.5,Ortofoto_0.4,Ortofoto_0.25,Ortofoto_0.16",
      TILED: true,
    },
  }),
  minZoom: 16.5,
});

const topoweb = new TileLayer({
  source: new XYZ({
    url: "https://minkarta.lantmateriet.se/map/topowebbcache/?layer=topowebb&style=default&tilematrixset=3857&Service=WMTS&Request=GetTile&Version=1.0.0&Format=image/png&TileMatrix={z}&TileCol={x}&TileRow={y}",
    maxZoom: 17,
  }),
  visible: false,
});

const osm = new TileLayer({
  className: "saturated",
  source: new OSM(),
  visible: false,
});

// vector layers:
const routeLineString = new MultiLineString([]);
const routeLineLayer = new VectorLayer({
  source: new VectorSource({
    features: [new Feature({
      geometry: routeLineString,
      routeLineString: true,
    })],
  }),
  style: function (feature) {
    return new Style({
      stroke: new Stroke({
        width: 10,
        color: [255, 0, 255, 0.4],
      }),
    })
  }
});

const routePointStyle = {
  startPoint: new Style({
    image: new Icon({
      anchor: [0.5, 1],
      opacity: 0.85,
      src: "https://jole84.se/images/start-marker.svg",
    }),
  }),
  midPoint: new Style({
    image: new Icon({
      anchor: [0.5, 1],
      opacity: 0.85,
      src: "https://jole84.se/images/marker.svg",
    }),
  }),
  endPoint: new Style({
    image: new Icon({
      anchor: [0.5, 1],
      opacity: 0.85,
      src: "https://jole84.se/images/end-marker.svg",
    }),
  }),
}

function getPointType(i, y) {
  if (i == 0) {
    return "startPoint";
  } else if (i == y - 1) {
    return "endPoint";
  } else {
    return "midPoint";
  }
}

const routePointsLayer = new VectorLayer({
  source: new VectorSource(),
  style: function (feature) {
    return routePointStyle[feature.get("pointType")];
  },
});

const routePointsLineString = new LineString([]);
const routePointsLineStringLayer = new VectorLayer({
  source: new VectorSource({
    features: [new Feature({
      geometry: routePointsLineString,
      routePointsLineString: true,
    })],
  }),
  style: routePointsLayerStyle,
});

function routePointsLayerStyle(feature) {
  const geometry = feature.getGeometry();
  const styles = [new Style({
    stroke: new Stroke({
      color: [255, 0, 0, 0.6],
      lineDash: [20],
      width: 6,
    })
  })];

  geometry.forEachSegment(function (start, end) {
    const dx = end[0] - start[0];
    const dy = end[1] - start[1];
    const halfx = (start[0] + end[0]) / 2
    const halfy = (start[1] + end[1]) / 2
    const rotation = Math.atan2(dy, dx);
    // arrows
    styles.push(
      new Style({
        geometry: new Point([halfx, halfy]),
        image: new Icon({
          src: 'https://openlayers.org/en/latest/examples/data/arrow.png',
          color: [255, 0, 0, 0.6],
          // anchor: [-3, 0.5],
          scale: 2,
          rotateWithView: true,
          rotation: -rotation,
        }),
        // image: new RegularShape({
        //   fill: new Fill({
        //     color: [255, 0, 0, 0.6]
        //   }),
        //   points: 3,
        //   radius: 25,
        //   displacement: [25, 0],
        //   rotation: -rotation,
        //   angle: Math.PI / 2 // rotate 90°
        // })
      }),
    );
  });

  return styles;
}

routePointsLineString.addEventListener("change", function () {
  const routePoints = routePointsLineString.getCoordinates();
  localStorage.routePoints = JSON.stringify(routePoints);
  const currentFeatures = [];
  routePointsLayer.getSource().forEachFeature(function (feature) {
    currentFeatures[feature.getId()] = feature.get("straight");
  });
  routePointsLayer.getSource().clear();
  for (var i = 0; i < routePoints.length; i++) {
    const routePointMarker = new Feature({
      geometry: new Point(routePoints[i]),
      straight: currentFeatures[i] || false,
      routePointMarker: true,
      pointType: getPointType(i, routePoints.length),
    });
    routePointMarker.setId(i);
    routePointsLayer.getSource().addFeature(routePointMarker);
  };
});

const modifyRoutePointsLineString = new Modify({ source: routePointsLineStringLayer.getSource() });
modifyRoutePointsLineString.addEventListener("modifyend", function () {
  routeMe();
});


const voiceHintsLayer = new VectorLayer({
  source: new VectorSource(),
  style: gpxStyle,
});

const translateArray = {
  "turn": "sväng",
  // "new name": "nytt vägnamn", //?
  // "depart": "start",
  "arrive": "ankomst",
  // "merge": "sammansätt?", //?
  "on ramp": "påfart",
  "off ramp": "avfart",
  // "fork": "", //?
  "end of road": "slutet av vägen sväng",
  // "continue": "fortsätt",
  // "roundabout": "rondell",
  // "rotary": "rondell",
  "roundabout turn": "i rondellen sväng",
  // "notification": "", //?
  "exit roundabout": "kör ut ur rondell",
  "exit rotary": "kör ut ur rondell",
  // turns
  "uturn": "u-sväng",
  "sharp right": "höger",
  "right": "höger",
  "slight right": "höger",
  "straight": "rakt",
  "slight left": "vänster",
  "left": "vänster",
  "sharp left": "vänster",
  1: "första utfarten",
  2: "andra utfarten",
  3: "tredje utfarten",
  4: "fjärde utfarten",
  5: "femte utfarten",
};

function createTurnHint(routeStep) {
  console.log(routeStep);
  const destinations = routeStep.destinations;
  const maneuverType = routeStep.maneuver.type;
  const maneuverModifier = routeStep.maneuver.modifier;
  const roundaboutExit = routeStep.maneuver.exit;
  const maneuverName = routeStep.name;
  const rampExit = routeStep.exits;
  const ref = routeStep.ref;

  if (!translateArray.hasOwnProperty(maneuverType)) {
    return
  }

  const turnString = [];

  if (["exit roundabout", "exit rotary"].includes(maneuverType)) {
    turnString.push(destinations);
    turnString.push(translateArray[maneuverType]);
    turnString.push(translateArray[roundaboutExit]);
  }

  if (["roundabout turn"].includes(maneuverType)) {
    turnString.push(destinations);
    turnString.push(translateArray[maneuverType]);
    turnString.push(translateArray[maneuverModifier]);
  }

  if (["arrive"].includes(maneuverType)) {
    turnString.unshift(translateArray[maneuverType]);
  }

  if (["turn", "end of road"].includes(maneuverType)) {
    turnString.push(translateArray[maneuverType]);
    turnString.push(translateArray[maneuverModifier]);
  }

  if (["on ramp", "off ramp"].includes(maneuverType)) {
    turnString.push(translateArray[maneuverType]);
    turnString.push(destinations);
    turnString.push(rampExit);
    turnString.push(ref);
  }
  turnString.push(maneuverName);

  const stepManeuverCoordinates = fromLonLat(routeStep.maneuver.location);
  const marker = new Feature({
    name: turnString.join(" ").trim(),
    geometry: new Point(stepManeuverCoordinates),
  });
  voiceHintsLayer.getSource().addFeature(marker);
}

const poiLayer = new VectorLayer({
  source: new VectorSource(),
  style: function (feature) {
    return new Style({
      image: new Icon({
        anchor: [0.5, 1],
        opacity: 0.9,
        src: "https://jole84.se/images/white-marker.svg",
        color: "magenta",
        scale: 0.8,
      }),
      text: new Text({
        text: feature.get("name"),
        font: "14px Roboto,monospace",
        textAlign: "left",
        offsetX: 10,
        fill: new Fill({
          color: "#b41412",
        }),
        backgroundFill: new Fill({
          color: [255, 255, 255, 0.9],
        }),
        backgroundStroke: new Stroke({
          color: [0, 0, 0, 0.9],
          width: 1.5,
        }),
        padding: [2, 1, 0, 2],
      }),
    });
  },
});
const modifyPoiLayer = new Modify({ source: poiLayer.getSource() });

poiLayer.getSource().addEventListener("change", function () {
  const poiFeatures = poiLayer.getSource().getFeatures();
  const geoJsonFile = new GeoJSON().writeFeatures(poiFeatures);
  localStorage.poiString = geoJsonFile;
});
try {
  poiLayer.getSource().addFeatures(new GeoJSON().readFeatures(localStorage.poiString));
} catch (error) {
  console.log(error);
}

JSON.parse(localStorage.routePoints || "[]").forEach(function (element) {
  routePointsLineString.appendCoordinate(element);
});
routeMe();

const multipleColors = [
  [0, 0, 255, 0.6], // blue standard
  [255, 0, 255, 0.6], // magenta
  [255, 0, 0, 0.6], // red
  [0, 150, 0, 0.6], // green
  [255, 255, 0, 0.6], // yellow
  [0, 255, 255, 0.6], // aqua
]

function gpxStyle(feature) {
  const featureType = feature.getGeometry().getType();
  if (featureType == "Point") {
    return new Style({
      image: new Icon({
        anchor: [0.5, 1],
        src: "https://jole84.se/images/white-marker.svg",
        color: "red",
        opacity: 0.8,
        scale: 0.8,
      }),
      text: new Text({
        text: feature.get("name"),
        font: "13px B612, sans-serif",
        placement: "line",
        textAlign: "left",
        textBaseline: "bottom",
        offsetX: 10,
        fill: new Fill({
          color: "#b41412",
        }),
        backgroundFill: new Fill({
          color: [255, 255, 255, 0.9],
        }),
        backgroundStroke: new Stroke({
          color: [0, 0, 0, 0.9],
          width: 1.5,
        }),
        padding: [0, 0, 0, 1],
      }),
    });
  }

  if (featureType == "LineString" || featureType == "MultiLineString") {
    return new Style({
      stroke: new Stroke({
        // color: [0, 0, 255, 0.6],
        color: multipleColors[feature.getId()] || [Math.random() * 255, Math.random() * 255, Math.random() * 255, 0.6],
        width: 10,
      }),
    });
  }

  if (featureType == "Polygon" || featureType == "MultiPolygon") {
    return new Style({
      stroke: new Stroke({
        color: [255, 0, 0, 1],
        width: 2,
      }),
      fill: new Fill({
        color: [255, 0, 0, 0.2],
      }),
      text: new Text({
        text: feature.get("name"),
        font: "13px B612, sans-serif",
        overflow: true,
        fill: new Fill({
          color: "#b41412",
        }),
        stroke: new Stroke({
          color: "white",
          width: 4,
        }),
      }),
    });
  }
}

const gpxLayer = new VectorLayer({
  source: new VectorSource(),
  style: gpxStyle,
  declutter: true,
});

let lineStringId = 0;
// gpxLayer.getSource().addEventListener("change", function () {
//   const poiString = [];
//   gpxLayer.getSource().forEachFeature(function (feature) {
//     poiString.push([feature.getGeometry().getType(), feature.getGeometry().getCoordinates(), feature.get("name")]);
//   });
//   localStorage.gpxLayer = JSON.stringify(poiString);
// });

// JSON.parse(localStorage.gpxLayer || "[]").forEach(function (element) {
//   const geomType = element[0];
//   const coordinates = element[1];
//   const name = element[2];
//   const newFeature = new Feature({
//     geometry: newGeom(geomType, coordinates),
//     name: name,
//     gpxFeature: true,
//   });
//   if (newFeature.getGeometry().getType() == "LineString" || newFeature.getGeometry().getType() == "MultiLineString") {
//     newFeature.setId(0);
//   }
//   gpxLayer.getSource().addFeature(newFeature);
// });

// function newGeom(featureType, coordinates) {
//   if (featureType == "Point") {
//     return new Point(coordinates);
//   }
//   if (featureType == "LineString") {
//     return new LineString(coordinates);
//   }
//   if (featureType == "MultiLineString") {
//     return new MultiLineString(coordinates);
//   }
//   if (featureType == "Polygon") {
//     return new Polygon(coordinates);
//   }
//   if (featureType == "MultiPolygon") {
//     return new MultiPolygon(coordinates);
//   }
// }

const drawLayer = new VectorLayer({
  source: new VectorSource(),
  style: function (feature) {
    return new Style({
      stroke: new Stroke({
        color: [255, 0, 0, 0.5],
        width: 10,
      }),
      text: new Text({
        text: "Markering\n" + feature.get("name"),
        font: "12px Roboto,monospace",
        // offsetX: 10,
        fill: new Fill({
          color: "black",
        }),
        backgroundFill: new Fill({
          color: [255, 255, 255, 0.9],
        }),
        backgroundStroke: new Stroke({
          color: [0, 0, 0, 0.9],
          width: 1.5,
        }),
        padding: [2, 0, 0, 2],
      }),
    })
  }
});

const newDrawFeature = new Feature({
  geometry: new LineString([]),
});
newDrawFeature.setId(0);
drawLayer.getSource().addFeature(newDrawFeature);
drawLayer.getSource().addEventListener("change", function () {
  const drawFeatures = [];
  drawLayer.getSource().forEachFeature(function (feature) {
    if (feature.getId() != 0) {
      feature.set("drawing", true);
      feature.set("name", featureLengthString(getLength(feature.getGeometry())))
      drawFeatures.push(feature.getGeometry().getCoordinates());
    }
  });
  localStorage.drawFeatures = JSON.stringify(drawFeatures);
});

newDrawFeature.addEventListener("change", function () {
  newDrawFeature.set("name", featureLengthString(getLength(newDrawFeature.getGeometry())));
});

function featureLengthString(featureLength) {
  return featureLength > 1000 ? (featureLength / 1000).toFixed(2) + "km" : Math.round(featureLength) + "m";
}

JSON.parse(localStorage.drawFeatures || "[]").forEach(function (element) {
  if (element.length > 0) {
    drawLayer.getSource().addFeature(new Feature({
      geometry: new LineString(element)
    }));
  }
});

const view = new View({
  center: JSON.parse(localStorage.centerCoordinate),
  zoom: JSON.parse(localStorage.centerZoom),
  minZoom: 3,
  maxZoom: 20,
  enableRotation: false,
});

const map = new Map({
  target: "map",
  layers: [
    newTileLayer,
    ortofoto,
    topoweb,
    osm,
    gpxLayer,
    routeLineLayer,
    routePointsLineStringLayer,
    routePointsLayer,
    voiceHintsLayer,
    poiLayer,
    drawLayer,
  ],
  view: view,
  keyboardEventTarget: document,
});

// map.addInteraction(modifyroutePoints);
map.addInteraction(modifyRoutePointsLineString);
map.addInteraction(modifyPoiLayer);

window.onbeforeunload = function () {
  localStorage.centerCoordinate = JSON.stringify(view.getCenter());
  localStorage.centerZoom = view.getZoom();
}

function getPixelDistance(pixel, pixel2) {
  return Math.sqrt((pixel[1] - pixel2[1]) * (pixel[1] - pixel2[1]) + (pixel[0] - pixel2[0]) * (pixel[0] - pixel2[0]));
}

function switchMap() {
  layerSelector.value = localStorage.mapMode;
  newTileLayer.setVisible(false);
  ortofoto.setVisible(false);
  topoweb.setVisible(false);
  osm.setVisible(false);

  if (localStorage.mapMode == 0) {
    newTileLayer.setVisible(true);
    newTileLayer.getSource().refresh({ force: true });
    ortofoto.setVisible(true);
    ortofoto.setMinZoom(16.5);
  } else if (localStorage.mapMode == 1) {
    newTileLayer.setVisible(true);
    newTileLayer.getSource().refresh({ force: true });
    ortofoto.setVisible(true);
    ortofoto.setMinZoom(16.5);
  } else if (localStorage.mapMode == 2) {
    topoweb.setVisible(true);
  } else if (localStorage.mapMode == 3) {
    ortofoto.setVisible(true);
    ortofoto.setMinZoom(1);
    ortofoto.setMaxZoom(20);
  } else if (localStorage.mapMode == 4) {
    osm.setVisible(true);
  }
}
document.getElementById("layerSelector").addEventListener("change", function () {
  localStorage.mapMode = layerSelector.value;
  switchMap();
});
switchMap();

function routeMeOSR() {
  const coordsString = [];
  const straightPoints = [];
  voiceHintsLayer.getSource().clear();
  routePointsLayer.getSource().forEachFeature(function (feature) {
    coordsString[feature.getId()] = toLonLat(feature.getGeometry().getCoordinates());
    if (feature.get("straight")) {
      straightPoints.push(feature.getId());
    }
  });

  fetch(`https://api.openrouteservice.org/v2/directions/driving-car/geojson?`, {
    method: "post",
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Accept': 'application/json, application/geo+json, application/gpx+xml, img/png; charset=utf-8',
      'Authorization': '5b3ce3597851110001cf62482ba2170071134e8a80497f7f4f2a0683'
    },
    body: JSON.stringify({
      coordinates: coordsString,
      maneuvers: true,
      // skip_segments: [1],
      // options: {
      // avoid_features: ["highways"],
      // round_trip: {
      //   length: 100000,
      //   points: 2,
      //   seed: 5
      // }
      // },
    })
  }).then(response => {
    return response.json();
  }).then(result => {
    console.log(result);
    // destinationCoordinates[destinationCoordinates.length - 1] = result.features[0].geometry.coordinates[result.features[0].geometry.coordinates.length - 1];
    const format = new GeoJSON();
    const newGeometry = format.readFeature(result.features[0].geometry, {
      dataProjection: "EPSG:4326",
      featureProjection: "EPSG:3857"
    });

    trackLength = result.features[0].properties.summary.distance / 1000; // track-length in km
    const totalTime = result.features[0].properties.summary.duration * 1000;
    document.getElementById("trackLength").innerHTML = "Avstånd: " + trackLength.toFixed(2) + " km";
    document.getElementById("totalTime").innerHTML = "Restid: " + new Date(0 + totalTime).toUTCString().toString().slice(16, 25);

    const newGeometryCoordinates = newGeometry.getGeometry().getCoordinates();
    newGeometryCoordinates.push(fromLonLat(coordsString[coordsString.length - 1]));
    routeLineString.setCoordinates([newGeometryCoordinates]);
  });
}

function routeMe() {
  const coordsString = [];
  const straightPoints = [];
  voiceHintsLayer.getSource().clear();
  routePointsLayer.getSource().forEachFeature(function (feature) {
    coordsString[feature.getId()] = toLonLat(feature.getGeometry().getCoordinates());
    if (feature.get("straight")) {
      straightPoints.push(feature.getId());
    }
  });

  if (coordsString.length >= 2) {
    if (localStorage.routeMode == "direkt") {
      routeLineString.setCoordinates([routePointsLineString.getCoordinates()]);
      trackLength = getLength(routePointsLineString) / 1000;
      document.getElementById("trackLength").innerHTML = "Avstånd: " + trackLength.toFixed(2) + " km";
    } else {
      // localStorage.routeMode
      // straightPoints
      // ${localStorage.routeMode}
      const params = new URLSearchParams({
        // exclude: ["motorway"],
        // annotations: true,
        // radiuses: 50,
        geometries: 'geojson',
        continue_straight: false,
        overview: 'full',
        generate_hints: false,
        skip_waypoints: true,
        steps: enableVoiceHint // || true,
      });
      fetch(`https://router.project-osrm.org/route/v1/driving/${coordsString.join(";")}?` + params).then(response => {
        return response.json();
      }).then(result => {
        console.log(result)
        const format = new GeoJSON();
        const newGeometry = format.readFeature(result.routes[0].geometry, {
          dataProjection: "EPSG:4326",
          featureProjection: "EPSG:3857"
        });

        trackLength = result.routes[0].distance / 1000; // track-length in km
        const totalTime = result.routes[0].duration * 1000; // track-time in milliseconds
        document.getElementById("trackLength").innerHTML = "Avstånd: " + trackLength.toFixed(2) + " km";
        document.getElementById("totalTime").innerHTML = "Restid: " + new Date(0 + totalTime).toUTCString().toString().slice(16, 25);

        const newGeometryCoordinates = newGeometry.getGeometry().getCoordinates();
        newGeometryCoordinates.push(fromLonLat(coordsString[coordsString.length - 1]));
        routeLineString.setCoordinates([newGeometryCoordinates]);

        const legs = result.routes[0].legs;
        for (const leg of legs) {
          for (const step of leg.steps) {
            createTurnHint(step);
          }
        }
      }).catch((error) => {
        document.getElementById("info1").innerHTML = "OSRM error:<br>" + error;
        routeMeOSR();
      });
    }
  } else {
    routeLineString.setCoordinates([]);
  }
}

// add context menu popup
const contextPopupDiv = document.getElementById('contextPopup');
const contextPopupContent = document.getElementById("contextPopupContent");
const contextPopup = new Overlay({
  element: contextPopupDiv,
  positioning: "bottom-left",
});
map.addOverlay(contextPopup);

document.getElementById("contextPopupCloser").addEventListener("click", function () {
  contextPopup.setPosition();
});

map.addEventListener("contextmenu", function (event) {
  if (!window.matchMedia("(pointer: coarse)").matches && !enableTouchControls) {
    if (!event.originalEvent.altKey) {
      event.preventDefault();
      const closestRoutePoint = routePointsLayer.getSource().getClosestFeatureToCoordinate(event.coordinate);
      if (closestRoutePoint) {
        const closestRoutePointId = closestRoutePoint.getId();
        const distanceToClosestRoutePoint = getPixelDistance(map.getPixelFromCoordinate(closestRoutePoint.getGeometry().getCoordinates()), map.getPixelFromCoordinate(event.coordinate))
        if (distanceToClosestRoutePoint < 40) {
          routePointsLayer.getSource().removeFeature(closestRoutePoint);
          const newRoutePoints = [];
          for (let i = 0; i < routePointsLayer.getSource().getFeatures().length + 1; i++) {
            if (i === closestRoutePointId) {
              continue;
            }
            newRoutePoints.push(routePointsLayer.getSource().getFeatureById(i).getGeometry().getCoordinates());
          };
          routePointsLineString.setCoordinates(newRoutePoints);
        } else {
          routePointsLineString.appendCoordinate(event.coordinate);
        }
      } else {
        routePointsLineString.appendCoordinate(event.coordinate);
      }

      routeMe();
    }
  }
});

contextPopupContent.addEventListener("click", function () { // copy coordinates
  navigator.clipboard.writeText(contextPopupContent.innerHTML);
});

function openContextPopup(coordinate) {
  const coordinatePixel = map.getPixelFromCoordinate(coordinate);
  contextPopup.setPosition(coordinate);
  contextPopup.panIntoView({ animation: { duration: 250 }, margin: 10 });
  const closestPoi = poiLayer.getSource().getClosestFeatureToCoordinate(coordinate);

  document.getElementById("removeDrawing").style.display = "none";
  document.getElementById("removeGpxFeature").style.display = "none";
  document.getElementById("convertGpxFeature").style.display = "none";
  document.getElementById("editPoiButton").style.display = "none";
  // document.getElementById("flipStraight").style.display = "none";

  let drawingToRemove;
  let gpxFeatureToRemove;
  map.forEachFeatureAtPixel(coordinatePixel, function (feature) {
    console.log(feature.getProperties());
    if (feature.get("poi") && closestPoi) {
      document.getElementById("editPoiButton").innerHTML = 'Byt namn på POI "' + closestPoi.get("name") + '"';
      document.getElementById("editPoiButton").style.display = "unset";
    }
    if (feature.get("drawing")) {
      drawingToRemove = feature;
      document.getElementById("removeDrawing").innerHTML = 'Ta bort markering "' + feature.get("name") + '"';
      document.getElementById("removeDrawing").style.display = "unset";
    }
    if (feature.get("gpxFeature")) {
      gpxFeatureToRemove = feature;
      document.getElementById("removeGpxFeature").innerHTML = feature.get("name") ? 'Ta bort "' + feature.get("name") + '"' : "Ta bort GPX";
      document.getElementById("removeGpxFeature").style.display = "unset";
      document.getElementById("convertGpxFeature").style.display = "unset";
    }
    document.getElementById("removeDrawing").onclick = function () {
      drawLayer.getSource().removeFeature(drawingToRemove);
      contextPopup.setPosition();
    }
    document.getElementById("removeGpxFeature").onclick = function () {
      gpxLayer.getSource().removeFeature(gpxFeatureToRemove);
      contextPopup.setPosition();
    }
    document.getElementById("convertGpxFeature").onclick = function () {
      gpxFeatureToRemove.set("gpxFeature", false);
      if (gpxFeatureToRemove.getGeometry().getType() === "LineString") {
        gpxFeatureToRemove.getGeometry().simplify(500).getCoordinates().forEach(function (coordinate) {
          routePointsLineString.appendCoordinate(coordinate);
        });
      }
      if (gpxFeatureToRemove.getGeometry().getType() === "MultiLineString") {
        gpxFeatureToRemove.getGeometry().getLineString(0).simplify(500).getCoordinates().forEach(function (coordinate) {
          routePointsLineString.appendCoordinate(coordinate);
        });
      }
      if (gpxFeatureToRemove.getGeometry().getType() === "Point") {
        poiLayer.getSource().addFeature(gpxFeatureToRemove);
      }
      gpxLayer.getSource().removeFeature(gpxFeatureToRemove);
      routeMe();
      contextPopup.setPosition();
    }
  });

  const closestRoutePoint = routePointsLayer.getSource().getClosestFeatureToCoordinate(coordinate);
  if (closestRoutePoint) {
    const distanceToClosestRoutePoint = getPixelDistance(map.getPixelFromCoordinate(closestRoutePoint.getGeometry().getCoordinates()), coordinatePixel)
    if (distanceToClosestRoutePoint < 40) {
      document.getElementById("removeRoutePosition").style.display = "unset";
    } else {
      document.getElementById("removeRoutePosition").style.display = "none";
    }
  } else {
    document.getElementById("removeRoutePosition").style.display = "none";
  }

  if (closestPoi) {
    const distanceToClosestPoi = getPixelDistance(map.getPixelFromCoordinate(closestPoi.getGeometry().getCoordinates()), coordinatePixel);
    if (distanceToClosestPoi < 40) {
      document.getElementById("removePoiButton").style.display = "unset";
      document.getElementById("removePoiButton").innerHTML = '✖ Ta bort POI "' + closestPoi.get("name") + '"';
    } else {
      document.getElementById("removePoiButton").style.display = "none";
    }
  } else {
    document.getElementById("removePoiButton").style.display = "none";
  }

  contextPopupContent.innerHTML = toStringXY(toLonLat(coordinate).reverse(), 5);
}

map.addEventListener("click", function (event) {
  if (!window.matchMedia("(pointer: coarse)").matches && !enableTouchControls) {
    if (contextPopup.getPosition()) {
      // hide if visible
      contextPopup.setPosition();
    } else {
      openContextPopup(event.coordinate);
    }
  }
});

map.on("pointermove", function (evt) {
  const hit = map.hasFeatureAtPixel(evt.pixel, {
    layerFilter: function (layerCandidate) {
      return !layerCandidate.get("newTileLayer");
    }
  });
  if (hit) {
    this.getTargetElement().style.cursor = "pointer";
  } else {
    this.getTargetElement().style.cursor = "auto";
  }
});

document.addEventListener("mouseup", function () {
  if (newDrawFeature.getGeometry().getCoordinates().length > 0) {
    const newDrawFeatureCopy = newDrawFeature.clone();
    newDrawFeatureCopy.setGeometry(newDrawFeatureCopy.getGeometry().simplify(20));
    drawLayer.getSource().addFeature(newDrawFeatureCopy);
    newDrawFeature.getGeometry().setCoordinates([]);
  }
});

map.on("pointerdrag", function (evt) {
  if (evt.originalEvent.altKey) {
    newDrawFeature.getGeometry().appendCoordinate(evt.coordinate);
  }
});

document.addEventListener("keydown", function (event) {
  // if (event.key == "s") {
  //   console.log("gpxLayer", gpxLayer.getSource().getFeatures().length);
  //   console.log("routeLineLayer", routeLineLayer.getSource().getFeatures().length);
  //   console.log("routePointsLineStringLayer", routePointsLineStringLayer.getSource().getFeatures().length);
  //   console.log("routePointsLayer", routePointsLayer.getSource().getFeatures().length);
  //   console.log("voiceHintsLayer", voiceHintsLayer.getSource().getFeatures().length);
  //   console.log("poiLayer", poiLayer.getSource().getFeatures().length);
  //   console.log("drawLayer", drawLayer.getSource().getFeatures().length);
  // }

  if (!menuDivcontent.checkVisibility()) {
    if (event.key == "Backspace") {
      const newroutePointsLineString = routePointsLineString.getCoordinates();
      newroutePointsLineString.pop()
      routePointsLineString.setCoordinates(newroutePointsLineString);
      routeMe();
    }
  }
});

document.getElementById("gmaplink").addEventListener("click", function () {
  var gmaplink = "http://maps.google.com/maps?q=" + toLonLat(contextPopup.getPosition()).reverse();
  window.open(gmaplink);
});

document.getElementById("streetviewlink").addEventListener("click", function () {
  var gmaplink = "http://maps.google.com/maps?layer=c&cbll=" + toLonLat(contextPopup.getPosition()).reverse();
  window.open(gmaplink);
});

document.getElementById("addRoutePosition").addEventListener("click", function () {
  routePointsLineString.appendCoordinate(contextPopup.getPosition());
  contextPopup.setPosition();
  routeMe();
});

document.getElementById("removeRoutePosition").addEventListener("click", function () {
  const closestRoutePoint = routePointsLayer.getSource().getClosestFeatureToCoordinate(contextPopup.getPosition());
  const closestRoutePointId = closestRoutePoint.getId();
  routePointsLayer.getSource().removeFeature(closestRoutePoint);
  const newRoutePoints = [];
  for (let i = 0; i < routePointsLayer.getSource().getFeatures().length + 1; i++) {
    if (i === closestRoutePointId) {
      continue;
    }
    newRoutePoints.push(routePointsLayer.getSource().getFeatureById(i).getGeometry().getCoordinates());
  };
  routePointsLineString.setCoordinates(newRoutePoints);
  routeMe();
  contextPopup.setPosition();
});

document.getElementById("addPoiButton").addEventListener("click", function () {
  poiPosition = contextPopup.getPosition();
  menuDivcontent.replaceChildren(savePoiNameInput);
  contextPopup.setPosition();
  poiFileName.select();
  poiFileName.placeholder = toStringXY(toLonLat(poiPosition).reverse(), 5);
});

document.getElementById("editPoiButton").addEventListener("click", function () {
  const closestPoi = poiLayer.getSource().getClosestFeatureToCoordinate(contextPopup.getPosition());
  poiPosition = closestPoi.getGeometry().getCoordinates();
  menuDivcontent.replaceChildren(savePoiNameInput);
  contextPopup.setPosition();
  poiFileName.select();
  poiFileName.value = closestPoi.get("name");
  poiLayer.getSource().removeFeature(closestPoi);
});

document.getElementById("savePoiOkButton").addEventListener("click", function () {
  addPoi(poiPosition, poiFileName.value || poiFileName.placeholder);
  menuDivcontent.replaceChildren();
  poiFileName.value = "";
});

function addPoi(poiPosition, name) {
  const poiMarker = new Feature({
    geometry: new Point(poiPosition),
    name: name,
    poi: true,
  });
  poiLayer.getSource().addFeature(poiMarker);
}

document.getElementById("removePoiButton").addEventListener("click", function () {
  const closestPoi = poiLayer.getSource().getClosestFeatureToCoordinate(contextPopup.getPosition());
  poiLayer.getSource().removeFeature(closestPoi);
  contextPopup.setPosition();
});

addPositionButton.addEventListener("click", function (event) {
  routePointsLineString.appendCoordinate(map.getView().getCenter());
  routeMe();
});

contextPopupButton.addEventListener("click", function (event) {
  if (contextPopup.getPosition()) {
    // hide if visible
    contextPopup.setPosition();
  } else {
    openContextPopup(map.getView().getCenter());
  }
});

removePositionButton.addEventListener("click", function (event) {
  try {
    const closestRoutePoint = routePointsLayer.getSource().getClosestFeatureToCoordinate(map.getView().getCenter());
    const closestRoutePointDistance = getPixelDistance(
      map.getPixelFromCoordinate(map.getView().getCenter()),
      map.getPixelFromCoordinate(closestRoutePoint.getGeometry().getCoordinates())
    );
    const closestRoutePointId = closestRoutePoint.getId();
    if (closestRoutePointDistance < 40) {
      routePointsLayer.getSource().removeFeature(closestRoutePoint);
    }
    const newRoutePoints = [];
    for (let i = 0; i < routePointsLayer.getSource().getFeatures().length + 1; i++) {
      if (i === closestRoutePointId) {
        continue;
      }
      newRoutePoints.push(routePointsLayer.getSource().getFeatureById(i).getGeometry().getCoordinates());
    };
    routePointsLineString.setCoordinates(newRoutePoints);
    routeMe();
  } catch {
    console.log("no points found!")
  }
});

// upload route to API
document.getElementById("storeRouteButton").onclick = function () {
  if (localStorage.getItem("token")) {
    showApp(localStorage.getItem("username"));
  }
  menuDivcontent.replaceChildren(routeStorageMenu);
  loadData();
}

document.getElementById("loginButton").onclick = login;
document.getElementById("logoutButton").onclick = logout;
document.getElementById("uploadRouteButton").onclick = uploadRoute;
document.getElementById("deleteUserButton").onclick = deleteUser;
document.getElementById("changePasswordButton").onclick = changePassword;
const uploadsTable = document.getElementById("uploads");

async function api(action, data = {}) {
  const token = localStorage.getItem("token");

  const res = await fetch("https://jole84.se/routeStorage/api.php", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, token, ...data })
  });

  return res.json();
}

async function loadData() {
  const r = await api("list");
  // const username = localStorage.getItem("username");

  console.log(r.uploads);

  document.getElementById("uploads").replaceChildren();
  r.uploads.forEach(u => {
    const is_public = u.is_public == 1;

    const newRow = uploadsTable.insertRow();
    const cell1 = newRow.insertCell(0);
    const cell2 = newRow.insertCell(1);
    const cell3 = newRow.insertCell(2);
    const cell4 = newRow.insertCell(3);
    const cell5 = newRow.insertCell(4);
    const cell6 = newRow.insertCell(5);
    const cell7 = newRow.insertCell(6);

    const elementText = document.createElement("a");
    elementText.innerHTML = u.item_name;
    elementText.classList.add("bold");
    // elementText.classList.add("user-select-all");
    // elementText.title = "Klicka för att kopiera";
    elementText.href = "https://jole84.se/nav-app/index.html?getId=" + u.id;
    cell1.appendChild(elementText);

    // elementText.addEventListener("click", function () {
    //   navigator.clipboard.writeText(elementText.href);
    // });

    cell2.innerHTML = u.is_public ? '<span class="public">(Publik)</span>' : "(Privat)";
    // cell2.classList.add("bold");
    // ladda knapp
    const loadButton = document.createElement("button");
    loadButton.addEventListener("click", () => { loadItem(u) });
    loadButton.innerHTML = "Ladda";
    cell3.appendChild(loadButton);

    if (!!localStorage.token && u.username == localStorage.username) {
      // ta bort knapp
      const removeButton = document.createElement("button");
      removeButton.addEventListener("click", () => { deleteUpload(u) });
      removeButton.innerHTML = "Ta bort";
      cell4.appendChild(removeButton);

      // växla privat knapp
      const makePublicButton = document.createElement("button");
      makePublicButton.addEventListener("click", () => {
        is_public ? makePrivate(u.id) : makePublic(u.id);
      });
      makePublicButton.innerHTML = is_public ? "Gör privat" : "Gör publik";
      cell5.appendChild(makePublicButton);

      // ersätt upload knapp
      const updateButton = document.createElement("button");
      updateButton.addEventListener("click", () => { editItem(u) });
      updateButton.innerHTML = "Ersätt";
      cell6.appendChild(updateButton);
    }

    const creatorText = document.createElement("small");
    creatorText.innerHTML = `By <span class="bold">${u.username}</span> — ${new Date(u.created_at).toLocaleString()}<br>`;
    cell7.appendChild(creatorText);
  });
}

async function uploadRoute() {
  // const name = document.getElementById("uploadName").value;
  const name = prompt("Ange ruttnamn");
  const collection = new Collection();
  const fileFormat = new GeoJSON();

  collection.extend(poiLayer.getSource().getFeatures());
  collection.extend(getNonEmptyFeatures(routePointsLineStringLayer));
  collection.extend(getNonEmptyFeatures(routeLineLayer));
  collection.extend(getNonEmptyFeatures(drawLayer));

  const geoJsonFile = fileFormat.writeFeatures(collection.getArray(), {
    dataProjection: "EPSG:4326",
    featureProjection: "EPSG:3857",
    decimals: 5,
  });

  console.log(geoJsonFile);
  const text = btoa(encodeURIComponent(geoJsonFile));
  if (name) {
    await api("upload", { name, text });
    loadData();
  }
}

async function login() {
  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value;

  const r = await api("login", { username, password });

  if (r.success) {
    localStorage.setItem("token", r.token);
    localStorage.setItem("username", r.username);
    showApp(username);
    loadData();
  } else {
    alert(r.error);
  }
}

function showApp(username) {
  try {
    if (localStorage.token) {
      document.getElementById("loginView").classList.add("invisible");
      document.getElementById("appView").classList.remove("invisible");
      document.getElementById("userLabel").textContent = username;
    } else {
      document.getElementById("loginView").classList.remove("invisible");
      document.getElementById("appView").classList.add("invisible");
    }
  } catch (error) {
    console.log(error);
  }
  // loadData();
}

function logout() {
  localStorage.removeItem("token");
  localStorage.removeItem("username");
  showApp("");
  loadData();
  // location.reload();
}

async function deleteUser() {
  if (!confirm("Delete your account and ALL uploads?")) return;
  await api("delete_user");
  logout();
}

async function changePassword() {
  const old_password = document.getElementById("oldPassword").value;
  const new_password = document.getElementById("newPassword").value;
  const verifyNewPassword = document.getElementById("verifyNewPassword").value;

  if (!old_password || !new_password || (new_password != verifyNewPassword)) return;

  const r = await api("change_password", {
    old_password,
    new_password
  });

  if (r.error) {
    alert(r.error);
    return;
  }

  alert("Password changed successfully");
  document.getElementById("oldPassword").value = "";
  document.getElementById("newPassword").value = "";
}

async function makePublic(id) {
  await api("make_public", { id });
  loadData();
}

async function makePrivate(id) {
  await api("make_private", { id });
  loadData();
}

async function deleteUpload(u) {
  if (!confirm("Ta bort " + u.item_name + "?")) return;
  await api("delete_upload", { "id": u.id });
  loadData();
}

async function loadItem(u) {
  const r = await api("get_item", { id: u.id });

  if (r.error) {
    alert(r.error);
    return;
  }

  const format = new GeoJSON();
  const newGeometry = format.readFeatures(decodeURIComponent(atob(r.item.item_text)), {
    dataProjection: "EPSG:4326",
    featureProjection: "EPSG:3857",
  });

  clearMap();
  document.getElementById("currentLoadedName").innerHTML = u.item_name;
  newGeometry.forEach(element => {
    if (!!element.get("routeLineString")) {
      routeLineString.setCoordinates(element.getGeometry().getCoordinates());
    } else if (!!element.get("poi")) {
      poiLayer.getSource().addFeature(element);
    } else if (!!element.get("drawing")) {
      drawLayer.getSource().addFeature(element);
    } else if (!!element.get("routePointsLineString")) {
      routePointsLineString.setCoordinates(element.getGeometry().getCoordinates());
      routeMe();
    }
  });
}

function editItem(u) {
  // if (!confirm("ersätt upload?")) return;
  const oldName = document.getElementById("currentLoadedName").innerHTML;
  const newMessage = (u.item_name != oldName) ? "Varning ersätter:\n" + u.item_name + " med " + (oldName || "ny rutt\n") : "" + "Ange ruttnamn"

  const name = prompt(newMessage, u.item_name);
  if (!name) return;

  const collection = new Collection();
  const fileFormat = new GeoJSON();
  collection.extend(poiLayer.getSource().getFeatures());
  collection.extend(getNonEmptyFeatures(routePointsLineStringLayer));
  collection.extend(getNonEmptyFeatures(routeLineLayer));
  collection.extend(getNonEmptyFeatures(drawLayer));

  const geoJsonFile = fileFormat.writeFeatures(collection.getArray(), {
    dataProjection: "EPSG:4326",
    featureProjection: "EPSG:3857",
    decimals: 5,
  });

  const text = btoa(encodeURIComponent(geoJsonFile));

  api("update_item", { id: u.id, name: name, text: text })
    .then(() => loadData());
}