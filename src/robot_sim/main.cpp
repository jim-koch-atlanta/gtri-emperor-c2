// robot_sim — one robot process. Streams Telemetry up at 10 Hz and applies
// inbound RobotCommands (SetParameters) over a single gRPC bidi stream.
//
// Threading (see design notes): the WRITER is the main thread — the 10 Hz
// telemetry heartbeat, which must never block. The READER runs on its own
// thread because stream->Read() blocks. gRPC permits one concurrent reader +
// one concurrent writer per stream, but NOT two writers — so the reader does
// NOT write CommandResults itself; it applies the command and ENQUEUES a
// result, which the writer drains. This is the mirror image of c2_server's
// Link() (reader inline, writer thread draining a queue).
#include <atomic>
#include <chrono>
#include <cmath>
#include <cstdint>
#include <exception>
#include <iostream>
#include <memory>
#include <mutex>
#include <numbers>
#include <queue>
#include <string>
#include <thread>

#include <grpcpp/grpcpp.h>
#include "robot.grpc.pb.h"
#include "robot_types.hpp"

namespace {

// ---- Initial parameters from the command line (plumbing) -------------------
struct RobotParams {
  std::string robot_id;
  double x0 = 0.0;
  double y0 = 0.0;
  double radius = 0.0;   // R
  double speed = 0.0;    // V
  double theta0 = 0.0;   // phase
  std::string server_addr = "localhost:50051";
};

void usage(const char* prog) {
  std::cerr << "usage: " << prog
            << " <robot_id> <x0> <y0> <R> <V> <theta0> [server_addr]\n"
            << "  e.g. " << prog << " R-01 0 0 100 12 0 localhost:50051\n";
}

bool parseArgs(int argc, char** argv, RobotParams& p) {
  if (argc < 7) return false;
  try {
    p.robot_id = argv[1];
    p.x0     = std::stod(argv[2]);
    p.y0     = std::stod(argv[3]);
    p.radius = std::stod(argv[4]);
    p.speed  = std::stod(argv[5]);
    p.theta0 = std::stod(argv[6]);
    if (argc >= 8) p.server_addr = argv[7];
  } catch (const std::exception& e) {
    std::cerr << "bad numeric argument: " << e.what() << "\n";
    return false;
  }
  return true;
}

// ============================================================================
// MOTION MODEL SEAM — YOURS (Requirement #1).
// This block is the robot's own physics + command-apply — the part you write
// and defend. It's a thin stub here only so the scaffold compiles and runs
// (the dot sits still); replace the two TODO bodies with the real circular
// model. Strongly suggest lifting this into motion_model.hpp as a pure,
// gRPC-free type with a gtest (§10: position at known t; partial apply;
// teleport). Keep it lock-free internally — main() owns the mutex — so the
// unit test can construct and drive it trivially.
// ============================================================================
struct MotionState {
  double cx;       // center x  (x0)
  double cy;       // center y  (y0)
  double radius;   // R
  double speed;    // V
  double theta0;   // phase
  std::chrono::steady_clock::time_point start;  // t = 0 reference
};

// (x, y, heading) at wall-time 'now', from the circular motion model.
//   t   = seconds since start
//   phi = V/R·t + theta0     (angular position on the circle)
//   x = cx + R·cos(phi);  y = cy + R·sin(phi)
//   heading = phi + pi/2     (CCW tangent, radians; assumes V > 0)
void computePosition(const MotionState& m,
                     std::chrono::steady_clock::time_point now,
                     double& x, double& y, double& heading) {
  double t = std::chrono::duration<double>(now - m.start).count();
  double phi = m.speed / m.radius * t + m.theta0;
  x = m.cx + m.radius * std::cos(phi);
  y = m.cy + m.radius * std::sin(phi);
  heading = phi + std::numbers::pi / 2.0;
}

// Apply a partial SetParameters — only the fields the command actually set
// (mirror of the gateway's guarded to_proto).
// Returns true = APPLIED, false = REJECTED.
bool applyParams(MotionState& m, const emperor::SetParameters& sp) {
  // Reject bad params before mutating anything: R <= 0 divides by zero in the
  // motion model (NaN position). Surfaces to the operator as REJECTED (§5).
  if (sp.has_radius() && sp.radius() <= 0.0) { return false; }

  if (sp.has_center_x()) { m.cx = sp.center_x(); }
  if (sp.has_center_y()) { m.cy = sp.center_y(); }
  if (sp.has_radius()) { m.radius = sp.radius(); }
  if (sp.has_speed()) { m.speed = sp.speed(); }
  if (sp.has_theta()) { m.theta0 = sp.theta(); }

  return true;
}

}  // namespace

