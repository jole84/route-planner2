import './style.css';
import { Feature, Map, View } from "ol";
import { Modify } from "ol/interaction.js";
import { saveAs } from 'file-saver';
import { Stroke, Style, Icon, Fill, Text } from "ol/style.js";
import { toLonLat } from "ol/proj.js";
import { toStringXY } from "ol/coordinate";
import { Vector as VectorLayer } from "ol/layer.js";
import { GPX, GeoJSON, KML } from 'ol/format.js';
import Draw from 'ol/interaction/Draw.js';
import Collection from 'ol/Collection.js';
import KeyboardPan from "ol/interaction/KeyboardPan.js";
import LineString from "ol/geom/LineString";
import OSM from "ol/source/OSM.js";
import Overlay from "ol/Overlay.js";
import Point from "ol/geom/Point.js";
import TileLayer from "ol/layer/Tile";
import TileWMS from "ol/source/TileWMS.js";
import VectorSource from "ol/source/Vector.js";
import XYZ from "ol/source/XYZ.js";
import MultiLineString from 'ol/geom/MultiLineString.js';

const menuDivcontent = document.getElementById("menuDivContent");
const menuItems = document.getElementById("menuItems");
const helpDiv = document.getElementById("helpDiv");
const gpxFileNameInput = document.getElementById("gpxFileNameInput");
const gpxFileName = document.getElementById("gpxFileName");
const savePoiNameInput = document.getElementById("savePoiNameInput");
const poiFileName = document.getElementById("poiFileName");

let trackLength = 0;
let poiPosition;
let enableVoiceHint = false;

localStorage.centerCoordinate = localStorage.centerCoordinate || JSON.stringify(defaultCenter);
localStorage.centerZoom = localStorage.centerZoom || defaultZoom;
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
  customFileButton.click();
}

function getFileFormat(fileExtention) {
  if (fileExtention === "gpx") {
    return new GPX();
  } else if (fileExtention === "kml") {
    return new KML({ extractStyles: false });
  } else if (fileExtention === "geojson") {
    return new GeoJSON();
  }
}

document.getElementById("customFileButton").addEventListener("change", (evt) => {
  console.log(evt)
  const files = evt.target.files; // FileList object
  // remove previously loaded gpx files
  gpxLayer.getSource().clear();
  for (let i = 0; i < files.length; i++) {
    const reader = new FileReader();
    reader.readAsText(files[i], "UTF-8");
    reader.onload = function (evt) {
      const fileFormat = getFileFormat(files[0].name.split(".").pop().toLowerCase());
      const gpxFeatures = fileFormat.readFeatures(evt.target.result, {
        dataProjection: "EPSG:4326",
        featureProjection: "EPSG:3857",
      });
      gpxLayer.getSource().addFeatures(gpxFeatures);
    };
  }
});

document.getElementById("exportRouteButton").onclick = function () {
  let fileName = "Rutt_" + new Date().toLocaleDateString().replaceAll(" ", "_") + "_" + trackLength.toFixed(2) + "km";
  menuDivcontent.replaceChildren(gpxFileNameInput);

  gpxFileName.placeholder = "Rutt_" + new Date().toLocaleDateString().replaceAll(" ", "_") + "_" + trackLength.toFixed(2) + "km";

  document.getElementById("saveFileOkButton").onclick = () => {
    fileName = gpxFileName.value || gpxFileName.placeholder;
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
    });
    const blob = new Blob([gpxFile], { type: "application/gpx+xml" })
    saveAs(blob, fileName + ".gpx");
    menuDivcontent.replaceChildren();
  }
}

