const assert = require('node:assert/strict')
const test = require('node:test')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { nodewhisper, transcribeDetailed, configureWhisper, disposeWhisper, getWhisperStatus } = require('../dist')
const { ensureWhisperExecutable } = require('../dist/whisper')
const { readWav } = require('../dist/audio')
const sample = path.resolve(__dirname, '../cpp/whisper.cpp/samples/jfk.wav')
const silent = { info() {}, debug() {}, error() {} }
const options = {
	modelName: 'tiny.en',
	logger: silent,
	whisperOptions: { noGpu: process.env.WHISPER_TEST_GPU !== '1', threads: 2 },
}

async function fixture(t) {
	await configureWhisper({ maxConcurrency: 1, maxQueue: 2 })
	const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'whisper-controls-'))
	t.after(async () => {
		await disposeWhisper()
		await fs.rm(directory, { recursive: true, force: true })
	})
	const audio = path.join(directory, 'audio.wav')
	await fs.copyFile(sample, audio)
	return { audio, directory }
}

async function longerAudio(directory) {
	const samples = readWav(sample)
	const repeated = Buffer.alloc(44 + samples.length * 6 * 2)
	repeated.write('RIFF')
	repeated.writeUInt32LE(repeated.length - 8, 4)
	repeated.write('WAVEfmt ', 8)
	repeated.writeUInt32LE(16, 16)
	repeated.writeUInt16LE(1, 20)
	repeated.writeUInt16LE(1, 22)
	repeated.writeUInt32LE(16000, 24)
	repeated.writeUInt32LE(32000, 28)
	repeated.writeUInt16LE(2, 32)
	repeated.writeUInt16LE(16, 34)
	repeated.write('data', 36)
	repeated.writeUInt32LE(repeated.length - 44, 40)
	for (let i = 0; i < samples.length * 6; i++) {
		repeated.writeInt16LE(
			Math.max(-32768, Math.min(32767, Math.round(samples[i % samples.length] * 32768))),
			44 + i * 2
		)
	}
	const file = path.join(directory, 'long.wav')
	await fs.writeFile(file, repeated)
	return file
}

test.before(async () => {
	await ensureWhisperExecutable(silent)
})

