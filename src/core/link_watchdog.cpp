#include "link_watchdog.hpp"

namespace c2 {

LinkWatchdog::LinkWatchdog(std::chrono::milliseconds stale_after,
                           std::chrono::milliseconds lost_after)
    : stale_after_(stale_after), lost_after_(lost_after) {}

void LinkWatchdog::record(const std::string& robot_id,
                          std::chrono::steady_clock::time_point now) {
  std::lock_guard<std::mutex> lg(mutex_);
  last_rx_[robot_id] = now;  // insert or advance; recovery is just a fresh stamp
}

LinkHealth LinkWatchdog::classify(const std::string& robot_id,
                                  std::chrono::steady_clock::time_point now) const {
  std::lock_guard<std::mutex> lg(mutex_);
  auto it = last_rx_.find(robot_id);
  if (it == last_rx_.end()) {
    return {LinkStatus::LOST, -1};  // never heard from this robot
  }

  auto age = std::chrono::duration_cast<std::chrono::milliseconds>(now - it->second);

  LinkStatus status;
  if (age >= lost_after_) {
    status = LinkStatus::LOST;
  } else if (age >= stale_after_) {
    status = LinkStatus::STALE;
  } else {
    status = LinkStatus::LIVE;
  }
  return {status, age.count()};
}

}  // namespace c2
