# subscribe_probe — smoke/demo client for OperatorFeed.Subscribe. Links the
# generated proto lib only (no warnings gate — it's throwaway tooling).
add_executable(subscribe_probe subscribe_probe.cpp)
target_link_libraries(subscribe_probe PRIVATE emperor_c2_proto)
