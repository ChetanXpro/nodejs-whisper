# Development

## Local setup

Clone with submodules to include whisper.cpp:

```bash
git clone --recurse-submodules https://github.com/ChetanXpro/nodejs-whisper
cd nodejs-whisper
npm ci
npm run build
```

For an existing checkout, run `git submodule update --init --recursive` if whisper.cpp is missing.
Run `npm run dev` to watch the TypeScript source, or `npm run test:example` to transcribe the bundled recording.

## Native builds

Native builds need CMake 3.19+, a C++17 compiler, and Node.js 20.17+ (20.x) or 22.9+.

```bash
npm run build:native
```

CUDA requires the CUDA toolkit and a separate build:

```bash
npm run build:native -- --cuda
```

Pass `withCuda: true` when transcribing to select the CUDA build.

| Environment variable | Effect |
| --- | --- |
| `NODEJS_WHISPER_SKIP_NATIVE=1` | Skip native compilation, including during installation |
| `NODEJS_WHISPER_CUDA=1` | Select the CUDA variant for native builds, including during installation |
| `NODEJS_WHISPER_CMAKE_ARGS` | Pass CMake definitions as `-DNAME=value` |

For example, on a POSIX shell:

```bash
NODEJS_WHISPER_CMAKE_ARGS="-DGGML_NATIVE=OFF" npm run build:native
```

## Tests

```bash
npm run typecheck
npm test
npm run build:native
npm run test:native
npm run test:integration
```

The native suite includes a C++ logging test and real transcription tests. The CLI suite tests the fallback
backend. Integration tests use CPU inference and download the tiny.en and Silero VAD models when needed.

## Packaging native binaries

After building, stage the local binary with:

```bash
npm run package:native
```

Add `-- --cuda` to stage a CUDA build. Binaries go into `prebuilds/` by OS, architecture, and backend. Linux
paths also distinguish glibc and musl.

The integration workflow builds on Linux, macOS, and Windows and uploads binary artifacts. Merge the required
artifacts into `prebuilds/` before `npm pack` or `npm publish`. The workflow doesn't publish them automatically.

## Error codes and debugging

| Error code | Meaning |
| --- | --- |
| `ERR_WHISPER_QUEUE_FULL` | No waiting slot is available |
| `ERR_WHISPER_QUEUE_TIMEOUT` | The request waited too long; inference didn't start |
| `ERR_WHISPER_CLOSING` | Disposal is in progress; new requests aren't accepted |
| `ERR_WHISPER_BUSY` | Configuration can't change while work or cleanup is in progress |
| `ERR_WHISPER_NATIVE_UNAVAILABLE` | The requested native backend isn't usable |
| `ERR_WHISPER_NATIVE` | Native audio decoding, model loading, or inference failed |

Queue timeouts don't interrupt running inference. After `disposeWhisper()` completes, new requests can start
fresh workers. Call `configureWhisper()` only when there are no active or waiting requests.

Native workers share Node's process, so a fatal native crash can terminate it. Set `backend: 'cli'` when
process isolation is needed. Request options and prompt history reset between transcriptions; sampling can
still produce different text across runs.

Transcript segments reach `logger.log` during inference. Native diagnostics are buffered and sent to
`logger.debug`; fallback reasons are logged there too. The CLI streams both kinds of output.

Logs from whisper/ggml's internal threads have no context ID. These messages use a synchronized shared buffer
and are delivered by the next worker to flush its logs, labelled `[shared native backend diagnostics]`.
They may belong to another concurrent request. Each worker's own logs remain separate. Buffers are capped at
256 KiB and report truncation.
