#include <napi.h>
#include "whisper.h"
#include "diagnostics.h"

#include <algorithm>
#include <atomic>
#include <cmath>
#include <exception>
#include <filesystem>
#include <limits>
#include <memory>
#include <mutex>
#include <string>

namespace {
// Owner-thread messages remain local. Internal backend threads use a synchronized,
// explicitly shared buffer because whisper/ggml's log callback has no context ID.
whisper_node::Diagnostics diagnostics;
thread_local whisper_node::LogBuffer worker_logs;
thread_local whisper_node::LogBuffer * log_owner = nullptr;
std::once_flag logging_once;
std::mutex load_mutex;

void capture_log(ggml_log_level, const char * text, void *) noexcept {
    diagnostics.capture(log_owner, text);
}

std::string string(const Napi::Object & options, const char * key, const char * fallback = "") {
    const auto value = options.Get(key);
    if (value.IsUndefined()) return fallback;
    if (!value.IsString()) throw Napi::TypeError::New(options.Env(), std::string(key) + " must be a string");
    auto result = value.As<Napi::String>().Utf8Value();
    if (result.find('\0') != std::string::npos) {
        throw Napi::TypeError::New(options.Env(), std::string(key) + " must not contain null bytes");
    }
    return result;
}

bool boolean(const Napi::Object & options, const char * key, bool fallback = false) {
    const auto value = options.Get(key);
    if (value.IsUndefined()) return fallback;
    if (!value.IsBoolean()) throw Napi::TypeError::New(options.Env(), std::string(key) + " must be a boolean");
    return value.As<Napi::Boolean>().Value();
}

double number(const Napi::Object & options, const char * key, double fallback,
              double min, double max, bool integer = false) {
    const auto value = options.Get(key);
    if (value.IsUndefined()) return fallback;
    if (!value.IsNumber()) throw Napi::TypeError::New(options.Env(), std::string(key) + " must be a number");
    const double result = value.As<Napi::Number>().DoubleValue();
    if (!std::isfinite(result) || result < min || result > max || (integer && std::trunc(result) != result)) {
        throw Napi::RangeError::New(options.Env(), std::string(key) + " is outside its supported range");
    }
    return result;
}

// Each instance lives exclusively on a dedicated JS worker. Node-API finalizers
// also release the context if the worker exits without an explicit close.
class Context : public Napi::ObjectWrap<Context> {
public:
    static Napi::Object Init(Napi::Env env, Napi::Object exports) {
        log_owner = &worker_logs;
        std::call_once(logging_once, [] { whisper_log_set(capture_log, nullptr); });
        exports.Set("Context", DefineClass(env, "Context", {
            InstanceMethod("transcribe", &Context::Transcribe),
            InstanceMethod("close", &Context::Close),
        }));
        exports.Set("takeLogs", Napi::Function::New(env, [](const Napi::CallbackInfo & info) {
            return Napi::String::New(info.Env(), diagnostics.take(worker_logs));
        }));
#ifdef NODEJS_WHISPER_CUDA
        exports.Set("cuda", true);
#else
        exports.Set("cuda", false);
#endif
        return exports;
    }

    explicit Context(const Napi::CallbackInfo & info) : Napi::ObjectWrap<Context>(info) {
        if (info.Length() != 2 || !info[0].IsString() || !info[1].IsBoolean()) {
            throw Napi::TypeError::New(info.Env(), "Expected a model path and useGpu boolean");
        }
        const auto path = info[0].As<Napi::String>().Utf8Value();
        auto params = whisper_context_default_params();
        params.use_gpu = info[1].As<Napi::Boolean>().Value();
        params.flash_attn = true; // Match whisper-cli's default.
        std::lock_guard<std::mutex> lock(load_mutex);
        ctx.reset(whisper_init_from_file_with_params(path.c_str(), params));
        if (!ctx) throw Napi::Error::New(info.Env(), "Failed to load Whisper model: " + path);
    }

private:
    std::unique_ptr<whisper_context, decltype(&whisper_free)> ctx{nullptr, whisper_free};
    bool busy = false;

    Napi::Value Close(const Napi::CallbackInfo & info) {
        if (busy) throw Napi::Error::New(info.Env(), "Cannot close a context during transcription");
        ctx.reset();
        return info.Env().Undefined();
    }

