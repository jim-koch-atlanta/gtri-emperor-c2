#include <grpcpp/grpcpp.h>
#include "robot.grpc.pb.h"
#include "robot_types.hpp"

#include "grpc_robot_callback_gateway.hpp"
#include "grpc_robot_reactor.hpp"

namespace c2 {

GrpcRobotReactor::GrpcRobotReactor(GrpcRobotCallbackGateway* owner) {
    this->owner = owner;

    this->StartRead(&incoming); // Kick off the first read.
}

void GrpcRobotReactor::enqueue(emperor::RobotCommand cmd) {
    std::lock_guard lg(outgoing_mutex);
    outgoing_queue.push(cmd);
    pumpLocked();
}

void GrpcRobotReactor::OnReadDone(bool ok) {
    if (!ok) {
        // The client is closed / dead.
        Finish(grpc::Status::OK);
        return;
    }

    if (!this->registered) {
        std::string robot_id = incoming.telemetry().robot_id();
        this->robot_id = robot_id;
        owner->RegisterReactor(robot_id, this);
        this->registered = true;
    }

    if (incoming.kind_case() == emperor::Uplink::KindCase::kTelemetry) {
        owner->DeliverTelemetry(*incoming.mutable_telemetry());
    } else if (incoming.kind_case() == emperor::Uplink::KindCase::kCommandResult) {
        owner->DeliverCommandResult(*incoming.mutable_command_result());
    }

    StartRead(&incoming);
}

void GrpcRobotReactor::OnWriteDone(bool ok) {
    std::lock_guard lg(outgoing_mutex);
    writing = false;
    if (!ok) {
        Finish({ grpc::StatusCode::UNAVAILABLE, "write failed" });
        return;
    }
    outgoing_queue.pop();
    pumpLocked();
}

void GrpcRobotReactor::OnDone() {
    this->owner->UnregisterReactor(this->robot_id);
    delete this;
}

void GrpcRobotReactor::OnCancel() {

}

void GrpcRobotReactor::pumpLocked() {
    if (this->writing || this->outgoing_queue.empty()) {
        return;
    }

    outgoing = outgoing_queue.front();
    writing = true;
    StartWrite(&outgoing);
}

}