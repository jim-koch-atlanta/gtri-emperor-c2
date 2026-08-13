#pragma once

#include <chrono>
#include <cstdint>
#include <mutex>
#include <string>
#include <unordered_map>

namespace c2 {

// Domain link-health enum (mirrors proto emperor::LinkStatus; translated at the
// OperatorFeed seam, like the other domain/proto mirrors). Could move to
// robot_types.hpp later if other organs need it.
enum class LinkStatus { LIVE, STALE, LOST };

struct LinkHealth {
  LinkStatus status;
  std::int64_t age_ms;  // since last server-receive; -1 if never heard from
};

// LinkWatchdog — per-robot link health on SERVER RECEIVE TIME (TECH_SPEC §4/§8).
//
// Two deliberate design choices worth defending:
//  1. Time is the *server's* monotonic clock (steady_clock), passed IN, never
//     the robot's telemetry timestamp. Health then depends only on when bytes
//     actually arrived here — immune to robot clock skew/NTP steps — and on a
//     clock that can't jump backward. 'now' is a parameter so the §10 test can
//     drive exact thresholds without sleeping.
//  2. No timer thread. Status is a pure function of (now - last_receive)
//     against two thresholds, evaluated lazily when SwarmState is assembled
//     (5 Hz) — well under the 1.5 s / 10 s bands. Recovery to LIVE is automatic:
//     a fresh record() resets last_receive, so age drops and the band flips
//     back. There's no stored FSM state to get out of sync.
//
// Concurrency: record() is called from the gateway's telemetry callback (one
// thread per link, different robots concurrent); classify() from the assembler.
// One mutex over the map covers both.
class LinkWatchdog {
public:
  explicit LinkWatchdog(
      std::chrono::milliseconds stale_after = std::chrono::milliseconds(1500),
      std::chrono::milliseconds lost_after  = std::chrono::milliseconds(10000));

  // Note telemetry from robot_id arrived at server-receive time 'now'. Call on
  // every telemetry *received*, independent of whether TrackStore keeps it —
  // a duplicate/straggler still proves the link is alive.
  void record(const std::string& robot_id,
              std::chrono::steady_clock::time_point now);

  // Link health as of 'now': band + age since last receive. Convention is
  // half-open — reaching a threshold enters that state (age >= stale_after ->
  // STALE, age >= lost_after -> LOST).
  LinkHealth classify(const std::string& robot_id,
                      std::chrono::steady_clock::time_point now) const;

private:
  const std::chrono::milliseconds stale_after_;
  const std::chrono::milliseconds lost_after_;

  mutable std::mutex mutex_;
  std::unordered_map<std::string, std::chrono::steady_clock::time_point> last_rx_;
};

}  // namespace c2
