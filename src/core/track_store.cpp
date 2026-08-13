#include "track_store.hpp"

namespace c2 {

bool TrackStore::upsert(const RobotTelemetry& telemetry) {
  std::shared_ptr<Track> track;
  {
    std::lock_guard<std::mutex> map_lock(map_mutex_);
    auto it = tracks_.find(telemetry.robot_id);
    if (it == tracks_.end()) {
      // First sample for a new robot: always accepted. find + create must be
      // atomic under map_mutex_, or two threads could both create it.
      tracks_.emplace(telemetry.robot_id, std::make_shared<Track>(telemetry));
      return true;
    }
    track = it->second;  // copy the shared_ptr, then release map_mutex_
  }

  // Existing robot: latest-wins by seq, under the per-Track lock only.
  std::lock_guard<std::mutex> track_lock(track->mutex);
  if (telemetry.seq > track->latest.seq) {
    track->latest = telemetry;
    return true;
  }
  return false;  // duplicate (seq ==) or out-of-order straggler (seq <)
}

std::vector<RobotTelemetry> TrackStore::snapshot() const {
  // Copy the shared_ptrs out under the map lock, release it, then read each
  // Track under its own lock — never hold both at once.
  std::vector<std::shared_ptr<Track>> cells;
  {
    std::lock_guard<std::mutex> map_lock(map_mutex_);
    cells.reserve(tracks_.size());
    for (const auto& entry : tracks_) {
      cells.push_back(entry.second);
    }
  }

  std::vector<RobotTelemetry> out;
  out.reserve(cells.size());
  for (const auto& track : cells) {
    std::lock_guard<std::mutex> track_lock(track->mutex);
    out.push_back(track->latest);
  }
  return out;
}

std::size_t TrackStore::size() const {
  std::lock_guard<std::mutex> map_lock(map_mutex_);
  return tracks_.size();
}

}  // namespace c2
