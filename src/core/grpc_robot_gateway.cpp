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
#include "grpc_robot_gateway.hpp"

namespace c2 {

// Callbacks are called synchronously on each link's reader thread.
// Implementations must be thread-safe (multiple links run concurrently).
GrpcRobotGateway::GrpcRobotGateway(
    std::function<void(RobotTelemetry)> on_telemetry,
    std::function<void(CommandResult)>  on_command_result) {
    on_telemetry_ = on_telemetry;
    on_command_result_ = on_command_result;
}

// Push a RobotCommand down to the named robot.
// Returns false if that robot is not currently linked.
bool GrpcRobotGateway::SendCommand(const RobotCommand& cmd) {
    if (auto ls = lookup(cmd.robot_id)) {
        std::lock_guard<std::mutex> lg(ls->mutex);
        ls->outgoing.push(to_proto(cmd));
        ls->cv.notify_all();
        return true;
    }

    return false;
}

grpc::Status GrpcRobotGateway::Link(
    [[maybe_unused]] grpc::ServerContext* ctx,
    grpc::ServerReaderWriter<emperor::RobotCommand, emperor::Uplink>* stream) {

    emperor::Uplink uplink;
    if (!stream->Read(&uplink)) {
        return grpc::Status::CANCELLED;
    }

    // If it's not a Telemetry message, something's wrong.
    if (!uplink.has_telemetry()) {
        return grpc::Status::CANCELLED;
    }

    std::string robot_id = uplink.telemetry().robot_id();

    // Shared state between the telemetry-reader and command-writer threads.    
    std::shared_ptr<RobotLinkState> linkState = std::make_shared<RobotLinkState>(robot_id);
    {
        std::lock_guard<std::mutex> lg(registry_mutex_);        
        registry_.emplace(robot_id, linkState);
    }

    // Register the writer thread.
    std::jthread writerThread([&](std::stop_token tk) {
      WriterThreadImpl(tk, stream, *linkState);
    });


    do {
        if (uplink.kind_case() == emperor::Uplink::KindCase::kTelemetry) {
            auto cmd = to_domain(uplink.telemetry());
            on_telemetry_(cmd);
        } else if (uplink.kind_case() == emperor::Uplink::KindCase::kCommandResult) {
            auto cmd = to_domain(uplink.command_result());
            on_command_result_(cmd);
        }
    } while (stream->Read(&uplink));

    writerThread.request_stop();
    writerThread.join();

    // Once the writer thread is done, we unregister the LinkState for this Link() connection.
    std::lock_guard<std::mutex> lg(registry_mutex_);        
    registry_.erase(robot_id);

    return grpc::Status::OK;
}

grpc::Status GrpcRobotGateway::WriterThreadImpl(
    std::stop_token stop,
    grpc::ServerReaderWriter<emperor::RobotCommand, emperor::Uplink>* stream,
    RobotLinkState& state) {

    while (!stop.stop_requested()) {
      std::unique_lock<std::mutex> lock(state.mutex);

      // Wait until there is data OR a shutdown signal is given
      state.cv.wait(lock, stop, [&]() { 
          return !state.outgoing.empty() || stop.stop_requested(); 
      });    

      while (!state.outgoing.empty()) {
        auto cmd = state.outgoing.front();
        state.outgoing.pop();
        if (!stream->Write(cmd)) {
          return grpc::Status::CANCELLED;
        }
      }
    }

    return grpc::Status::OK;

}

// TOCTOU-safe: check-and-fetch under one lock, returns strong ref or nullptr.
std::shared_ptr<RobotLinkState> GrpcRobotGateway::lookup(const std::string& robot_id) {
    std::lock_guard<std::mutex> lg(registry_mutex_);
    auto it = registry_.find(robot_id);
    if (it == registry_.end()) {
      return nullptr;
    }
    return it->second.lock();   // null if it expired mid-lookup
}

// proto -> domain translation (static; no side effects).
RobotTelemetry GrpcRobotGateway::to_domain(const emperor::Telemetry& t) {
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

CommandResult GrpcRobotGateway::to_domain(const emperor::CommandResult& r) {
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

emperor::RobotCommand GrpcRobotGateway::to_proto(const RobotCommand& cmd) {
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
