// THROWAWAY AI-GENERATED EXPLORATION — proves the API seam; not the submission.
//
// The tactical map. MapLibre is imperative, so the pattern is: create the map
// ONCE (a ref, never re-created on React re-render), add empty GeoJSON sources +
// layers on load, then on every frame rebuild the GeoJSON and setData().
//
// HYBRID rendering, on purpose:
//   * trails + heading ticks -> GeoJSON LINE layers (data-driven, GPU-drawn).
//   * robot dots + labels     -> DOM markers (HTML/CSS over the canvas).
// For a swarm of ≤ dozens, DOM markers are the idiomatic MapLibre choice: crisp
// CSS styling, per-marker DOM click events, labels with zero glyph dependency.
// The GPU-backed circle/symbol layer is the right tool at LOD scale (hundreds–
// thousands of tracks) — which is exactly the scaling path TECH_SPEC §9 draws.
// (Side benefit: DOM markers render in headless screenshots; a WebGL circle
// layer does not under software rendering.)

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { FeatureCollection } from "geojson";
import type { SwarmState } from "./types";
import type { Trails } from "./useSwarm";
import { metersToLonLat } from "./geo";
import { STATUS_COLOR, FENCE_UNION_COLOR, INPUT_COLOR, BUFFER_COLOR } from "./viz";
import { fence } from "./mission";

const HEADING_TICK_M = 35; // length of the heading indicator, in world metres

export interface LayerVisibility {
  mission: boolean; // the union geofence (fill + bold outline)
  buffers: boolean; // component buffers (launch / route / roi)
  inputs: boolean; // the raw mission inputs (dashed)
}

// Data-driven color for the component buffers, keyed on their fixture name.
const bufferColorExpr: maplibregl.ExpressionSpecification = [
  "match",
  ["get", "name"],
  "fence_launch_point", BUFFER_COLOR.fence_launch_point,
  "fence_ingress_route", BUFFER_COLOR.fence_ingress_route,
  "fence_region_of_interest", BUFFER_COLOR.fence_region_of_interest,
  "#8b949e",
];

const STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors",
      maxzoom: 19,
    },
  },
  layers: [
    { id: "bg", type: "background", paint: { "background-color": "#0d1117" } },
    {
      id: "osm",
      type: "raster",
      source: "osm",
      // Desaturate + dim so the basemap reads as a backdrop, not the subject.
      paint: { "raster-opacity": 0.55, "raster-saturation": -0.6, "raster-brightness-max": 0.7 },
    },
  ],
};

interface Props {
  frame: SwarmState | null;
  trailsRef: React.MutableRefObject<Trails>;
  selected: Set<string>;
  basemap: "osm" | "dark";
  fitNonce: number;
  layerVis: LayerVisibility;
  criticalRobots: Set<string>; // robots with unacked critical alerts -> flash
  breachPulseNonce: number; // bumped on each new breach -> pulse the fence
  flyTo: { robotId: string; nonce: number } | null; // alert click -> fly to robot
  onSelect: (id: string, additive: boolean) => void;
  onClearSelection: () => void;
}