// temp
document.getElementById("lowerLeftButton").addEventListener("click", () => {
  const collection = new Collection();
  collection.extend(poiLayer.getSource().getFeatures());
  collection.extend(routeLineLayer.getSource().getFeatures());
  routeLineString.getCoordinates()
  console.log(routeLineString.getCoordinates().length)
  const fileFormat = new GPX();
  const gpxFile = fileFormat.writeFeatures(collection.getArray(), {
    dataProjection: "EPSG:4326",
    featureProjection: "EPSG:3857",
  });
  console.log(gpxFile)
  // menuDivcontent.innerHTML = 
  document.getElementById("trackLength").innerHTML = "<pre>" + (gpxFile) + "</pre>";
});

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
const routeLineString = new LineString([]);
const routeLineLayer = new VectorLayer({
  source: new VectorSource({
    features: [new Feature({
      type: "routeLine",
      geometry: routeLineString,
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
const modifyroutePoints = new Modify({ source: routePointsLayer.getSource() });
modifyroutePoints.addEventListener("modifyend", function () {
  const routePoints = routePointsLayer.getSource().getFeatures();
  routePointsLineString.setCoordinates([]);
  for (let i = 0; i < routePoints.length; i++) {
    routePointsLineString.appendCoordinate(routePoints[i].getGeometry().getCoordinates());
  };
  routeMe();
});


const routePointsLineString = new LineString([]);
const routePointsLineStringLayer = new VectorLayer({
  source: new VectorSource({
    features: [new Feature({
      geometry: routePointsLineString,
    })],
  }),
  style: function (feature) {
    return new Style({
      stroke: new Stroke({
        color: [255, 0, 0, 0.6],
        lineDash: [20],
        width: 6,
      }),
    })
  }
});

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
    routePointMarker.setId(routePointsLayer.getSource().getFeatures().length);
    routePointsLayer.getSource().addFeature(routePointMarker);
  };
});

const modifyRoutePointsLineString = new Modify({ source: routePointsLineStringLayer.getSource() });
modifyRoutePointsLineString.addEventListener("modifyend", function () {
  routeMe();
});


const voiceHintsLayer = new VectorLayer({
  source: new VectorSource(),
  style: function (feature) {
    gpxStyle["Point"].getText().setText(feature.get("name"));
    return gpxStyle[feature.getGeometry().getType()];
  },
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
  returnString += turnInstruction + " " + turnType[turnInstruction];
  if (roundaboutExit > 0) {
    returnString += nummer[roundaboutExit] + " utfarten";
  }
  returnString += " " + distanceToNext + " m "
  // if (distanceToNext < 1000) {
  //   returnString += ",\nfortsätt i " + Math.round(distanceToNext) + "m"
  // }
  // if (distanceToNext > 1000) {
  //   returnString += ",\nfortsätt i " + Math.round(distanceToNext / 1000) + "km"
  // }
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

JSON.parse(localStorage.poiLayer || "[]");

poiLayer.getSource().addFeatures(JSON.parse(localStorage.poiLayer || "[]"));

poiLayer.addEventListener("change", function () {
  const poiFeatures = poiLayer.getSource().getFeatures();
});

const gpxStyle = {
  Point: new Style({
    image: new Icon({
      anchor: [0.5, 1],
      opacity: 0.85,
      src: "https://jole84.se/poi-marker-blue.svg",
    }),
    text: new Text({
      font: "14px Roboto,monospace",
      textAlign: "left",
      offsetX: 10,
      fill: new Fill({
        color: "blue",
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
  }),
  LineString: new Style({
    stroke: new Stroke({
      color: [0, 0, 255, 0.4],
      width: 10,
    }),
  }),
  Polygon: new Style({
    stroke: new Stroke({
      color: [255, 0, 0, 0.6],
      width: 2,
    }),
    fill: new Fill({
      color: [255, 0, 0, 0.1],
    }),
  }),
};
gpxStyle["MultiLineString"] = gpxStyle["LineString"];
gpxStyle["MultiPolygon"] = gpxStyle["Polygon"];

const gpxLayer = new VectorLayer({
  source: new VectorSource(),
  style: function (feature) {
    gpxStyle["Point"].getText().setText(feature.get("name"));
    return gpxStyle[feature.getGeometry().getType()];
  },
});

const drawLayer = new VectorLayer({
  source: new VectorSource(),
  style: new Style({
    stroke: new Stroke({
      color: [255, 0, 0, 0.5],
      width: 10,
    }),
  })
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

map.addInteraction(modifyroutePoints);
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
    const brouterUrl = "https://brouter.de/brouter?lonlats=" +
    coordsString.join("|") +
    "&profile=car-fast&alternativeidx=0&format=geojson&timode=2&straight=" +
    straightPoints.join(",");

    fetch(brouterUrl).then(function (response) {
      response.json().then(function (result) {
        trackLength = result.features[0].properties["track-length"] / 1000; // track-length in km
        const totalTime = result.features[0].properties["total-time"]; // track-time in milliseconds
        document.getElementById("trackLength").innerHTML = trackLength + " km";
        document.getElementById("totalTime").innerHTML = totalTime + " s";
        // add route information to info box

        routeLineString.setCoordinates(new GeoJSON().readFeature(result.features[0], {
          dataProjection: "EPSG:4326",
          featureProjection: "EPSG:3857"
        }).getGeometry().getCoordinates());

        if (enableVoiceHint) {

          const voicehints = result.features[0].properties.voicehints;
          const routeGeometryCoordinates = routeLineString.getCoordinates();
          for (var i = 0; i < voicehints.length; i++) {
            const marker = new Feature({
              type: "routePoint",
              name: translateVoicehint(voicehints[i]),
              geometry: new Point(routeGeometryCoordinates[voicehints[i][0]]),
            });
            voiceHintsLayer.getSource().addFeature(marker);
          }
        }
      });
    });
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
  contextPopup.setPosition(undefined);
});

map.addEventListener("click", function (event) {
  // map.forEachFeatureAtPixel(event.pixel, function (feature) {
  //   if (feature.get("routePointMarker")) {
  //     feature.set("straight",  !feature.get("straight"));
  //   }
  // });
  // routeMe();
  contextPopup.setPosition(undefined);
});

contextPopupContent.addEventListener("click", function () {
  navigator.clipboard.writeText(contextPopupContent.innerHTML);
});

map.addEventListener("contextmenu", function (event) {
  event.preventDefault();

  document.getElementById("flipStraight").style.display = "none";
  map.forEachFeatureAtPixel(event.pixel, function (feature) {
    if (feature.get("routePointMarker")) {
      document.getElementById("flipStraight").innerHTML = "rak " + feature.get("straight");
      document.getElementById("flipStraight").style.display = "unset";
      // feature.set("straight",  !feature.get("straight"));
    }
    document.getElementById("flipStraight").onclick = function () {
      feature.set("straight",  !feature.get("straight"));
      document.getElementById("flipStraight").innerHTML = "rak " + feature.get("straight");
      routeMe();
    }
  });

  const closestRoutePoint = routePointsLayer.getSource().getClosestFeatureToCoordinate(event.coordinate);
  if (closestRoutePoint) {
    const distanceToClosestRoutePoint = getPixelDistance(map.getPixelFromCoordinate(closestRoutePoint.getGeometry().getCoordinates()), map.getPixelFromCoordinate(event.coordinate))
    if (distanceToClosestRoutePoint < 40) {
      document.getElementById("removeRoutePosition").style.display = "unset";
    } else {
      document.getElementById("removeRoutePosition").style.display = "none";
    }
  } else {
    document.getElementById("removeRoutePosition").style.display = "none";
  }

  const closestPoi = poiLayer.getSource().getClosestFeatureToCoordinate(event.coordinate);
  if (closestPoi) {
    const distanceToClosestPoi = getPixelDistance(map.getPixelFromCoordinate(closestPoi.getGeometry().getCoordinates()), map.getPixelFromCoordinate(event.coordinate));
    if (distanceToClosestPoi < 40) {
      document.getElementById("removePoiButton").style.display = "unset";
      document.getElementById("removePoiButton").innerHTML = 'Ta bort POI "' + closestPoi.get("name") + '"';
    } else {
      document.getElementById("removePoiButton").style.display = "none";
    }
  } else {
    document.getElementById("removePoiButton").style.display = "none";
  }

  contextPopupContent.innerHTML = toStringXY(toLonLat(event.coordinate).reverse(), 5);
  contextPopup.setPosition(event.coordinate);
  contextPopup.panIntoView({ animation: { duration: 250 }, margin: 10 });
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
  contextPopup.setPosition(undefined);
  routeMe();
});

document.getElementById("removeRoutePosition").addEventListener("click", function () {
  const closestRoutePoint = routePointsLayer.getSource().getClosestFeatureToCoordinate(contextPopup.getPosition());
  routePointsLayer.getSource().removeFeature(closestRoutePoint);
  const routePoints = routePointsLayer.getSource().getFeatures();
  routePointsLineString.setCoordinates([]);
  for (let i = 0; i < routePoints.length; i++) {
    routePointsLineString.appendCoordinate(routePoints[i].getGeometry().getCoordinates());
  };
  routeMe();
  contextPopup.setPosition(undefined);
});

document.getElementById("addPoiButton").addEventListener("click", function () {
  poiPosition = contextPopup.getPosition();
  menuDivcontent.replaceChildren(savePoiNameInput);
  contextPopup.setPosition(undefined);
  poiFileName.placeholder = toStringXY(toLonLat(poiPosition).reverse(), 5);
});

document.getElementById("savePoiOkButton").addEventListener("click", function () {
  const poiMarker = new Feature({
    geometry: new Point(poiPosition),
    name: poiFileName.value || poiFileName.placeholder,
  });
  poiLayer.getSource().addFeature(poiMarker);
  menuDivcontent.replaceChildren();
  poiFileName.value = "";
});

document.getElementById("removePoiButton").addEventListener("click", function () {
  const closestPoi = poiLayer.getSource().getClosestFeatureToCoordinate(contextPopup.getPosition());
  poiLayer.getSource().removeFeature(closestPoi);
  routeLineLayer.getSource().removeFeature(closestPoi);
  contextPopup.setPosition(undefined);
});

//remove poiLayer > use routeLineLayer