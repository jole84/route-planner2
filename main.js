import './style.css';
import { Feature, Map, View } from "ol";
import { Modify } from "ol/interaction.js";
// import { saveAs } from 'file-saver';
import { Stroke, Style, Icon, Fill, Text } from "ol/style.js";
import { toLonLat } from "ol/proj.js";
import { toStringXY } from "ol/coordinate";
import { Vector as VectorLayer } from "ol/layer.js";
import { GPX, GeoJSON, KML } from 'ol/format.js';
import Collection from 'ol/Collection.js';
import { Polygon, MultiPolygon, Point, MultiLineString, LineString } from 'ol/geom';
// import RegularShape from 'ol/style/RegularShape.js';
import OSM from "ol/source/OSM.js";
import Overlay from "ol/Overlay.js";
import TileLayer from "ol/layer/Tile";
import TileWMS from "ol/source/TileWMS.js";
import { getLength } from 'ol/sphere';
import VectorSource from "ol/source/Vector.js";
import XYZ from "ol/source/XYZ.js";

const addPositionButton = document.getElementById("addPositionButton");
const removePositionButton = document.getElementById("removePositionButton");
const contextPopupButton = document.getElementById("contextPopupButton");
const menuDivcontent = document.getElementById("menuDivContent");
const menuItems = document.getElementById("menuItems");
const helpDiv = document.getElementById("helpDiv");
const gpxFileNameInput = document.getElementById("gpxFileNameInput");
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

localStorage.routeMode = document.getElementById("routeModeSelector").value = localStorage.routeMode || "car-fast";
document.getElementById("routeModeSelector").addEventListener("change", function (event) {
  localStorage.routeMode = document.getElementById("routeModeSelector").value;
  routeMe();
});

localStorage.centerCoordinate = localStorage.centerCoordinate || "[1700000, 8500000]";
localStorage.centerZoom = localStorage.centerZoom || 7;
localStorage.routePlannerMapMode = localStorage.routePlannerMapMode || 0; // default map

document.getElementById("openMenuButton").addEventListener("click", () => {
  menuDivcontent.replaceChildren(menuItems);
  document.getElementById("enableVoiceHint").checked = enableVoiceHint;
});
document.getElementById("enableVoiceHint").addEventListener("change", function () {
  enableVoiceHint = document.getElementById("enableVoiceHint").checked;
  routeMe();
});
document.getElementById("menuDivCloseButton").addEventListener("click", () => {
  menuDivcontent.replaceChildren();
});

document.getElementById("openhelpButton").addEventListener("click", () => {
  menuDivcontent.replaceChildren(helpDiv);
});

document.getElementById("clickFileButton").onclick = function () {
  menuDivcontent.replaceChildren(loadFileDialog);
}

// document.getElementById("mouseClickAdd").addEventListener("change", () => {
//   localStorage.mouseClickAdd = document.getElementById("mouseClickAdd").checked;
// });
// document.getElementById("mouseClickAdd").checked = JSON.parse(localStorage.mouseClickAdd || "false");

