include(FetchContent)

# GoogleTest, pinned.
FetchContent_Declare(
    googletest
    GIT_REPOSITORY https://github.com/google/googletest.git
    GIT_TAG        v1.16.0
    GIT_SHALLOW    TRUE)

# Keep GoogleTest out of `install`, and use the shared CRT on Windows.
set(gtest_force_shared_crt ON CACHE BOOL "" FORCE)
set(INSTALL_GTEST OFF CACHE BOOL "" FORCE)

FetchContent_MakeAvailable(googletest)

add_executable(emperor_c2_tests
    telemetry_test.cpp
    track_store_test.cpp
    link_watchdog_test.cpp)

# emperor_c2_core brings TrackStore + the domain types, and PUBLIC-links
# emperor_c2_proto so the proto headers still reach telemetry_test.cpp.
target_link_libraries(emperor_c2_tests
    PRIVATE
        emperor_c2_core
        emperor_c2_warnings
        GTest::gtest_main)

include(GoogleTest)
gtest_discover_tests(emperor_c2_tests)
