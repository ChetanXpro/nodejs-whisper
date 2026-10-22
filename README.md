# nodejs-whisper

Node.js bindings for OpenAI's Whisper model.

[![MIT License](https://img.shields.io/badge/License-MIT-green.svg)](https://choosealicense.com/licenses/mit/)

## Features

-   Automatically convert the audio to WAV format with a 16000 Hz frequency to support the whisper model.
-   Output transcripts to (.txt .srt .vtt .json .wts .lrc)
-   Optimized for CPU (Including Apple Silicon ARM)
-   Timestamp precision to single word
-   Split on word rather than on token (Optional)
-   Translate from source language to english (Optional)
-   Convert audio format to wav to support whisper model

## Installation

Requires Node.js 18+. Install FFmpeg if your audio needs conversion to 16 kHz WAV.

```bash
npm i nodejs-whisper
npx nodejs-whisper download
```

When a matching native binary isn't bundled, installation attempts to build one. This requires CMake 3.19+,
a C++17 compiler, and Node.js 20.17+ (20.x) or 22.9+:

- Linux: `sudo apt install build-essential cmake`
- macOS: install Xcode Command Line Tools and CMake.
- Windows: install CMake and Visual Studio Build Tools with **Desktop development with C++**.

If the native addon is unavailable, transcription uses the CLI backend. Building the CLI also needs CMake and
a compiler. See [native builds](docs/development.md#native-builds) for CUDA and custom build settings.

## Usage/Examples

See `example/index.ts` (can be run with `$ npm run test:example`)

```javascript
import path from 'path'
import { nodewhisper } from 'nodejs-whisper'

// Need to provide exact path to your audio file.
const filePath = path.resolve(__dirname, 'YourAudioFileName')

await nodewhisper(filePath, {
	modelName: 'base.en', //Downloaded models name
	modelRootPath: '/path/to/whisper/models', // (optional) directory containing the selected ggml model file
	autoDownloadModelName: 'base.en', // (optional) auto download a model if model is not present
	autoDownloadVadModelName: 'silero-v6.2.0', // (optional) download and enable a Silero VAD model
	removeWavFileAfterTranscription: false, // (optional) remove wav file once transcribed
	withCuda: false, // (optional) use cuda for faster processing
	logger: console, // (optional) Logging instance, defaults to console
	whisperOptions: {
		outputInCsv: false, // get output result in csv file
		outputInJson: false, // get output result in json file
		outputInJsonFull: false, // get output result in json file including more information
		outputInLrc: false, // get output result in lrc file
		outputInSrt: true, // get output result in srt file
		outputInText: false, // get output result in txt file
		outputInVtt: false, // get output result in vtt file
		outputInWords: false, // get output result in wts file for karaoke
		translateToEnglish: false, // translate from source language to english
		wordTimestamps: false, // word-level timestamps
		timestamps_length: 20, // amount of dialogue per timestamp pair
		splitOnWord: true, // split on word rather than on token
		noGpu: false, // disable GPU inference
		vadThreshold: 0.5, // speech detection probability threshold
		vadMinSpeechDurationMs: 250, // discard shorter speech segments
		vadMinSilenceDurationMs: 100, // silence required to split segments
		vadMaxSpeechDurationS: 30, // split speech segments longer than this
		vadSpeechPadMs: 30, // padding around detected speech
		vadSamplesOverlap: 0.1, // overlap between speech segments in seconds
	},
})

// Model list
const MODELS_LIST = [
	'tiny',
	'tiny.en',
	'tiny-q5_1',
	'tiny.en-q5_1',
	'tiny-q8_0',
	'base',
	'base.en',
	'base-q5_1',
	'base.en-q5_1',
	'base-q8_0',
	'small',
	'small.en',
	'small.en-tdrz',
	'small-q5_1',
	'small.en-q5_1',
	'small-q8_0',
	'medium',
	'medium.en',
	'medium-q5_0',
	'medium.en-q5_0',
	'medium-q8_0',
	'large-v1',
	'large-v2',
	'large-v2-q5_0',
	'large-v2-q8_0',
	'large-v3',
	'large-v3-q5_0',
	'large-v3-turbo',
	'large-v3-turbo-q5_0',
	'large-v3-turbo-q8_0',
	'large', // backward-compatible alias for large-v3
]
```

The configured logger receives transcript segments through `info`, diagnostics through `debug`, and failures
through `error`. Console and Pino loggers work directly.

### Structured results and callbacks

Use `transcribeDetailed()` to get plain text, the detected language, and segments directly:

```ts
import { transcribeDetailed } from 'nodejs-whisper'

const controller = new AbortController()
const result = await transcribeDetailed(filePath, {
    modelName: 'tiny.en',
    autoDownloadModelName: 'tiny.en',
    includeTokens: true,
    signal: controller.signal,
    onProgress: progress => console.info(`${Math.round(progress * 100)}%`),
    onSegment: segment => console.info(segment.text),
})

console.info(result.text, result.language)
console.info(result.segments) // [{ text, start, end, tokens? }]
```

Times are in milliseconds. `includeTokens` defaults to `false`. Each token has `text`, `id`, `probability`,
and available `start`/`end` times. Tokens can be parts of words; probabilities are model scores, not accuracy
guarantees. With VAD, token times are omitted because the engine reports them against trimmed audio.
Segment times refer to the original input. File exports still require the `whisperOptions.outputIn*` options.

`signal`, `onProgress`, and `onSegment` work with both APIs and backends. Progress runs from `0` to `1` and
measures inference, not downloads or conversion. Short recordings may have few updates. Segment callbacks
receive completed segments without tokens. Callbacks must be synchronous; throwing rejects the request
with the same error.

Call `controller.abort()` to cancel. The promise rejects with `name: 'AbortError'` and `code: 'ABORT_ERR'`.
Queued requests are removed immediately; running inference and conversion stop before releasing their slot.
Downloads, builds, model loading, and file writes already in progress finish before cancellation settles.

If no segments are detected, `transcribeDetailed()` returns empty text and an empty segment array.

### Model reuse and concurrency

The native backend keeps models loaded between requests. Existing `nodewhisper()` calls still return a
`Promise<string>` with the transcript for that recording.

By default, one transcription runs at a time and up to 100 requests can wait. Each waiting request starts when
a worker becomes available. A full queue rejects new requests with `ERR_WHISPER_QUEUE_FULL`. Idle models are
released after 60 seconds.

To change the limits, configure them before starting any requests:

```ts
import { nodewhisper, configureWhisper } from 'nodejs-whisper'

await configureWhisper({
    maxConcurrency: 2,
    maxQueue: 50,
})

const [first, second] = await Promise.all([
    nodewhisper('/audio/first.wav', { modelName: 'base.en' }),
    nodewhisper('/audio/second.wav', { modelName: 'base.en' }),
])
```

| Setting | Default | Meaning |
| --- | --- | --- |
| `maxConcurrency` | `1` | Maximum active requests |
| `maxQueue` | `100` | Maximum waiting requests; `0` rejects requests that need to wait |
| `threadsPerWorker` | Automatic, up to `4` | CPU threads per transcription; override with `whisperOptions.threads` |
| `idleTimeoutMs` | `60000` | Release idle models after this many milliseconds; `0` keeps them loaded |
| `queueTimeoutMs` | `0` | Maximum queue wait in milliseconds; `0` disables the timeout |
| `backend` | `'auto'` | Use `'auto'`, `'native'`, or `'cli'`; can also be set per request |

More workers use more model memory. Models are reused within the same Node.js environment when the model, GPU,
and VAD settings match. Requests writing to the same output path run one at a time.

Use `getWhisperStatus()` to check active and waiting requests. To release models, call `await disposeWhisper()`;
it finishes accepted requests and rejects new ones until it completes. Idle workers don't keep Node running.

`auto` falls back to the CLI when the addon is missing or incompatible, or when `outputInWords` requests a
karaoke `.wts` file. Forced `native` mode rejects those requests. Failed native inference isn't retried through
the CLI. See [error codes and debugging](docs/development.md#error-codes-and-debugging) for details.

### Model storage

When `modelRootPath` is used with `autoDownloadModelName`, downloaded models are saved in that directory.

Docker model cache example:

```yaml
volumes:
    - ./.docker-data/whisper-models:/data/whisper-models
```

```javascript
await nodewhisper(filePath, {
    modelName: 'tiny.en',
    autoDownloadModelName: 'tiny.en',
    modelRootPath: '/data/whisper-models',
    whisperOptions: {
        outputInSrt: true,
    },
})
```

The model will be saved as `/data/whisper-models/ggml-tiny.en.bin`.

### Voice activity detection

VAD detects speech before transcription, which can reduce work on long recordings with silence. The recommended
Silero model is less than 1 MB and can be downloaded automatically:

```javascript
await nodewhisper(filePath, {
	modelName: 'tiny.en',
	autoDownloadModelName: 'tiny.en',
	autoDownloadVadModelName: 'silero-v6.2.0',
	whisperOptions: {
		vadThreshold: 0.5,
		vadMinSilenceDurationMs: 100,
	},
})
```

Providing `autoDownloadVadModelName` enables VAD automatically. To use an existing or custom VAD model instead,
set `whisperOptions.vad` to `true` and provide its path through `whisperOptions.vadModelPath`.

## Types

```
 interface IOptions {
	modelName: string
	modelRootPath?: string
	removeWavFileAfterTranscription?: boolean
	withCuda?: boolean
	autoDownloadModelName?: string
	autoDownloadVadModelName?: 'silero-v5.1.2' | 'silero-v6.2.0'
	whisperOptions?: WhisperOptions
	logger?: Logger
	backend?: 'auto' | 'native' | 'cli'
	signal?: AbortSignal
	onProgress?: (progress: number) => void
	onSegment?: (segment: TranscriptionSegment) => void
}

 interface WhisperOptions {
	threads?: number
	outputInCsv?: boolean
	outputInJson?: boolean
	outputInJsonFull?: boolean
	outputInLrc?: boolean
	outputInSrt?: boolean
	outputInText?: boolean
	outputInVtt?: boolean
	outputInWords?: boolean
	translateToEnglish?: boolean
	timestamps_length?: number
	wordTimestamps?: boolean
	splitOnWord?: boolean
	noGpu?: boolean
	vad?: boolean
	vadModelPath?: string
	vadThreshold?: number
	vadMinSpeechDurationMs?: number
	vadMinSilenceDurationMs?: number
	vadMaxSpeechDurationS?: number
	vadSpeechPadMs?: number
	vadSamplesOverlap?: number
}

```

## Development

See the [development guide](docs/development.md) for local setup, tests, native builds, and packaging.

## Made with

-   [Whisper OpenAI (using whisper.cpp)](https://github.com/ggml-org/whisper.cpp)

## Feedback

If you have any feedback, please reach out to us at chetanbaliyan10@gmail.com

## Authors

-   [@chetanXpro](https://www.github.com/chetanXpro)
