# subscribe_probe — smoke/demo client for OperatorFeed.Subscribe. Links the
# generated proto lib only (no warnings gate — it's throwaway tooling).
add_executable(subscribe_probe subscribe_probe.cpp)
target_link_libraries(subscribe_probe PRIVATE emperor_c2_proto)

# send_command_probe — fires one SetParameters{radius *= 1.5} via SendCommand.
add_executable(send_command_probe send_command_probe.cpp)
target_link_libraries(send_command_probe PRIVATE emperor_c2_proto)
