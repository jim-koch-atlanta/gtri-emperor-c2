// subscribe_probe — smoke-test client for OperatorFeed.Subscribe. Connects,
// reads a few SwarmState frames, prints a one-line summary of each, exits.
// Demo/smoke tooling — not part of the shipped system.
//
//   subscribe_probe [target=localhost:50051] [frames=10]
#include <cstdlib>
#include <iostream>
#include <string>

#include <grpcpp/grpcpp.h>
#include "robot.grpc.pb.h"

int main(int argc, char** argv) {
  const std::string target = (argc > 1) ? argv[1] : "localhost:50051";
  const int max_frames = (argc > 2) ? std::atoi(argv[2]) : 10;

  auto channel = grpc::CreateChannel(target, grpc::InsecureChannelCredentials());
  auto stub = emperor::OperatorFeed::NewStub(channel);

  grpc::ClientContext ctx;
  emperor::SubscribeRequest req;
  auto reader = stub->Subscribe(&ctx, req);

  emperor::SwarmState state;
  int n = 0;
  for (; n < max_frames && reader->Read(&state); ++n) {
    std::cout << "seq=" << state.seq()
              << " robots=" << state.robots_size()
              << " commands=" << state.commands_size();
    for (const auto& r : state.robots()) {
      std::cout << "  [" << r.telemetry().robot_id()
                << " x=" << static_cast<int>(r.telemetry().x())
                << " y=" << static_cast<int>(r.telemetry().y())
                << " " << emperor::LinkStatus_Name(r.link_status())
                << " age=" << r.age_ms() << "ms]";
    }
    std::cout << "\n";
  }

  ctx.TryCancel();
  auto status = reader->Finish();
  std::cout << "-- read " << n << " frames; stream status="
            << status.error_code() << "\n";
  return 0;
}
