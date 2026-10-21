const assert = require('node:assert/strict')
const test = require('node:test')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { execFile } = require('node:child_process')
const { promisify } = require('node:util')
const { setTimeout: delay } = require('node:timers/promises')
const { nodewhisper, configureWhisper, disposeWhisper, getWhisperStatus } = require('../dist')
const { findNativeAddon } = require('../dist/native')

const sample = path.resolve(__dirname, '../cpp/whisper.cpp/samples/jfk.wav')
const motherTeresa = path.resolve(__dirname, '../example/mother_teresa.wav')
const options = {
	modelName: 'tiny.en',
	autoDownloadModelName: 'tiny.en',
	backend: 'native',
	whisperOptions: { noGpu: true },
}

async function fixture(t) {
	assert.ok(findNativeAddon(), 'Build the addon with npm run build:native before running this suite')
	const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'whisper-native-'))
	await configureWhisper({})
	t.after(async () => {
		await disposeWhisper()
		await fs.rm(directory, { recursive: true, force: true })
	})
	const audio = path.join(directory, 'one.wav')
	await fs.copyFile(sample, audio)
	const events = []
	const logger = {
		debug: (...args) => events.push(['debug', args.join(' ')]),
		log: (...args) => events.push(['log', args.join(' ')]),
		error: (...args) => events.push(['error', args.join(' ')]),
	}
	return { directory, audio, events, logger }
}

const plain = text =>
	text
		.replace(/\[[^\]]*\]/g, '')
		.replace(/\s+/g, ' ')
		.toLowerCase()
const loads = events =>
	events.filter(([level, text]) => level === 'debug' && text.includes('whisper_init_with_params_no_state:'))

test(
	'existing API selects native, reuses its model, exports files, and keeps the event loop responsive',
	{ timeout: 120000 },
	async t => {
		const { audio, events, logger } = await fixture(t)
		let ticks = 0
		const timer = setInterval(() => ticks++, 10)
		t.after(() => clearInterval(timer))
		const outputOptions = {
			noGpu: true,
			outputInText: true,
			outputInVtt: true,
			outputInSrt: true,
			outputInCsv: true,
			outputInLrc: true,
			outputInJsonFull: true,
			splitOnWord: true,
			timestamps_length: 36,
		}
		const transcript = await nodewhisper(audio, {
			...options,
			backend: undefined,
			logger,
			whisperOptions: outputOptions,
		})
		assert.match(plain(transcript), /ask not what your country can do for you/)
		assert.ok(ticks > 2, 'native loading and inference must not block the main JS thread')
		assert.equal(loads(events).length, 1)
		assert.ok(events.some(([level, text]) => level === 'log' && text.includes('-->')))
		assert.ok(events.some(([, text]) => text.includes('native backend')))
		assert.equal(getWhisperStatus().workers, 1)
		for (const extension of ['txt', 'vtt', 'srt', 'csv', 'lrc']) {
			assert.match((await fs.readFile(audio + '.' + extension, 'utf8')).toLowerCase(), /country/)
		}
		const json = JSON.parse(await fs.readFile(audio + '.json', 'utf8'))
		assert.equal(json.model.type, 'tiny')
		assert.equal(json.result.language, 'en')
		assert.ok(json.transcription.every(segment => segment.tokens.length > 0))
		assert.ok(json.transcription.every(segment => Number.isFinite(segment.offsets.from)))
		const second = await nodewhisper(audio, {
			...options,
			logger,
			whisperOptions: { noGpu: true, language: undefined, timestamps_length: undefined, vadModelPath: undefined },
		})
		assert.match(plain(second), /what you can do for your country/)
		assert.equal(loads(events).length, 1, 'warm requests must not reload model weights')
	}
)

