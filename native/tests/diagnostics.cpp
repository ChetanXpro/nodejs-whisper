#include "diagnostics.h"

#include <iostream>
#include <stdexcept>
#include <thread>
#include <vector>

void check(bool condition, const char * message) {
    if (!condition) throw std::runtime_error(message);
}

int main() {
    try {
        whisper_node::Diagnostics diagnostics;
        whisper_node::LogBuffer first, second;
        diagnostics.capture(&first, "first request\n");
        diagnostics.capture(&second, "second request\n");

        // Simulate ggml threads, which have no JS worker/context association.
        std::vector<std::thread> threads;
        for (int i = 0; i < 8; ++i) {
            threads.emplace_back([&] {
                for (int j = 0; j < 100; ++j) diagnostics.capture(nullptr, "backend diagnostic\n");
            });
        }
        for (auto & thread : threads) thread.join();

        const auto logs = diagnostics.take(first);
        check(logs.find("first request") != std::string::npos, "missing owner-thread logs");
        check(logs.find("second request") == std::string::npos, "mixed owner-thread logs");
        check(logs.find("[shared native backend diagnostics]") != std::string::npos, "missing shared label");
        size_t count = 0;
        for (size_t offset = 0; (offset = logs.find("backend diagnostic\n", offset)) != std::string::npos; ++offset) ++count;
        check(count == 800, "lost or duplicated backend-thread messages");
        check(diagnostics.take(second) == "second request\n", "shared messages should be drained once");
        check(diagnostics.take(first).empty(), "owner logs should be drained once");

        const std::string oversized(whisper_node::LogBuffer::limit + 100, 'x');
        diagnostics.capture(nullptr, oversized.c_str());
        const auto bounded = diagnostics.take(first);
        check(bounded.size() < whisper_node::LogBuffer::limit + 128, "shared log buffer is not bounded");
        check(bounded.find("[native diagnostics truncated]") != std::string::npos, "missing truncation notice");
        diagnostics.capture(nullptr, "after draining\n");
        const auto next = diagnostics.take(first);
        check(next.find("after draining") != std::string::npos, "buffer failed to reset after draining");
        check(next.find("truncated") == std::string::npos, "truncation state was not reset");
        std::cout << "Native diagnostic routing tests passed\n";
        return 0;
    } catch (const std::exception & error) {
        std::cerr << error.what() << '\n';
        return 1;
    }
}
