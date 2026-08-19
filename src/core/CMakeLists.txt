add_library(emperor_c2_core STATIC
    command_tracker.cpp
    grpc_robot_callback_gateway.cpp
    grpc_robot_gateway.cpp
    grpc_robot_reactor.cpp
    track_store.cpp
    link_watchdog.cpp)

# robot_types.hpp lives here; consumers get it via PUBLIC include path.
target_include_directories(emperor_c2_core PUBLIC ${CMAKE_CURRENT_SOURCE_DIR})

# emperor_c2_proto is PUBLIC so grpc++, libprotobuf, and gen/ include path
# all flow through to c2_server and robot_sim automatically.
target_link_libraries(emperor_c2_core PUBLIC emperor_c2_proto)

target_link_libraries(emperor_c2_core PRIVATE emperor_c2_warnings)
