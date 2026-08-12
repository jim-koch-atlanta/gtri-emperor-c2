// robot_sim — skeleton entry point. Real motion model + gRPC bidi client land
// Thu pm per TECH_SPEC §12. This main only proves the target links the
// generated proto lib.
#include <iostream>

#include "robot.pb.h"

int main() {
  GOOGLE_PROTOBUF_VERIFY_VERSION;

  emperor::Telemetry t;
  t.set_robot_id("R-00");
  t.set_seq(0);

  std::cout << "emperor robot_sim skeleton — robot_id=" << t.robot_id()
            << ", seq=" << t.seq() << '\n';

  google::protobuf::ShutdownProtobufLibrary();
  return 0;
}
