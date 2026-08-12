cmake_minimum_required(VERSION 3.24)

project(emperor_c2
    VERSION 0.1.0
    DESCRIPTION "Emperor C2 — miniature swarm command & control"
    LANGUAGES CXX)

# C++20, no compiler-specific extensions.
set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# Emit build/compile_commands.json so editor tooling (clangd, IntelliSense)
# sees the exact flags — including the generated-proto include dir.
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

# Sensible default for single-config generators.
if(NOT CMAKE_BUILD_TYPE AND NOT CMAKE_CONFIGURATION_TYPES)
    set(CMAKE_BUILD_TYPE RelWithDebInfo CACHE STRING "Build type" FORCE)
endif()

# ASan + UBSan build (separate dir: -DEMPEROR_C2_SANITIZE=ON, pair with
# -DCMAKE_BUILD_TYPE=Debug). Applied globally so deps are instrumented too.
# TSan for the multi-link server paths is a separate switch added when the
# server lands (tsan.supp pattern comes from c2-lab).
option(EMPEROR_C2_SANITIZE "Build with ASan + UBSan" OFF)
if(EMPEROR_C2_SANITIZE)
    add_compile_options(-fsanitize=address,undefined -fno-omit-frame-pointer)
    add_link_options(-fsanitize=address,undefined)
endif()

# INTERFACE target applied to OUR code only — never to generated proto code
# or fetched deps like GoogleTest.
add_library(emperor_c2_warnings INTERFACE)
target_compile_options(emperor_c2_warnings INTERFACE -Wall -Wextra)

enable_testing()

add_subdirectory(proto)
add_subdirectory(src)
add_subdirectory(tests)
