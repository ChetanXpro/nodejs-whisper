#pragma once

#include <algorithm>
#include <cstring>
#include <mutex>
#include <string>

namespace whisper_node {

class LogBuffer {
public:
    static constexpr size_t limit = 256 * 1024;

    // A logging callback must never unwind through whisper/ggml, even on allocation failure.
    void append(const char * text) noexcept {
        try {
            std::lock_guard<std::mutex> lock(mutex);
            const size_t size = std::strlen(text);
            const size_t available = limit - buffer.size();
            buffer.append(text, std::min(size, available));
            truncated = truncated || size > available;
        } catch (...) {
            // Logging is best effort if allocation or synchronization fails.
        }
    }

    std::string take() {
        std::lock_guard<std::mutex> lock(mutex);
        std::string result;
        result.swap(buffer);
        if (truncated) result += "\n[native diagnostics truncated]\n";
        truncated = false;
        return result;
    }

private:
    std::mutex mutex;
    std::string buffer;
    bool truncated = false;
};

class Diagnostics {
public:
    void capture(LogBuffer * owner, const char * text) noexcept {
        (owner ? *owner : shared).append(text);
    }

    std::string take(LogBuffer & owner) {
        auto result = owner.take();
        auto backend = shared.take();
        // ggml's process-wide callback supplies no context ID for its own threads.
        // Keep these messages without incorrectly attributing them to one request.
        if (!backend.empty()) result += "[shared native backend diagnostics]\n" + backend;
        return result;
    }

private:
    LogBuffer shared;
};

} // namespace whisper_node
