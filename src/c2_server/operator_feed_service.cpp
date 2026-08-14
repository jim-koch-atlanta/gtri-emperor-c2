#include <chrono>
#include <cstdint>
#include <string>
#include <thread>
#include <vector>

#include <grpcpp/grpcpp.h>
#include "robot.grpc.pb.h"
#include "robot_types.hpp"

#include "operator_feed_service.hpp"

namespace c2
{

    OperatorFeedService::OperatorFeedService(TrackStore &store, LinkWatchdog &watchdog,
                                             CommandTracker &tracker, GrpcRobotGateway &gateway)
        : store_{store}, watchdog_{watchdog}, tracker_{tracker}, gateway_{gateway} {}

    // ---- file-local domain->proto translation (the north seam) -----------------
    // There are multiple copies of toProtobufTimestamp now, so it would make sense
    // to put that into a util file.
    namespace
    {

        void toProtobufTimestamp(const std::chrono::system_clock::time_point &tp,
                                 google::protobuf::Timestamp *out)
        {
            auto since_epoch = tp.time_since_epoch();
            auto seconds = std::chrono::duration_cast<std::chrono::seconds>(since_epoch);
            auto nanos = std::chrono::duration_cast<std::chrono::nanoseconds>(since_epoch - seconds);
            out->set_seconds(seconds.count());
            out->set_nanos(static_cast<std::int32_t>(nanos.count()));
        }

        void toProtobufTelemetry(const RobotTelemetry &r, emperor::Telemetry &out)
        {
            out.set_robot_id(r.robot_id);
            out.set_seq(r.seq);
            toProtobufTimestamp(r.timestamp, out.mutable_timestamp());
            out.set_x(r.x);
            out.set_y(r.y);
            out.set_heading(r.heading);
            out.set_speed(r.speed);
            out.set_radius(r.radius);
        }

        emperor::LinkStatus toProtobufLinkStatus(LinkStatus status)
        {
            switch (status)
            {
            case LinkStatus::LIVE:
                return emperor::LINK_LIVE;
            case LinkStatus::STALE:
                return emperor::LINK_STALE;
            case LinkStatus::LOST:
                return emperor::LINK_LOST;
            }
            return emperor::LINK_STATUS_UNSPECIFIED;
        }

        // A RobotState = telemetry (from the snapshot) + link_status + age_ms (from the
        // watchdog). Builds directly into each Add()'d element — no temporary + copy.
        void toProtobufRobots(
            const std::vector<RobotTelemetry> &robots_telemetry,
            std::chrono::steady_clock::time_point now_steady,
            const LinkWatchdog &watchdog,
            google::protobuf::RepeatedPtrField<emperor::RobotState> *output_robots)
        {
            for (const auto &robot_telemetry : robots_telemetry)
            {
                emperor::RobotState *state = output_robots->Add();
                toProtobufTelemetry(robot_telemetry, *state->mutable_telemetry());
                LinkHealth health = watchdog.classify(robot_telemetry.robot_id, now_steady);
                state->set_link_status(toProtobufLinkStatus(health.status));
                state->set_age_ms(health.age_ms);
            }
        }

        emperor::CommandState toProtobufCommandState(c2::CommandState c) {
            switch (c) {
                case c2::CommandState::CMD_APPLIED:
                    return emperor::CommandState::CMD_APPLIED;
                case c2::CommandState::CMD_EXPIRED:
                    return emperor::CommandState::CMD_EXPIRED;
                case c2::CommandState::CMD_PENDING:
                    return emperor::CommandState::CMD_PENDING;
                case c2::CommandState::CMD_ROBOT_OFFLINE:
                    return emperor::CommandState::CMD_ROBOT_OFFLINE;
                case c2::CommandState::CMD_SENT:
                    return emperor::CommandState::CMD_SENT;
                case c2::CommandState::CMD_REJECTED:
                    return emperor::CommandState::CMD_REJECTED;
                default:
                    return emperor::CommandState::CMD_STATE_UNSPECIFIED;
            }
        }