test('CLI keeps the existing string result, exports and transcript logging', { timeout: 120000 }, async t => {
	const { audio, directory } = await fixture(t)
	const input = path.join(directory, 'audio sample.wav')
	await fs.rename(audio, input)
	const logs = []
	const transcript = await nodewhisper(input, {
		...options,
		backend: 'cli',
		logger: {
			...silent,
			info: text => {
				logs.push(text)
			},
		},
		whisperOptions: {
			...options.whisperOptions,
			outputInText: true,
			outputInSrt: true,
			outputInVtt: true,
			outputInCsv: true,
			outputInLrc: true,
			outputInJsonFull: true,
		},
	})
	assert.match(transcript, /\[00:00:.*-->/)
	assert.match(transcript.toLowerCase(), /country/)
	assert.equal(logs.join(''), transcript)
	for (const extension of ['txt', 'srt', 'vtt', 'csv', 'lrc']) {
		assert.match((await fs.readFile(`${input}.${extension}`, 'utf8')).toLowerCase(), /country/)
	}
	const json = JSON.parse(await fs.readFile(`${input}.json`, 'utf8'))
	assert.equal(json.result.language, 'en')
	assert.ok(json.transcription.some(segment => segment.tokens.length > 0))
})

test('native VAD returns input segment times and omits unaligned token times', { timeout: 120000 }, async t => {
	const { audio } = await fixture(t)
	const segments = []
	const result = await transcribeDetailed(audio, {
		...options,
		backend: 'native',
		includeTokens: true,
		autoDownloadVadModelName: 'silero-v6.2.0',
		whisperOptions: { noGpu: true, threads: 1 },
		onSegment(segment) {
			segments.push(segment)
		},
	})
	assert.match(result.text.toLowerCase(), /country/)
	assert.deepEqual(
		segments,
		result.segments.map(({ tokens, ...segment }) => segment)
	)
	const tokens = result.segments.flatMap(segment => segment.tokens)
	assert.ok(tokens.length > 0)
	assert.ok(
		tokens.every(
			token => token.start === undefined && token.end === undefined && Number.isFinite(token.probability)
		)
	)
})

for (const backend of ['native', 'cli']) {
	test(
		`${backend}: detailed results, tokens and callbacks work without an output JSON file`,
		{ timeout: 120000 },
		async t => {
			const { audio, directory } = await fixture(t)
			const segments = [],
				progress = [],
				logs = []
			let completed = false
			const result = await transcribeDetailed(audio, {
				...options,
				backend,
				includeTokens: true,
				logger: {
					...silent,
					debug: text => {
						logs.push(text)
					},
				},
				onProgress(value) {
					assert.equal(completed, false)
					progress.push(value)
				},
				onSegment(segment) {
					assert.equal(completed, false)
					segments.push({ ...segment })
					segment.text = 'mutated by consumer'
				},
			})
			completed = true
			assert.equal(result.language, 'en')
			assert.match(result.text.toLowerCase(), /ask not what your country can do for you/)
			assert.doesNotMatch(result.text, /-->|mutated by consumer/)
			assert.ok(segments.length > 0)
			assert.equal(segments.length, result.segments.length)
			assert.deepEqual(
				segments.map(segment => segment.text),
				result.segments.map(segment => segment.text)
			)
			assert.deepEqual(
				segments.map(({ start, end }) => [start, end]),
				result.segments.map(({ start, end }) => [start, end])
			)
			assert.ok(result.segments.every(segment => segment.start >= 0 && segment.end >= segment.start))
			const tokens = result.segments.flatMap(segment => segment.tokens)
			assert.ok(tokens.length > 0)
			for (const token of tokens) assert.doesNotMatch(token.text, /^\[_/, 'internal tokens must be omitted')
			assert.ok(
				tokens.every(
					token => typeof token.text === 'string' && token.probability >= 0 && token.probability <= 1
				)
			)
			assert.ok(tokens.some(token => Number.isFinite(token.start) && token.end >= token.start))
			assert.equal(progress[0], 0)
			assert.equal(progress.at(-1), 1)
			assert.ok(
				progress.every((value, index) => value >= 0 && value <= 1 && (!index || value > progress[index - 1]))
			)
			assert.deepEqual(await fs.readdir(directory), ['audio.wav'])
			if (process.env.WHISPER_TEST_GPU === '1') {
				assert.ok(
					logs.some(text => /whisper_backend_init_gpu: using .+ backend/.test(text)),
					'GPU test must actually use a GPU backend'
				)
			}
			const second = await transcribeDetailed(audio, {
				...options,
				backend,
				logger: {
					...silent,
					debug: text => {
						logs.push(text)
					},
				},
				whisperOptions: { ...options.whisperOptions, outputInSrt: true },
			})
			assert.match(second.text.toLowerCase(), /country/)
			assert.ok(second.segments.every(segment => segment.tokens === undefined))
			assert.match(await fs.readFile(audio + '.srt', 'utf8'), /-->/)
			const exported = await transcribeDetailed(audio, {
				...options,
				backend,
				includeTokens: true,
				whisperOptions: { ...options.whisperOptions, outputInJson: true },
			})
			assert.ok(exported.segments.some(segment => segment.tokens.length > 0))
			const json = JSON.parse(await fs.readFile(audio + '.json', 'utf8'))
			assert.ok(
				json.transcription.every(segment => segment.tokens === undefined),
				'compact JSON remains compact when tokens are requested in memory'
			)
			if (backend === 'native')
				assert.equal(
					logs.filter(text =>
						text.includes('whisper_init_from_file_with_params_no_state: loading model from')
					).length,
					1
				)
		}
	)

	test(
		`${backend}: queued cancellation never runs, and active cancellation keeps the slot until work stops`,
		{ timeout: 120000 },
		async t => {
			const { audio, directory } = await fixture(t)
			const long = await longerAudio(directory)
			const activeController = new AbortController()
			const queuedController = new AbortController()
			let startedInference = false,
				queuedRan = false,
				activeSettled = false
			let activeAtAbort
			const progress = []
			const active = transcribeDetailed(long, {
				...options,
				backend,
				signal: activeController.signal,
				onProgress(value) {
					progress.push(value)
					if (value > 0 && value < 1 && !startedInference) {
						startedInference = true
						assert.equal(getWhisperStatus().active, 1)
						activeController.abort()
						activeAtAbort = getWhisperStatus().active
					}
				},
			})
			const cancelled = assert.rejects(active, { name: 'AbortError', code: 'ABORT_ERR' }).then(() => {
				activeSettled = true
			})
			const queued = nodewhisper(audio, {
				...options,
				backend,
				signal: queuedController.signal,
				onProgress() {
					queuedRan = true
				},
			})
			const queuedCancelled = assert.rejects(queued, { name: 'AbortError', code: 'ABORT_ERR' })
			queuedController.abort()
			assert.equal(getWhisperStatus().queued, 0)
			const next = nodewhisper(audio, {
				...options,
				backend,
				onProgress() {
					assert.ok(activeController.signal.aborted)
				},
			})
			await Promise.all([cancelled, queuedCancelled])
			assert.ok(startedInference && activeSettled)
			assert.equal(activeAtAbort, 1, 'aborting must not release a running worker immediately')
			assert.equal(queuedRan, false)
			assert.equal(progress.includes(1), false)
			assert.match((await next).toLowerCase(), /country/)
			assert.equal(getWhisperStatus().active, 0)
			assert.equal(getWhisperStatus().queued, 0)
		}
	)

	test(
		`${backend}: throwing from onSegment rejects with the original error and the next request succeeds`,
		{ timeout: 120000 },
		async t => {
			const { audio } = await fixture(t)
			const expected = new Error('consumer failed')
			let calls = 0
			await assert.rejects(
				transcribeDetailed(audio, {
					...options,
					backend,
					onSegment() {
						calls++
						throw expected
					},
				}),
				error => error === expected
			)
			assert.equal(calls, 1)
			assert.match((await nodewhisper(audio, { ...options, backend })).toLowerCase(), /country/)
		}
	)
}
