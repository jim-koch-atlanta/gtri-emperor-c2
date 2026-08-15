# gui/react-spike — React/MapLibre C2 client (THROWAWAY)

> **THROWAWAY AI-GENERATED EXPLORATION — proves the API seam; not the submission.**
> Branch `gui-spike-react` only. Never merged. The submission is the C++ core +
> the WPF `operator_gui`. This exists to prove `OperatorFeed` is client-platform-
> independent (§9) with a second, browser-based client, explore a MapLibre map
> layer (§9 stretch #2), and prototype a mission/geofence layer + attention-and-
> alerting (§9 supervision by exception).

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
