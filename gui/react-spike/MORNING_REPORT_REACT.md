# MORNING REPORT — React / MapLibre C2 client spike

> **THROWAWAY AI-GENERATED EXPLORATION — proves the API seam; not the submission.**
> Every file under `gui/react-spike/` was vibe-coded by Claude in one overnight,
> unattended session (late Fri 2026-08-14 → Sat 2026-08-15). It lives only on the
> branch `gui-spike-react`, is **never merged to master**, and is **not** the
> interview deliverable. The submission is the C++ core + the WPF `operator_gui`.
> Purpose: (a) prove `OperatorFeed` is client-platform-independent by attaching a
> second, totally different client; (b) explore a MapLibre map layer (§9 stretch
> #2); (c) leave Jim teaching material on the browser/gRPC boundary.

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

Three screenshots (in `screenshots/`), all captured headless from this session:

| file | what it shows |
|---|---|
| `swarm-overview.png` | Fake simulator: 6 robots on the McMurdo basemap (5 LIVE green, 1 STALE amber), roster, status counts, auto-fit. |
| `command-lifecycle.png` | A multi-target command in the status strip: `R-01 APPLIED · R-02 APPLIED · R-06 ROBOT_OFFLINE`, with the roster showing R-01/R-02's radius changed to 250. |
| `real-server.png` | The browser driving the **real C++ server** — note "LIVE · GRPC" top-right — 3 real `robot_sim` processes streaming live. |

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

- **`web/`** (Vite + React 18 + TypeScript + MapLibre GL JS). One data seam
  (`useSwarm` hook: a WebSocket → latest frame + trails + `sendCommand`), and the
  whole UI is a pure function of the `SwarmState` frames. MapLibre renders a
  desaturated OpenStreetMap basemap of McMurdo; robots are DOM markers, trails and
  heading ticks are GeoJSON line layers.

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
```

Open `http://localhost:5173`. The top-right badge shows the seam: **FAKE** vs
**GRPC**, and LIVE / NO-C2 / BRIDGE-DOWN. `npm run build` produces a static bundle;
`npm run typecheck` is the green gate for both packages.

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
- Both packages **typecheck clean** and the web app **production-builds clean**.

## What is NOT verified / not done

- **Live mouse interaction was not click-tested.** Click-to-select, Ctrl-multiselect,
  the APPLY button, Fit All, and the basemap toggle are all wired and type-checked,
  and the command *data path* they drive is proven — but I could not drive real
  clicks headless (see the CDP gotcha), so **Jim should click through once** in a
  real browser. Low risk (standard React/DOM handlers), but unproven by me.
- **Trails and heading ticks are subtle in the static screenshots.** They're
  implemented as GeoJSON line layers (trails = per-robot last-50 world positions,
  reprojected each frame; heading = a 35 m tick along the heading vector) and are
  most legible live as the dots move. I didn't get a crisp still of them.
- **No tests.** Throwaway. The C++ side has the tests that matter.
- **Bundle is one 958 kB chunk** (MapLibre is ~800 kB of it). Fine for a spike;
  a real build would code-split the map.

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
- **Robustness:** command ack correlation surfaced in the UI, reconnect/replay with
  `SwarmState.seq` gap detection, and code-split/lazy-loaded map.

---

## Bottom line for the demo

If Jim wants 30 seconds of "and because the operator API is framework-neutral, here's
the *same* system driven by a completely different client — a browser, on a map":
run the bridge in `--fake` and open the page; it's self-contained and shows robots,
selection-ready roster, and the command strip. The stronger version is `real-server.png`:
the browser on the live C++ swarm, **zero core changes**. Either way, it's a
supporting exhibit for §9 — the WPF client remains the submission.