export function MapView({ frame, trailsRef, selected, basemap, fitNonce, layerVis, criticalRobots, breachPulseNonce, flyTo, onSelect, onClearSelection }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<Map<string, maplibregl.Marker>>(new Map());
  const readyRef = useRef(false);

  // Keep latest callbacks/state in refs so map + marker handlers, registered once,
  // always see current values without re-binding.
  const onSelectRef = useRef(onSelect);
  const onClearRef = useRef(onClearSelection);
  const frameRef = useRef(frame);
  const basemapRef = useRef(basemap);
  onSelectRef.current = onSelect;
  onClearRef.current = onClearSelection;
  frameRef.current = frame;
  basemapRef.current = basemap;

  // Create-or-update a DOM marker per robot; drop markers for robots that left.
  const syncMarkers = (map: maplibregl.Map, f: SwarmState | null, sel: Set<string>, critical: Set<string>) => {
    const markers = markersRef.current;
    const seen = new Set<string>();
    for (const r of f?.robots ?? []) {
      const id = r.telemetry.robot_id;
      seen.add(id);
      const lngLat = metersToLonLat(r.telemetry.x, r.telemetry.y);
      let m = markers.get(id);
      if (!m) {
        const el = document.createElement("div");
        el.className = "robot-marker";
        el.innerHTML = `<span class="marker-dot"></span><span class="marker-label"></span>`;
        (el.querySelector(".marker-label") as HTMLElement).textContent = id;
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          onSelectRef.current(id, e.ctrlKey || e.metaKey || e.shiftKey);
        });
        m = new maplibregl.Marker({ element: el, anchor: "center" }).setLngLat(lngLat).addTo(map);
        markers.set(id, m);
      } else {
        m.setLngLat(lngLat);
      }
      const el = m.getElement();
      (el.querySelector(".marker-dot") as HTMLElement).style.background = STATUS_COLOR[r.link_status];
      el.classList.toggle("selected", sel.has(id));
      el.classList.toggle("critical", critical.has(id)); // flash on unacked critical alert
    }
    for (const [id, m] of markers) {
      if (!seen.has(id)) {
        m.remove();
        markers.delete(id);
      }
    }
  };

  // ---- create map once ----------------------------------------------------
  useEffect(() => {
    if (!containerRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLE,
      center: [166.6878, -77.8423], // McMurdo — static framing of the whole mission extent
      zoom: 13.9,
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");

    // Keep the map's drawing buffer in lockstep with its (flex-sized) container so
    // it stays correct when the window resizes. (MapLibre tracks this itself too;
    // this is belt-and-suspenders.)
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(containerRef.current);

    map.on("load", () => {
      // ---- mission geometry (UNDER the robots): fills first, bold fence on top
      map.addSource("mission-inputs", { type: "geojson", data: fence.inputs });
      map.addSource("mission-buffers", { type: "geojson", data: fence.buffers });
      map.addSource("mission-union", { type: "geojson", data: { type: "FeatureCollection", features: [fence.union] } });

      map.addLayer({ id: "mission-union-fill", type: "fill", source: "mission-union", paint: { "fill-color": FENCE_UNION_COLOR, "fill-opacity": 0.05 } });
      map.addLayer({ id: "mission-buffers-fill", type: "fill", source: "mission-buffers", paint: { "fill-color": bufferColorExpr, "fill-opacity": 0.1 } });
      map.addLayer({ id: "mission-buffers-line", type: "line", source: "mission-buffers", paint: { "line-color": bufferColorExpr, "line-width": 1, "line-opacity": 0.5 } });
      map.addLayer({ id: "mission-inputs-line", type: "line", source: "mission-inputs", paint: { "line-color": INPUT_COLOR, "line-width": 1.2, "line-opacity": 0.75, "line-dasharray": [2, 2] } });
      map.addLayer({ id: "mission-inputs-point", type: "circle", source: "mission-inputs", filter: ["==", ["geometry-type"], "Point"], paint: { "circle-radius": 4, "circle-color": INPUT_COLOR, "circle-stroke-color": "#0d1117", "circle-stroke-width": 1.5 } });
      map.addLayer({ id: "mission-union-line", type: "line", source: "mission-union", paint: { "line-color": FENCE_UNION_COLOR, "line-width": 3, "line-opacity": 1 } });

      for (const id of ["trails", "headings"]) {
        map.addSource(id, { type: "geojson", data: emptyFC() });
      }
      map.addLayer({
        id: "trails-line",
        type: "line",
        source: "trails",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": ["match", ["get", "status"], "LINK_LIVE", STATUS_COLOR.LINK_LIVE, "LINK_STALE", STATUS_COLOR.LINK_STALE, STATUS_COLOR.LINK_STATUS_UNSPECIFIED],
          "line-width": 1.5,
          "line-opacity": 0.4,
        },
      });
      map.addLayer({
        id: "headings-line",
        type: "line",
        source: "headings",
        paint: { "line-color": "#e6edf3", "line-width": 2, "line-opacity": 0.85 },
      });
      // Apply the initial basemap choice (the [basemap] effect can run before the
      // style is ready and bail, so set it here too).
      map.setLayoutProperty("osm", "visibility", basemapRef.current === "osm" ? "visible" : "none");
      readyRef.current = true;
      redrawLines(map, frameRef.current, trailsRef.current);
      syncMarkers(map, frameRef.current, selected, criticalRobots);
    });

    // Click on empty canvas clears selection (marker clicks stopPropagation).
    map.on("click", (e) => {
      const oe = e.originalEvent;
      if (!(oe.ctrlKey || oe.metaKey || oe.shiftKey)) onClearRef.current();
    });

    return () => {
      ro.disconnect();
      markersRef.current.forEach((m) => m.remove());
      markersRef.current.clear();
      map.remove();
      mapRef.current = null;
      readyRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- redraw on every frame / selection change ---------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (readyRef.current) redrawLines(map, frame, trailsRef.current);
    syncMarkers(map, frame, selected, criticalRobots);
    // No auto-fit: the map opens framed on the fixed McMurdo mission extent (set
    // in the constructor). Fit All reframes to the live swarm on demand. (A
    // fitBounds camera move also breaks headless screenshot capture of the GeoJSON
    // layers — see MORNING_REPORT — so a static initial view is doubly right here.)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frame, selected, criticalRobots]);

  // ---- basemap toggle -----------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    map.setLayoutProperty("osm", "visibility", basemap === "osm" ? "visible" : "none");
  }, [basemap]);

  // ---- mission layer toggles (Mission / Buffers / Inputs) -----------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    const set = (id: string, v: boolean) => map.setLayoutProperty(id, "visibility", v ? "visible" : "none");
    set("mission-union-fill", layerVis.mission);
    set("mission-union-line", layerVis.mission);
    set("mission-buffers-fill", layerVis.buffers);
    set("mission-buffers-line", layerVis.buffers);
    set("mission-inputs-line", layerVis.inputs);
    set("mission-inputs-point", layerVis.inputs);
  }, [layerVis]);

  // ---- Fit All button (App bumps fitNonce) --------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current || fitNonce === 0) return;
    if (frameRef.current) fitAll(map, frameRef.current);
  }, [fitNonce]);

  // ---- breach pulse: briefly flash the union fence outline red ------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current || breachPulseNonce === 0) return;
    let raf = 0;
    const start = performance.now();
    const DURATION = 1800;
    const step = (t: number) => {
      const p = (t - start) / DURATION;
      if (p >= 1) {
        map.setPaintProperty("mission-union-line", "line-color", FENCE_UNION_COLOR);
        map.setPaintProperty("mission-union-line", "line-width", 3);
        return;
      }
      const pulse = Math.abs(Math.sin(p * Math.PI * 3)); // 3 flashes
      map.setPaintProperty("mission-union-line", "line-color", "#f85149");
      map.setPaintProperty("mission-union-line", "line-width", 3 + pulse * 6);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [breachPulseNonce]);

  // ---- fly to a robot (alert click) ---------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current || !flyTo) return;
    const r = frameRef.current?.robots.find((x) => x.telemetry.robot_id === flyTo.robotId);
    if (r) map.flyTo({ center: metersToLonLat(r.telemetry.x, r.telemetry.y), zoom: Math.max(map.getZoom(), 15.5), duration: 900 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flyTo?.nonce]);

  return <div ref={containerRef} className="map" />;
}

