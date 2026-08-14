#pragma once

#include <condition_variable>
#include <functional>
#include <memory>
#include <mutex>
#include <queue>
#include <string>
#include <unordered_map>

#include <grpcpp/grpcpp.h>
#include "robot.grpc.pb.h"
#include "robot_types.hpp"

#include "track_store.hpp"
#include "link_watchdog.hpp"
#include "command_tracker.hpp"
#include "grpc_robot_gateway.hpp"

namespace c2 {

class OperatorFeedService final : public emperor::OperatorFeed::Service {
public:
    OperatorFeedService(TrackStore& store, LinkWatchdog& watchdog,
                      CommandTracker& tracker, GrpcRobotGateway& gateway);

    grpc::Status Subscribe(grpc::ServerContext* ctx,
                         const emperor::SubscribeRequest*,
                         grpc::ServerWriter<emperor::SwarmState>* writer) override;
    grpc::Status SendCommand(grpc::ServerContext* ctx,
                           const emperor::OperatorCommand* cmd,
                           emperor::Accepted* out) override;

private:
    TrackStore& store_;
    LinkWatchdog& watchdog_;
    CommandTracker& tracker_;
    GrpcRobotGateway& gateway_;
};

}