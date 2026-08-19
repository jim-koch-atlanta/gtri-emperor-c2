#pragma once

#include <queue>
#include <grpcpp/grpcpp.h>
#include "robot.grpc.pb.h"
#include "robot_types.hpp"

namespace c2 {

class GrpcRobotCallbackGateway;

// The gateway seam (TECH_SPEC §6), implemented using gRPC's reactor pattern. 
// The only place in the project where emperor:: proto types appear on the
// robot-link side. Core organs (TrackStore, CommandTracker, LinkWatchdog)
// receive plain domain types via callbacks.
class GrpcRobotReactor final : public ::grpc::ServerBidiReactor<emperor::Uplink, emperor::RobotCommand>
{
public:
    // Callbacks are called synchronously on each link's reader thread.
    // Implementations must be thread-safe (multiple links run concurrently).
    GrpcRobotReactor(GrpcRobotCallbackGateway* owner);

    void enqueue(emperor::RobotCommand cmd);

    void OnReadDone(bool ok) override;
    void OnWriteDone(bool ok) override;
    void OnDone() override;
    void OnCancel() override;

private:

    void pumpLocked();

    GrpcRobotCallbackGateway* owner;
    std::string robot_id;

    emperor::Uplink incoming;       // Read buffer, outlives the read.
    emperor::RobotCommand outgoing; // Write buffer, outlives the write.

    std::queue<emperor::RobotCommand> outgoing_queue;
    std::mutex outgoing_mutex;
    bool writing = false;
    bool registered = false;
};

} // namespace c2