// ---- pure GeoJSON builders ------------------------------------------------

function emptyFC(): FeatureCollection {
  return { type: "FeatureCollection", features: [] };
}

function redrawLines(map: maplibregl.Map, frame: SwarmState | null, trails: Trails) {
  const headings: FeatureCollection = { type: "FeatureCollection", features: [] };
  const trailFC: FeatureCollection = { type: "FeatureCollection", features: [] };

  for (const r of frame?.robots ?? []) {
    const t = r.telemetry;
    const pos = metersToLonLat(t.x, t.y);
    // Heading tick along the heading vector (x=East=cos, y=North=sin).
    const hx = t.x + HEADING_TICK_M * Math.cos(t.heading);
    const hy = t.y + HEADING_TICK_M * Math.sin(t.heading);
    headings.features.push({
      type: "Feature",
      geometry: { type: "LineString", coordinates: [pos, metersToLonLat(hx, hy)] },
      properties: {},
    });
  }

  for (const [id, hist] of trails) {
    if (hist.length < 2) continue;
    const status = frame?.robots.find((r) => r.telemetry.robot_id === id)?.link_status ?? "LINK_STATUS_UNSPECIFIED";
    trailFC.features.push({
      type: "Feature",
      geometry: { type: "LineString", coordinates: hist.map(([x, y]) => metersToLonLat(x, y)) },
      properties: { status },
    });
  }

  (map.getSource("headings") as maplibregl.GeoJSONSource | undefined)?.setData(headings);
  (map.getSource("trails") as maplibregl.GeoJSONSource | undefined)?.setData(trailFC);
}

function fitAll(map: maplibregl.Map, frame: SwarmState, duration = 600) {
  if (frame.robots.length === 0) return;
  const b = new maplibregl.LngLatBounds();
  for (const r of frame.robots) b.extend(metersToLonLat(r.telemetry.x, r.telemetry.y));
  map.fitBounds(b, { padding: 90, maxZoom: 17, duration });
}
