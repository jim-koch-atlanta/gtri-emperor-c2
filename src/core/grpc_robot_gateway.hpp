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

// Shared state for one active Link() call — owned by the handler, referenced
// weakly by the registry so SendCommand can push a RobotCommand down the stream.
struct RobotLinkState {
    std::string robot_id;
    std::queue<emperor::RobotCommand> outgoing;
    std::mutex mutex;
    std::condition_variable_any cv;

    explicit RobotLinkState(std::string id) : robot_id(std::move(id)) {}
};

// The gateway seam (TECH_SPEC §6): the only place in the project where
// emperor:: proto types appear on the robot-link side. Core organs (TrackStore,
// CommandTracker, LinkWatchdog) receive plain domain types via callbacks.
class GrpcRobotGateway final : public emperor::RobotLink::Service {
public:
    // Callbacks are called synchronously on each link's reader thread.
    // Implementations must be thread-safe (multiple links run concurrently).
    GrpcRobotGateway(
        std::function<void(RobotTelemetry)> on_telemetry,
        std::function<void(CommandResult)>  on_command_result);

    // Push a RobotCommand down to the named robot.
    // Returns false if that robot is not currently linked.
    bool SendCommand(const RobotCommand& cmd);

private:
    grpc::Status Link(
        grpc::ServerContext* ctx,
        grpc::ServerReaderWriter<emperor::RobotCommand, emperor::Uplink>* stream) override;

    grpc::Status WriterThreadImpl(
        std::stop_token stop,
        grpc::ServerReaderWriter<emperor::RobotCommand, emperor::Uplink>* stream,
        RobotLinkState& state);

    // TOCTOU-safe: check-and-fetch under one lock, returns strong ref or nullptr.
    std::shared_ptr<RobotLinkState> lookup(const std::string& robot_id);

    // proto -> domain translation (static; no side effects).
    static RobotTelemetry     to_domain(const emperor::Telemetry& t);
    static CommandResult      to_domain(const emperor::CommandResult& r);
    static emperor::RobotCommand to_proto(const RobotCommand& cmd);

    std::mutex registry_mutex_;
    std::unordered_map<std::string, std::weak_ptr<RobotLinkState>> registry_;

    std::function<void(RobotTelemetry)> on_telemetry_;
    std::function<void(CommandResult)>  on_command_result_;
};

} // namespace c2
