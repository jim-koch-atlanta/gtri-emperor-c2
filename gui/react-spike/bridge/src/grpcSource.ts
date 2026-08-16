// THROWAWAY AI-GENERATED EXPLORATION — proves the API seam; not the submission.
//
// GrpcSource — THIS BRIDGE IS A GATEWAY. Browsers can't speak raw HTTP/2 gRPC,
// so this process is a §6-style gateway one layer out from the C2 core: it
// subscribes to OperatorFeed.Subscribe over gRPC, re-broadcasts each SwarmState
// as JSON to the web client, and turns the web client's plain-JSON command
// intents back into proto OperatorCommands via OperatorFeed.SendCommand. The C2
// server is untouched and unaware a browser is on the other end — which is the
// whole point of the client-platform-independence seam (§9).

import * as grpc from "@grpc/grpc-js";
import { emperor } from "./proto.js";
import type { Source } from "./source.js";
import type { SwarmState, CommandIntent, Accepted, Timestamp } from "./types.js";

const RECONNECT_MIN_MS = 500;
const RECONNECT_MAX_MS = 5000;
const COMMAND_EXPIRY_MS = 5000; // validity window for issued commands (§5)

function toProtoTimestamp(ms: number): Timestamp {
  return { seconds: Math.floor(ms / 1000), nanos: (ms % 1000) * 1_000_000 };
}

// Drop undefined params so proto3 field presence (optional) stays honest: only
// the fields the operator actually set get sent (SetParameters teleport, §4).
function cleanParams(params: CommandIntent["params"]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(params)) {
    if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
  }
  return out;
}

export class GrpcSource implements Source {
  readonly kind = "grpc" as const;
  private client: any;
  private call: grpc.ClientReadableStream<any> | null = null;
  private frameCb: (s: SwarmState) => void = () => {};
  private statusCb: (connected: boolean, detail: string) => void = () => {};
  private backoff = RECONNECT_MIN_MS;
  private stopped = false;
  private healthy = false; // are we currently receiving frames?
  private commandSeq = 0;

  constructor(private readonly target: string) {
    this.client = new emperor.OperatorFeed(
      target,
      grpc.credentials.createInsecure(),
    );
  }

  onFrame(cb: (s: SwarmState) => void) {
    this.frameCb = cb;
  }
  onStatus(cb: (connected: boolean, detail: string) => void) {
    this.statusCb = cb;
  }

  start() {
    this.stopped = false;
    this.subscribe();
  }

  stop() {
    this.stopped = true;
    if (this.call) this.call.cancel();
    this.client.close();
  }

  private subscribe() {
    if (this.stopped) return;
    this.statusCb(false, `connecting to ${this.target}…`);

    const call: grpc.ClientReadableStream<any> = this.client.Subscribe({});
    this.call = call;

    call.on("data", (frame: SwarmState) => {
      // Announce health only on the transition into "streaming" — not once per
      // frame — so the WS clients get one status message, not 5/sec of noise.
      if (!this.healthy) {
        this.healthy = true;
        this.backoff = RECONNECT_MIN_MS; // reset backoff once genuinely connected
        this.statusCb(true, `streaming from ${this.target}`);
      }
      this.frameCb(frame);
    });
    call.on("error", (err: grpc.ServiceError) => this.onDrop(err.message));
    call.on("end", () => this.onDrop("stream ended"));
  }

  private onDrop(detail: string) {
    if (this.stopped) return;
    this.healthy = false;
    this.statusCb(false, `disconnected (${detail}); retry in ${this.backoff}ms`);
    const wait = this.backoff;
    this.backoff = Math.min(this.backoff * 2, RECONNECT_MAX_MS);
    setTimeout(() => this.subscribe(), wait);
  }

  sendCommand(intent: CommandIntent): Promise<Accepted> {
    const now = Date.now();
    const command: any = {
      command_id: intent.command_id ?? `op-${now}-${this.commandSeq++}`,
      timestamp: toProtoTimestamp(now),
      expiry: toProtoTimestamp(now + COMMAND_EXPIRY_MS),
      targets: intent.targets,
      set_parameters: cleanParams(intent.params),
    };
    return new Promise((resolve, reject) => {
      this.client.SendCommand(command, (err: grpc.ServiceError | null, resp: Accepted) => {
        if (err) reject(err);
        else resolve(resp);
      });
    });
  }
}
