# Two process binaries. Both link the generated proto lib (proving codegen +
# linkage) and the warnings INTERFACE lib (our code, -Wall -Wextra).
add_executable(c2_server c2_server/main.cpp)
target_link_libraries(c2_server PRIVATE emperor_c2_proto emperor_c2_warnings)

add_executable(robot_sim robot_sim/main.cpp)
target_link_libraries(robot_sim PRIVATE emperor_c2_proto emperor_c2_warnings)
