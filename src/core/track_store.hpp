#pragma once

#include <cstddef>
#include <memory>
#include <mutex>
#include <string>
#include <unordered_map>
#include <vector>

#include "robot_types.hpp"

namespace c2 {

// TrackStore — the "common internal data structure" (TECH_SPEC §4): the latest
// telemetry per robot, latest-wins BY per-robot seq. Written by the gateway's
// telemetry callback (one thread per link, so different robots write
// concurrently); read by the OperatorFeed assembler at 5 Hz.
//
// Concurrency (the goose registry pattern):
//   - map_mutex_ guards the MAP STRUCTURE only — insert / find / rehash.
//   - each Track carries its own mutex guarding its contents, so per-robot
//     updates don't serialize against each other, and a snapshot can copy the
//     shared_ptrs out under map_mutex_, release it, then read each Track under
//     its own lock.
// The per-Track mutex does NOT make the map safe — hence both levels.
class TrackStore {
public:
  // Apply one telemetry sample. Latest-wins by seq: stored iff its seq is
  // strictly greater than the robot's current seq. Returns true if stored,
  // false if dropped — the false case is both the duplicate (seq ==) and the
  // out-of-order straggler (seq <), which is what the §10 test asserts.
  bool upsert(const RobotTelemetry& telemetry);

  // A copy of the latest telemetry for every tracked robot, for SwarmState
  // assembly. Order is unspecified.
  std::vector<RobotTelemetry> snapshot() const;

  // Number of distinct robots currently tracked.
  std::size_t size() const;

private:
  // Per-robot cell: the latest-wins value plus its own lock. Constructed with
  // the first accepted sample so `latest` is never read uninitialized (no
  // insert-before-set window).
  struct Track {
    mutable std::mutex mutex;
    RobotTelemetry latest;
    explicit Track(RobotTelemetry initial) : latest(std::move(initial)) {}
  };

  mutable std::mutex map_mutex_;  // guards the map structure only
  std::unordered_map<std::string, std::shared_ptr<Track>> tracks_;
};

}  // namespace c2
