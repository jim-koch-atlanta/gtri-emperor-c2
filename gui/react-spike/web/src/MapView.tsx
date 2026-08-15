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
import { STATUS_COLOR } from "./viz";

const HEADING_TICK_M = 35; // length of the heading indicator, in world metres

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
  onSelect: (id: string, additive: boolean) => void;
  onClearSelection: () => void;
}

export function MapView({ frame, trailsRef, selected, basemap, fitNonce, onSelect, onClearSelection }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<Map<string, maplibregl.Marker>>(new Map());
  const readyRef = useRef(false);
  const didFitRef = useRef(false);

  // Keep latest callbacks/state in refs so map + marker handlers, registered once,
  // always see current values without re-binding.
  const onSelectRef = useRef(onSelect);
  const onClearRef = useRef(onClearSelection);
  const frameRef = useRef(frame);
  onSelectRef.current = onSelect;
  onClearRef.current = onClearSelection;
  frameRef.current = frame;

  // Create-or-update a DOM marker per robot; drop markers for robots that left.
  const syncMarkers = (map: maplibregl.Map, f: SwarmState | null, sel: Set<string>) => {
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
      center: [166.687, -77.845], // McMurdo, framing the spawn area before auto-fit
      zoom: 15,
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");

    map.on("load", () => {
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
      readyRef.current = true;
      redrawLines(map, frameRef.current, trailsRef.current);
      syncMarkers(map, frameRef.current, selected);
    });

    // Click on empty canvas clears selection (marker clicks stopPropagation).
    map.on("click", (e) => {
      const oe = e.originalEvent;
      if (!(oe.ctrlKey || oe.metaKey || oe.shiftKey)) onClearRef.current();
    });

    return () => {
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
    syncMarkers(map, frame, selected);

    // Auto-fit once, when the first real frame arrives (instant — no animation).
    if (!didFitRef.current && frame && frame.robots.length > 0) {
      didFitRef.current = true;
      fitAll(map, frame, 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frame, selected]);

  // ---- basemap toggle -----------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    map.setLayoutProperty("osm", "visibility", basemap === "osm" ? "visible" : "none");
  }, [basemap]);

  // ---- Fit All button (App bumps fitNonce) --------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current || fitNonce === 0) return;
    if (frameRef.current) fitAll(map, frameRef.current);
  }, [fitNonce]);

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
