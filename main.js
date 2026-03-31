import './style.css';
import { Feature, Map, View } from "ol";
import { Modify } from "ol/interaction.js";
import { Stroke, Style, Icon, Fill, Text } from "ol/style.js";
import { fromLonLat, toLonLat } from "ol/proj.js";
import { toStringXY } from "ol/coordinate";
import { Vector as VectorLayer } from "ol/layer.js";
import { GPX, GeoJSON, KML } from 'ol/format.js';
import Collection from 'ol/Collection.js';
import { Point, MultiLineString, LineString, MultiPoint } from 'ol/geom';
import OSM from "ol/source/OSM.js";
import Overlay from "ol/Overlay.js";
import TileLayer from "ol/layer/Tile";
import TileWMS from "ol/source/TileWMS.js";
import Polyline from 'ol/format/Polyline.js';
import { getLength } from 'ol/sphere';
import VectorSource from "ol/source/Vector.js";
import XYZ from "ol/source/XYZ.js";
import VectorTileLayer from 'ol/layer/VectorTile.js';
import VectorTileSource from 'ol/source/VectorTile.js';
import MVT from 'ol/format/MVT.js';
import { styleStuff } from "https://jole84.se/styleTileFunctions.js"

const addPositionButton = document.getElementById("addPositionButton");
const removePositionButton = document.getElementById("removePositionButton");
const contextPopupButton = document.getElementById("contextPopupButton");
const menuDivcontent = document.getElementById("menuDivContent");
const menuItems = document.getElementById("menuItems");
const exportLinks = document.getElementById("exportLinks");
const routeStorageMenu = document.getElementById("routeStorageMenu");

const destinationCoordinates = {
  coordinates: JSON.parse(localStorage.destinationCoordinates || "[]"),

  changed() {
    localStorage.destinationCoordinates = JSON.stringify(this.coordinates);
    routePointsLayer.getSource().clear();
    this.coordinates.forEach((coordinate) => {
      addRoutePointMarker(coordinate);
    });
    routePointsLineString.setCoordinates(this.coordinates);
    routeMe();
  },

  push(coordinate) {
    this.coordinates.push(coordinate);
    this.changed();
  },

  pop() {
    this.coordinates.pop();
    this.changed();
  },

  remove(index) {
    if (index >= 0 && index < this.coordinates.length) {
      this.coordinates.splice(index, 1);
      this.changed();
    }
  },

  clear() {
    this.coordinates = [];
    this.changed();
  },

  removeCoordinate(coordinate) {
    const coordinatesList = this.coordinates.map(coordinate => String(coordinate));
    const index = coordinatesList.indexOf(String(coordinate));
    this.coordinates.splice(index, 1);
    this.changed();
  },

  getIndexOf(coordinate) {
    const coordinatesList = this.coordinates.map(coordinate => String(coordinate));
    return coordinatesList.indexOf(String(coordinate));
  },

  getClosestPointToCoordinate(coordinate) {
    const newMultiPoint = new MultiPoint(this.coordinates);
    const closestPoint = newMultiPoint.getClosestPoint(coordinate);
    return closestPoint;
  },

  list() {
    return this.coordinates;
  },

  listLonLat() {
    return this.coordinates.map(coordinate => toLonLat(coordinate));
  },

  getCoordinate(index) {
    return this.coordinates[index];
  },

  getLength() {
    return this.coordinates.length;
  },

  update(index, coordinate) {
    this.coordinates[index] = coordinate;
    this.changed();
  },

  getFirstCoordinate() {
    return this.coordinates[0];
  },

  getLastCoordinate() {
    return this.coordinates[this.coordinates.length - 1];
  },
}

let trackLength = 0;
let poiPosition;
let enableClickToAdd = document.getElementById("enableClickToAdd").checked;
let enableClickInfo = document.getElementById("enableClickInfo").checked;
let enableVoiceHint = false;
let shortestRoute = true;
let avoidHighways = false;
let qrCodeLink = new QRCode("qrRoutePlanner", {
  text: "https://jole84.se/nav-app/index.html",
  correctLevel: QRCode.CorrectLevel.M,
  // width: 512,
  // height: 512,
});

sessionStorage.routeMode = document.getElementById("routeModeSelector").value = sessionStorage.routeMode || "OSRM";
document.getElementById("routeModeSelector").addEventListener("change", function (event) {
  sessionStorage.routeMode = document.getElementById("routeModeSelector").value;
  routeMe();
});

localStorage.centerCoordinate = localStorage.centerCoordinate || "[1650000, 8000000]";
localStorage.centerZoom = localStorage.centerZoom || 7;
localStorage.mapMode = localStorage.mapMode || 0; // default map

document.getElementById("openInfoButton").addEventListener("click", () => {
  menuDivcontent.replaceChildren(menuItems);
  document.getElementById("enableVoiceHint").checked = enableVoiceHint;
  document.getElementById("avoidHighways").checked = avoidHighways;
});
let enableTouchControls = document.getElementById("enableTouchControls").checked;
document.getElementById("enableTouchControls").addEventListener("change", function () {
  document.getElementById("map").style.cursor = document.getElementById("enableTouchControls").checked ? "auto" : "crosshair";
  enableTouchControls = document.getElementById("enableTouchControls").checked;
  document.getElementById("crosshair").style.display = enableTouchControls ? "unset" : "none";
  document.getElementById("lowerRightGroup").style.display = enableTouchControls ? "inline" : "none";
});

document.getElementById("enableClickToAdd").addEventListener("change", function () {
  enableClickToAdd = document.getElementById("enableClickToAdd").checked;
});

document.getElementById("enableClickInfo").addEventListener("change", function () {
  infoLayer.getSource().clear();
  enableClickInfo = document.getElementById("enableClickInfo").checked;
});

