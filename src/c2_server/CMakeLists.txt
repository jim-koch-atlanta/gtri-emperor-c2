# emperor_c2_server executable: the server main plus the OperatorFeed north-seam service.
# Links emperor_c2_core (organs + gateway + domain types) and the warnings lib.
add_executable(emperor_c2_server
    main.cpp
    operator_feed_service.cpp)

target_link_libraries(emperor_c2_server PRIVATE emperor_c2_core emperor_c2_warnings)
