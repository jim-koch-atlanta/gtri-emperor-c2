// AI-ASSISTED EXPLORATION — the web-based C2 vision, a supporting exhibit for
// TECH_SPEC §9; the C++ core + WPF operator_gui are the primary submission.
//
// Loads the mission fence fixture (fixtures/mcmurdo_fence.geojson) at build time
// and exposes it split by role for rendering, plus the point-in-fence test used by
// the geofence-breach alert rule. The fixture is a PLACEHOLDER hand-approximation
// (turf buffers), same schema as the real gtri-penguin-fence emitter — see its
// _note and MORNING_REPORT_REACT.md. In production this geometry would arrive from
// the actual pipeline (and the breach test would run server-side).

import fenceRaw from "../../fixtures/mcmurdo_fence.geojson?raw";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import type { Feature, FeatureCollection, Polygon, MultiPolygon } from "geojson";
import { metersToLonLat } from "./geo";

const fc = JSON.parse(fenceRaw) as FeatureCollection;

const role = (r: string): FeatureCollection => ({
  type: "FeatureCollection",
  features: fc.features.filter((f) => f.properties?.role === r),
});

export interface MissionFence {
  all: FeatureCollection; // everything (rendering convenience)
  inputs: FeatureCollection; // role=input: launch point, ingress route, ROI
  buffers: FeatureCollection; // role=fence, component buffers (not the union)
  union: Feature<Polygon | MultiPolygon>; // name=fence: the merged geofence
}

export const fence: MissionFence = {
  all: fc,
  inputs: role("input"),
  buffers: {
    type: "FeatureCollection",
    features: fc.features.filter((f) => f.properties?.role === "fence" && f.properties?.name !== "fence"),
  },
  union: fc.features.find((f) => f.properties?.name === "fence") as Feature<Polygon | MultiPolygon>,
};

/** Is a robot (lon/lat degrees) inside the merged geofence? */
export function insideFence(lon: number, lat: number): boolean {
  return booleanPointInPolygon([lon, lat], fence.union);
}

/** Is a robot (local E/N metres) inside the merged geofence? */
export function insideFenceMeters(x: number, y: number): boolean {
  const [lon, lat] = metersToLonLat(x, y);
  return insideFence(lon, lat);
}
