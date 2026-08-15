# MORNING REPORT — React / MapLibre C2 client spike

> **THROWAWAY AI-GENERATED EXPLORATION — proves the API seam; not the submission.**
> Every file under `gui/react-spike/` was vibe-coded by Claude in one overnight,
> unattended session (late Fri 2026-08-14 → Sat 2026-08-15). It lives only on the
> branch `gui-spike-react`, is **never merged to master**, and is **not** the
> interview deliverable. The submission is the C++ core + the WPF `operator_gui`.
> Purpose: (a) prove `OperatorFeed` is client-platform-independent by attaching a
> second, totally different client; (b) explore a MapLibre map layer (§9 stretch
> #2), now with a **mission geometry layer** and **attention/alerting** (§9
> supervision-by-exception); (c) leave Jim teaching material on the browser/gRPC
> boundary.
>
> **Session 2 (Sat 2026-08-15) added two features:** a mission geometry / geofence
> layer (fixtures in Q1's schema + MapLibre rendering + layer toggles) and a
> client-side AlertEngine with an alert feed (link loss, command failures, and
> **geofence breach**). Both are covered below.

---

## TL;DR — what this proves

A **React + TypeScript + MapLibre** browser app shows the live swarm on a real
map of McMurdo Station and issues multi-target commands with per-target lifecycle
feedback — **against the exact same, unmodified C++ `c2_server`** the WPF GUI
talks to. Not one line of the proto, the C2 core, or the server changed. The only
new code is a **bridge** process, because browsers can't speak raw gRPC.

That is the whole point of TECH_SPEC §9's *client-platform independence*: the
operator API boundary (`SwarmState` stream + `SendCommand`) is UI-framework-neutral
by construction, and here's a second framework proving it.

Screenshots (in `screenshots/`), all captured headless from this machine:

| file | what it shows |
|---|---|
| `feature1-mission.png` | **Mission layer:** the geofence (cyan union outline), component buffers (launch circle, ingress corridor, ROI buffer), dashed mission inputs, layer toggles — the swarm orbiting inside the fence, on the dark tactical basemap. |
| `feature2-breach.png` | **Geofence breach:** R-03 commanded outside the fence — its dot flashes red, the top bar shows `1 ALERTS`, and the alert feed reads `R-03 outside the geofence · CRITICAL` with an ACK button. |
| `feature2-nominal.png` | The full three-column layout with the alert feed idle (`no alerts — swarm nominal`). |
| `swarm-overview.png` | Session 1 — 6 robots on the **OSM McMurdo** basemap (5 LIVE, 1 STALE), roster, counts. |
| `command-lifecycle.png` | Session 1 — a multi-target command in the status strip: `R-01 APPLIED · R-02 APPLIED · R-06 ROBOT_OFFLINE`. |
| `real-server.png` | Session 1 — the browser driving the **real C++ server** ("LIVE · GRPC"), 3 real `robot_sim` processes. |

---

## Architecture — a gateway in front of the gateway

```
robot_sim ×N ──gRPC──> c2_server ──gRPC(OperatorFeed)──> [ bridge ] ──WebSocket/JSON──> [ React web app ]
   (C++)              (C++, UNCHANGED)                    (Node/TS)                       (browser)
```

- **`bridge/`** (Node 20+/TypeScript). Loads `proto/robot.proto` with
  `@grpc/proto-loader` (the one source of truth — never hand-edited, never copied),
  subscribes to `OperatorFeed.Subscribe`, and re-broadcasts each `SwarmState` as
  JSON over a WebSocket (`ws`, port 8081). Command intents come back as JSON and
  it calls `OperatorFeed.SendCommand`. **This bridge is itself a §6-style gateway,
  one layer out** — it translates a transport (gRPC) the client can't speak into
  one it can (WebSocket), exactly like `GrpcRobotGateway` translates the vehicle
  link. It reconnects to the server with exponential backoff, and has a **`--fake`
  mode**: a self-contained swarm simulator (same planar-metres circular-motion
  model) so the entire UI is demoable with no C++ server at all.

- **`web/`** (Vite + React 18 + TypeScript + MapLibre GL JS + turf). Two seams:
  `useSwarm` (WebSocket → latest frame + trails + `sendCommand`) and `useAlerts`
  (frames → AlertEngine → alerts). The whole UI is a pure function of the
  `SwarmState` frames plus the static mission fixture. MapLibre renders the mission
  geometry + robots (DOM markers) + trails/heading (GeoJSON lines) over a **dark
  tactical basemap by default**, with an OSM-McMurdo basemap one toggle away.

### World anchor — why McMurdo, not the Pole

The robots live in a planar x/y-metres frame. `geo.ts` places that frame on the
globe as **local East/North offsets from McMurdo Station (−77.846, 166.668)**.
McMurdo is chosen deliberately: it's about as far south as you can go and still be
**inside Web Mercator's valid band (±85.0511°)**. The South Pole (−90°) is *not* —
Mercator's y → ∞ there, tiles clamp, geometry folds. (This is the geojson.io lesson
from Q1, and it's a feature to call out in the defense, not a bug to hide.) At
−77.85° everything projects cleanly; a local-tangent metres→lon/lat approximation
is exact to centimetres over the ~1.5 km the swarm spans.

---

## Feature 1 — Mission geometry layer

A plausible mission and its geofence, rendered under the swarm.

- **`fixtures/mcmurdo_mission.txt`** — a mission in **Q1's exact input format**
  (JSON with hemisphere-suffixed lat/lon strings — `launchPoint`, `ingressRoute[3]`,
  `regionOfInterest[5]`), placed at McMurdo: a launch point, a 3-vertex ingress
  route, and a 5-vertex ROI pentagon a few hundred metres away, the whole thing
  ~1.3 km across (inside the robots' frame).
- **`fixtures/mcmurdo_fence.geojson`** — a hand-approximated fence in **Q1's exact
  output schema** (`FeatureCollection` + `aeqd_center`; features carry
  `{name, role}` with roles `input` / `fence`, union named `fence` — matching
  `gtri-penguin-fence`'s `geojson.cpp`). Launch circle ~200 m, ingress corridor
  ~100 m, ROI buffer ~250 m, unioned. **PLACEHOLDER** (see its `_note`): generated
  by `web/scripts/generate_fixtures.mjs` with turf planar buffers — *not* the real
  AEQD/Hausdorff pipeline. Same schema; regenerate with the real pipeline for the
  true fence. (I did **not** touch the Q1 repo — I only matched its I/O contract.)
- **Rendering** (`MapView.tsx`, under the robots): component buffers as subtle
  data-driven fills, the union fence as a **bold cyan outline**, mission inputs as
  **dashed** lines + a launch-point marker. **Layer toggles** (Mission / Buffers /
  Inputs) live in the left panel.

The generator defines the mission once in local E/N metres — the same frame the
robots live in — and buffers in an *isotropic* (equator-metres) frame so a 200 m
circle stays round at 77°S, then projects to McMurdo. So the fence lines up with
the swarm on the map, and (fake mode) all six robots start inside it.

## Feature 2 — Attention & alerting (supervision by exception)

TECH_SPEC §9's *attention management*: at scale an operator supervises **by
exception**, not by watching every track. `alertEngine.ts` is a **pure,
unit-tested** state machine (9 vitest cases, `npm test`) fed the `SwarmState`
stream; it returns the new alerts each frame:

- **Link transitions** — LIVE→STALE (warn) · →LOST (critical) · recovery (info).
- **Command terminal failures** — REJECTED / EXPIRED / ROBOT_OFFLINE (warn), once
  each (dedup by command+target).
- **Geofence breach** — a robot outside the union fence
  (`@turf/boolean-point-in-polygon`) is **critical**; re-entry is info. Debounced
  by *state change* (orbiting across the boundary can't spam). A robot already
  outside when first seen is flagged immediately — see the design note in gotchas.

The **alert feed** (right panel) lists newest-first, colored by severity, each
ACK-able; the top bar carries an unacked-count badge; a critical alert **flashes
the robot's map dot** and a breach **pulses the fence outline**; clicking an alert
**selects + flies to** the robot. The engine is pure and the map/DOM effects are
injected, so the whole thing is testable without a browser.

### Demo beat (the 30-second story)

1. Open the app (fake mode) — swarm orbiting **inside** the geofence, feed idle.
2. Select **R-03** (in the ROI); in the command panel set **radius → 450** and
   APPLY. Its orbit widens past the ROI buffer and it crosses the fence.
3. **BREACH fires:** R-03's dot flashes red, the fence pulses, the top bar shows
   `1 ALERTS`, and the feed logs `R-03 … geofence · CRITICAL`.
4. Click the alert → the map flies to R-03. **ACK** it → the row dims, the flash
   stops, the badge clears.
5. Command R-03's radius back down → it re-enters → an `info` re-entry alert.

*(Against a live `launch_swarm`, the fence still renders and breach detection still
runs, but the fixture is a specific McMurdo mission — the fake swarm is positioned
to sit inside it. Real `robot_sim` spacing is arbitrary, so real robots may sit
outside the fixture fence; in production the fence would come from the mission the
robots are actually flying.)*

---

## How to run

Two terminals. Node 20+ (this session used Node 22.22 — see gotchas).

**Terminal 1 — bridge**
```bash
cd gui/react-spike/bridge
npm install
npm start -- --fake                       # self-contained simulator, no server
#   …or against a real server:
#   (WSL) tools/launch_swarm.sh 6          # start C++ server + 6 robots first
npm start                                  # connect to localhost:50051
#   options: --target host:port   --port 8081(WS)
```

**Terminal 2 — web**
```bash
cd gui/react-spike/web
npm install
npm run dev                                # http://localhost:5173
npm test                                   # AlertEngine unit tests (vitest, 9 cases)
npm run gen:fence                          # regenerate the mission fixtures (turf)
```

Open `http://localhost:5173`. The top-right badge shows the seam: **FAKE** vs
**GRPC**, and LIVE / NO-C2 / BRIDGE-DOWN. `npm run build` produces a static bundle;
`npm run typecheck` + `npm test` are the green gates.

---

## What works (verified this session)

- **Bridge, both modes.** `--fake` streams a 6-robot swarm; real mode streamed 3
  live `robot_sim` processes as JSON. Verified with a Node WebSocket probe.
- **Command path, both directions, both modes.** A command intent from a client
  → bridge builds the proto `OperatorCommand` (mints id, stamps timestamp/expiry)
  → `SendCommand`. Against the **real** server this walked `SENT → APPLIED` and
  R-01's radius changed 120 → 200 in the telemetry. Against fake, a multi-target
  command produced `APPLIED / APPLIED / ROBOT_OFFLINE` per target.
- **The React UI renders live data.** DOM-marker robots colored by link status,
  labels, roster (id/status/age/speed/radius), LIVE/STALE/LOST counts, connection
  badge, auto-fit-to-swarm, dark tactical theme, McMurdo OSM basemap. Confirmed via
  headless screenshots against both fake and the real server.
- **Command status strip.** Per-command, per-target lifecycle chips driven straight
  off `SwarmState.commands` — the UI invents no state (see `command-lifecycle.png`).
- **Mission layer** renders (fence + buffers + dashed inputs + toggles), robots sit
  inside the fence, fixtures match Q1's I/O schema — `feature1-mission.png`.
- **Alerting**: AlertEngine is **unit-tested (9 vitest cases)**; the geofence breach
  fires end-to-end in the UI with a flashing dot + feed entry — `feature2-breach.png`.
- **Typecheck clean, tests green, production build clean** for the web package;
  bridge typechecks clean.

## What is NOT verified / not done

- **Live mouse interaction was not click-tested.** Click/Ctrl-select, APPLY, Fit
  All, basemap + layer toggles, alert-click-to-fly, and ACK are all wired and
  type-checked, and the data paths they drive are proven (breach via a commanded
  radius; command path via probes) — but I can't drive real clicks headless (see
  the CDP gotcha). **Jim should click through once.** Low risk.
- **Headless screenshots of the GeoJSON layers are flaky** (see gotchas) — the
  committed feature shots are the runs that rendered; on a real GPU it's not an
  issue. Trails/heading ticks are thin and easiest to see live.
- **Bundle is one ~1 MB chunk** (MapLibre + turf). Fine for a spike; a real build
  would code-split the map + tree-shake turf.

---

## Gotchas banked (the useful part for Jim)

1. **`/mnt/c` + Vite = stale code, silently.** The repo is on the Windows drvfs
   mount. **inotify does not fire on `/mnt/c` under WSL2**, so Vite's file watcher
   never sees edits and serves *stale compiled modules* — with no error. This ate
   an hour: every screenshot loaded the first-compiled `MapView`, so none of my
   edits appeared and I mis-diagnosed it three ways. Fix is in `vite.config.ts`:
   `server.watch.usePolling = true`. **This applies verbatim to any Vite/webpack
   work in this repo** — and is worth remembering for the WPF side's tooling too.
2. **Headless Chrome can't draw MapLibre `circle` layers.** Under software WebGL
   (`--enable-unsafe-swiftshader`, the only headless path that worked here) *line*
   and *fill* layers render but *circle* layers don't; the hardware-GPU headless
   path rendered nothing. This is a headless-screenshot limitation, **not** an app
   bug (circle layers are fine on a real GPU) — but it's why the robot dots became
   **DOM markers**, which render as HTML regardless of WebGL. That turned out to be
   the *better* choice for ≤ dozens of robots anyway (crisp CSS, labels with no
   glyph dependency); the GPU circle/symbol layer is the right tool at LOD scale,
   which §9 already documents as the scaling path.
3. **You cannot drive Windows Chrome's DevTools from WSL.** Chrome forces
   `--remote-debugging-port` to bind `127.0.0.1` and ignores `--remote-debugging-address=0.0.0.0`,
   and WSL2's NAT can't reach a Windows loopback port. So no Puppeteer/CDP-from-WSL;
   headless one-shot `--screenshot` (with `--run-all-compositor-stages-before-draw`
   + `--virtual-time-budget`) was the only automation available. To catch the
   command strip populated, I fired the command from a Node probe (it's global
   bridge state, broadcast to *all* clients) and screenshot the browser.
4. **`google/protobuf/timestamp.proto` resolves with no include dirs** in
   `@grpc/proto-loader` — it bundles the well-known types. Set proto-loader
   `{ keepCase:true, longs:Number, enums:String }` so the JSON matches the proto
   field names and `LINK_LIVE`/`CMD_APPLIED` arrive as readable strings.
5. **Node 22, not 20.** Kickoff said Node 20; the box had 22.22. Everything worked;
   Node 22's global `WebSocket` was handy for probes. Pin 20 or 22 for the team.
6. **OSM tiles + WSL→Windows localhost.** WSL2 forwards `localhost` from Windows,
   so Windows Chrome reached the WSL Vite (`:5173`) and bridge (`:8081`) over
   `localhost` cleanly, and OSM raster tiles loaded from the internet — same clean
   OS-boundary story the spec tells about gRPC on `localhost`.
7. **Headless GeoJSON layers render nondeterministically under `--virtual-time-budget`.**
   MapLibre parses GeoJSON sources in a **web worker**; virtual-time (which
   fast-forwards page timers — a 22 s budget exits in ~1.5 s real) starves that
   worker, so fence/buffer/trail layers *sometimes* don't finish before capture
   (a near-blank ~44 KB PNG vs a ~90 KB rendered one). What made it usable:
   `--disable-background-timer-throttling --disable-renderer-backgrounding`, a
   **dark basemap default** (no OSM tiles competing for the main thread), and a
   **retry-until-the-PNG-is-big-enough** loop. DOM markers + raster always render;
   this only bites the GeoJSON layers, and only headless. (This supersedes Session
   1's "circle layers don't render" note — the real culprit was the GeoJSON worker,
   not the layer type. DOM markers for the dots are still the right call at this
   scale.)
9. **`position: relative` on a MapLibre marker element silently breaks all marker
   positions** (found by Jim in review). Our marker CSS used
   `.robot-marker { position: relative }` (to anchor the label child). But our
   stylesheet loads *after* MapLibre's, same specificity, so it overrode
   MapLibre's required `.maplibregl-marker { position: absolute }`. Relative markers
   stay in normal flow and **stack vertically**, so each robot rendered offset
   *south* by the height of the markers above it (R-01 ≈ 0 px, the 6th robot
   ≈ 80 px) — invisible at high zoom, glaring zoomed out, and it makes robots
   *look* outside the fence when their data says inside (the alerts, which read the
   data, were correct all along). Fix: `.robot-marker { position: absolute }`. The
   diagnosis that nailed it: log `map.project(lngLat)` vs the marker's real
   `getBoundingClientRect()` — the transform matched the projection but the element
   still landed 80 px low, which points at flow, not projection. (A single marker
   hides this — you need several to see the stack.)
8. **First-sighting-outside is a design decision, not just a demo hack.** The
   headless capture window is ~1.5 s, far too short to reliably *witness* an
   inside→outside transition. That forced a good question: should the AlertEngine
   alert when a robot is *already* outside the fence at first sighting? For
   exception-based supervision the answer is **yes** — a robot outside the geofence
   when you start supervising is a live violation you must see, not something to
   hide because you missed the crossing. So the engine flags first-sighting-outside
   as critical (inside-on-first-sight stays nominal), which is both more correct and
   makes the breach observable without sub-second timing.

---

## What a production version would do differently

- **Not use a bridge at all, or make it first-class.** Two honest options:
  (a) **gRPC-Web** — add an Envoy/`grpc-web` proxy and generate a browser gRPC-Web
  client, so the browser speaks (a flavour of) gRPC directly and there's no bespoke
  JSON envelope; or (b) treat the bridge as a real **API gateway** with auth,
  backpressure, and per-client interest-management filters (§9). The throwaway's
  hand-rolled WebSocket+JSON is the shortest path to *proving* the seam, not the
  shape you'd ship.
- **AuthN/AuthZ + command authority.** No identity here. Real multi-operator C2 is
  authoritative server-side about *who may command an asset* (§9) — the browser
  must never be trusted for that.
- **Delta/snapshot + interest management** instead of full-state JSON broadcast, at
  scale (§9). Fine at 20 robots × 5 Hz; not at thousands of tracks.
- **GPU-backed tracks at LOD.** DOM markers are perfect for dozens; hundreds/
  thousands want the GeoJSON circle/symbol layer with clustering + LOD.
- **A vector basemap + offline tiles.** Raster OSM over the public tile server is a
  demo convenience; a fielded system wants an owned vector style and offline packs
  (and, for real polar ops, a polar projection instead of Web Mercator).
- **Geofence evaluation belongs on the server, not the client.** Here the breach
  test is a client-side turf point-in-polygon on a fixture — fine for a demo, wrong
  for a system: the authoritative fence and the breach decision must live server-side
  (every client agrees, and a compromised/laggy client can't miss a violation). The
  fixture would be replaced by the real `gtri-penguin-fence` output, delivered over
  the feed, and the breach event would arrive *in* `SwarmState`, not be recomputed
  per client.
- **Alerting is real state, not view state.** Alerts should be **persisted +
  audited** (server-authored, with IDs, ownership, ack-by-whom, and replay), not
  held in React state that a refresh wipes. Severity/priority should be a
  configurable **policy** (which conditions, what thresholds, escalation, dedup
  windows), not hard-coded — the seed of §9's attention-management layer.
- **Robustness:** command ack correlation surfaced in the UI, reconnect/replay with
  `SwarmState.seq` gap detection, and code-split/lazy-loaded map + turf.

---

## Bottom line for the demo

Two 30-second stories, both self-contained (`--fake`, no server):

1. **"The same system, a different client."** A browser on a map, driving the
   unmodified C++ core — §9 client-platform independence. The stronger cut is
   `real-server.png`: the browser on the live C++ swarm, zero core changes.
2. **"Supervision by exception."** Robots inside a mission geofence; command one
   out; a critical breach alert fires, its dot flashes, you click the alert to fly
   to it and ACK — §9 attention management, made concrete (the beat above).

Both are supporting exhibits for §9 — **the WPF client remains the submission**,
and every fixture/placeholder here is labeled as such. Nothing was merged to
master; this lives only on `gui-spike-react`.
