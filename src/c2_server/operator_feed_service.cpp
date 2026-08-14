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

#include "operator_feed_service.hpp"

namespace c2 {

OperatorFeedService::OperatorFeedService(TrackStore& store, LinkWatchdog& watchdog,
                    CommandTracker& tracker, GrpcRobotGateway& gateway)
    : store_{store}
    , watchdog_{watchdog}
    , tracker_{tracker}
    , gateway_{gateway} {

}

grpc::Status OperatorFeedService::Subscribe(grpc::ServerContext* ctx,
                        const emperor::SubscribeRequest*,
                        grpc::ServerWriter<emperor::SwarmState>* writer) {

    return grpc::Status::OK;
}

grpc::Status OperatorFeedService::SendCommand(grpc::ServerContext* ctx,
                        const emperor::OperatorCommand* cmd,
                        emperor::Accepted* out) {

    return grpc::Status::OK;
}

}