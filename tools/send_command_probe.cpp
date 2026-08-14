// send_command_probe — fires ONE SetParameters{radius *= mult} at a named robot
// via OperatorFeed.SendCommand, so the operator can watch that robot's orbit
// widen live in the GUI. First exercise of the whole command path end-to-end:
// GUI-shaped OperatorCommand -> server fan-out -> RobotCommand -> robot applies.
// Demo/smoke tooling — not part of the shipped system.
//
//   send_command_probe [robot_id=R-01] [target=localhost:50051] [mult=1.5]
#include <chrono>
#include <cstdlib>
#include <iostream>
#include <string>

#include <grpcpp/grpcpp.h>
#include "robot.grpc.pb.h"

int main(int argc, char** argv) {
  const std::string robot_id = (argc > 1) ? argv[1] : "R-01";
  const std::string target   = (argc > 2) ? argv[2] : "localhost:50051";
  const double mult          = (argc > 3) ? std::atof(argv[3]) : 1.5;

  auto channel = grpc::CreateChannel(target, grpc::InsecureChannelCredentials());
  auto stub = emperor::OperatorFeed::NewStub(channel);

  // 1) Read the target robot's CURRENT radius from one SwarmState frame, so the
  //    *1.5 is honest whatever params it launched with.
  double current_radius = 0.0;
  bool found = false;
  {
    grpc::ClientContext ctx;
    emperor::SubscribeRequest req;
    auto reader = stub->Subscribe(&ctx, req);
    emperor::SwarmState state;
    for (int n = 0; n < 20 && !found && reader->Read(&state); ++n) {
      for (const auto& r : state.robots()) {
        if (r.telemetry().robot_id() == robot_id) {
          current_radius = r.telemetry().radius();
          found = true;
          break;
        }
      }
    }
    ctx.TryCancel();          // done reading; tear the subscription down
    reader->Finish();
  }

  if (!found) {
    std::cerr << "robot '" << robot_id << "' not seen in swarm — is it running?\n";
    return 1;
  }

  const double new_radius = current_radius * mult;

  // 2) Send one OperatorCommand: SetParameters{radius=new_radius} to that robot.
  emperor::OperatorCommand cmd;
  cmd.set_command_id("probe-" + robot_id + "-radius");

  // timestamp = now, expiry = now + 30s (system_clock seconds — the clock the
  // CommandTracker uses). Generous window so it can't EXPIRE mid-demo.
  const auto now_s = std::chrono::duration_cast<std::chrono::seconds>(
                         std::chrono::system_clock::now().time_since_epoch())
                         .count();
  cmd.mutable_timestamp()->set_seconds(now_s);
  cmd.mutable_expiry()->set_seconds(now_s + 30);

  cmd.add_targets(robot_id);
  cmd.mutable_set_parameters()->set_radius(new_radius);   // partial apply: only radius

  grpc::ClientContext ctx;
  emperor::Accepted accepted;
  const grpc::Status status = stub->SendCommand(&ctx, cmd, &accepted);

  if (!status.ok()) {
    std::cerr << "SendCommand RPC failed: " << status.error_code() << ' '
              << status.error_message() << '\n';
    return 1;
  }

  std::cout << "sent radius " << current_radius << " -> " << new_radius
            << " to " << robot_id
            << "  | accepted=" << (accepted.accepted() ? "true" : "false")
            << " id=" << accepted.command_id()
            << " detail=\"" << accepted.detail() << "\"\n"
            << "watch " << robot_id << "'s orbit widen in the GUI.\n";
  return 0;
}
