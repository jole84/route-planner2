import './style.css';
import "./style.css";
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

const menuDiv2content = document.getElementById("menuDivContent");
const menuDiv = document.getElementById("menuDiv");

localStorage.centerCoordinate = localStorage.centerCoordinate || JSON.stringify(defaultCenter);
localStorage.centerZoom = localStorage.centerZoom || defaultZoom;
localStorage.routePlannerMapMode = localStorage.routePlannerMapMode || 0; // default map

document.getElementById("openMenuButton").addEventListener("click", () => {
  menuDiv2content.innerHTML = new Date().toLocaleString();
  menuDiv.style.display = "flex";
});
document.getElementById("menuDivCloseButton").addEventListener("click", () => {
  menuDiv.style.display = "none";
});

document.getElementById("openhelpButton").addEventListener("click", () => {
  document.getElementById("helpDiv").style.display = "flex";
});
document.getElementById("helpDivCloseButton").addEventListener("click", () => {
  document.getElementById("helpDiv").style.display = "none";
});

document.getElementById("savePoiCloseButton").addEventListener("click", () => {
  document.getElementById("savePoiNameInput").style.display = "none";
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
  ],
  view: view,
  keyboardEventTarget: document,
});

window.onbeforeunload = function () {
  localStorage.centerCoordinate = JSON.stringify(view.getCenter());
  localStorage.centerZoom = view.getZoom();
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