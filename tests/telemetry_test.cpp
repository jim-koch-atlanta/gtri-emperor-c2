// Skeleton smoke test: the generated proto lib links, and a Telemetry message
// survives a serialize/parse round-trip with fields intact. Real unit tests
// (motion model, track store by seq, watchdog, command tracker) land with the
// domain types per TECH_SPEC §10.
#include <string>

#include <gtest/gtest.h>

#include "robot.pb.h"

TEST(TelemetryProto, RoundTrip) {
  emperor::Telemetry t;
  t.set_robot_id("R-03");
  t.set_seq(42);
  t.set_x(100.0);
  t.set_y(-50.0);
  t.set_heading(1.5707963);
  t.set_speed(12.0);
  t.set_radius(100.0);

  std::string wire;
  ASSERT_TRUE(t.SerializeToString(&wire));

  emperor::Telemetry parsed;
  ASSERT_TRUE(parsed.ParseFromString(wire));

  EXPECT_EQ(parsed.robot_id(), "R-03");
  EXPECT_EQ(parsed.seq(), 42u);
  EXPECT_DOUBLE_EQ(parsed.x(), 100.0);
  EXPECT_DOUBLE_EQ(parsed.y(), -50.0);
  EXPECT_DOUBLE_EQ(parsed.heading(), 1.5707963);
  EXPECT_DOUBLE_EQ(parsed.speed(), 12.0);
  EXPECT_DOUBLE_EQ(parsed.radius(), 100.0);
}
