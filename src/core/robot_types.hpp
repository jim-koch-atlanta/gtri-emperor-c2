#pragma once

#include <chrono>
#include <cstdint>
#include <optional>
#include <string>
#include <variant>
#include <vector>

namespace c2 {

struct RobotTelemetry {
  std::string robot_id;
  std::uint64_t seq;
  std::chrono::system_clock::time_point timestamp;
  double x;
  double y;
  double heading;
  double speed;   // V
  double radius;  // R
};

struct SetParameters {
  std::optional<double> speed;     // V
  std::optional<double> radius;    // R
  std::optional<double> center_x;  // x0
  std::optional<double> center_y;  // y0
  std::optional<double> theta;     // theta0 (phase)
};

// RobotCommand (C2 -> vehicle seam). Single target only — the vehicle protocol
// never sees group semantics, keeping a future MAVLink/DDS gateway honest (§6).
struct RobotCommand {
  std::string command_id;
  std::chrono::system_clock::time_point timestamp;
  std::chrono::system_clock::time_point expiry;
  std::string robot_id;
  std::variant<SetParameters> payload;
};

// OperatorCommand (GUI -> C2 seam). Multi-targeting is C2 semantics: the
// Command Tracker fans one OperatorCommand into per-robot RobotCommands.
struct OperatorCommand {
  std::string command_id;
  std::chrono::system_clock::time_point timestamp;
  std::chrono::system_clock::time_point expiry;
  std::vector<std::string> targets;
  std::variant<SetParameters> payload;
};

enum class ResultCode {
  RESULT_UNSPECIFIED = 0,
  RESULT_APPLIED = 1,
  RESULT_REJECTED = 2,
};

struct CommandResult {
  std::string command_id;
  std::string robot_id;
  ResultCode result;
  std::string detail;
};

}
