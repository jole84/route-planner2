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
import KeyboardPan from "ol/interaction/KeyboardPan.js";
import LineString from "ol/geom/LineString";
import OSM from "ol/source/OSM.js";
import Overlay from "ol/Overlay.js";
import Point from "ol/geom/Point.js";
import TileLayer from "ol/layer/Tile";
import TileWMS from "ol/source/TileWMS.js";
import VectorSource from "ol/source/Vector.js";
import XYZ from "ol/source/XYZ.js";

const menuDivcontent = document.getElementById("menuDivContent");
const menuItems = document.getElementById("menuItems");
const helpDiv = document.getElementById("helpDiv");
const gpxFileNameInput = document.getElementById("gpxFileNameInput");

localStorage.centerCoordinate = localStorage.centerCoordinate || JSON.stringify(defaultCenter);
localStorage.centerZoom = localStorage.centerZoom || defaultZoom;
localStorage.routePlannerMapMode = localStorage.routePlannerMapMode || 0; // default map

document.getElementById("openMenuButton").addEventListener("click", () => {
  menuDivcontent.innerHTML = menuItems.innerHTML;
  document.getElementById("someCheckbox").checked = true;
});
document.getElementById("menuDivCloseButton").addEventListener("click", () => {
  menuDivcontent.innerHTML = "";
});

document.getElementById("openhelpButton").addEventListener("click", () => {
  menuDivcontent.innerHTML = helpDiv.innerHTML;
});

// temp
document.getElementById("lowerLeftButton").addEventListener("click", () => {
  menuDivcontent.innerHTML = "poiLayer features:<br><pre>" + JSON.stringify(poiLayer.getSource().getFeatures(), null, 2) + "</pre>";
});
document.getElementById("lowerRightButton").addEventListener("click", () => {
  menuDivcontent.innerHTML = "destinationPoints: <pre>" + JSON.stringify(routePointsLineString.getCoordinates(), null, 2) + "</pre>";
  // menuDivcontent.innerHTML += "routePointsLayer: <pre>" + JSON.stringify(routePointsLayer.getSource().getFeatures(), null, 2) + "</pre>";
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

// added layers:
const routeLineString = new LineString([]);
const routeLineLayer = new VectorLayer({
  source: new VectorSource({
    features: [new Feature({
      type: "routeLine",
      geometry: routeLineString,
    })],
  }),
});

const routePointsLayer = new VectorLayer({
  source: new VectorSource(),
});
const modifyroutePoints = new Modify({ source: routePointsLayer.getSource() });
modifyroutePoints.addEventListener("modifyend", function () {
  routeMe();
});


const routePointsLineString = new LineString([]);
const routePointsLineStringLayer = new VectorLayer({
  source: new VectorSource({
    features: [new Feature({
      geometry: routePointsLineString,
    })],
  }),
});

routePointsLineString.addEventListener("change", function () {
  const routePoints = routePointsLineString.getCoordinates();
  routePointsLayer.getSource().clear();
  routePoints.forEach(function (segment) {
    const routePointMarker = new Feature({
      geometry: new Point(segment),
    });
    routePointMarker.setId(routePointsLayer.getSource().getFeatures().length);
    routePointsLayer.getSource().addFeature(routePointMarker);
  });
});

const modifyroutePointsLineString = new Modify({ source: routePointsLineStringLayer.getSource() });

// modifyroutePointsLineString.addEventListener("modifystart", function () {
//   console.log("routePointsLineString modifystart");
// });
modifyroutePointsLineString.addEventListener("modifyend", function () {
  routeMe();
});


const voiceHintsLayer = new VectorLayer({
  source: new VectorSource(),
});

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
        padding: [0, 0, 0, 1],
      }),
    });
  },
});
const modifyPoiLayer = new Modify({ source: poiLayer.getSource() });


const gpxLayer = new VectorLayer({
  source: new VectorSource(),
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
map.addInteraction(modifyroutePointsLineString);
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

  slitlagerkarta.setVisible(true);
  ortofoto.setVisible(true);
  ortofoto.setMinZoom(15.5);
}
switchMap();

function routeMe() {
  const routePoints = routePointsLineString.getCoordinates();
  if (routePoints.length >= 2) {
    console.log("routing has started");

    for (let i = 0; i < routePoints.length; i++) {
      console.log(i, toLonLat(routePoints[i]));
    };
  } else {
    console.log("routing has not started");
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

map.addEventListener("click", function () {
  contextPopup.setPosition(undefined);
});

contextPopupContent.addEventListener("click", function () {
  navigator.clipboard.writeText(contextPopupContent.innerHTML);
});

map.addEventListener("contextmenu", function (event) {
  event.preventDefault();
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

document.getElementById("navAppRoute").addEventListener("click", function () {
  var navapplink = "https://jole84.se/nav-app/index.html?destinationPoints=" + JSON.stringify([toLonLat(contextPopup.getPosition())]);
  window.open(navapplink);
});


document.getElementById("addRoutePosition").addEventListener("click", function () {
  routePointsLineString.appendCoordinate(contextPopup.getPosition());
  contextPopup.setPosition(undefined);
  routeMe();
});

document.getElementById("removeRoutePosition").addEventListener("click", function () {
  const closestRoutePoint = routePointsLayer.getSource().getClosestFeatureToCoordinate(contextPopup.getPosition());
  if (closestRoutePoint) {
    const distanceToClosestRoutePoint = getPixelDistance(map.getPixelFromCoordinate(closestRoutePoint.getGeometry().getCoordinates()), map.getPixelFromCoordinate(contextPopup.getPosition()))
    if (distanceToClosestRoutePoint < 40) {
      routePointsLayer.getSource().removeFeature(closestRoutePoint);
      const routePoints = routePointsLayer.getSource().getFeatures();
      routePointsLineString.setCoordinates([]);
      for (let i = 0; i < routePoints.length; i++) {
        routePointsLineString.appendCoordinate(routePoints[i].getGeometry().getCoordinates());
      };
      routeMe();
    }
  }
  contextPopup.setPosition(undefined);
});

document.getElementById("addPoiButton").addEventListener("click", function () {
  menuDivcontent.innerHTML = document.getElementById("savePoiNameInput").innerHTML;
  const contextPopupPosition = contextPopup.getPosition();
  document.getElementById("poiFileName").value = toStringXY(toLonLat(contextPopupPosition).reverse(), 5);
  document.getElementById("savePoiOkButton").addEventListener("click", function () {
    const poiName = document.getElementById("poiFileName").value;
    menuDivcontent.innerHTML = "";
    console.log(poiName);
    const poiMarker = new Feature({
      geometry: new Point(contextPopupPosition),
      name: poiName,
    });
    poiLayer.getSource().addFeature(poiMarker);
  });
  contextPopup.setPosition(undefined);
});

document.getElementById("removePoiButton").addEventListener("click", function () {
  const closestPoi = poiLayer.getSource().getClosestFeatureToCoordinate(contextPopup.getPosition());
  if (closestPoi) {
    const distanceToClosestPoi = getPixelDistance(map.getPixelFromCoordinate(closestPoi.getGeometry().getCoordinates()), map.getPixelFromCoordinate(contextPopup.getPosition()))
    if (distanceToClosestPoi < 40) {
      poiLayer.getSource().removeFeature(closestPoi);
    }
  }
  contextPopup.setPosition(undefined);
});