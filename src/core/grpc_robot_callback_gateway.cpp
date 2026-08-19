#include <condition_variable>
#include <functional>
#include <memory>
#include <mutex>
#include <queue>
#include <string>
#include <thread>
#include <unordered_map>

#include <grpcpp/grpcpp.h>

#include "robot.grpc.pb.h"
#include "robot_types.hpp"
#include "grpc_robot_callback_gateway.hpp"
#include "grpc_robot_reactor.hpp"

namespace c2 {

// Callbacks are called synchronously on each link's reader thread.
// Implementations must be thread-safe (multiple links run concurrently).
GrpcRobotCallbackGateway::GrpcRobotCallbackGateway(
    std::function<void(RobotTelemetry)> on_telemetry,
    std::function<void(CommandResult)>  on_command_result) {
    on_telemetry_ = on_telemetry;
    on_command_result_ = on_command_result;
}

// Push a RobotCommand down to the named robot.
// Returns false if that robot is not currently linked.
bool GrpcRobotCallbackGateway::SendCommand(const RobotCommand& cmd) {
    std::lock_guard lg(this->registry_mutex_);
    auto it = this->registry_.find(cmd.robot_id);
    if (it != this->registry_.end()) {
        GrpcRobotReactor* reactor = it->second;
        reactor->enqueue(to_proto(cmd));
        return true;
    }

    return false;
}

grpc::ServerBidiReactor<emperor::Uplink, emperor::RobotCommand>*
GrpcRobotCallbackGateway::Link([[maybe_unused]] grpc::CallbackServerContext* ctx) {
    return new GrpcRobotReactor(this);
}

void GrpcRobotCallbackGateway::RegisterReactor(std::string robot_id, GrpcRobotReactor* reactor) {
    std::lock_guard lg(this->registry_mutex_);
    this->registry_.emplace(robot_id, reactor);
}

void GrpcRobotCallbackGateway::UnregisterReactor(std::string robot_id) {
    std::lock_guard lg(this->registry_mutex_);
    this->registry_.erase(robot_id);
}

void GrpcRobotCallbackGateway::DeliverTelemetry(const emperor::Telemetry& t) {
    c2::RobotTelemetry rt = to_domain(t);
    on_telemetry_(rt);
}

void GrpcRobotCallbackGateway::DeliverCommandResult(const emperor::CommandResult& c) {
    c2::CommandResult rt = to_domain(c);
    on_command_result_(rt);
}

// proto -> domain translation (static; no side effects).
RobotTelemetry GrpcRobotCallbackGateway::to_domain(const emperor::Telemetry& t) {
    return RobotTelemetry{
        .robot_id = t.robot_id(),
        .seq = t.seq(),
        .timestamp = std::chrono::system_clock::from_time_t(t.timestamp().seconds()) + std::chrono::nanoseconds(t.timestamp().nanos()),
        .x = t.x(),
        .y = t.y(),
        .heading = t.heading(),
        .speed = t.speed(),
        .radius = t.radius(),
    };
}

CommandResult GrpcRobotCallbackGateway::to_domain(const emperor::CommandResult& r) {
    ResultCode code;
    switch(r.result()) {
        case emperor::ResultCode::RESULT_UNSPECIFIED:
            code = ResultCode::RESULT_UNSPECIFIED;
            break;
        case emperor::ResultCode::RESULT_APPLIED:
            code = ResultCode::RESULT_APPLIED;
            break;
        case emperor::ResultCode::RESULT_REJECTED:
            code = ResultCode::RESULT_REJECTED;
            break;
        default:
            code = ResultCode::RESULT_UNSPECIFIED;
            break;
    }

    return CommandResult{
        .command_id = r.command_id(),
        .robot_id = r.robot_id(),
        .result = code,
        .detail = r.detail(),
    };
}

void ConvertToProtobufTimestamp(
    const std::chrono::system_clock::time_point& tp, 
    google::protobuf::Timestamp* output_timestamp) 
{
    // 1. Get the duration since the Unix epoch
    auto duration_since_epoch = tp.time_since_epoch();

    // 2. Extract whole seconds
    auto seconds = std::chrono::duration_cast<std::chrono::seconds>(duration_since_epoch);
    output_timestamp->set_seconds(seconds.count());

    // 3. Extract the remaining nanoseconds 
    auto nanoseconds = std::chrono::duration_cast<std::chrono::nanoseconds>(duration_since_epoch - seconds);
    output_timestamp->set_nanos(static_cast<int32_t>(nanoseconds.count()));
}

emperor::RobotCommand GrpcRobotCallbackGateway::to_proto(const RobotCommand& cmd) {
    emperor::RobotCommand eCmd;
    eCmd.set_command_id(cmd.command_id);
    eCmd.set_robot_id(cmd.robot_id);

    ConvertToProtobufTimestamp(cmd.timestamp, eCmd.mutable_timestamp());
    ConvertToProtobufTimestamp(cmd.expiry, eCmd.mutable_expiry());

    auto setParameters = std::get<SetParameters>(cmd.payload);
    auto* out = eCmd.mutable_set_parameters();
    if (setParameters.center_x.has_value()) { out->set_center_x(setParameters.center_x.value()); };
    if (setParameters.center_y.has_value()) { out->set_center_y(setParameters.center_y.value()); };
    if (setParameters.radius.has_value()) { out->set_radius(setParameters.radius.value()); };
    if (setParameters.speed.has_value()) { out->set_speed(setParameters.speed.value()); };
    if (setParameters.theta.has_value()) { out->set_theta(setParameters.theta.value()); };

    return eCmd;
}

} // namespace c2
