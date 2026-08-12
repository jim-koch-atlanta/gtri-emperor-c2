# --- gRPC + Protobuf toolchain -------------------------------------------
# Local dev builds against $HOME/.local (gRPC 1.82 / protoc v35):
#   cmake -DCMAKE_PREFIX_PATH=$HOME/.local -B build
# CI installs the apt packages instead. The block below tolerates both
# CONFIG-mode discovery (local $HOME/.local) and MODULE / pkg-config
# discovery (apt), so the same CMake configures in either environment.

find_package(Protobuf CONFIG QUIET)
if(NOT Protobuf_FOUND)
    find_package(Protobuf MODULE REQUIRED)   # apt: CMake's bundled FindProtobuf
endif()

if(TARGET protobuf::protoc)
    set(PROTOC_BIN $<TARGET_FILE:protobuf::protoc>)
else()
    set(PROTOC_BIN ${Protobuf_PROTOC_EXECUTABLE})
endif()

find_package(gRPC CONFIG QUIET)
if(gRPC_FOUND)
    set(GRPCPP_LIB gRPC::grpc++)
    set(GRPC_CPP_PLUGIN_BIN $<TARGET_FILE:gRPC::grpc_cpp_plugin>)
else()
    # apt fallback: libgrpc++-dev ships a pkg-config file; the plugin binary
    # comes from protobuf-compiler-grpc.
    find_package(PkgConfig REQUIRED)
    pkg_check_modules(GRPCPP REQUIRED IMPORTED_TARGET grpc++)
    set(GRPCPP_LIB PkgConfig::GRPCPP)
    find_program(GRPC_CPP_PLUGIN_BIN grpc_cpp_plugin REQUIRED)
endif()

message(STATUS "emperor_c2: protobuf ${Protobuf_VERSION}, gRPC ${gRPC_VERSION}")

# --- Codegen: protoc + gRPC C++ plugin on robot.proto at build time ------
set(GEN_DIR ${CMAKE_CURRENT_BINARY_DIR}/gen)
file(MAKE_DIRECTORY ${GEN_DIR})
set(PROTO ${CMAKE_CURRENT_SOURCE_DIR}/robot.proto)
set(GEN_SRCS ${GEN_DIR}/robot.pb.cc ${GEN_DIR}/robot.grpc.pb.cc)

add_custom_command(
    OUTPUT ${GEN_SRCS} ${GEN_DIR}/robot.pb.h ${GEN_DIR}/robot.grpc.pb.h
    COMMAND ${PROTOC_BIN}
            --cpp_out=${GEN_DIR}
            --grpc_out=${GEN_DIR}
            --plugin=protoc-gen-grpc=${GRPC_CPP_PLUGIN_BIN}
            -I ${CMAKE_CURRENT_SOURCE_DIR}
            ${PROTO}
    DEPENDS ${PROTO}
    COMMENT "protoc: regenerating robot.{pb,grpc.pb}.{h,cc}")

# Generated code as a lib both binaries + tests link against. Its include dir
# is marked SYSTEM so -Wall -Wextra on our targets never flags generated code.
add_library(emperor_c2_proto ${GEN_SRCS})
target_include_directories(emperor_c2_proto SYSTEM PUBLIC ${GEN_DIR})
target_link_libraries(emperor_c2_proto PUBLIC ${GRPCPP_LIB} protobuf::libprotobuf)