document.getElementById("enableVoiceHint").addEventListener("change", function () {
  enableVoiceHint = document.getElementById("enableVoiceHint").checked;
  routeMe();
});
document.getElementById("shortestRoute").addEventListener("change", function () {
  shortestRoute = document.getElementById("shortestRoute").checked;
  routeMe();
});
document.getElementById("avoidHighways").addEventListener("change", function () {
  avoidHighways = document.getElementById("avoidHighways").checked;
  routeMe();
});
document.getElementById("menuDivCloseButton").addEventListener("click", () => {
  menuDivcontent.replaceChildren();
});

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
  gpxLayer.getSource().clear();
  getTheFile();
});

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
      if (feature.get("styleUrl")) feature.unset("styleUrl"); // we do not need the styleUrl
      console.log(feature.getProperties());
      if (loadAsProject) {
        if (feature.get("routeMode")) sessionStorage.routeMode = document.getElementById("routeModeSelector").value = feature.get("routeMode");
        if (feature.get("drawing")) {
          drawLayer.getSource().addFeature(feature);
        } else if (feature.get("routePointsLineString")) {
          destinationCoordinates.coordinates = feature.getGeometry().getCoordinates();
          destinationCoordinates.changed();
        } else if (feature.get("routePointMarker")) {
          console.log(feature, "routePointMarker");
          // needs fixing
          // addRoutePointMarker(feature.getGeometry().getCoordinates());
        } else if (feature.getGeometry().getType() === "Point") {
          addPoi(feature.getGeometry().getCoordinates(), feature.get("name"));
        } else {
          if (feature.getGeometry().getType() === "LineString") {
            feature.getGeometry().simplify(500).getCoordinates().forEach((coordinate) => routePointsLineString.appendCoordinate(coordinate));
          }
          if (feature.getGeometry().getType() === "MultiLineString") {
            feature.getGeometry().getLineString(0).simplify(500).getCoordinates().forEach((coordinate) => routePointsLineString.appendCoordinate(coordinate));
          }
        }
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
  let linkCode = "https://jole84.se/nav-app/index.html";
  const url = new URL(linkCode);
  const poiPoints = [];

  // Route waypoints
  if (destinationCoordinates.getLength() > 0) {
    url.searchParams.append("destinationPoints64", btoa(JSON.stringify(destinationCoordinates.listLonLat())));
  }

  // POI
  poiLayer.getSource().forEachFeature(function (feature) {
    poiPoints.push([toCoordinateString(feature.getGeometry().getCoordinates()), encodeURI(feature.get("name"))]);
  });
  if (poiPoints.length > 0) {
    url.searchParams.append("poiPoints64", btoa(JSON.stringify(poiPoints)));
  }

  if (document.getElementById("currentLoadedName").innerHTML == "") {
    qrCodeLink.clear();
    document.getElementById("linkCodeDiv").innerHTML = url;
    document.getElementById("navAppButton").setAttribute("href", url);
    document.getElementById("navAppButton").title = url;
    try {
      qrCodeLink.makeCode(url);
    } catch {
      console.log("qr error");
    }
  }

  document.getElementById("linkCodeDiv").addEventListener("click", function () {
    navigator.clipboard.writeText(linkCode);
  });
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
  // collection.extend(getNonEmptyFeatures(routePointsLineStringLayer));
  collection.extend(routePointsLayer.getSource().getFeatures());
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
document.getElementById("appViewClearMapButton").onclick = clearMap;
document.getElementById("appViewClearMapButton2").onclick = clearMap;

function clearMap() {
  document.getElementById("currentLoadedName").innerHTML = "";
  document.getElementById("totalTime").innerHTML = "";
  document.getElementById("trackLength").innerHTML = "";
  destinationCoordinates.clear();
  voiceHintsLayer.getSource().clear();
  poiLayer.getSource().clear();
  gpxLayer.getSource().clear();
  searchResultLayer.getSource().clear();
  drawLayer.getSource().clear();
  drawLayer.getSource().addFeature(newDrawFeature);
  localStorage.removeItem("poiString");
  localStorage.removeItem("gpxLayer");
  localStorage.removeItem("drawFeatures");
  lineStringId = 0;
  // document.location.reload();
};

document.getElementById("reverseRoute").addEventListener("click", function () {
  destinationCoordinates.coordinates = destinationCoordinates.coordinates.reverse();
  destinationCoordinates.changed();
});

const newTileLayer = new VectorTileLayer({
  source: new VectorTileSource({
    format: new MVT(),
    url: localStorage.testing ? "https://jole84.se/phpReadFile.php?url=https://jole84.se/tiles/{z}/{x}/{y}.pbf" : 'https://jole84.se/tiles/{z}/{x}/{y}.pbf',
    // url: 'https://jole84.se/tiles/{z}/{x}/{y}.pbf',
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

const opentopomap = new TileLayer({
  className: "saturated",
  source: new OSM({
    url: "https://tile.opentopomap.org/{z}/{x}/{y}.png",
    maxZoom: 17,
  }),
  visible: false,
});

// vector layers:
const routeLineString = new MultiLineString([]);
const routeLineStringFeature = new Feature({
  geometry: routeLineString,
  routeLineString: true,
})
const routeLineLayer = new VectorLayer({
  source: new VectorSource({
    features: [routeLineStringFeature],
  }),
  style: function (feature) {
    return new Style({
      stroke: new Stroke({
        width: 10,
        color: [255, 0, 255, 0.4],
      }),
    })
  },
  routeLineLayer: true,
});

function routePointStyle(feature) {
  return new Style({
    image: new Icon({
      anchor: [0.5, 1],
      opacity: 0.85,
      src: "https://jole84.se/images/marker.svg",
    }),
    text: new Text({
      text: String(feature.getId() + 1),
      font: "bold 12px sans-serif",
      justify: "center",
      textBaseline: "bottom",
      offsetY: -20,
    }),
  });
}

const routePointsLayer = new VectorLayer({
  source: new VectorSource(),
  style: routePointStyle,
  routePointsLayer: true,
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
const modifyRoutePoints = new Modify({ source: routePointsLayer.getSource() });
modifyRoutePoints.addEventListener("modifyend", function (event) {
  destinationCoordinates.update(
    event.features.getArray()[0].getId(),
    event.features.getArray()[0].getGeometry().getCoordinates()
  );
});

const modifyRoutePointsLineString = new Modify({ source: routePointsLineStringLayer.getSource() });
modifyRoutePointsLineString.addEventListener("modifyend", function (event) {
  const routePointsLineStringCoordinates = routePointsLineString.getCoordinates();
  destinationCoordinates.coordinates = routePointsLineStringCoordinates;
  destinationCoordinates.changed();
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
  triggerPointer: true,
});
const modifyPoiLayer = new Modify({ source: poiLayer.getSource() });

poiLayer.addEventListener("change", function () {
  const poiFeatures = poiLayer.getSource().getFeatures();
  const geoJsonFile = new GeoJSON().writeFeatures(poiFeatures);
  localStorage.poiString = geoJsonFile;
});

try {
  poiLayer.getSource().addFeatures(new GeoJSON().readFeatures(localStorage.poiString || { "type": "FeatureCollection", "features": [] }));
} catch (error) {
  console.log(error);
}

destinationCoordinates.changed();

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
        text: String(feature.get("name")),
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
  triggerPointer: true,
});

const searchResultLayer = new VectorLayer({
  source: new VectorSource(),
  style: (feature) => {
    return new Style({
      image: new Icon({
        anchor: [0.5, 1],
        src: "https://jole84.se/images/white-marker.svg",
        color: "blue",
        opacity: 0.6,
        scale: 0.8,
      }),
      text: new Text({
        text: String("Sökresultat:\n" + feature.get("name")),
        font: "13px B612, sans-serif",
        placement: "line",
        textAlign: "left",
        textBaseline: "bottom",
        offsetX: 10,
        fill: new Fill({
          color: "#1222b4",
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
  },
  declutter: true,
  triggerPointer: true,
});

let lineStringId = 0;

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
  },
  triggerPointer: true,
});

const newDrawFeature = new Feature({
  geometry: new LineString([]),
  "drawing": true,
});
newDrawFeature.setId(0);
drawLayer.getSource().addFeature(newDrawFeature);

drawLayer.getSource().addEventListener("change", function () {
  const drawFeatures = drawLayer.getSource().getFeatures();
  const geoJsonFile = new GeoJSON().writeFeatures(drawFeatures);
  localStorage.drawFeatures = geoJsonFile;
});

newDrawFeature.addEventListener("change", function () {
  newDrawFeature.set("name", featureLengthString(getLength(newDrawFeature.getGeometry())));
});

try {
  drawLayer.getSource().addFeatures(new GeoJSON().readFeatures(localStorage.drawFeatures || { "type": "FeatureCollection", "features": [] }));
} catch (error) {
  console.log(error);
}

function featureLengthString(featureLength) {
  return featureLength > 1000 ? (featureLength / 1000).toFixed(2) + "km" : Math.round(featureLength) + "m";
}

document.addEventListener("mouseup", function () {
  if (newDrawFeature.getGeometry().getCoordinates().length > 0) {
    const newDrawFeatureCopy = newDrawFeature.clone();
    newDrawFeatureCopy.setGeometry(newDrawFeatureCopy.getGeometry().simplify(20));
    drawLayer.getSource().addFeature(newDrawFeatureCopy);
    newDrawFeature.getGeometry().setCoordinates([]);
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
    opentopomap,
    gpxLayer,
    searchResultLayer,
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

map.addInteraction(modifyRoutePointsLineString);
// map.addInteraction(modifyRouteLineString);
map.addInteraction(modifyRoutePoints);
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
  opentopomap.setVisible(false);

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
  } else if (localStorage.mapMode == 5) {
    opentopomap.setVisible(true);
  }
}
document.getElementById("layerSelector").addEventListener("change", function () {
  localStorage.mapMode = layerSelector.value;
  switchMap();
});
switchMap();

function routeMe() {
  voiceHintsLayer.getSource().clear();
  if (destinationCoordinates.getLength() >= 2) {
    const routeMode = sessionStorage.routeMode;
    console.log("Starting routeMe, routeMode: " + routeMode);
    if (routeMode == "direkt") {
      routeLineString.setCoordinates([destinationCoordinates.list()]);
      trackLength = getLength(routeLineString) / 1000;
      document.getElementById("trackLength").innerHTML = "Avstånd: " + trackLength.toFixed(2) + " km";
      document.getElementById("totalTime").innerHTML = "";
    }
    else if (routeMode == "OSRM") routeMeOSRM();
    else if (routeMode == "ORS") routeMeORS();
    else if (routeMode == "GraphHopper") routeMeGraphHopper();
    else if (routeMode == "Geoapify") routeMeGeoapify();
    else if (routeMode == "google") routeMeGoogle();
    else if (routeMode == "valhalla") routeMeValhalla();
  } else {
    routeLineString.setCoordinates([]);
  }
}

async function routeMeOSRM() {
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

  const response = await fetch(`https://router.project-osrm.org/route/v1/driving/${destinationCoordinates.listLonLat().join(";")}?` + params);
  const result = await response.json();

  console.log(result);
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
  newGeometryCoordinates.push(destinationCoordinates.getLastCoordinate());
  routeLineString.setCoordinates([newGeometryCoordinates]);

  const legs = result.routes[0].legs;
  for (const leg of legs) {
    for (const step of leg.steps) {
      createTurnHint(step);
    }
  }
}

async function routeMeORS() {
  const requestBody = {
    method: "post",
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Accept': 'application/json, application/geo+json, application/gpx+xml, img/png; charset=utf-8',
      'Authorization': '5b3ce3597851110001cf62482ba2170071134e8a80497f7f4f2a0683'
    },
    body: JSON.stringify({
      coordinates: destinationCoordinates.listLonLat(),
      maneuvers: true,

      // preference: "fastest",
      preference: shortestRoute ? "shortest" : "recommended",

      // maximum_speed: 85,
      // skip_segments: [1],

      options: {
        avoid_features: avoidHighways ? ["highways"] : [],
        // round_trip: {
        //   length: 100000,
        //   points: 2,
        //   seed: 5
        // }
      },
    })
  };

  const response = await fetch(`https://api.openrouteservice.org/v2/directions/driving-car/geojson?`, requestBody);
  console.log("x-ratelimit-remaining", response.headers.get("x-ratelimit-remaining"));
  const result = await response.json();

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
  newGeometryCoordinates.push(destinationCoordinates.getLastCoordinate());
  routeLineString.setCoordinates([newGeometryCoordinates]);
}

async function routeMeGraphHopper() {
  const body = {
    profile: "car",
    points: destinationCoordinates.listLonLat(),
    points_encoded: false,

    // algorithm: "round_trip",
    // "round_trip.distance": 10000,
    // "round_trip.seed": 5,

    // snap_preventions: ["motorway","ferry","tunnel"],

    // optimize: true,

    // "ch.disable": true, // "Free packages cannot use flexible mode"
    // custom_model: {
    // speed: [
    //   {
    //     if: true,
    //     limit_to: 100
    //   }
    // ],
    // priority: [
    //   {
    //     if: "road_class == MOTORWAY",
    //     multiply_by: "0"
    //   }
    // ],
    // distance_influence: 100
    // }
  }

  const response = await fetch('https://graphhopper.com/api/1/route?key=89fef6e4-250b-400c-8e85-1ab9107f84a8', {
    method: "POST",
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify(body),
  });

  console.log("x-ratelimit-remaining", response.headers.get("x-ratelimit-remaining"));
  const result = await response.json();

  // response.headers.forEach((val, key) => {
  //   console.log(key, val);
  // });

  console.log(result);
  const format = new GeoJSON();
  const newGeometry = format.readFeature((result.paths[0].points), {
    dataProjection: "EPSG:4326",
    featureProjection: "EPSG:3857"
  });

  trackLength = result.paths[0].distance / 1000;
  const totalTime = result.paths[0].time;
  document.getElementById("trackLength").innerHTML = "Avstånd: " + trackLength.toFixed(2) + " km";
  document.getElementById("totalTime").innerHTML = "Restid: " + new Date(0 + totalTime).toUTCString().toString().slice(16, 25);

  routeLineString.setCoordinates([newGeometry.getGeometry().getCoordinates()]);
}

async function routeMeGeoapify() {
  const requestOptions = {
    method: "GET",
    redirect: "follow"
  };

  const params = new URLSearchParams({
    waypoints: destinationCoordinates.listLonLat().map(coordinate => coordinate.reverse()).join("|"),
    mode: "drive",
    // mode: "truck",
    // mode: "heavy_truck",
    // mode: "long_truck",
    // mode: "motorcycle",
    apiKey: import.meta.env.VITE_GEOAPIFY_API_KEY,
    // avoid: "highways",
    lang: "sv",
    // details: "instruction_details",
    // traffic: "approximated",
    // max_speed: 80,
    // avoid: "location:57.893118,14.371427",
    // type: "balanced",
    // type: "short",
    // type: "less_maneuvers",
    type: shortestRoute ? "short" : "balanced",
  });

  if (avoidHighways) params.append("avoid", "highways");

  const response = await fetch('https://api.geoapify.com/v1/routing?' + params, requestOptions);
  const result = await response.json();

  console.log(result);
  const format = new GeoJSON();
  const newGeometry = format.readFeature((result.features[0].geometry), {
    dataProjection: "EPSG:4326",
    featureProjection: "EPSG:3857"
  });

  trackLength = result.features[0].properties.distance / 1000;
  const totalTime = result.features[0].properties.time * 1000;
  document.getElementById("trackLength").innerHTML = "Avstånd: " + trackLength.toFixed(2) + " km";
  document.getElementById("totalTime").innerHTML = "Restid: " + new Date(0 + totalTime).toUTCString().toString().slice(16, 25);

  routeLineString.setCoordinates([newGeometry.getGeometry().getLineString().getCoordinates()]);
}

async function routeMeGoogle() {
  const points = destinationCoordinates.listLonLat().map(coordinate => ({ latitude: coordinate[1], longitude: coordinate[0] }))

  if (points.length < 2) return console.error("Need at least 2 points");

  const origin = { location: { latLng: points[0] } };
  const destination = { location: { latLng: points[points.length - 1] } };
  const intermediates = points.slice(1, -1).map(p => ({ location: { latLng: p } }));

  let FieldMask = 'routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline'
  if (enableVoiceHint) FieldMask += ',routes.legs.steps.navigationInstruction,routes.legs.steps.distanceMeters,routes.legs.steps.startLocation';

  const requestBody = {
    method: "POST",
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': import.meta.env.VITE_GOOGLE_MAPS_API_KEY,
      // FieldMask determines the cost/data returned
      'X-Goog-FieldMask': FieldMask,
    },
    body: JSON.stringify({
      origin,
      destination,
      intermediates,
      travelMode: 'DRIVE',
      // travelMode: 'TWO_WHEELER',
      // requestedReferenceRoutes: shortestRoute ? ["SHORTER_DISTANCE"] : [], // "FUEL_EFFICIENT"
      // routingPreference: 'TRAFFIC_AWARE',
      routingPreference: 'TRAFFIC_UNAWARE',
      units: 'METRIC',
      languageCode: 'sv-SE',
      routeModifiers: {
        // avoidTolls: true,
        // avoidFerries: true,
        avoidHighways: avoidHighways,
      },
    }),
  };

  const response = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', requestBody);
  const result = await response.json();

  console.log(result);

  const format = new Polyline();
  const newGeometry = format.readFeature((result.routes[0].polyline.encodedPolyline), {
    dataProjection: "EPSG:4326",
    featureProjection: "EPSG:3857"
  });

  trackLength = result.routes[0].distanceMeters / 1000;
  const totalTime = result.routes[0].duration.replace("s", "") * 1000;
  document.getElementById("trackLength").innerHTML = "Avstånd: " + trackLength.toFixed(2) + " km";
  document.getElementById("totalTime").innerHTML = "Restid: " + new Date(0 + totalTime).toUTCString().toString().slice(16, 25);

  routeLineString.setCoordinates([newGeometry.getGeometry().getCoordinates()]);

  voiceHintsLayer.getSource().clear();
  if (enableVoiceHint) {
    result.routes[0].legs.forEach(leg => {
      leg.steps.forEach(step => {
        console.log(step);

        const maneuverCoordinate = fromLonLat([step.startLocation.latLng.longitude, step.startLocation.latLng.latitude]);

        const instructionText = step.navigationInstruction.instructions;
        const marker = new Feature({
          name: instructionText,
          geometry: new Point(maneuverCoordinate),
        });
        voiceHintsLayer.getSource().addFeature(marker);
      });
    });
  }
}

async function routeMeValhalla() {
  const points = destinationCoordinates.listLonLat().map(coordinate => ({ lat: coordinate[1], lon: coordinate[0], type: "break" }))

  points.slice(1, -1).map(element => element["type"] = "via"); // "through", "via", "break_through"

  // const vehicleType = "auto";
  // const vehicleType = "truck";
  const vehicleType = "motorcycle";

  const params = {
    locations: points,
    "costing": vehicleType,
    "costing_options": {
      "auto": {
        "maneuver_penalty": 5,
        "country_crossing_penalty": 0,
        "country_crossing_cost": 600,
        "width": 1.6,
        "height": 1.9,
        "use_highways": avoidHighways ? 0 : 1,
        "use_tolls": 1,
        "use_ferry": 1,
        "ferry_cost": 300,
        "use_living_streets": 0.5,
        "use_tracks": 0,
        "private_access_penalty": 450,
        "destination_only_penalty": 300,
        "ignore_closures": false,
        "ignore_restrictions": false,
        "ignore_access": false,
        "closure_factor": 9,
        "service_penalty": 15,
        "service_factor": 1,
        "exclude_unpaved": false,
        "shortest": shortestRoute,
        "exclude_cash_only_tolls": false,
        "top_speed": 95,
        "fixed_speed": 0,
        "toll_booth_penalty": 0,
        "toll_booth_cost": 15,
        "gate_penalty": 300,
        "gate_cost": 30,
        "include_hov2": false,
        "include_hov3": false,
        "include_hot": false,
        "disable_hierarchy_pruning": false,
        "speed_types": [
          "current",
          "freeflow",
          "predicted",
          "constrained"
        ]
      },
      "motorcycle": {
        "maneuver_penalty": 5,
        "country_crossing_penalty": 0,
        "country_crossing_cost": 600,
        "width": 1.6,
        "height": 1.9,
        "use_highways": avoidHighways ? 0 : 1,
        "use_tolls": 1,
        "use_ferry": 1,
        "ferry_cost": 300,
        "use_living_streets": 0.5,
        "use_tracks": 0,
        "private_access_penalty": 450,
        "destination_only_penalty": 300,
        "ignore_closures": false,
        "ignore_restrictions": false,
        "ignore_access": false,
        "closure_factor": 9,
        "service_penalty": 15,
        "service_factor": 1,
        "shortest": shortestRoute,
        "exclude_cash_only_tolls": false,
        "top_speed": 140,
        "fixed_speed": 0,
        "toll_booth_penalty": 0,
        "toll_booth_cost": 15,
        "gate_penalty": 300,
        "gate_cost": 30,
        "include_hov2": false,
        "include_hov3": false,
        "include_hot": false,
        "disable_hierarchy_pruning": false,
        "use_trails": 0,
        "speed_types": [
          "current",
          "freeflow",
          "predicted",
          "constrained"
        ]
      },
      "truck": {
        "maneuver_penalty": 5,
        "country_crossing_penalty": 0,
        "country_crossing_cost": 600,
        "length": 24,
        "width": 2.6,
        "height": 4.5,
        "weight": 21.77,
        "axle_load": 9,
        "hazmat": false,
        "use_highways": avoidHighways ? 0 : 1,
        "use_tolls": 1,
        "use_ferry": 1,
        "ferry_cost": 300,
        "use_living_streets": 0.5,
        "use_tracks": 0,
        "private_access_penalty": 450,
        "ignore_closures": false,
        "ignore_restrictions": false,
        "ignore_access": false,
        "closure_factor": 9,
        "service_penalty": 15,
        "service_factor": 1,
        "exclude_unpaved": false,
        "shortest": shortestRoute,
        "exclude_cash_only_tolls": false,
        "top_speed": 90,
        "axle_count": 5,
        "fixed_speed": 0,
        "toll_booth_penalty": 0,
        "toll_booth_cost": 15,
        "gate_penalty": 300,
        "gate_cost": 30,
        "include_hov2": false,
        "include_hov3": false,
        "include_hot": false,
        "disable_hierarchy_pruning": false,
        "speed_types": [
          "current",
          "freeflow",
          "predicted",
          "constrained"
        ]
      }
    },
    "exclude_polygons": [],
    "units": "kilometers",
    "alternates": 0,
    "language": "sv-SE"
  }

  const response = await fetch('https://valhalla1.openstreetmap.de/route?json=' + JSON.stringify(params));
  const result = await response.json();

  console.log(result);

  const format = new Polyline({
    factor: "1e6",
    geometryLayout: "XY"
  });
  const newGeometry = format.readFeature((result.trip.legs[0].shape), {
    dataProjection: "EPSG:4326",
    featureProjection: "EPSG:3857"
  });

  trackLength = result.trip.summary.length;
  const totalTime = result.trip.summary.time * 1000;
  document.getElementById("trackLength").innerHTML = "Avstånd: " + trackLength.toFixed(2) + " km";
  document.getElementById("totalTime").innerHTML = "Restid: " + new Date(0 + totalTime).toUTCString().toString().slice(16, 25);

  routeLineString.setCoordinates([newGeometry.getGeometry().getCoordinates()]);


  voiceHintsLayer.getSource().clear();
  if (enableVoiceHint) {
    let maneuverDistance = 0;
    result.trip.legs.forEach(leg => {
      const maneuvers = leg.maneuvers;
      maneuvers.forEach(maneuver => {
        const maneuverCoordinate = routeLineString.getLineString().getCoordinateAt(maneuverDistance / trackLength);
        maneuverDistance += maneuver.length;
        const marker = new Feature({
          name: maneuver.instruction,
          geometry: new Point(maneuverCoordinate),
        });
        voiceHintsLayer.getSource().addFeature(marker);
      })
    });
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

contextPopupContent.addEventListener("click", function () { // copy coordinates
  navigator.clipboard.writeText(contextPopupContent.innerHTML);
});

function openContextPopup(coordinate) {
  const coordinatePixel = map.getPixelFromCoordinate(coordinate);
  contextPopup.setPosition(coordinate);
  contextPopup.panIntoView({ animation: { duration: 250 }, margin: 10 });
  const closestRoutePoint = getPixelDistance(
    map.getPixelFromCoordinate(coordinate),
    map.getPixelFromCoordinate(destinationCoordinates.getClosestPointToCoordinate(coordinate))
  ) < 40;
  const closestPoi = poiLayer.getSource().getClosestFeatureToCoordinate(
    coordinate,
    feature => getPixelDistance(map.getPixelFromCoordinate(feature.getGeometry().getCoordinates()), coordinatePixel) < 40
  );

  document.getElementById("removeDrawing").style.display = "none";
  document.getElementById("removeGpxFeature").style.display = "none";
  document.getElementById("convertGpxFeature").style.display = "none";

  let drawingToRemove;
  let gpxFeatureToRemove;
  map.forEachFeatureAtPixel(coordinatePixel, function (feature) {
    console.log(feature);
    if (closestPoi) {
      document.getElementById("editPoiButton").innerHTML = '🛠️ Byt namn på POI "' + closestPoi.get("name") + '"';
      document.getElementById("removePoiButton").innerHTML = '✖ Ta bort POI "' + closestPoi.get("name") + '"';
    }
    if (feature.get("drawing")) {
      drawingToRemove = feature;
      document.getElementById("removeDrawing").innerHTML = '✖ Ta bort markering "' + feature.get("name") + '"';
      document.getElementById("removeDrawing").style.display = "unset";
    }
    if (feature.get("gpxFeature")) {
      gpxFeatureToRemove = feature;
      document.getElementById("removeGpxFeature").innerHTML = feature.get("name") ? '✖ Ta bort "' + feature.get("name") + '"' : "✖ Ta bort GPX";
      document.getElementById("removeGpxFeature").style.display = "unset";
      document.getElementById("convertGpxFeature").innerHTML = feature.get("name") ? '➕ Spara i projekt: "' + feature.get("name") + '"' : "🧲 Spara GPX i projekt";
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
      gpxFeatureToRemove.unset("gpxFeature");
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
        gpxFeatureToRemove.set("poi", true);
        poiLayer.getSource().addFeature(gpxFeatureToRemove);
      }
      if (gpxLayer.getSource().hasFeature(gpxFeatureToRemove)) gpxLayer.getSource().removeFeature(gpxFeatureToRemove);
      if (searchResultLayer.getSource().hasFeature(gpxFeatureToRemove)) searchResultLayer.getSource().removeFeature(gpxFeatureToRemove);
      // routeMe();
      contextPopup.setPosition();
    }
  });

  document.getElementById("removeRoutePosition").style.display = closestRoutePoint ? "unset" : "none";
  document.getElementById("removePoiButton").style.display = closestPoi ? "unset" : "none";
  document.getElementById("editPoiButton").style.display = closestPoi ? "unset" : "none";


  contextPopupContent.innerHTML = toStringXY(toLonLat(coordinate).reverse(), 5);
}

map.addEventListener("click", function (event) {
  if (contextPopup.getPosition()) return contextPopup.setPosition(); // remove contextPopup if visible

  if (!window.matchMedia("(pointer: coarse)").matches && !enableTouchControls && enableClickToAdd) {
    const closestRoutePoint = destinationCoordinates.getClosestPointToCoordinate(event.coordinate);

    const routePointIsClose = getPixelDistance(
      map.getPixelFromCoordinate(event.coordinate),
      map.getPixelFromCoordinate(closestRoutePoint)
    ) < 40;

    if (routePointIsClose) {
      destinationCoordinates.removeCoordinate(closestRoutePoint);
    } else {
      destinationCoordinates.push(event.coordinate);
    }
  }
});

map.addEventListener("contextmenu", function (event) {
  if (!event.originalEvent.altKey) {
    event.preventDefault();
    if (!window.matchMedia("(pointer: coarse)").matches && !enableTouchControls) {
      if (contextPopup.getPosition()) {
        // hide if visible
        contextPopup.setPosition();
      } else {
        openContextPopup(event.coordinate);
      }
    }
  }
});

map.on("pointermove", function (evt) {
  const hit = map.hasFeatureAtPixel(evt.pixel, {
    layerFilter: layerCandidate => layerCandidate.get("triggerPointer"),
    hitTolerance: 5,
  });

  if (hit) {
    this.getTargetElement().style.cursor = "pointer";
  } else {
    if (enableClickToAdd) this.getTargetElement().style.cursor = "crosshair";
    else this.getTargetElement().style.cursor = "auto";
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

  if (!menuDivcontent.checkVisibility() && document.activeElement.id != "searchInput") {
    if (enableTouchControls) {
      if (event.key == "a") document.getElementById("addPositionButton").click();
      if (event.key == "s") document.getElementById("removePositionButton").click();
      if (event.key == "c") document.getElementById("contextPopupButton").click();
    }
    if (event.key == "Backspace") {
      destinationCoordinates.pop();
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
  destinationCoordinates.push(contextPopup.getPosition());
  contextPopup.setPosition();
});

document.getElementById("removeRoutePosition").addEventListener("click", function () {
  const closestRoutePoint = destinationCoordinates.getClosestPointToCoordinate(contextPopup.getPosition());
  destinationCoordinates.removeCoordinate(closestRoutePoint);
  contextPopup.setPosition();
});

document.getElementById("addPoiButton").addEventListener("click", function () {
  poiPosition = contextPopup.getPosition();
  contextPopup.setPosition();
  const newName = prompt("Namn på POI:", toStringXY(toLonLat(poiPosition).reverse(), 5));
  if (newName) addPoi(poiPosition, newName);
});

document.getElementById("editPoiButton").addEventListener("click", function () {
  const closestPoi = poiLayer.getSource().getClosestFeatureToCoordinate(contextPopup.getPosition());
  poiPosition = closestPoi.getGeometry().getCoordinates();
  contextPopup.setPosition();
  const newName = prompt("Nytt namn:", closestPoi.get("name"));
  if (newName) closestPoi.set("name", newName);
});

function addPoi(poiPosition, name) {
  const poiMarker = new Feature({
    geometry: new Point(poiPosition),
    name: name,
    poi: true,
  });
  poiLayer.getSource().addFeature(poiMarker);
}

function addSearchResult(poiPosition, name) {
  const poiMarker = new Feature({
    geometry: new Point(poiPosition),
    name: name,
    gpxFeature: true,
  });
  searchResultLayer.getSource().addFeature(poiMarker);
}

function addRoutePointMarker(coordinate) {
  const routePointsLayerLength = routePointsLayer.getSource().getFeatures().length;
  const routePointMarker = new Feature({
    geometry: new Point(coordinate),
    routePointMarker: true,
  });
  routePointMarker.setId(routePointsLayerLength);
  routePointsLayer.getSource().addFeature(routePointMarker);
}

document.getElementById("removePoiButton").addEventListener("click", function () {
  const closestPoi = poiLayer.getSource().getClosestFeatureToCoordinate(contextPopup.getPosition());
  poiLayer.getSource().removeFeature(closestPoi);
  contextPopup.setPosition();
});

addPositionButton.addEventListener("click", function () {
  destinationCoordinates.push(map.getView().getCenter());
});

contextPopupButton.addEventListener("click", function () {
  if (contextPopup.getPosition()) {
    // hide if visible
    contextPopup.setPosition();
  } else {
    openContextPopup(map.getView().getCenter());
  }
});

removePositionButton.addEventListener("click", function () {
  try {
    const closestRoutePoint = destinationCoordinates.getClosestPointToCoordinate(map.getView().getCenter());

    const closestRoutePointDistance = getPixelDistance(
      map.getPixelFromCoordinate(map.getView().getCenter()),
      map.getPixelFromCoordinate(closestRoutePoint)
    );
    if (closestRoutePointDistance < 40) {
      destinationCoordinates.removeCoordinate(closestRoutePoint);
    }
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

    const elementText = document.createElement("code");
    elementText.innerHTML = u.item_name;
    elementText.classList.add("user-select-all");
    elementText.classList.add("bold");
    elementText.title = "Klicka för att kopiera länk\n" + "https://jole84.se/nav-app/index.html?getId=" + u.id;
    elementText.href = "https://jole84.se/nav-app/index.html?getId=" + u.id;
    cell1.appendChild(elementText);

    elementText.addEventListener("click", function () {
      navigator.clipboard.writeText(elementText.href);
    });

    cell2.innerHTML = u.is_public ? '<span class="public bold">(Publik)</span>' : "(Privat)";
    // cell2.classList.add("bold");
    // ladda knapp
    const loadButton = document.createElement("button");
    loadButton.classList.add("btn", "btn-primary");
    loadButton.addEventListener("click", () => { loadItem(u) });
    loadButton.innerHTML = "Ladda";
    cell3.appendChild(loadButton);

    if (!!localStorage.token && u.username == localStorage.username) {
      // ersätt upload knapp
      const updateButton = document.createElement("button");
      updateButton.classList.add("btn", "btn-danger");
      updateButton.addEventListener("click", () => { editItem(u) });
      updateButton.innerHTML = "Ersätt";
      cell4.appendChild(updateButton);

      // växla privat knapp
      const makePublicButton = document.createElement("button");
      makePublicButton.classList.add("btn", is_public ? "btn-success" : "btn-warning");
      makePublicButton.addEventListener("click", () => {
        is_public ? makePrivate(u.id) : makePublic(u.id);
      });
      makePublicButton.innerHTML = is_public ? "Gör privat" : "Gör publik";
      cell5.appendChild(makePublicButton);

      // ta bort knapp
      const removeButton = document.createElement("button");
      removeButton.classList.add("btn", "btn-danger");

      removeButton.addEventListener("click", () => { deleteUpload(u) });
      removeButton.innerHTML = "Ta bort";
      cell6.appendChild(removeButton);
    }

    const creatorText = document.createElement("small");
    creatorText.innerHTML = `By <span class="bold">${u.username}</span> — ${new Date(u.created_at).toLocaleString()}<br>`;
    cell7.appendChild(creatorText);
  });
}

async function uploadRoute() {
  const name = prompt("Ange ruttnamn");
  document.getElementById("currentLoadedName").innerHTML = name;
  const collection = new Collection();
  const fileFormat = new GeoJSON();

  collection.extend(poiLayer.getSource().getFeatures());
  collection.extend(getNonEmptyFeatures(routePointsLineStringLayer));
  collection.extend(getNonEmptyFeatures(routeLineLayer));
  collection.extend(getNonEmptyFeatures(drawLayer));
  collection.extend(getNonEmptyFeatures(gpxLayer));

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

  // clearMap();
  const newUrl = new URL("https://jole84.se/nav-app/index.html");
  newUrl.searchParams.append("getId", u.id);
  qrCodeLink.makeCode(newUrl);
  try {
    document.getElementById("linkCodeDiv").innerHTML = newUrl;
    document.getElementById("navAppButton").href = newUrl;
    document.getElementById("navAppButton").title = newUrl;
  } catch (error) {
    console.log(error);
  }

  document.getElementById("currentLoadedName").innerHTML = u.item_name;
  newGeometry.forEach(element => {
    if (element.get("routeMode")) sessionStorage.routeMode = document.getElementById("routeModeSelector").value = element.get("routeMode");
    if (!!element.get("routeLineString")) {
      routeLineString.setCoordinates(element.getGeometry().getCoordinates());
    } else if (!!element.get("poi")) {
      poiLayer.getSource().addFeature(element);
    } else if (!!element.get("drawing")) {
      drawLayer.getSource().addFeature(element);
    } else if (!!element.get("routePointsLineString")) {
      const routePointsLineStringCoordinates = element.getGeometry().getCoordinates();
      destinationCoordinates.coordinates = element.getGeometry().getCoordinates();
      routePointsLineString.setCoordinates(routePointsLineStringCoordinates);
      routePointsLayer.getSource().clear();
      routePointsLineStringCoordinates.forEach(coordinate => {
        addRoutePointMarker(coordinate);
      });
    } else if (!!element.get("gpxFeature")) {
      gpxLayer.getSource().addFeature(element);
    }
  });
}

function editItem(u) {
  const oldName = document.getElementById("currentLoadedName").innerHTML;
  const newMessage = (u.item_name != oldName) ? "Varning ersätter:\n" + u.item_name + " med " + (oldName || "ny rutt\n") : "" + "Ange ruttnamn"

  const name = prompt(newMessage, u.item_name);
  if (!name) return;

  document.getElementById("currentLoadedName").innerHTML = name;
  const collection = new Collection();
  const fileFormat = new GeoJSON();
  collection.extend(poiLayer.getSource().getFeatures());
  collection.extend(getNonEmptyFeatures(routePointsLineStringLayer));
  collection.extend(getNonEmptyFeatures(routeLineLayer));
  collection.extend(getNonEmptyFeatures(drawLayer));
  collection.extend(getNonEmptyFeatures(gpxLayer));

  const geoJsonFile = fileFormat.writeFeatures(collection.getArray(), {
    dataProjection: "EPSG:4326",
    featureProjection: "EPSG:3857",
    decimals: 5,
  });

  const text = btoa(encodeURIComponent(geoJsonFile));

  api("update_item", { id: u.id, name: name, text: text })
    .then(() => loadData());
}

document.getElementById("searchInput").addEventListener("change", async () => {
  const searchString = document.getElementById("searchInput").value;

  // 1. Clear previous results immediately
  searchResultLayer.getSource().clear();
  if (!searchString.trim()) return;

  const viewCenter = toLonLat(view.getCenter());

  try {
    const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: "POST",
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': import.meta.env.VITE_GOOGLE_MAPS_API_KEY,
        'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.location',
      },
      body: JSON.stringify({
        textQuery: searchString,
        locationBias: {
          circle: {
            center: { latitude: viewCenter[1], longitude: viewCenter[0] },
            radius: 5000.0 // Increased to 5km; 500m is very small for text search
          }
        }
      }),
    });

    const result = await response.json();

    // 2. Safety Check: If no places are found, the 'places' key won't exist
    if (!result.places || result.places.length === 0) {
      console.log("No results found");
      return;
    }

    // 3. Process results
    for (const place of result.places) {
      const resultCoordinate = fromLonLat([place.location.longitude, place.location.latitude]);
      addSearchResult(resultCoordinate, place.displayName.text + "\n" + place.formattedAddress);
    }

    // 4. Fit the map ONCE after all points are added
    const extent = searchResultLayer.getSource().getExtent();
    if (extent) {
      view.fit(extent, {
        maxZoom: 15,
        padding: [100, 100, 100, 100],
        duration: 500 // Adds a smooth transition
      });
    }

  } catch (error) {
    console.error("Places API Search failed:", error);
  }
});

const infoLayer = new VectorLayer({
  source: new VectorSource(),
  style: function (feature) {
    console.log(feature.getProperties());

    return new Style({
      text: new Text({
        text: String(feature.get("name") || feature.get("objekttyp") || (feature.get("vagtyp") ? [feature.get("vagtyp"), feature.get("maxspeed") + "km/h", feature.get("Namn_130")].join("\n") : "") || feature.get("layer") || "feature"),
        font: "bold 14px sans-serif",
        overflow: true,
        fill: new Fill({
          color: "black",
        }),
        stroke: new Stroke({
          color: "white",
          width: 4,
        }),
      }),
      stroke: new Stroke({
        width: 4,
        color: [255, 0, 0, 0.8],
      }),
      fill: new Fill({
        color: [255, 0, 0, 0.2],
      }),
    })
  },
  declutter: true,
});

map.addLayer(infoLayer);

map.addEventListener("click", function (event) {
  if (enableClickInfo) {
    infoLayer.getSource().clear();
    map.forEachFeatureAtPixel(event.pixel, function (feature) {
      infoLayer.getSource().addFeature(feature);
    }, {
      hitTolerance: 20,
    });
  }

  if (localStorage.testing) {
    // use for testing
    console.log("testing: " + localStorage.testing);
  }
});