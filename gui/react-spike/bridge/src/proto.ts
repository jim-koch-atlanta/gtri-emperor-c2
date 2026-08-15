// THROWAWAY AI-GENERATED EXPLORATION — proves the API seam; not the submission.
//
// Loads robot.proto (the ONE source of truth — not hand-edited, not copied) and
// hands back the emperor package. proto-loader resolves the well-known
// google/protobuf/timestamp.proto itself, so no include dirs are needed.

import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
// src -> bridge -> react-spike -> gui -> repo root -> proto/robot.proto
export const PROTO_PATH = resolve(here, "../../../../proto/robot.proto");

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true, // keep snake_case field names, matching the proto/spec
  longs: Number, // uint64 seq / int64 age_ms are tiny here — decode as numbers
  enums: String, // LINK_LIVE / CMD_APPLIED come across as readable strings
  defaults: true,
  oneofs: true,
});

const loaded = grpc.loadPackageDefinition(packageDefinition) as any;

// The emperor.* service constructors and message types from robot.proto.
export const emperor = loaded.emperor;
