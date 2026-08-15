# gui/react-spike — React/MapLibre C2 client (THROWAWAY)

> **THROWAWAY AI-GENERATED EXPLORATION — proves the API seam; not the submission.**
> Branch `gui-spike-react` only. Never merged. The submission is the C++ core +
> the WPF `operator_gui`. This exists to prove `OperatorFeed` is client-platform-
> independent (§9) with a second, browser-based client, and to explore a MapLibre
> map layer (§9 stretch #2).

**Read `MORNING_REPORT_REACT.md`** — the full write-up (architecture, what works,
gotchas, screenshots, what a production version would differ on).

## Quickstart

```bash
# Terminal 1 — bridge (gRPC -> WebSocket/JSON gateway for the browser)
cd bridge && npm install && npm start -- --fake     # self-contained; no server
#   or:  npm start        # against a real c2_server on localhost:50051

# Terminal 2 — web app
cd web && npm install && npm run dev                # http://localhost:5173
```

```
bridge/   Node + TS. proto-loader -> OperatorFeed.Subscribe -> WebSocket fan-out.
          Command intents (JSON) -> OperatorFeed.SendCommand. --fake = simulator.
web/      Vite + React 18 + TS + MapLibre. One WS data seam; robots as DOM markers
          on a McMurdo basemap; roster, status counts, command status strip.
screenshots/  swarm-overview · command-lifecycle · real-server (captured headless).
```
