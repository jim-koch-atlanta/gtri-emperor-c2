# gui/react-spike — a web-based C2 client (React / MapLibre)

> **AI-ASSISTED EXPLORATION — proves the API seam and sketches a web-based C2.**
> The primary deliverable is the C++ core + the WPF `operator_gui`; this is a
> second, browser-based client driving the **unmodified** C2 server. It exists to
> prove `OperatorFeed` is client-platform-independent (§9), explore a MapLibre map
> layer (§9 stretch #2), and prototype a mission/geofence layer + attention-and-
> alerting (§9 supervision by exception). Built fast with AI assistance; less
> mature than the WPF client — see MORNING_REPORT_REACT.md for what's verified.

**Read `MORNING_REPORT_REACT.md`** — the full write-up (architecture, what works,
gotchas, screenshots, what a production version would differ on).

## Quickstart

```bash
# Terminal 1 — bridge (gRPC -> WebSocket/JSON gateway for the browser)
cd bridge && npm install && npm start -- --fake     # self-contained; no server
#   or:  npm start        # against a real c2_server on localhost:50051

# Terminal 2 — web app
cd web && npm install && npm run dev                # http://localhost:5173
cd web && npm test                                  # AlertEngine unit tests (vitest)
cd web && npm run gen:fence                          # regenerate the mission fixtures
```

```
bridge/     Node + TS. proto-loader -> OperatorFeed.Subscribe -> WebSocket fan-out.
            Command intents (JSON) -> OperatorFeed.SendCommand. --fake = simulator.
web/        Vite + React 18 + TS + MapLibre + turf. WS + alert seams; DOM-marker
            robots + mission geofence layer; roster, counts, command strip, alert feed.
fixtures/   mcmurdo_mission.txt + mcmurdo_fence.geojson — Q1 I/O schema; fence is a
            labeled PLACEHOLDER (turf buffers, not the real gtri-penguin-fence pipeline).
screenshots/  feature1-mission · feature2-breach · feature2-nominal · (session 1) …
```
