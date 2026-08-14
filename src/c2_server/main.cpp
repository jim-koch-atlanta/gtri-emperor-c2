// c2_server — The C2 server entry point.
#include <iostream>

#include "robot.pb.h"
#include "track_store.hpp"
#include "link_watchdog.hpp"
#include "command_tracker.hpp"
#include "grpc_robot_gateway.hpp"
#include "operator_feed_service.hpp"

int main()
{
  GOOGLE_PROTOBUF_VERIFY_VERSION;

  // The Track Store holds track points from the robots.
  c2::TrackStore store;

  // The link watchdog checks when the last telemetry message was received from each robot.
  // It will mark any robots that haven't sent recently as "dead".
  c2::LinkWatchdog watchdog;

  // Command tracker keeps track of each command's state.
  c2::CommandTracker tracker;

  // When a telemetry message is received from a robot, update our track store
  // and mark the robot alive in the link watchdog.
  auto on_telemetry_ = [&](c2::RobotTelemetry t) {
    store.upsert(t);
    watchdog.record(t.robot_id, std::chrono::steady_clock::now());
  };

  // When a CommandResult message is received from a robot, update the command
  // status in our command tracker.
  auto on_command_result_ = [&](c2::CommandResult r){
    tracker.onCommandResult(r, std::chrono::system_clock::now());
  };

  // GrpcRobotGateway is the translation between gRPC objects and our internal objects,
  // so that our business logic is transport-layer agnostic.
  c2::GrpcRobotGateway gateway(on_telemetry_, on_command_result_);

  // Operator feed handles coneections from C2 clients (the GUI).
  c2::OperatorFeedService feed(store, watchdog, tracker, gateway);

  // register and run
  grpc::ServerBuilder b;
  b.AddListeningPort("0.0.0.0:50051", grpc::InsecureServerCredentials());
  b.RegisterService(&gateway);
  b.RegisterService(&feed); // two services, ONE server, one port
  auto server = b.BuildAndStart();
  server->Wait();

  google::protobuf::ShutdownProtobufLibrary();
  return 0;
}
