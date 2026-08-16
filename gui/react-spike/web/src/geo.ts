// AI-ASSISTED EXPLORATION — the web-based C2 vision, a supporting exhibit for
// TECH_SPEC §9; the C++ core + WPF operator_gui are the primary submission.
//
// World anchoring. The robots live in a planar frame (x/y meters, TECH_SPEC §2);
// this places that frame on the globe as local East/North offsets from an anchor,
// so a real map (MapLibre) can render them.
//
// ANCHOR = McMurdo Station, Antarctica. Chosen deliberately: it is the highest-
// latitude spot with real map coverage that is STILL inside Web Mercator's valid
// band (±85.0511°). The South Pole (-90°) is NOT — Mercator's y goes to infinity
// there, so tiles clamp and geometry folds (the geojson.io lesson from Q1). At
// McMurdo's -77.85° everything projects cleanly. This constraint is a feature to
// call out, not a bug to hide.

export const ANCHOR = { lat: -77.846, lon: 166.668 };

const EARTH_R = 6_378_137; // WGS-84 equatorial radius (m)
const DEG = Math.PI / 180;

// Local tangent-plane (equirectangular) approximation. Exact enough at this
// scale (robots span ~1.5 km; the error over 1.5 km is centimetres): treat x as
// East metres and y as North metres from the anchor.
const M_PER_DEG_LAT = (EARTH_R * DEG); // ≈ 111.32 km / deg
const M_PER_DEG_LON = EARTH_R * DEG * Math.cos(ANCHOR.lat * DEG); // shrinks with latitude

/** Robot planar (x=East, y=North) metres -> [lon, lat] for MapLibre. */
export function metersToLonLat(x: number, y: number): [number, number] {
  const lon = ANCHOR.lon + x / M_PER_DEG_LON;
  const lat = ANCHOR.lat + y / M_PER_DEG_LAT;
  return [lon, lat];
}