test(
	'native VAD works, reuses its models and switching VAD off recreates context safely',
	{ timeout: 120000 },
	async t => {
		const { directory, events, logger } = await fixture(t)
		const audio = path.join(directory, 'vad.wav')
		await fs.copyFile(motherTeresa, audio)
		const vadOptions = {
			...options,
			logger,
			autoDownloadVadModelName: 'silero-v6.2.0',
			whisperOptions: {
				noGpu: true,
				outputInVtt: true,
				vadThreshold: 0.5,
				vadMinSilenceDurationMs: 100,
				timestamps_length: 14,
				splitOnWord: true,
			},
		}
		for (let i = 0; i < 2; i++) {
			const result = await nodewhisper(audio, vadOptions)
			assert.match(plain(result), /i do not want.*your money/)
		}
		assert.equal(loads(events).length, 1)
		assert.ok(events.some(([, text]) => text.includes('whisper_vad_init_from_file_with_params')))
		assert.match((await fs.readFile(audio + '.vtt', 'utf8')).toLowerCase(), /i do not want/)
		const { VAD_MODEL_OBJECT } = require('../dist/constants')
		const customVad = path.join(directory, 'speech-音声.bin')
		await fs.copyFile(
			path.resolve(__dirname, '../cpp/whisper.cpp/models', VAD_MODEL_OBJECT['silero-v6.2.0']),
			customVad
		)
		assert.match(
			plain(
				await nodewhisper(audio, {
					...options,
					logger,
					whisperOptions: { noGpu: true, vad: true, vadModelPath: customVad },
				})
			),
			/i do not want/
		)
		assert.equal(loads(events).length, 2)
		await nodewhisper(audio, { ...options, logger })
		assert.equal(loads(events).length, 3)
	}
)

test('native queue rejects overflow and shutdown drains every accepted request', { timeout: 120000 }, async t => {
	const { audio, logger } = await fixture(t)
	await configureWhisper({ maxConcurrency: 1, maxQueue: 1 })
	const first = nodewhisper(audio, { ...options, logger })
	const second = nodewhisper(audio, { ...options, logger })
	await assert.rejects(nodewhisper(audio, { ...options, logger }), { code: 'ERR_WHISPER_QUEUE_FULL' })
	assert.equal(getWhisperStatus().active, 1)
	assert.equal(getWhisperStatus().queued, 1)
	await assert.rejects(configureWhisper({ maxConcurrency: 2 }), { code: 'ERR_WHISPER_BUSY' })
	const shutdown = disposeWhisper()
	await assert.rejects(nodewhisper(audio, { ...options, logger }), { code: 'ERR_WHISPER_CLOSING' })
	const results = await Promise.all([first, second])
	await shutdown
	assert.equal(results.length, 2)
	assert.equal(getWhisperStatus().workers, 0)
	assert.equal(getWhisperStatus().active, 0)
	assert.match(plain(await nodewhisper(audio, { ...options, logger })), /country/)
})

test('two workers transcribe concurrently and idle cleanup releases their models', { timeout: 120000 }, async t => {
	const { directory, audio, events, logger } = await fixture(t)
	const other = path.join(directory, 'two.wav')
	await fs.copyFile(sample, other)
	await configureWhisper({ maxConcurrency: 2, threadsPerWorker: 1, idleTimeoutMs: 20 })
	const requests = [audio, other].map(file => nodewhisper(file, { ...options, logger }))
	assert.equal(getWhisperStatus().active, 2)
	for (const transcript of await Promise.all(requests)) assert.match(plain(transcript), /country/)
	assert.equal(loads(events).length, 2)
	for (let i = 0; i < 100 && getWhisperStatus().workers; i++) await delay(20)
	assert.equal(getWhisperStatus().workers, 0)
})

test('failed inference does not poison the queue or keep an idle process alive', { timeout: 120000 }, async t => {
	const { audio, logger } = await fixture(t)
	await assert.rejects(
		nodewhisper(audio, { ...options, logger, whisperOptions: { noGpu: true, language: 'invalid' } }),
		/Unknown language/
	)
	assert.match(plain(await nodewhisper(audio, { ...options, logger })), /country/)
	await disposeWhisper()
	const script = `const {nodewhisper, getWhisperStatus} = require(${JSON.stringify(path.resolve(__dirname, '../dist'))});
		process.on('exit', () => require('node:assert/strict').equal(getWhisperStatus().workers, 0));
		nodewhisper(${JSON.stringify(audio)}, ${JSON.stringify(options)}).then(() => console.log('completed')).catch(e => {console.error(e); process.exitCode=1})`
	const { stdout } = await promisify(execFile)(process.execPath, ['-e', script], { timeout: 30000 })
	assert.match(stdout, /completed/)
})

test('ts-node CLI runs the source API with a native worker and exits when idle', { timeout: 90000 }, async t => {
	const { directory, audio } = await fixture(t)
	const root = path.resolve(__dirname, '..')
	const entry = path.join(directory, 'example.ts')
	await fs.writeFile(
		entry,
		`import { nodewhisper } from ${JSON.stringify(path.join(root, 'src'))};
		nodewhisper(${JSON.stringify(audio)}, ${JSON.stringify({
			...options,
			whisperOptions: { noGpu: true, outputInVtt: true },
		})}).then(text => console.log('completed:', text)).catch(error => {console.error(error); process.exitCode = 1});`
	)
	const tsNode = path.join(path.dirname(require.resolve('ts-node/package.json')), 'dist/bin.js')
	const { stdout } = await promisify(execFile)(
		process.execPath,
		[tsNode, '--project', path.join(root, 'tsconfig.json'), entry],
		{ cwd: root, timeout: 60000 }
	)
	assert.match(stdout, /native backend/)
	assert.match(plain(stdout), /completed:.*ask not what your country can do for you/)
	assert.match(await fs.readFile(audio + '.vtt', 'utf8'), /^WEBVTT/)
})

