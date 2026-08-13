// LinkWatchdog unit tests (TECH_SPEC §10): transitions at exact thresholds,
// driven by injected server-receive time (no sleeps → deterministic).
#include <chrono>

#include <gtest/gtest.h>

#include "link_watchdog.hpp"

using namespace std::chrono_literals;

namespace {

// A fixed base on the monotonic clock; offsets below are all relative to it.
const std::chrono::steady_clock::time_point kBase{};

TEST(LinkWatchdog, LiveWhenFresh) {
  c2::LinkWatchdog wd;  // defaults: 1.5 s / 10 s
  wd.record("R-01", kBase);
  auto h = wd.classify("R-01", kBase + 100ms);
  EXPECT_EQ(h.status, c2::LinkStatus::LIVE);
  EXPECT_EQ(h.age_ms, 100);
}

TEST(LinkWatchdog, StaleAtExactThreshold) {
  c2::LinkWatchdog wd;
  wd.record("R-01", kBase);
  EXPECT_EQ(wd.classify("R-01", kBase + 1499ms).status, c2::LinkStatus::LIVE);
  EXPECT_EQ(wd.classify("R-01", kBase + 1500ms).status, c2::LinkStatus::STALE);
}

TEST(LinkWatchdog, LostAtExactThreshold) {
  c2::LinkWatchdog wd;
  wd.record("R-01", kBase);
  EXPECT_EQ(wd.classify("R-01", kBase + 9999ms).status, c2::LinkStatus::STALE);
  EXPECT_EQ(wd.classify("R-01", kBase + 10000ms).status, c2::LinkStatus::LOST);
}

TEST(LinkWatchdog, RecoversToLiveOnFreshTelemetry) {
  c2::LinkWatchdog wd;
  wd.record("R-01", kBase);
  EXPECT_EQ(wd.classify("R-01", kBase + 5s).status, c2::LinkStatus::STALE);
  wd.record("R-01", kBase + 5s);  // fresh telemetry resets the clock
  EXPECT_EQ(wd.classify("R-01", kBase + 5s + 100ms).status, c2::LinkStatus::LIVE);
}

TEST(LinkWatchdog, ConfigurableThresholds) {
  c2::LinkWatchdog wd(200ms, 500ms);
  wd.record("R-01", kBase);
  EXPECT_EQ(wd.classify("R-01", kBase + 250ms).status, c2::LinkStatus::STALE);
  EXPECT_EQ(wd.classify("R-01", kBase + 600ms).status, c2::LinkStatus::LOST);
}

TEST(LinkWatchdog, UnknownRobotIsLost) {
  c2::LinkWatchdog wd;
  auto h = wd.classify("ghost", kBase);
  EXPECT_EQ(h.status, c2::LinkStatus::LOST);
  EXPECT_EQ(h.age_ms, -1);
}

}  // namespace
