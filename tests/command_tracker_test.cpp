// CommandTracker unit tests (TECH_SPEC §5/§10): lifecycle, 2-target fan-out,
// EXPIRED and ROBOT_OFFLINE paths, sticky-terminal, retention. Time injected.
#include <chrono>
#include <string>
#include <vector>

#include <gtest/gtest.h>

#include "command_tracker.hpp"

using namespace std::chrono_literals;

namespace {

const std::chrono::system_clock::time_point kNow{};  // fixed base

bool allOnline(const std::string&) { return false; }

c2::OperatorCommand makeCmd(std::string id, std::vector<std::string> targets,
                            std::chrono::system_clock::time_point expiry) {
  c2::OperatorCommand cmd;
  cmd.command_id = std::move(id);
  cmd.targets = std::move(targets);
  cmd.expiry = expiry;
  c2::SetParameters sp;
  sp.speed = 15.0;
  cmd.payload = sp;
  return cmd;
}

c2::CommandState stateOf(const std::vector<c2::TrackedCommand>& snap,
                         const std::string& cmd_id, const std::string& robot_id) {
  for (const auto& tc : snap) {
    if (tc.command_id != cmd_id) continue;
    auto it = tc.targets.find(robot_id);
    if (it != tc.targets.end()) return it->second.state;
  }
  return c2::CommandState::CMD_STATE_UNSPECIFIED;
}

TEST(CommandTracker, FanOutOneRobotCommandPerLiveTarget) {
  c2::CommandTracker tracker;
  auto dispatch = tracker.onCommandSubmitted(
      makeCmd("C1", {"R-01", "R-02"}, kNow + 5s), allOnline, kNow);
  EXPECT_EQ(dispatch.size(), 2u);
  auto snap = tracker.snapshot();
  EXPECT_EQ(stateOf(snap, "C1", "R-01"), c2::CommandState::CMD_PENDING);
  EXPECT_EQ(stateOf(snap, "C1", "R-02"), c2::CommandState::CMD_PENDING);
}

TEST(CommandTracker, HappyPathPendingSentApplied) {
  c2::CommandTracker tracker;
  tracker.onCommandSubmitted(makeCmd("C1", {"R-01"}, kNow + 5s), allOnline, kNow);
  tracker.onCommandSent("C1", "R-01");
  EXPECT_EQ(stateOf(tracker.snapshot(), "C1", "R-01"), c2::CommandState::CMD_SENT);

  c2::CommandResult res;
  res.command_id = "C1";
  res.robot_id = "R-01";
  res.result = c2::ResultCode::RESULT_APPLIED;
  tracker.onCommandResult(res, kNow + 1s);
  EXPECT_EQ(stateOf(tracker.snapshot(), "C1", "R-01"), c2::CommandState::CMD_APPLIED);
}

TEST(CommandTracker, OfflineTargetIsRobotOfflineAndNotDispatched) {
  c2::CommandTracker tracker;
  auto offline = [](const std::string& id) { return id == "R-05"; };
  auto dispatch = tracker.onCommandSubmitted(
      makeCmd("C1", {"R-01", "R-05"}, kNow + 5s), offline, kNow);
  ASSERT_EQ(dispatch.size(), 1u);
  EXPECT_EQ(dispatch[0].robot_id, "R-01");
  auto snap = tracker.snapshot();
  EXPECT_EQ(stateOf(snap, "C1", "R-01"), c2::CommandState::CMD_PENDING);
  EXPECT_EQ(stateOf(snap, "C1", "R-05"), c2::CommandState::CMD_ROBOT_OFFLINE);
}

TEST(CommandTracker, SweepExpiresNonTerminalAtExpiry) {
  c2::CommandTracker tracker;
  tracker.onCommandSubmitted(makeCmd("C1", {"R-01"}, kNow + 2s), allOnline, kNow);
  tracker.onCommandSent("C1", "R-01");

  tracker.sweepExpired(kNow + 1s);  // before expiry
  EXPECT_EQ(stateOf(tracker.snapshot(), "C1", "R-01"), c2::CommandState::CMD_SENT);

  tracker.sweepExpired(kNow + 2s);  // at expiry
  EXPECT_EQ(stateOf(tracker.snapshot(), "C1", "R-01"), c2::CommandState::CMD_EXPIRED);
}

TEST(CommandTracker, ResultAfterExpiredIsIgnored) {
  c2::CommandTracker tracker;
  tracker.onCommandSubmitted(makeCmd("C1", {"R-01"}, kNow + 1s), allOnline, kNow);
  tracker.onCommandSent("C1", "R-01");
  tracker.sweepExpired(kNow + 1s);  // -> EXPIRED

  c2::CommandResult res;
  res.command_id = "C1";
  res.robot_id = "R-01";
  res.result = c2::ResultCode::RESULT_APPLIED;
  tracker.onCommandResult(res, kNow + 2s);  // late — must not resurrect
  EXPECT_EQ(stateOf(tracker.snapshot(), "C1", "R-01"), c2::CommandState::CMD_EXPIRED);
}

TEST(CommandTracker, RetentionDropsCompletedCommands) {
  c2::CommandTracker tracker(500ms);  // short retention window
  tracker.onCommandSubmitted(makeCmd("C1", {"R-01"}, kNow + 10s), allOnline, kNow);
  tracker.onCommandSent("C1", "R-01");

  c2::CommandResult res;
  res.command_id = "C1";
  res.robot_id = "R-01";
  res.result = c2::ResultCode::RESULT_APPLIED;
  tracker.onCommandResult(res, kNow);            // completes at kNow
  EXPECT_EQ(tracker.snapshot().size(), 1u);      // still retained

  tracker.sweepExpired(kNow + 600ms);            // past 500ms window -> dropped
  EXPECT_EQ(tracker.snapshot().size(), 0u);
}

}  // namespace