test(
	'native segment callback errors abort safely, preserve the error, and allow recovery',
	{ timeout: 90000 },
	async t => {
		const { audio } = await fixture(t)
		// Isolate the native boundary test so a regression becomes a failed subprocess.
		const script = `
		const assert = require('node:assert/strict');
		const addon = require(${JSON.stringify(findNativeAddon())});
		const { readWav } = require(${JSON.stringify(path.resolve(__dirname, '../dist/audio'))});
		const context = new addon.Context(${JSON.stringify(path.resolve(__dirname, '../cpp/whisper.cpp/models/ggml-tiny.en.bin'))}, false);
		try {
			const audio = readWav(${JSON.stringify(audio)});
			const longer = new Float32Array(audio.length * 4);
			for (let i = 0; i < 4; i++) longer.set(audio, i * audio.length);
			const expected = new Error('segment callback failed');
			let callbacks = 0;
			assert.throws(() => context.transcribe(longer, {threads: 2, timestamps_length: 14}, () => {
				callbacks++;
				throw expected;
			}), error => error === expected);
			assert.equal(callbacks, 1, 'do not call JS again after the first callback failure');
			const result = context.transcribe(audio, {threads: 2}, () => {});
			assert.match(result.segments.map(s => s.text).join(''), /country/i);
			assert.throws(() => context.transcribe(audio, {threads: 2}, () => context.close()), /Cannot close a context during transcription/);
			assert.match(context.transcribe(audio, {threads: 2}, () => {}).segments.map(s => s.text).join(''), /country/i);
			console.log('callback recovery verified');
		} finally { context.close(); }
	`
		const { stdout } = await promisify(execFile)(process.execPath, ['-e', script], { timeout: 60000 })
		assert.match(stdout, /callback recovery verified/)
	}
)

test('the native boundary validates types, numeric ranges and VAD paths', { timeout: 90000 }, async t => {
	const { audio, directory } = await fixture(t)
	const addon = require(findNativeAddon())
	const { readWav } = require('../dist/audio')
	const context = new addon.Context(path.resolve(__dirname, '../cpp/whisper.cpp/models/ggml-tiny.en.bin'), false)
	t.after(() => context.close())
	const samples = readWav(audio)
	for (const [invalid, name] of [
		[{ threads: '4' }, 'threads'],
		[{ language: 123 }, 'language'],
		[{ vadModelPath: 123 }, 'vadModelPath'],
		[{ vad: 'true' }, 'vad'],
		[{ translateToEnglish: 'false' }, 'translateToEnglish'],
		[{ outputInJsonFull: 'true', timestamps_length: 14 }, 'outputInJsonFull'],
		[{ vadMinSpeechDurationMs: '250' }, 'vadMinSpeechDurationMs'],
	]) {
		assert.throws(
			() => context.transcribe(samples, invalid, () => {}),
			error => error instanceof TypeError && error.message.includes(name)
		)
	}
	for (const invalid of [
		{ threads: NaN },
		{ threads: Infinity },
		{ threads: 2 ** 32 },
		{ threads: 0 },
		{ threads: 1.5 },
		{ timestamps_length: -1 },
		{ vadThreshold: 2 },
		{ vadMaxSpeechDurationS: Infinity },
	]) {
		assert.throws(() => context.transcribe(samples, invalid, () => {}), RangeError)
	}
	for (const vadModelPath of [undefined, '']) {
		assert.throws(
			() => context.transcribe(samples, { vad: true, vadModelPath }, () => {}),
			/vadModelPath is required/
		)
	}
	for (const vadModelPath of [directory, path.join(directory, 'missing.bin')]) {
		assert.throws(() => context.transcribe(samples, { vad: true, vadModelPath }, () => {}), /VAD model file/)
	}
	const result = context.transcribe(samples, { threads: 2, language: undefined, vadModelPath: undefined }, () => {})
	assert.match(result.segments.map(segment => segment.text).join(''), /country/i)
	addon.takeLogs()
})
