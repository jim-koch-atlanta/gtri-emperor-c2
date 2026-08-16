// AI-ASSISTED EXPLORATION — the web-based C2 vision, a supporting exhibit for
// TECH_SPEC §9; the C++ core + WPF operator_gui are the primary submission.
//
// Bridge entry point. Wires a Source (real gRPC C2 server, or the fake
// simulator) to a WebSocket fan-out the browser can consume. This process is the
// gateway that lets a browser — which cannot speak raw gRPC — act as a second,
// entirely independent operator client against an unmodified C2 core (§9).
//
//   npm start                 # connect to a real server on localhost:50051
//   npm start -- --fake       # self-contained simulator, no server needed
//   npm start -- --target host:port --port 8081
//
import { WebSocketServer, WebSocket } from "ws";
import { GrpcSource } from "./grpcSource.js";
import { FakeSource } from "./fakeSource.js";
import type { Source } from "./source.js";
import type { ServerMessage, ClientMessage, SwarmState } from "./types.js";

function parseArgs(argv: string[]) {
  const args = { fake: false, target: "localhost:50051", port: 8081 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--fake") args.fake = true;
    else if (a === "--target") args.target = argv[++i];
    else if (a === "--port") args.port = Number(argv[++i]);
  }
  return args;
}

const opts = parseArgs(process.argv.slice(2));
const source: Source = opts.fake ? new FakeSource() : new GrpcSource(opts.target);

const wss = new WebSocketServer({ port: opts.port });
const clients = new Set<WebSocket>();

// Cache the last frame + link status so a browser that connects mid-stream gets
// state immediately instead of waiting for the next 5 Hz tick.
let lastFrame: SwarmState | null = null;
let connected = false;
let statusDetail = "starting";

function broadcast(msg: ServerMessage) {
  const data = JSON.stringify(msg);
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) ws.send(data);
  }
}

source.onStatus((isConnected, detail) => {
  connected = isConnected;
  statusDetail = detail;
  broadcast({ type: "status", connected, source: source.kind, detail });
  console.log(`[source:${source.kind}] ${detail}`);
});

source.onFrame((state) => {
  lastFrame = state;
  broadcast({ type: "swarm", state });
});

wss.on("connection", (ws) => {
  clients.add(ws);
  console.log(`[ws] client connected (${clients.size} total)`);

  // Prime the new client with current status + latest frame.
  ws.send(JSON.stringify({ type: "status", connected, source: source.kind, detail: statusDetail } satisfies ServerMessage));
  if (lastFrame) ws.send(JSON.stringify({ type: "swarm", state: lastFrame } satisfies ServerMessage));

  ws.on("message", async (raw) => {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      console.warn("[ws] dropped malformed message");
      return;
    }
    if (msg.type === "command") {
      try {
        const accepted = await source.sendCommand(msg.intent);
        ws.send(JSON.stringify({ type: "ack", ...accepted } satisfies ServerMessage));
        console.log(`[cmd] ${accepted.command_id} -> ${msg.intent.targets.join(",")} accepted=${accepted.accepted}`);
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        ws.send(JSON.stringify({ type: "ack", command_id: "", accepted: false, detail } satisfies ServerMessage));
        console.warn(`[cmd] send failed: ${detail}`);
      }
    }
  });

  ws.on("close", () => {
    clients.delete(ws);
    console.log(`[ws] client disconnected (${clients.size} total)`);
  });
});

console.log(`[bridge] WebSocket on ws://localhost:${opts.port}  source=${source.kind}${opts.fake ? "" : ` target=${opts.target}`}`);
source.start();

function shutdown() {
  console.log("\n[bridge] shutting down");
  source.stop();
  wss.close();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
