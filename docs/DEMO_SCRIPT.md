# Emperor C2 — Demo Script (Mon 2026-08-17, 10:00 ET)

Crib sheet. Glance, don't read. Narration lines = the *point* of the beat, not a script. Two terminals in WSL2 (`T1` server, `T2` for SIGSTOP/probe), GUI on Windows.

---

## Pre-flight

**Night before**
- [ ] Backend builds fresh: `cmake -B build -DCMAKE_PREFIX_PATH=$HOME/.local && cmake --build build --parallel && (cd build && ctest)` → **18/18 green**.
- [ ] GUI builds fresh (Windows): `dotnet build gui\operator_gui`.
- [ ] `tools/launch_swarm.sh 6` dry run → 6 robots `LINK_LIVE` in the health check; `Ctrl-C` cleans up.
- [ ] GUI `--grpc` connects; six dots orbit; **Fit All** frames them; roster populated.
- [ ] (If showing Beat 6) `cd gui/react-spike/bridge && npm install`; `cd ../web && npm install`.
- [ ] Repo access token / share link works **in an incognito window**.

**9:40 am**
- [ ] Kill everything, relaunch clean (T1 launcher, GUI `--grpc`). Confirm live.
- [ ] Window sized + positioned for screen-share; roster, tactical, command panel, status strip all visible.
- [ ] Mic / screen-share check. Then **kill it all again** and hold at the launch sequence — start the demo from scratch.

---

## Launch sequence (start here, live)

| # | where | command | expect (~timing) |
|---|-------|---------|------------------|
| 1 | T1 (WSL2) | `tools/launch_swarm.sh 6` | `server up … bound 0.0.0.0:50051`, `6 robots launched`, 5 health frames all `LINK_LIVE`; holds. (~3 s) |
| 2 | Windows | `dotnet run --project gui\operator_gui -- --grpc` | window opens; six dots orbit; roster fills with status/age/speed/radius. (~5 s) |
| 3 | GUI | click **Fit All** | swarm framed and circling. Status bar: `6 LIVE · 0 STALE · 0 LOST`. |

> *Opening line:* "N robot processes on Linux, a C2 server fusing their state, a Windows operator client — gRPC across the OS boundary. Watch a command's whole lifecycle, per target."

---

## The five beats

### Beat 1 — single-target command
- **Do:** click **R-03** in the roster → in COMMAND, set **Radius** larger (e.g. 150) → **APPLY TO 1 ROBOT**.
- **See:** status strip adds a row; its chip walks **PENDING → SENT → APPLIED**; R-03's circle **widens**.
- **Point:** *issuing a command isn't enough — the UI proves it landed, per target.*

### Beat 2 — multi-target command
- **Do:** click **R-01**, **Ctrl-click R-02** (button reads **APPLY TO 2 ROBOTS**) → change **Speed** → **APPLY**.
- **See:** one command row, **two chips** that land **independently** (R-01 APPLIED · R-02 APPLIED).
- **Point:** *group semantics live in the C2 (targets[]); the operator sees per-target truth.*

### Beat 3 — command a STALE robot → EXPIRED
- **Do (T2):** `pkill -STOP -f "robot_sim R-05"`  → watch R-05 go **STALE** in the roster (age climbing). While STALE (1.5–10 s window), command it (any param) → **APPLY**.
- **See:** chip sits **PENDING**; at the command's 10 s validity window it flips **EXPIRED** (amber).
- **Point:** *stale commands must die, not execute late — the write may reach a kernel buffer, but no result ever returns.*

### Beat 4 — command a LOST robot → ROBOT_OFFLINE
- **Do:** leave R-05 stopped; after ~10 s of no telemetry it flips **LOST**. Command it again → **APPLY**.
- **See:** chip is **ROBOT_OFFLINE** (red) **immediately** — no send attempted.
- **Point:** *the C2 knows the target is gone at dispatch time and says so up front.*

### Beat 5 — recovery
- **Do (T2):** `pkill -CONT -f "robot_sim R-05"`.
- **See:** R-05 snaps back to **LIVE**, age drops, dot rejoins its circle.
- **Point:** *link health is a pure function of receive-time age — recovery is automatic, no reset.*

> *Close:* "That one status strip is communication + operator feedback + failure handling + multi-robot commands, made visible." Then point at **TECH_SPEC §9**: "here's how this prototype becomes the real system."

---

## Beat 6 (OPTIONAL — DECIDE AT DRY RUN) — the API-boundary proof, ~30 s

Same live C2 server, a **completely different client** — a browser.

- **Do (WSL2, two more terminals):**
  - `cd gui/react-spike/bridge && npm start`   *(gRPC→WebSocket bridge on :8081, connects to the live :50051)*
  - `cd gui/react-spike/web && npm run dev`   *(→ open `http://localhost:5173`)*
- **See:** the same six robots rendered on a map in the browser, off the same `OperatorFeed` stream — the C2 server unchanged and unaware.
- **Say:** "The operator API is UI-framework-neutral by construction — here's the same C2, zero core changes, in a browser. Built **AI-assisted**, less mature than the WPF client, but it's the vision for a **web-based C2**: cross-platform, one deployment point (upgrade the server, every operator gets it), no client install, multi-operator by construction — hosted *inside* the enclave, not on the internet, so deployment stays controlled. The seam is what lets you have a native client *and* a web client against one core."
- **SKIP IF:** running long or energy is low. It's a supporting exhibit; skipping costs nothing. The WPF client is the primary deliverable.

---

## Recovery table (if it breaks live)

| symptom | do this |
|---------|---------|
| **server won't start** | port in use → `ss -ltn \| grep 50051`; clear it → `pkill -f emperor_c2_server; pkill -x robot_sim`; relaunch. |
| **GUI can't connect** | server must bind **0.0.0.0** (it does) — check WSL2 localhost forwarding / Windows firewall. Sanity-check the stream from WSL2: `build/tools/subscribe_probe localhost:50051 3`. |
| **a robot dies on its own** | *free LOST demo* — narrate it: "there's the watchdog surfacing a lost link," then `pkill -CONT …` or relaunch. |
| **total GUI failure** | fall back to `build/tools/subscribe_probe localhost:50051 5` in a terminal — the raw `SwarmState` frames prove the backend is live; narrate the architecture off the stream while you recover. |
| **command chip stuck PENDING** | that robot is STALE/LOST (a valid beat!) — or relaunch the swarm; the tracker's retention window bounds the strip. |
