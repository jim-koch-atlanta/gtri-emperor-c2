// c2_server — skeleton entry point. Real organs (track store, command tracker,
// link watchdog, operator feed) land Thu pm per TECH_SPEC §12. This main only
// proves the target links the generated proto lib.
#include <iostream>

#include "robot.pb.h"
#include "track_store.hpp"
#include "link_watchdog.hpp"
#include "command_tracker.hpp"
#include "grpc_robot_gateway.hpp"
#include "operator_feed_service.hpp"

int main() {
  GOOGLE_PROTOBUF_VERIFY_VERSION;

  // The Track Store holds track points from the robots.
  c2::TrackStore store;

  // The link watchdog checks when the last telemetry message was received from each robot.
  // It will mark any robots that haven't sent recently as "dead".
  c2::LinkWatchdog watchdog;

  // Command tracker keeps track of each command's state.
  c2::CommandTracker tracker;

  // GrpcRobotGateway is the translation between gRPC objects and our internal objects,
  // so that our business logic is transport-layer agnostic.
  c2::GrpcRobotGateway gateway([](c2::RobotTelemetry t) { }, [](c2::CommandResult) { });

  // Operator feed handles coneections from C2 clients (the GUI).
  c2::OperatorFeedService feed(store, watchdog, tracker, gateway);

  // register and run
  grpc::ServerBuilder b;
  b.AddListeningPort("0.0.0.0:50051", grpc::InsecureServerCredentials());
  b.RegisterService(&gateway);
  b.RegisterService(&feed);          // two services, ONE server, one port
  auto server = b.BuildAndStart();
  server->Wait();                    // <- "waiting for connections" is this line

  google::protobuf::ShutdownProtobufLibrary();
  return 0;
}
