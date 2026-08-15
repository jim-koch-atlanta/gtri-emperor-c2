// THROWAWAY AI-GENERATED EXPLORATION — proves the API seam; not the submission.
//
// Generator for the two mission fixtures in ../../fixtures/. PRESENTATION/BUILD
// TOOLING — it stands in for the real gtri-penguin-fence pipeline, which projects to
// an AEQD frame and computes exact offset geometry (Hausdorff-checked). Here we just
// planar-buffer with turf and union — a HAND-APPROXIMATION, same output schema.
// (Lives under web/ so it can reuse web's @turf/turf devDependency.)
//
// The mission is defined ONCE in local East/North metres from the McMurdo anchor —
// the same frame the robots live in — so the fence lines up with the swarm on the
// map. Buffers are computed in an *isotropic* metres-at-the-equator frame (so a
// 200 m circle is actually round), then projected to McMurdo lat/lon.
//
//   npm run gen:fence           # from web/
//
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import * as turf from "@turf/turf";

const HERE = dirname(fileURLToPath(import.meta.url)); // web/scripts
const FIXTURES = resolve(HERE, "../../fixtures");

// ---- world frame (must match web/src/geo.ts) ------------------------------
const ANCHOR = { lat: -77.846, lon: 166.668 };
const EARTH_R = 6_378_137;
const DEG = Math.PI / 180;
const M_PER_DEG_LAT = EARTH_R * DEG; // ≈ 111 320 m/deg
const M_PER_DEG_LON = EARTH_R * DEG * Math.cos(ANCHOR.lat * DEG); // shrinks with latitude
const M_PER_DEG_EQ = EARTH_R * DEG; // isotropic scale used only for buffering

const r6 = (n) => Math.round(n * 1e6) / 1e6;
const metersToLonLat = (x, y) => [r6(ANCHOR.lon + x / M_PER_DEG_LON), r6(ANCHOR.lat + y / M_PER_DEG_LAT)];

// ---- mission, in local E/N metres (single source of truth) ----------------
const launch = [0, 0];
const route = [[0, 0], [300, 250], [550, 450]];
const roiCenter = [700, 600];
const roiR = 180;
// 5-vertex ROI pentagon (distinct vertices; closed with a repeated first point).
const roi = [90, 162, 234, 306, 18].map((deg) => {
  const a = deg * DEG;
  return [roiCenter[0] + roiR * Math.cos(a), roiCenter[1] + roiR * Math.sin(a)];
});
const roiClosed = [...roi, roi[0]];

// ---- buffer in an isotropic (equator-metres) frame, then union ------------
const toEq = ([x, y]) => [x / M_PER_DEG_EQ, y / M_PER_DEG_EQ]; // metres -> equator degrees
const BUF = { units: "meters", steps: 24 };

const launchFenceEq = turf.buffer(turf.point(toEq(launch)), 200, BUF);
const corridorEq = turf.buffer(turf.lineString(route.map(toEq)), 100, BUF);
const roiFenceEq = turf.buffer(turf.polygon([roiClosed.map(toEq)]), 250, BUF);

let unionEq = turf.union(turf.featureCollection([launchFenceEq, corridorEq]));
unionEq = turf.union(turf.featureCollection([unionEq, roiFenceEq]));

// ---- project any geometry's coordinates: equator-degrees -> McMurdo lat/lon
const projPoint = ([lon, lat]) => metersToLonLat(lon * M_PER_DEG_EQ, lat * M_PER_DEG_EQ);
const projCoords = (c) => (typeof c[0] === "number" ? projPoint(c) : c.map(projCoords));
const projGeom = (g) => ({ type: g.type, coordinates: projCoords(g.coordinates) });

// ---- assemble the Q1-schema FeatureCollection -----------------------------
const feature = (name, role, geometry) => ({ type: "Feature", properties: { name, role }, geometry });

// aeqd_center: mean of the distinct input points (a placeholder for Q1's spherical centroid).
const pts = [launch, route[1], route[2], ...roi];
const meanM = [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
const [clon, clat] = metersToLonLat(meanM[0], meanM[1]);

const fence = {
  type: "FeatureCollection",
  _note:
    "PLACEHOLDER — hand-approximated (turf planar buffers + union), NOT the real " +
    "gtri-penguin-fence AEQD/Hausdorff pipeline. Same schema; regenerate with the " +
    "real pipeline for the true fence. See web/scripts/generate_fixtures.mjs.",
  aeqd_center: { lat: clat, lon: clon },
  features: [
    feature("launch_point", "input", { type: "Point", coordinates: metersToLonLat(...launch) }),
    feature("ingress_route", "input", { type: "LineString", coordinates: route.map((p) => metersToLonLat(...p)) }),
    feature("region_of_interest", "input", { type: "Polygon", coordinates: [roiClosed.map((p) => metersToLonLat(...p))] }),
    feature("fence_launch_point", "fence", projGeom(launchFenceEq.geometry)),
    feature("fence_ingress_route", "fence", projGeom(corridorEq.geometry)),
    feature("fence_region_of_interest", "fence", projGeom(roiFenceEq.geometry)),
    feature("fence", "fence", projGeom(unionEq.geometry)),
  ],
};

// ---- mission input, in Q1's JSON format (hemisphere-suffixed lat/lon) ------
const toHemi = ([x, y]) => {
  const [lon, lat] = metersToLonLat(x, y);
  return `${Math.abs(lat).toFixed(6)} ${lat < 0 ? "S" : "N"} ${Math.abs(lon).toFixed(6)} ${lon < 0 ? "W" : "E"}`;
};
const mission = {
  launchPoint: toHemi(launch),
  ingressRoute: route.map(toHemi),
  regionOfInterest: roiClosed.map(toHemi),
};

writeFileSync(resolve(FIXTURES, "mcmurdo_mission.txt"), JSON.stringify(mission, null, 2) + "\n");
writeFileSync(resolve(FIXTURES, "mcmurdo_fence.geojson"), JSON.stringify(fence, null, 2) + "\n");
console.log(`wrote mcmurdo_mission.txt (${mission.ingressRoute.length}-pt route, ${roi.length}-vertex ROI)`);
console.log(`wrote mcmurdo_fence.geojson (union geometry: ${unionEq.geometry.type})`);