function getFileFormat(fileExtention) {
  if (fileExtention === "gpx") {
    return new GPX();
  } else if (fileExtention === "kml") {
    return new KML({ extractStyles: false });
  } else if (fileExtention === "geojson") {
    return new GeoJSON();
  }
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


document.getElementById("selectFileButton").addEventListener("click", evt => {
  getTheFile();
  // menuDivcontent.replaceChildren();
});

// document.getElementById("customFileButton").addEventListener("change", evt => {
//   const files = evt.target.files; // FileList object
//   for (let i = 0; i < files.length; i++) {
//     fileLoader(files[i]);
//   }
// menuDivcontent.replaceChildren();
// });

function fileLoader(fileData) {
  const loadAsProject = fileData.name.startsWith("Projekt_");
  const loadAsRoute = document.getElementById("loadRoute").checked;
  const reader = new FileReader();
  reader.readAsText(fileData, "UTF-8");
  reader.onload = function (evt) {
    const fileFormat = getFileFormat(fileData.name.split(".").pop().toLowerCase());
    const gpxFeatures = fileFormat.readFeatures(evt.target.result, {
      dataProjection: "EPSG:4326",
      featureProjection: "EPSG:3857",
    });
    gpxFeatures.forEach(feature => {
      if (loadAsProject || loadAsRoute) {
        if (feature.getGeometry().getType() === "Point") {
          addPoi(feature.getGeometry().getCoordinates(), feature.get("name"));
        }
        if (feature.get("drawing")) {
          drawLayer.getSource().addFeature(feature);
        } else if (feature.get("routePointsLineString")) {
          feature.getGeometry().getCoordinates().forEach(function (coordinate) {
            routePointsLineString.appendCoordinate(coordinate);
          });
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
        if (feature.getGeometry().getType() === "Point") {
          addPoi(feature.getGeometry().getCoordinates(), feature.get("name"));
        } else {
          if (feature.getGeometry().getType() == "LineString" || feature.getGeometry().getType() == "MultiLineString") {
            feature.setId(lineStringId++);
          }
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
  menuDivcontent.replaceChildren(gpxFileNameInput);

  const routePoints = [];
  const poiPoints = [];
  let linkCode = "https://jole84.se/nav-app/index.html?";
  let trackPointLink = "https://jole84.se/nav-app/index.html?";
  let fileName = "Rutt_" + new Date().toLocaleDateString().replaceAll(" ", "_") + "_" + trackLength.toFixed(2) + "km";
  // gpxFileName.placeholder = fileName;

  routePointsLayer.getSource().forEachFeature(function (feature) {
    routePoints[feature.getId()] = toCoordinateString(feature.getGeometry().getCoordinates());
  });
  if (routePoints.length > 1) {
    linkCode += "destinationPoints64=" + btoa(JSON.stringify(routePoints));
    trackPointLink += "trackPoints=" + encodeURIComponent(JSON.stringify(routeLineString.getLineString(0).simplify(50).getCoordinates().map(each => [Math.round(each[0]), Math.round(each[1])])));
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

  document.getElementById("saveFileOkButton").onclick = () => {
    // const fileName = gpxFileName.value || gpxFileName.placeholder;
    const fileFormat = new GPX();
    const collection = new Collection();
    collection.extend(poiLayer.getSource().getFeatures());

    if (routeLineString.getCoordinates().length > 0) {
      collection.extend(routeLineLayer.getSource().getFeatures());
    }
    if (enableVoiceHint) {
      collection.extend(voiceHintsLayer.getSource().getFeatures());
    }
    const gpxFile = fileFormat.writeFeatures(collection.getArray(), {
      dataProjection: "EPSG:4326",
      featureProjection: "EPSG:3857",
      decimals: 5,
    });
    const blob = new Blob([gpxFile], { type: "application/gpx+xml" });
    // saveAs(blob, fileName + ".gpx");
    saveFile(blob, fileName + ".gpx");
    menuDivcontent.replaceChildren();
  }
}

async function saveFile(data, fileName) {
  // create a new handle
  const newHandle = await window.showSaveFilePicker({ suggestedName: fileName });

  // create a FileSystemWritableFileStream to write to
  const writableStream = await newHandle.createWritable();

  // write our file
  await writableStream.write(data);

  // close the file and write the contents to disk.
  await writableStream.close();
}

document.getElementById("saveGeoJsonButton").onclick = () => {
  const fileName = "Projekt_" + new Date().toLocaleString().replaceAll(" ", "_");
  const fileFormat = new GeoJSON();
  const collection = new Collection();

  collection.extend(poiLayer.getSource().getFeatures());
  collection.extend(routePointsLineStringLayer.getSource().getFeatures());
  collection.extend(drawLayer.getSource().getFeatures());

  const geoJsonFile = fileFormat.writeFeatures(collection.getArray(), {
    dataProjection: "EPSG:4326",
    featureProjection: "EPSG:3857",
    decimals: 5,
  });
  const blob = new Blob([geoJsonFile], { type: "application/json" });
  // saveAs(blob, fileName + ".geojson");
  saveFile(blob, fileName + ".geojson");
  menuDivcontent.replaceChildren();
}

document.getElementById("gpxOpacity").addEventListener("change", function () {
  gpxLayer.setOpacity(parseFloat(document.getElementById("gpxOpacity").value));
});

document.getElementById("clearMapButton").addEventListener("click", function () {
  document.getElementById("totalTime").innerHTML = "";
  document.getElementById("trackLength").innerHTML = "";
  routePointsLineString.setCoordinates([]);
  routeLineString.setCoordinates([]);
  routePointsLayer.getSource().clear();
  voiceHintsLayer.getSource().clear();
  poiLayer.getSource().clear();
  gpxLayer.getSource().clear();
  drawLayer.getSource().clear();
  localStorage.removeItem("poiString");
  localStorage.removeItem("routePoints");
  localStorage.removeItem("gpxLayer");
  localStorage.removeItem("drawFeatures");
  // document.location.reload();
});

document.getElementById("reverseRoute").addEventListener("click", function () {
  routePointsLineString.setCoordinates(routePointsLineString.getCoordinates().reverse());
  contextPopup.setPosition();
  routeMe();
});

// temp
// document.getElementById("lowerLeftButton").addEventListener("click", () => {
//   const poiFeatures = poiLayer.getSource().getFeatures();
//   poiFeatures.forEach(function (element) {

//     console.log(element.getProperties())
//   })
//   console.log(JSON.parse(localStorage.poiString || "[]"));

//   const collection = new Collection([],{unique:true});
//   collection.extend(poiLayer.getSource().getFeatures());
//   collection.extend(routeLineLayer.getSource().getFeatures());

//   console.log(collection.getArray())
//   const fileFormat = new GPX();
//   const gpxFile = fileFormat.writeFeatures(collection.getArray(), {
//     dataProjection: "EPSG:4326",
//     featureProjection: "EPSG:3857",
//   });
//   console.log(gpxFile);
//   document.getElementById("trackLength").innerHTML = "<pre>" + (gpxFile) + "</pre>";
// });

const slitlagerkarta = new TileLayer({
  source: new XYZ({
    url: "https://jole84.se/slitlagerkarta/{z}/{x}/{y}.jpg",
    minZoom: 6,
    maxZoom: 14,
  }),
  maxZoom: 15.5,
  useInterimTilesOnError: false,
});

const slitlagerkarta_nedtonad = new TileLayer({
  source: new XYZ({
    url: "https://jole84.se/slitlagerkarta_nedtonad/{z}/{x}/{y}.jpg",
    minZoom: 6,
    maxZoom: 14,
  }),
  maxZoom: 15.5,
  visible: false,
  useInterimTilesOnError: false,
});

const ortofoto = new TileLayer({
  source: new TileWMS({
    url: "https://minkarta.lantmateriet.se/map/ortofoto/",
    params: {
      layers: "Ortofoto_0.5,Ortofoto_0.4,Ortofoto_0.25,Ortofoto_0.16",
      TILED: true,
    },
  }),
  minZoom: 15.5,
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
      src: "https://jole84.se/start-marker.svg",
    }),
  }),
  midPoint: new Style({
    image: new Icon({
      anchor: [0.5, 1],
      opacity: 0.85,
      src: "https://jole84.se/marker.svg",
    }),
  }),
  endPoint: new Style({
    image: new Icon({
      anchor: [0.5, 1],
      opacity: 0.85,
      src: "https://jole84.se/end-marker.svg",
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
// const modifyroutePoints = new Modify({ source: routePointsLayer.getSource() });
// modifyroutePoints.addEventListener("modifyend", function () {
//   const routePoints = routePointsLayer.getSource().getFeatures();
//   routePointsLineString.setCoordinates([]);
//   for (let i = 0; i < routePoints.length; i++) {
//     routePointsLineString.appendCoordinate(routePoints[i].getGeometry().getCoordinates());
//   };
//   routeMe();
// });

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
          color:  [255, 0, 0, 0.6],
          // anchor: [-3, 0.5],
          scale: 2.5,
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

const allowedTurnType = [2, 4, 5, 7, 13, 14];
function translateVoicehint([geoPart, turnInstruction, roundaboutExit, distanceToNext, turnDeg]) {
  let returnString = "";
  const turnType = {
    1: "Fortsätt (rakt fram)",
    2: "Sväng vänster",
    3: "Sväng svagt åt vänster",
    4: "Sväng skarpt vänster",
    5: "Sväng höger",
    6: "Sväng svagt åt höger",
    7: "Sväng skarpt höger",
    8: "Håll vänster",
    9: "Håll höger",
    10: "U-sväng",
    11: "U-sväng höger",
    12: "Off route",
    13: "I rondellen, tag ",
    14: "I rondellen, tag ",
    15: "180 grader u-sväng",
    16: "Beeline routing",
  }
  const nummer = {
    1: "första",
    2: "andra",
    3: "tredje",
    4: "fjärde",
    5: "femte",
  }
  returnString += turnType[turnInstruction];
  if (roundaboutExit > 0) {
    returnString += nummer[roundaboutExit] + " utfarten";
  }
  if (distanceToNext < 1000) {
    returnString += ", " + Math.round(distanceToNext) + "m"
  }
  if (distanceToNext > 1000) {
    returnString += ", " + Math.round(distanceToNext / 1000) + "km"
  }
  // returnString += turnDeg;
  return returnString;
}

const poiLayer = new VectorLayer({
  source: new VectorSource(),
  style: function (feature) {
    return new Style({
      image: new Icon({
        anchor: [0.5, 1],
        opacity: 0.85,
        src: "https://jole84.se/poi-marker.svg",
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
  const poiString = [];
  poiLayer.getSource().forEachFeature(function (feature) {
    poiString.push([feature.getGeometry().getCoordinates(), feature.get("name")]);
  });
  localStorage.poiString = JSON.stringify(poiString);
});

JSON.parse(localStorage.poiString || "[]").forEach(function (element) {
  addPoi(element[0], element[1]);
});

JSON.parse(localStorage.routePoints || "[]").forEach(function (element) {
  routePointsLineString.appendCoordinate(element);
});
routeMe();

const multipleColors = [
  [0, 0, 255, 0.6], // blue standard
  [255, 0, 0, 0.8], // red
  [0, 150, 0, 0.8], // green
  [255, 255, 0, 0.8], // yellow
  [0, 255, 255, 0.8], // aqua
]

function gpxStyle(feature) {
  const featureType = feature.getGeometry().getType();
  if (featureType == "Point") {
    return new Style({
      image: new Icon({
        anchor: [0.5, 1],
        src: "https://jole84.se/poi-marker.svg",
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
        color: multipleColors[feature.getId()],
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
});

let lineStringId = 0;
gpxLayer.getSource().addEventListener("change", function () {
  const poiString = [];
  gpxLayer.getSource().forEachFeature(function (feature) {
    poiString.push([feature.getGeometry().getType(), feature.getGeometry().getCoordinates(), feature.get("name")]);
  });
  localStorage.gpxLayer = JSON.stringify(poiString);
});

JSON.parse(localStorage.gpxLayer || "[]").forEach(function (element) {
  const geomType = element[0];
  const coordinates = element[1];
  const name = element[2];
  const newFeature = new Feature({
    geometry: newGeom(geomType, coordinates),
    name: name,
    gpxFeature: true,
  });
  if (newFeature.getGeometry().getType() == "LineString" || newFeature.getGeometry().getType() == "MultiLineString") {
    newFeature.setId(0);
  }
  gpxLayer.getSource().addFeature(newFeature);
});

function newGeom(featureType, coordinates) {
  if (featureType == "Point") {
    return new Point(coordinates);
  }
  if (featureType == "LineString") {
    return new LineString(coordinates);
  }
  if (featureType == "MultiLineString") {
    return new MultiLineString(coordinates);
  }
  if (featureType == "Polygon") {
    return new Polygon(coordinates);
  }
  if (featureType == "MultiPolygon") {
    return new MultiPolygon(coordinates);
  }
}

const drawLayer = new VectorLayer({
  source: new VectorSource(),
  style: function (feature) {
    return new Style({
      stroke: new Stroke({
        color: [255, 0, 0, 0.5],
        width: 10,
      }),
      text: new Text({
        text: feature.get("name"),
        font: "14px Roboto,monospace",
        textAlign: "left",
        offsetX: 10,
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
        padding: [2, 1, 0, 2],
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
    feature.set("drawing", true);
    feature.set("name", featureLengthString(getLength(feature.getGeometry())))
    drawFeatures.push(feature.getGeometry().getCoordinates());
  });
  localStorage.drawFeatures = JSON.stringify(drawFeatures);
});

function featureLengthString(featureLength) {
  return featureLength > 1000 ? (featureLength / 1000).toFixed(3) + "km" : Math.round(featureLength) + "m";
}

JSON.parse(localStorage.drawFeatures || "[]").forEach(function (element) {
  drawLayer.getSource().addFeature(new Feature({
    geometry: new LineString(element)
  }));
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
    slitlagerkarta,
    slitlagerkarta_nedtonad,
    ortofoto,
    topoweb,
    osm,
    routeLineLayer,
    routePointsLineStringLayer,
    routePointsLayer,
    voiceHintsLayer,
    poiLayer,
    gpxLayer,
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
  layerSelector.value = localStorage.routePlannerMapMode;
  slitlagerkarta.setVisible(false);
  slitlagerkarta_nedtonad.setVisible(false);
  ortofoto.setVisible(false);
  topoweb.setVisible(false);
  osm.setVisible(false);

  if (localStorage.routePlannerMapMode == 0) {
    slitlagerkarta.setVisible(true);
    ortofoto.setVisible(true);
    ortofoto.setMinZoom(15.5);
  } else if (localStorage.routePlannerMapMode == 1) {
    slitlagerkarta_nedtonad.setVisible(true);
    ortofoto.setVisible(true);
    ortofoto.setMinZoom(15.5);
  } else if (localStorage.routePlannerMapMode == 2) {
    topoweb.setVisible(true);
  } else if (localStorage.routePlannerMapMode == 3) {
    ortofoto.setVisible(true);
    ortofoto.setMinZoom(1);
    ortofoto.setMaxZoom(20);
  } else if (localStorage.routePlannerMapMode == 4) {
    osm.setVisible(true);
  }
}
document.getElementById("layerSelector").addEventListener("change", function () {
  localStorage.routePlannerMapMode = layerSelector.value;
  switchMap();
});
switchMap();

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
    } else {
      const brouterUrl = "https://brouter.de/brouter?lonlats=" +
        coordsString.join("|") +
        "&profile=" + localStorage.routeMode + "&alternativeidx=0&format=geojson&timode=2&straight=" +
        straightPoints.join(",");

      fetch(brouterUrl).then(function (response) {
        response.json().then(function (result) {
          trackLength = result.features[0].properties["track-length"] / 1000; // track-length in km
          const totalTime = result.features[0].properties["total-time"] * 1000; // track-time in milliseconds
          document.getElementById("trackLength").innerHTML = "Avstånd: " + trackLength.toFixed(2) + " km";
          document.getElementById("totalTime").innerHTML = "Restid: " + new Date(0 + totalTime).toUTCString().toString().slice(16, 25);
          // add route information to info box

          routeLineString.setCoordinates([new GeoJSON().readFeature(result.features[0], {
            dataProjection: "EPSG:4326",
            featureProjection: "EPSG:3857"
          }).getGeometry().getCoordinates()]);

          if (enableVoiceHint) {

            const voicehints = result.features[0].properties.voicehints;
            const routeGeometryCoordinates = routeLineString.getCoordinates()[0];
            for (var i = 0; i < voicehints.length; i++) {
              const marker = new Feature({
                name: translateVoicehint(voicehints[i]),
                geometry: new Point(routeGeometryCoordinates[voicehints[i][0]]),
              });
              voiceHintsLayer.getSource().addFeature(marker);
            }
          }
        });
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
  if (!window.matchMedia("(pointer: coarse)").matches) {
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


  document.getElementById("removeDrawing").style.display = "none";
  document.getElementById("reverseRoute").style.display = "none";
  document.getElementById("flipStraight").style.display = "none";

  let drawingToRemove;
  map.forEachFeatureAtPixel(coordinatePixel, function (feature) {
    console.log(feature.getProperties());
    if (feature.get("routeLineString") || feature.get("routePointsLineString")) {
      document.getElementById("reverseRoute").style.display = "unset";
    }
    if (feature.get("drawing")) {
      drawingToRemove = feature;
      document.getElementById("removeDrawing").style.display = "unset";
    }
    if (feature.get("routePointMarker")) {
      document.getElementById("flipStraight").innerHTML = feature.get("straight") ? "rak" : "böj";
      document.getElementById("flipStraight").style.display = "unset";
    }
    if (feature.get("gpxFeature")) {
      document.getElementById("removeGpxFeature").style.display = "unset";
    }
    document.getElementById("flipStraight").onclick = function () {
      feature.set("straight", !feature.get("straight"));
      document.getElementById("flipStraight").innerHTML = feature.get("straight") ? "rak" : "böj";
      routeMe();
    }
    document.getElementById("removeDrawing").onclick = function () {
      drawLayer.getSource().removeFeature(feature);
      contextPopup.setPosition();
    }
    document.getElementById("removeGpxFeature").onclick = function () {
      gpxLayer.getSource().removeFeature(feature);
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

  const closestPoi = poiLayer.getSource().getClosestFeatureToCoordinate(coordinate);
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
  if (!window.matchMedia("(pointer: coarse)").matches) {
    if (contextPopup.getPosition()) {
      // hide if visible
      contextPopup.setPosition();
    } else {
      openContextPopup(event.coordinate);
    }
  }
});

map.on("pointermove", function (evt) {
  const hit = map.hasFeatureAtPixel(evt.pixel);
  if (hit) {
    this.getTargetElement().style.cursor = "pointer";
  } else {
    this.getTargetElement().style.cursor = "auto";
  }
});

document.addEventListener("mouseup", function () {
  if (newDrawFeature.getGeometry().getCoordinates().length > 0) {
    drawLayer.getSource().addFeature(newDrawFeature.clone())
    newDrawFeature.getGeometry().setCoordinates([])
  }
});

map.on("pointerdrag", function (evt) {
  if (evt.originalEvent.altKey) {
    newDrawFeature.getGeometry().appendCoordinate(evt.coordinate);
  }
});

document.addEventListener("keydown", function (event) {
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

// document.getElementById("navAppRoute").addEventListener("click", function () {
//   var navapplink = "https://jole84.se/nav-app/index.html?destinationPoints=" + JSON.stringify([toLonLat(contextPopup.getPosition())]);
//   window.open(navapplink);
// });


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

document.getElementById("savePoiOkButton").addEventListener("click", function () {
  addPoi(poiPosition, poiFileName.value || poiFileName.placeholder);
  menuDivcontent.replaceChildren();
  poiFileName.value = "";
});

function addPoi(poiPosition, name) {
  const poiMarker = new Feature({
    geometry: new Point(poiPosition),
    name: name,
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
})
