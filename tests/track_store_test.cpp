// TrackStore unit tests (TECH_SPEC §10): latest-wins BY per-robot seq;
// out-of-order and duplicate telemetry rejected; robot timestamp never
// consulted for ordering.
#include <cstdint>
#include <string>

#include <gtest/gtest.h>

#include "track_store.hpp"

namespace {

c2::RobotTelemetry sample(const std::string& id, std::uint64_t seq, double x = 0.0) {
  c2::RobotTelemetry t;
  t.robot_id = id;
  t.seq = seq;
  t.x = x;
  return t;
}

TEST(TrackStore, FirstSampleAccepted) {
  c2::TrackStore store;
  EXPECT_TRUE(store.upsert(sample("R-01", 0)));
  EXPECT_EQ(store.size(), 1u);
}

TEST(TrackStore, LatestWinsBySeq) {
  c2::TrackStore store;
  EXPECT_TRUE(store.upsert(sample("R-01", 1, 10.0)));
  EXPECT_TRUE(store.upsert(sample("R-01", 2, 20.0)));  // newer -> stored
  auto snap = store.snapshot();
  ASSERT_EQ(snap.size(), 1u);
  EXPECT_EQ(snap[0].seq, 2u);
  EXPECT_DOUBLE_EQ(snap[0].x, 20.0);
}

TEST(TrackStore, DuplicateSeqRejected) {
  c2::TrackStore store;
  EXPECT_TRUE(store.upsert(sample("R-01", 5, 10.0)));
  EXPECT_FALSE(store.upsert(sample("R-01", 5, 99.0)));  // dup -> dropped
  auto snap = store.snapshot();
  ASSERT_EQ(snap.size(), 1u);
  EXPECT_DOUBLE_EQ(snap[0].x, 10.0);  // unchanged
}

TEST(TrackStore, OutOfOrderRejected) {
  c2::TrackStore store;
  EXPECT_TRUE(store.upsert(sample("R-01", 5, 10.0)));
  EXPECT_FALSE(store.upsert(sample("R-01", 3, 99.0)));  // straggler -> dropped
  auto snap = store.snapshot();
  ASSERT_EQ(snap.size(), 1u);
  EXPECT_DOUBLE_EQ(snap[0].x, 10.0);  // unchanged
}

TEST(TrackStore, TracksMultipleRobotsIndependently) {
  c2::TrackStore store;
  EXPECT_TRUE(store.upsert(sample("R-01", 1)));
  EXPECT_TRUE(store.upsert(sample("R-02", 1)));
  EXPECT_EQ(store.size(), 2u);
  EXPECT_EQ(store.snapshot().size(), 2u);
}

}  // namespace