        // Map each TrackedCommand -> proto CommandStatus.
        void toProtobufCommands(
            const std::vector<TrackedCommand>& tracked_commands,
            google::protobuf::RepeatedPtrField<emperor::CommandStatus> *output_commands)
        {
            for (const auto& command : tracked_commands) {
                emperor::CommandStatus* status = output_commands->Add();
                status->set_command_id(command.command_id);
                for (const auto& target : command.targets) {
                    emperor::TargetStatus* ts = status->add_targets();
                    ts->set_robot_id(target.first);
                    ts->set_detail(target.second.detail);
                    ts->set_state(toProtobufCommandState(target.second.state));
                }
            }
        }

        c2::SetParameters toDomainSetParameters(const emperor::SetParameters& i) {
            c2::SetParameters o;
            
            if (i.has_center_x()) o.center_x = i.center_x();
            if (i.has_center_y()) o.center_y = i.center_y();
            if (i.has_radius()) o.radius = i.radius();
            if (i.has_speed()) o.speed = i.speed();
            if (i.has_theta()) o.theta = i.theta();

            return o;
        }

        std::chrono::system_clock::time_point toDomainTimestamp(const google::protobuf::Timestamp &ts)
        {
            return std::chrono::system_clock::from_time_t(ts.seconds()) +
                   std::chrono::nanoseconds(ts.nanos());
        }

        OperatorCommand toDomainOperatorCommand(const emperor::OperatorCommand &cmd)
        {
            OperatorCommand op;
            op.command_id = cmd.command_id();
            op.timestamp = toDomainTimestamp(cmd.timestamp());
            op.expiry = toDomainTimestamp(cmd.expiry());
            for (const auto &target : cmd.targets())
            {
                op.targets.push_back(target);
            }
            op.payload = toDomainSetParameters(cmd.set_parameters());
            return op;
        }

    } // namespace

    /**
     * The 5 Hz per-subscriber loop: assemble SwarmState from the organs, translate
     * to proto, write. Write() returning false = the client disconnected → return.
     */
    grpc::Status OperatorFeedService::Subscribe(
        [[maybe_unused]] grpc::ServerContext *ctx,
        const emperor::SubscribeRequest *,
        grpc::ServerWriter<emperor::SwarmState> *writer)
    {
        // Per-subscriber seq.
        std::uint64_t seq = 0;
        bool done = false;
        while (!done)
        {
            auto now_system = std::chrono::system_clock::now();
            auto now_steady = std::chrono::steady_clock::now();

            std::vector<RobotTelemetry> robots_telemetry = store_.snapshot();

            emperor::SwarmState swarm_state;
            swarm_state.set_seq(seq++);
            toProtobufTimestamp(now_system, swarm_state.mutable_server_time());
            toProtobufRobots(robots_telemetry, now_steady, watchdog_, swarm_state.mutable_robots());

            // Age the lifecycle before snapshotting: expire stale non-terminal
            // targets + drop commands past the retention window (bounded growth).
            tracker_.sweepExpired(now_system);
            toProtobufCommands(tracker_.snapshot(), swarm_state.mutable_commands());

            if (!writer->Write(swarm_state))
            {
                done = true; // subscriber disconnected
            }
            std::this_thread::sleep_for(std::chrono::milliseconds(200));
        }
        return grpc::Status::OK;
    }

    grpc::Status OperatorFeedService::SendCommand(
        [[maybe_unused]] grpc::ServerContext *ctx,
        const emperor::OperatorCommand *cmd,
        emperor::Accepted *out)
    {
        if (cmd->payload_case() != emperor::OperatorCommand::PayloadCase::kSetParameters) {
            return grpc::Status(grpc::StatusCode::INVALID_ARGUMENT,
                                "only SetParameters payloads are supported");
        }

        const auto now_system = std::chrono::system_clock::now();
        const auto now_steady = std::chrono::steady_clock::now();

        // The Command Tracker will do command fan-out for us.
        OperatorCommand op = toDomainOperatorCommand(*cmd);
        auto is_offline = [&](const std::string &id) {
            return watchdog_.classify(id, now_steady).status == LinkStatus::LOST;
        };
        std::vector<RobotCommand> to_dispatch =
            tracker_.onCommandSubmitted(op, is_offline, now_system);

        // Dispatch through the gRPC Robot Gateway. On success, mark the command sent.
        for (const auto &rc : to_dispatch) {
            if (gateway_.SendCommand(rc)) {
                tracker_.onCommandSent(rc.command_id, rc.robot_id);
            }
        }

        out->set_command_id(cmd->command_id());
        out->set_accepted(true);
        return grpc::Status::OK;
    }

} // namespace c2
