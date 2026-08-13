#include "command_tracker.hpp"

namespace c2 {
namespace {

bool isTerminal(CommandState s) {
  return s == CommandState::CMD_APPLIED ||
         s == CommandState::CMD_REJECTED ||
         s == CommandState::CMD_EXPIRED ||
         s == CommandState::CMD_ROBOT_OFFLINE;
}

// Stamp completed_at the first time every target is terminal. Caller holds the
// lock (or the command is not yet shared, as in onCommandSubmitted).
void refreshCompletion(TrackedCommand& tc,
                       std::chrono::system_clock::time_point now) {
  if (tc.completed_at.has_value()) return;
  for (const auto& entry : tc.targets) {
    if (!isTerminal(entry.second.state)) return;
  }
  tc.completed_at = now;
}

}  // namespace

CommandTracker::CommandTracker(std::chrono::milliseconds retention)
    : retention_(retention) {}

std::vector<RobotCommand> CommandTracker::onCommandSubmitted(
    const OperatorCommand& cmd,
    const std::function<bool(const std::string&)>& is_offline,
    std::chrono::system_clock::time_point now) {
  TrackedCommand tracked;
  tracked.command_id = cmd.command_id;
  tracked.expiry = cmd.expiry;
  tracked.payload = std::get<SetParameters>(cmd.payload);

  std::vector<RobotCommand> to_dispatch;
  for (const auto& robot_id : cmd.targets) {
    if (is_offline(robot_id)) {
      // Already LOST at dispatch: surface immediately, no send (§5).
      tracked.targets.emplace(
          robot_id, TargetState{CommandState::CMD_ROBOT_OFFLINE, "offline at dispatch"});
      continue;
    }
    tracked.targets.emplace(robot_id, TargetState{CommandState::CMD_PENDING, ""});
    to_dispatch.push_back(RobotCommand{
        .command_id = cmd.command_id,
        .timestamp = cmd.timestamp,
        .expiry = cmd.expiry,
        .robot_id = robot_id,
        .payload = tracked.payload,
    });
  }

  refreshCompletion(tracked, now);  // an all-offline command is born terminal

  std::lock_guard<std::mutex> lg(commands_mutex_);
  commands_.emplace(cmd.command_id, std::move(tracked));
  return to_dispatch;
}

void CommandTracker::onCommandSent(std::string_view command_id,
                                   std::string_view robot_id) {
  std::lock_guard<std::mutex> lg(commands_mutex_);
  auto it = commands_.find(std::string(command_id));
  if (it == commands_.end()) return;
  auto ts = it->second.targets.find(std::string(robot_id));
  if (ts == it->second.targets.end()) return;
  if (ts->second.state == CommandState::CMD_PENDING) {
    ts->second.state = CommandState::CMD_SENT;
  }
}

void CommandTracker::onCommandResult(const CommandResult& result,
                                     std::chrono::system_clock::time_point now) {
  std::lock_guard<std::mutex> lg(commands_mutex_);
  auto it = commands_.find(result.command_id);
  if (it == commands_.end()) return;
  auto ts = it->second.targets.find(result.robot_id);
  if (ts == it->second.targets.end()) return;
  if (isTerminal(ts->second.state)) return;  // late result — terminal is sticky (§5)

  if (result.result == ResultCode::RESULT_APPLIED) {
    ts->second.state = CommandState::CMD_APPLIED;
  } else if (result.result == ResultCode::RESULT_REJECTED) {
    ts->second.state = CommandState::CMD_REJECTED;
    ts->second.detail = result.detail;
  }
  refreshCompletion(it->second, now);
}

void CommandTracker::sweepExpired(std::chrono::system_clock::time_point now) {
  std::lock_guard<std::mutex> lg(commands_mutex_);

  // Phase 1: expire non-terminal targets whose command's window has passed.
  for (auto& entry : commands_) {
    TrackedCommand& tc = entry.second;
    if (now < tc.expiry) continue;
    for (auto& target : tc.targets) {
      if (target.second.state == CommandState::CMD_PENDING ||
          target.second.state == CommandState::CMD_SENT) {
        target.second.state = CommandState::CMD_EXPIRED;
        target.second.detail = "expired";
      }
    }
    refreshCompletion(tc, now);
  }

  // Phase 2: drop commands held past the retention window (bounded growth).
  for (auto it = commands_.begin(); it != commands_.end();) {
    const auto& completed = it->second.completed_at;
    if (completed.has_value() && now - *completed >= retention_) {
      it = commands_.erase(it);
    } else {
      ++it;
    }
  }
}

std::vector<TrackedCommand> CommandTracker::snapshot() const {
  std::lock_guard<std::mutex> lg(commands_mutex_);
  std::vector<TrackedCommand> out;
  out.reserve(commands_.size());
  for (const auto& entry : commands_) {
    out.push_back(entry.second);
  }
  return out;
}

}  // namespace c2
