const assert = require('node:assert/strict')
const test = require('node:test')
const { RequestControl } = require('../src/control')
const { lineReader, parseSegment, parseCliResult } = require('../src/cli')
const { detailedResult } = require('../src/output')
const { runProcess } = require('../src/process')
const { nodewhisper, transcribeDetailed, getWhisperStatus } = require('../src')

const logger = { info() {}, debug() {}, error() {} }

test('progress is bounded and monotonic; cancellation stops callbacks and preserves its cause', () => {
	const controller = new AbortController()
	const progress = []
	let segments = 0
	const control = new RequestControl({
		signal: controller.signal,
		onProgress: p => {
			progress.push(p)
		},
		onSegment: () => {
			segments++
		},
	})
	for (const value of [0, NaN, 0.5, 0.2, 0.5, 2]) control.progress(value)
	assert.deepEqual(progress, [0, 0.5, 1])
	const reason = new Error('user cancelled')
	controller.abort(reason)
	control.segment({ start: 0, end: 100, text: 'ignored' })
	assert.equal(segments, 0)
	assert.throws(
		() => control.check(),
		error => error.name === 'AbortError' && error.code === 'ABORT_ERR' && error.cause === reason
	)
	control.dispose()
})

test('callback exceptions stay on the main thread, retain identity, and stop further callbacks', async () => {
	const expected = new Error('UI failed')
	let calls = 0
	const control = new RequestControl({
		onSegment: () => {
			calls++
			throw expected
		},
	})
	control.segment({ start: 0, end: 100, text: 'hello' })
	control.segment({ start: 100, end: 200, text: 'again' })
	assert.equal(calls, 1)
	assert.throws(
		() => control.check(),
		error => error === expected
	)
	control.dispose()
	const asynchronous = new RequestControl({
		onProgress: async () => {
			throw new Error('rejected callback')
		},
	})
	asynchronous.progress(0)
	assert.throws(() => asynchronous.check(), /must be synchronous/)
	await new Promise(resolve => setImmediate(resolve))
	asynchronous.dispose()
})

test('pre-aborted calls and invalid controls never start work', async () => {
	const controller = new AbortController()
	controller.abort()
	for (const transcribe of [nodewhisper, transcribeDetailed]) {
		await assert.rejects(transcribe('missing.wav', { modelName: 'tiny.en', logger, signal: controller.signal }), {
			name: 'AbortError',
			code: 'ABORT_ERR',
		})
		for (const invalid of [{ signal: {} }, { onSegment: true }, { onProgress: 1 }]) {
			await assert.rejects(transcribe('missing.wav', { modelName: 'tiny.en', logger, ...invalid }), TypeError)
		}
	}
	await assert.rejects(transcribeDetailed('missing.wav', { modelName: 'tiny.en', includeTokens: 'true' }), TypeError)
	assert.equal(getWhisperStatus().active, 0)
	assert.equal(getWhisperStatus().queued, 0)
})

test('CLI streams handle split timestamp lines and normalize structured results without files', () => {
	const segments = []
	const reader = lineReader(line => {
		const segment = parseSegment(line)
		if (segment) segments.push(segment)
	})
	reader.push('\n[00:00:01.250 --> 00:')
	reader.push('00:02.500]   café 世界\n[01:02:03.004 --> 01:02:04.005]  next')
	reader.end()
	assert.deepEqual(segments, [
		{ text: ' café 世界', start: 1250, end: 2500 },
		{ text: 'next', start: 3723004, end: 3724005 },
	])
	const native = parseCliResult({
		result: { language: 'en' },
		transcription: [
			{
				text: ' hello',
				offsets: { from: 0, to: 1000 },
				tokens: [
					{ text: ' hello', id: 1, p: 0.8, t_dtw: -1, offsets: { from: 10, to: 900 } },
					{ text: '[_EOT_]', id: 2, p: 1, t_dtw: -1 },
				],
			},
		],
	})
	assert.deepEqual(detailedResult(native, true), {
		text: 'hello',
		language: 'en',
		segments: [
			{
				text: ' hello',
				start: 0,
				end: 1000,
				tokens: [{ text: ' hello', id: 1, probability: 0.8, start: 10, end: 900 }],
			},
		],
	})
	assert.equal(detailedResult(native, false).segments[0].tokens, undefined)
	const vad = detailedResult(native, true, false)
	assert.equal(vad.segments[0].tokens[0].start, undefined)
	assert.equal(vad.segments[0].tokens[0].end, undefined)
	assert.equal(vad.segments[0].tokens[0].probability, 0.8)
	assert.equal(vad.segments[0].end, 1000)
	assert.deepEqual(detailedResult({ segments: [], language: 'en' }, false), {
		text: '',
		language: 'en',
		segments: [],
	})
	assert.throws(() => parseCliResult({}), /Invalid transcription/)
})

test('detailed results omit internal tokens while preserving subwords and punctuation', () => {
	const tokens = [
		{ text: ' don', id: 836, p: 0.8, start: 0, end: 400 },
		{ text: "'t", id: 470, p: 0.9, start: 400, end: 600 },
		{ text: '.', id: 13, p: 0.7, start: 600, end: 600 },
		{ text: '[_TT_231]', id: 50594, p: 0.02, start: 4620, end: 4620 },
		{ text: '[_EOT_]', id: 50256, p: 1 },
		{ text: '[_LANG_en]', id: 50258, p: 1 },
		{ text: '[_extra_token_51864]', id: 51864, p: 1 },
	]
	const raw = { language: 'en', segments: [{ text: " don't.", start: 0, end: 4620, tokens }] }
	const result = detailedResult(raw, true)
	assert.deepEqual(result.segments[0].tokens, [
		{ text: ' don', id: 836, probability: 0.8, start: 0, end: 400 },
		{ text: "'t", id: 470, probability: 0.9, start: 400, end: 600 },
		{ text: '.', id: 13, probability: 0.7, start: 600, end: 600 },
	])
	assert.equal(raw.segments[0].tokens.length, 7, 'raw tokens remain available for full JSON exports')
})

test('cancelling a child waits for it to exit and preserves the cancellation reason', { timeout: 10000 }, async () => {
	const controller = new AbortController()
	const reason = new Error('cancel conversion')
	let pid
	await assert.rejects(
		runProcess(
			process.execPath,
			['-e', "process.stdout.write(String(process.pid) + '\\n'); setInterval(() => {}, 1000)"],
			logger,
			{
				signal: controller.signal,
				onStdout(text) {
					pid = Number(text.trim())
					controller.abort(reason)
				},
			}
		),
		error => error === reason
	)
	assert.ok(pid)
	assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' })
})

test('a non-Error output callback failure stops the child and rejects the request', { timeout: 10000 }, async () => {
	let pid
	await assert.rejects(
		runProcess(
			process.execPath,
			['-e', "process.stdout.write(String(process.pid) + '\\n'); setInterval(() => {}, 1000)"],
			logger,
			{
				onStdout(text) {
					pid = Number(text.trim())
					throw null
				},
			}
		),
		{ message: 'null' }
	)
	assert.ok(pid)
	assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' })
})