    Napi::Value Transcribe(const Napi::CallbackInfo & info) {
        auto env = info.Env();
        if (!ctx) throw Napi::Error::New(env, "Whisper context is closed");
        if (busy) throw Napi::Error::New(env, "Whisper context is already transcribing");
        struct BusyGuard {
            bool & busy;
            explicit BusyGuard(bool & value) : busy(value) { busy = true; }
            ~BusyGuard() { busy = false; }
        } guard(busy);
        if (info.Length() != 3 || !info[0].IsTypedArray() ||
            info[0].As<Napi::TypedArray>().TypedArrayType() != napi_float32_array ||
            !info[1].IsObject() || info[1].IsNull() || info[1].IsArray() || !info[2].IsFunction()) {
            throw Napi::TypeError::New(env, "Expected Float32Array audio, options and a segment callback");
        }
        auto audio = info[0].As<Napi::Float32Array>();
        auto options = info[1].As<Napi::Object>();
        if (audio.ElementLength() == 0 || audio.ElementLength() > INT32_MAX) {
            throw Napi::RangeError::New(env, "Invalid audio sample count");
        }
        std::string language = string(options, "language", "auto");
        if (language != "auto" && whisper_lang_id(language.c_str()) < 0) {
            throw Napi::Error::New(env, "Unknown language: " + language);
        }
        if (!whisper_is_multilingual(ctx.get())) language = "en";
        const std::string vad_path = string(options, "vadModelPath");
        auto params = whisper_full_default_params(WHISPER_SAMPLING_GREEDY);
        params.beam_search = whisper_full_default_params(WHISPER_SAMPLING_BEAM_SEARCH).beam_search;
        params.strategy = params.beam_search.beam_size > 1 ? WHISPER_SAMPLING_BEAM_SEARCH : WHISPER_SAMPLING_GREEDY;
        params.language = language.c_str();
        params.translate = boolean(options, "translateToEnglish") && whisper_is_multilingual(ctx.get());
        params.n_threads = static_cast<int>(number(options, "threads", params.n_threads, 1, INT32_MAX, true));
        // Never carry prompts or decoding history between independent requests.
        params.no_context = true;
        params.print_progress = false;
        params.print_realtime = false;
        params.print_timestamps = false;
        params.max_len = static_cast<int>(number(options, "timestamps_length", 0, 0, INT32_MAX, true));
        if (boolean(options, "wordTimestamps") && params.max_len == 0) params.max_len = 1;
        const bool full_json = boolean(options, "outputInJsonFull");
        params.token_timestamps = params.max_len > 0 || full_json;
        params.split_on_word = boolean(options, "splitOnWord");
        params.vad = boolean(options, "vad");
        if (params.vad) {
            if (vad_path.empty()) throw Napi::TypeError::New(env, "vadModelPath is required when vad is enabled");
            std::error_code error;
            bool is_file;
            try {
                is_file = std::filesystem::is_regular_file(std::filesystem::u8path(vad_path), error);
            } catch (const std::exception & failure) {
                throw Napi::Error::New(env, "Invalid VAD model path: " + std::string(failure.what()));
            }
            if (!is_file) {
                throw Napi::Error::New(env, "VAD model file does not exist or is not a regular file: " + vad_path);
            }
        }
        params.vad_model_path = vad_path.c_str();
        params.vad_params.threshold = number(options, "vadThreshold", 0.5, 0, 1);
        params.vad_params.min_speech_duration_ms = number(options, "vadMinSpeechDurationMs", 250, 0, INT32_MAX, true);
        params.vad_params.min_silence_duration_ms = number(options, "vadMinSilenceDurationMs", 100, 0, INT32_MAX, true);
        params.vad_params.max_speech_duration_s = number(options, "vadMaxSpeechDurationS", params.vad_params.max_speech_duration_s,
                                                        std::numeric_limits<float>::min(), std::numeric_limits<float>::max());
        params.vad_params.speech_pad_ms = number(options, "vadSpeechPadMs", 30, 0, INT32_MAX, true);
        params.vad_params.samples_overlap = number(options, "vadSamplesOverlap", 0.1, 0, std::numeric_limits<float>::max());

        struct CallbackState {
            Napi::Function function;
            std::exception_ptr error;
            std::atomic<bool> aborted{false};
            explicit CallbackState(Napi::Function cb) : function(cb) {}
        } callback(info[2].As<Napi::Function>());
        params.abort_callback_user_data = &callback;
        params.abort_callback = [](void * data) noexcept {
            return static_cast<CallbackState *>(data)->aborted.load(std::memory_order_relaxed);
        };
        params.new_segment_callback_user_data = &callback;
        params.new_segment_callback = [](whisper_context * context, whisper_state *, int count, void * data) noexcept {
            auto & state = *static_cast<CallbackState *>(data);
            if (state.aborted.load(std::memory_order_relaxed)) return;
            try {
                auto & cb = state.function;
                Napi::HandleScope scope(cb.Env());
                int end = whisper_full_n_segments(context);
                for (int i = end - count; i < end; ++i) {
                    auto segment = Napi::Object::New(cb.Env());
                    segment.Set("text", whisper_full_get_segment_text(context, i));
                    segment.Set("start", Napi::Number::New(cb.Env(), whisper_full_get_segment_t0(context, i) * 10));
                    segment.Set("end", Napi::Number::New(cb.Env(), whisper_full_get_segment_t1(context, i) * 10));
                    cb.Call({segment});
                }
            } catch (...) {
                state.error = std::current_exception();
                state.aborted.store(true, std::memory_order_relaxed);
            }
        };
        int result = whisper_full(ctx.get(), params, audio.Data(), static_cast<int>(audio.ElementLength()));
        if (callback.error) {
            try {
                std::rethrow_exception(callback.error);
            } catch (const Napi::Error &) {
                throw; // Preserve the original JS error after leaving whisper_full.
            } catch (const std::exception & error) {
                throw Napi::Error::New(env, error.what());
            } catch (...) {
                throw Napi::Error::New(env, "Native segment callback failed");
            }
        }
        if (result != 0) throw Napi::Error::New(env, "Whisper transcription failed (code " + std::to_string(result) + ")");

        auto output = Napi::Object::New(env);
        output.Set("language", language == "auto" ? whisper_lang_str(whisper_full_lang_id(ctx.get())) : language.c_str());
        output.Set("systeminfo", whisper_print_system_info());
        auto model = Napi::Object::New(env);
        model.Set("type", whisper_model_type_readable(ctx.get()));
        model.Set("multilingual", static_cast<bool>(whisper_is_multilingual(ctx.get())));
        model.Set("vocab", whisper_model_n_vocab(ctx.get()));
        model.Set("mels", whisper_model_n_mels(ctx.get()));
        model.Set("ftype", whisper_model_ftype(ctx.get()));
        auto audio_model = Napi::Object::New(env);
        audio_model.Set("ctx", whisper_model_n_audio_ctx(ctx.get()));
        audio_model.Set("state", whisper_model_n_audio_state(ctx.get()));
        audio_model.Set("head", whisper_model_n_audio_head(ctx.get()));
        audio_model.Set("layer", whisper_model_n_audio_layer(ctx.get()));
        model.Set("audio", audio_model);
        auto text_model = Napi::Object::New(env);
        text_model.Set("ctx", whisper_model_n_text_ctx(ctx.get()));
        text_model.Set("state", whisper_model_n_text_state(ctx.get()));
        text_model.Set("head", whisper_model_n_text_head(ctx.get()));
        text_model.Set("layer", whisper_model_n_text_layer(ctx.get()));
        model.Set("text", text_model);
        output.Set("model", model);
        auto segments = Napi::Array::New(env);
        for (int i = 0; i < whisper_full_n_segments(ctx.get()); ++i) {
            Napi::HandleScope scope(env);
            auto segment = Napi::Object::New(env);
            segment.Set("text", whisper_full_get_segment_text(ctx.get(), i));
            segment.Set("start", Napi::Number::New(env, whisper_full_get_segment_t0(ctx.get(), i) * 10));
            segment.Set("end", Napi::Number::New(env, whisper_full_get_segment_t1(ctx.get(), i) * 10));
            if (full_json) {
                auto tokens = Napi::Array::New(env);
                uint32_t index = 0;
                for (int j = 0; j < whisper_full_n_tokens(ctx.get(), i); ++j) {
                    auto token = whisper_full_get_token_data(ctx.get(), i, j);
                    std::string text = whisper_token_to_str(ctx.get(), token.id);
                    int64_t end = token.t1;
                    // Token bytes can split a UTF-8 character. Merge before
                    // constructing a JS string, as the CLI JSON exporter does.
                    while (!complete_utf8(text) && j + 1 < whisper_full_n_tokens(ctx.get(), i)) {
                        auto next = whisper_full_get_token_data(ctx.get(), i, ++j);
                        text += whisper_token_to_str(ctx.get(), next.id);
                        if (next.t1 >= 0) end = next.t1;
                    }
                    auto value = Napi::Object::New(env);
                    value.Set("text", text);
                    value.Set("id", token.id);
                    value.Set("p", token.p);
                    value.Set("t_dtw", Napi::Number::New(env, token.t_dtw));
                    if (token.t0 >= 0 && end >= 0) {
                        value.Set("start", Napi::Number::New(env, token.t0 * 10));
                        value.Set("end", Napi::Number::New(env, end * 10));
                    }
                    tokens.Set(index++, value);
                }
                segment.Set("tokens", tokens);
            }
            segments.Set(static_cast<uint32_t>(i), segment);
        }
        output.Set("segments", segments);
        return output;
    }

    static bool complete_utf8(const std::string & text) {
        if (text.empty()) return true;
        size_t start = text.size() - 1;
        while (start > 0 && (static_cast<unsigned char>(text[start]) & 0xc0) == 0x80) --start;
        auto lead = static_cast<unsigned char>(text[start]);
        size_t bytes = lead < 0x80 ? 1 : (lead & 0xe0) == 0xc0 ? 2 : (lead & 0xf0) == 0xe0 ? 3 : 4;
        return text.size() - start >= bytes;
    }
};
}

Napi::Object Init(Napi::Env env, Napi::Object exports) { return Context::Init(env, exports); }
NODE_API_MODULE(nodejs_whisper, Init)
