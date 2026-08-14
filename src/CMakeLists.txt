add_subdirectory(core)
add_subdirectory(c2_server)

# robot_sim is a single translation unit — keep it defined inline here.
add_executable(robot_sim robot_sim/main.cpp)
target_link_libraries(robot_sim PRIVATE emperor_c2_core emperor_c2_warnings)
