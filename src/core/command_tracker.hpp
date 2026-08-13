#pragma once

#include <chrono>
#include <functional>
#include <mutex>
#include <optional>
#include <string>
#include <string_view>
#include <unordered_map>
#include <vector>

#include "robot_types.hpp"

namespace c2 {

enum class CommandState {
  CMD_STATE_UNSPECIFIED = 0,
  CMD_PENDING = 1,
  CMD_SENT = 2,
  CMD_APPLIED = 3,
  CMD_REJECTED = 4,
  CMD_EXPIRED = 5,
  CMD_ROBOT_OFFLINE = 6,
};

struct TargetState {
  CommandState state;
  std::string detail;
};

struct TrackedCommand {
  std::string command_id;
  std::chrono::system_clock::time_point expiry;             // from the OperatorCommand
  SetParameters payload;                                    // to build per-robot RobotCommands
  std::unordered_map<std::string, TargetState> targets;     // key = robot_id
  std::optional<std::chrono::system_clock::time_point> completed_at;  // all targets terminal
};

// CommandTracker — per-command, per-target lifecycle (TECH_SPEC §5) plus the
// OperatorCommand -> per-robot RobotCommand fan-out.
//
//   PENDING -> SENT -> APPLIED
//                 \-> REJECTED / EXPIRED / ROBOT_OFFLINE
//
// Design decisions:
//  1. Transport-agnostic (§6): onCommandSubmitted RETURNS the RobotCommands to
//     dispatch; it never calls the gateway. The glue (OperatorFeed) sends them
//     and reports back via onCommandSent.
//  2. SENT = handed to a live link's outgoing queue, not "the robot ran it" —
//     so a SENT command can still EXPIRE on a stalled link (§5).
//  3. EXPIRED is SERVER-determined: sweepExpired(now) walks non-terminal targets
//     whose command is past its expiry, on injected time (testable like the
//     watchdog). The robot also honors the expiry field to refuse late
//     application — a separate mechanism.
//  4. Terminal is sticky: a result arriving after EXPIRED/etc. is ignored
//     ("stale commands must die, not execute late", §5).
//  5. Bounded growth: once every target is terminal, completed_at is stamped;
//     sweepExpired drops commands held past the retention window.
//
// Concurrency: onCommandSubmitted (SendCommand thread), onCommandResult
// (per-link reader threads), onCommandSent (dispatch path), sweepExpired/
// snapshot (assembler). One mutex over the command map.
class CommandTracker {
public:
  explicit CommandTracker(
      std::chrono::milliseconds retention = std::chrono::milliseconds(10000));

  // Fan out one operator command. Targets for which is_offline(id) is true go
  // straight to ROBOT_OFFLINE and are NOT dispatched; the rest become PENDING.
  // Returns the per-robot RobotCommands the caller should send.
  std::vector<RobotCommand> onCommandSubmitted(
      const OperatorCommand& cmd,
      const std::function<bool(const std::string&)>& is_offline,
      std::chrono::system_clock::time_point now);

  // Dispatch confirmed: PENDING -> SENT for that target (no-op if not PENDING).
  void onCommandSent(std::string_view command_id, std::string_view robot_id);

  // Robot ack: SENT -> APPLIED/REJECTED. Ignored if the target is already
  // terminal (a late result after EXPIRED, etc. — decision #4).
  void onCommandResult(const CommandResult& result,
                       std::chrono::system_clock::time_point now);

  // Time-driven housekeeping: (1) expire stale non-terminal targets, (2) drop
  // commands retained past the window. Caller runs this before snapshot() each
  // assembly tick.
  void sweepExpired(std::chrono::system_clock::time_point now);

  // All currently-tracked commands, for SwarmState.commands assembly.
  std::vector<TrackedCommand> snapshot() const;

private:
  const std::chrono::milliseconds retention_;
  mutable std::mutex commands_mutex_;
  std::unordered_map<std::string, TrackedCommand> commands_;
};

}  // namespace c2
