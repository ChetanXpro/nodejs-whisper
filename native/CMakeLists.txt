cmake_minimum_required(VERSION 3.19)
project(nodejs_whisper LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)
set(BUILD_SHARED_LIBS OFF CACHE BOOL "" FORCE)
set(WHISPER_BUILD_TESTS OFF CACHE BOOL "" FORCE)
set(WHISPER_BUILD_EXAMPLES OFF CACHE BOOL "" FORCE)
set(WHISPER_BUILD_SERVER OFF CACHE BOOL "" FORCE)
set(GGML_NATIVE OFF CACHE BOOL "Portable CPU binaries")
set(GGML_METAL_EMBED_LIBRARY ON CACHE BOOL "" FORCE)
if(WIN32)
    # Node workers unload the addon on exit. ggml's own thread pool joins its
    # threads during cleanup; OpenMP threads can outlive the Windows DLL.
    set(GGML_OPENMP OFF CACHE BOOL "Use joined CPU threads in Windows workers" FORCE)
endif()
add_subdirectory(../cpp/whisper.cpp whisper)

# The bundled whisper.cpp fixes VAD at four threads instead of honoring
# whisper_full_params.n_threads. Patch a build copy so the submodule stays intact.
get_target_property(WHISPER_SOURCE_DIR whisper SOURCE_DIR)
get_target_property(WHISPER_SOURCES whisper SOURCES)
set(WHISPER_SOURCE "${WHISPER_SOURCE_DIR}/whisper.cpp")
set_property(DIRECTORY APPEND PROPERTY CMAKE_CONFIGURE_DEPENDS "${WHISPER_SOURCE}")
file(READ "${WHISPER_SOURCE}" WHISPER_CONTENT)
set(VAD_THREADS_BEFORE "    auto vctx = state->vad_context;\n")
set(VAD_THREADS_AFTER "${VAD_THREADS_BEFORE}    vctx->n_threads = params.n_threads;\n    WHISPER_LOG_INFO(\"%s: n_threads = %d\\n\", __func__, vctx->n_threads);\n")
string(FIND "${WHISPER_CONTENT}" "${VAD_THREADS_BEFORE}" VAD_THREADS_POSITION)
list(FIND WHISPER_SOURCES "whisper.cpp" WHISPER_SOURCE_POSITION)
if(VAD_THREADS_POSITION EQUAL -1 OR WHISPER_SOURCE_POSITION EQUAL -1)
    message(FATAL_ERROR "whisper.cpp changed: review the VAD thread-limit patch")
endif()
string(REPLACE "${VAD_THREADS_BEFORE}" "${VAD_THREADS_AFTER}" WHISPER_CONTENT "${WHISPER_CONTENT}")
set(PATCHED_WHISPER_SOURCE "${CMAKE_CURRENT_BINARY_DIR}/whisper-vad-threads.cpp")
file(CONFIGURE OUTPUT "${PATCHED_WHISPER_SOURCE}" CONTENT "${WHISPER_CONTENT}" @ONLY)
list(REMOVE_AT WHISPER_SOURCES ${WHISPER_SOURCE_POSITION})
list(APPEND WHISPER_SOURCES "${PATCHED_WHISPER_SOURCE}")
set_property(TARGET whisper PROPERTY SOURCES "${WHISPER_SOURCES}")

execute_process(COMMAND node -p "require('node-addon-api').include"
    WORKING_DIRECTORY ${CMAKE_CURRENT_SOURCE_DIR}/..
    OUTPUT_VARIABLE NODE_ADDON_API_DIR OUTPUT_STRIP_TRAILING_WHITESPACE
    COMMAND_ERROR_IS_FATAL ANY)
string(REPLACE "\"" "" NODE_ADDON_API_DIR "${NODE_ADDON_API_DIR}")

add_library(nodejs_whisper SHARED addon.cpp ${CMAKE_JS_SRC})
set_target_properties(nodejs_whisper PROPERTIES PREFIX "" SUFFIX ".node"
    LIBRARY_OUTPUT_DIRECTORY "${CMAKE_BINARY_DIR}/Release"
    RUNTIME_OUTPUT_DIRECTORY "${CMAKE_BINARY_DIR}/Release")
foreach(CONFIG DEBUG RELEASE RELWITHDEBINFO MINSIZEREL)
    set_target_properties(nodejs_whisper PROPERTIES
        LIBRARY_OUTPUT_DIRECTORY_${CONFIG} "${CMAKE_BINARY_DIR}/Release"
        RUNTIME_OUTPUT_DIRECTORY_${CONFIG} "${CMAKE_BINARY_DIR}/Release")
endforeach()
target_include_directories(nodejs_whisper PRIVATE ${CMAKE_JS_INC} ${NODE_ADDON_API_DIR})
target_compile_definitions(nodejs_whisper PRIVATE NAPI_VERSION=8 NAPI_CPP_EXCEPTIONS)
if(GGML_CUDA)
    target_compile_definitions(nodejs_whisper PRIVATE NODEJS_WHISPER_CUDA)
endif()

# Exercise logging from real C++ threads without adding test hooks to the addon.
find_package(Threads REQUIRED)
add_executable(nodejs_whisper_diagnostics_test EXCLUDE_FROM_ALL tests/diagnostics.cpp)
target_include_directories(nodejs_whisper_diagnostics_test PRIVATE ${CMAKE_CURRENT_SOURCE_DIR})
target_link_libraries(nodejs_whisper_diagnostics_test PRIVATE Threads::Threads)
enable_testing()
add_test(NAME nodejs_whisper_diagnostics COMMAND nodejs_whisper_diagnostics_test)
target_link_libraries(nodejs_whisper PRIVATE whisper ${CMAKE_JS_LIB})
if(APPLE)
    target_link_options(nodejs_whisper PRIVATE "-undefined" "dynamic_lookup")
endif()
if(MSVC)
    target_compile_options(nodejs_whisper PRIVATE /EHsc)
    if(CMAKE_JS_NODELIB_DEF AND CMAKE_JS_NODELIB_TARGET)
        execute_process(COMMAND ${CMAKE_AR} /def:${CMAKE_JS_NODELIB_DEF}
            /out:${CMAKE_JS_NODELIB_TARGET} ${CMAKE_STATIC_LINKER_FLAGS})
    endif()
endif()