int main(int argc, char** argv) {
  GOOGLE_PROTOBUF_VERIFY_VERSION;

  RobotParams params;
  if (!parseArgs(argc, argv, params)) { usage(argv[0]); return 1; }

  auto channel = grpc::CreateChannel(params.server_addr,
                                     grpc::InsecureChannelCredentials());
  auto stub = emperor::RobotLink::NewStub(channel);

  grpc::ClientContext context;
  // Client writes Uplink, reads RobotCommand.
  auto stream = stub->Link(&context);

  // Shared motion state: written by the reader (on apply), read by the writer
  // (every tick) → guarded by motion_mutex.
  MotionState motion{params.x0, params.y0, params.radius, params.speed,
                     params.theta0, std::chrono::steady_clock::now()};
  std::mutex motion_mutex;

  // CommandResults produced by the reader, drained by the writer. The reader
  // must never write to the stream directly (single-writer rule).
  std::queue<emperor::Uplink> outgoing;
  std::mutex outgoing_mutex;

  std::atomic<bool> running{true};

  // ---- READER THREAD: command in -> apply (locked) -> enqueue result -------
  std::jthread reader([&]() {
    emperor::RobotCommand cmd;
    while (stream->Read(&cmd)) {
      bool applied = true;
      if (cmd.has_set_parameters()) {
        std::lock_guard<std::mutex> lg(motion_mutex);
        applied = applyParams(motion, cmd.set_parameters());
      }
      emperor::Uplink up;
      auto* r = up.mutable_command_result();
      r->set_command_id(cmd.command_id());
      r->set_robot_id(params.robot_id);
      r->set_result(applied ? emperor::RESULT_APPLIED : emperor::RESULT_REJECTED);
      {
        std::lock_guard<std::mutex> lg(outgoing_mutex);
        outgoing.push(std::move(up));
      }
    }
    running = false;  // stream closed by peer
  });

  // ---- WRITER (main thread): telemetry @10 Hz + drain results --------------
  std::uint64_t seq = 0;
  while (running) {
    // 1) telemetry tick
    double x, y, heading, speed, radius;
    {
      std::lock_guard<std::mutex> lg(motion_mutex);
      computePosition(motion, std::chrono::steady_clock::now(), x, y, heading);
      speed = motion.speed;
      radius = motion.radius;
    }
    emperor::Uplink up;
    auto* t = up.mutable_telemetry();
    t->set_robot_id(params.robot_id);
    t->set_seq(seq++);
    t->set_x(x);
    t->set_y(y);
    t->set_heading(heading);
    t->set_speed(speed);
    t->set_radius(radius);

    // Event timestamp (display/debug only, §4): whole seconds + nanosecond
    // remainder off the same epoch duration.
    auto since_epoch = std::chrono::system_clock::now().time_since_epoch();
    auto secs = std::chrono::duration_cast<std::chrono::seconds>(since_epoch);
    auto nanos = std::chrono::duration_cast<std::chrono::nanoseconds>(since_epoch - secs);
    auto* ts = t->mutable_timestamp();
    ts->set_seconds(secs.count());
    ts->set_nanos(static_cast<std::int32_t>(nanos.count()));

    if (!stream->Write(up)) break;

    // 2) drain any pending CommandResults through the single writer
    for (;;) {
      emperor::Uplink out;
      {
        std::lock_guard<std::mutex> lg(outgoing_mutex);
        if (outgoing.empty()) break;
        out = std::move(outgoing.front());
        outgoing.pop();
      }
      if (!stream->Write(out)) { running = false; break; }
    }

    std::this_thread::sleep_for(std::chrono::milliseconds(100));  // ~10 Hz
  }

  // Minimal teardown. TryCancel unblocks the reader's Read(); clean SIGINT
  // handling for launch_swarm is a later concern (Organ 5).
  context.TryCancel();
  reader.join();
  grpc::Status status = stream->Finish();
  std::cout << params.robot_id << " link closed (code "
            << status.error_code() << ")\n";

  google::protobuf::ShutdownProtobufLibrary();
  return 0;
}
