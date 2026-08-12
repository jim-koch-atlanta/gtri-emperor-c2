// c2_server — skeleton entry point. Real organs (track store, command tracker,
// link watchdog, operator feed) land Thu pm per TECH_SPEC §12. This main only
// proves the target links the generated proto lib.
#include <iostream>

#include "robot.pb.h"

int main() {
  GOOGLE_PROTOBUF_VERIFY_VERSION;

  emperor::SwarmState state;
  state.set_seq(0);

  std::cout << "emperor c2_server skeleton — SwarmState seq=" << state.seq()
            << ", robots=" << state.robots_size() << '\n';

  google::protobuf::ShutdownProtobufLibrary();
  return 0;
}
