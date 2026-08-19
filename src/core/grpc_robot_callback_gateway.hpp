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

namespace c2 {

class GrpcRobotReactor;

// The gateway seam (TECH_SPEC §6): the only place in the project where
// emperor:: proto types appear on the robot-link side. Core organs (TrackStore,
// CommandTracker, LinkWatchdog) receive plain domain types via callbacks.
class GrpcRobotCallbackGateway final : public emperor::RobotLink::CallbackService {

public:
    // Callbacks are called synchronously on each link's reader thread.
    // Implementations must be thread-safe (multiple links run concurrently).
    GrpcRobotCallbackGateway(
        std::function<void(RobotTelemetry)> on_telemetry,
        std::function<void(CommandResult)>  on_command_result);

    // Push a RobotCommand down to the named robot.
    // Returns false if that robot is not currently linked.
    bool SendCommand(const RobotCommand& cmd);

    void RegisterReactor(std::string robot_id, GrpcRobotReactor* reactor);
    void UnregisterReactor(std::string robot_id);

    void DeliverTelemetry(const emperor::Telemetry& t);
    void DeliverCommandResult(const emperor::CommandResult& c);
    
private:
    grpc::ServerBidiReactor<emperor::Uplink, emperor::RobotCommand>*
        Link([[maybe_unused]]grpc::CallbackServerContext* ctx) override;

    // proto -> domain translation (static; no side effects).
    static RobotTelemetry     to_domain(const emperor::Telemetry& t);
    static CommandResult      to_domain(const emperor::CommandResult& r);
    static emperor::RobotCommand to_proto(const RobotCommand& cmd);

    std::function<void(RobotTelemetry)> on_telemetry_;
    std::function<void(CommandResult)>  on_command_result_;

    std::mutex registry_mutex_;
    std::unordered_map<std::string, GrpcRobotReactor*> registry_;
};

} // namespace c2
