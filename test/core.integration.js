const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const { nodewhisper } = require('../src/index')
const { MODEL_OBJECT, WHISPER_CPP_PATH } = require('../src/constants')

test(
	'transcribes audio with tiny.en and routes whisper.cpp output through the logger',
	{ timeout: 10 * 60 * 1000 },
	async t => {
		const audioFile = path.resolve(__dirname, '../example/mother_teresa.wav')
		const outputFile = `${audioFile}.vtt`
		const modelFile = path.join(WHISPER_CPP_PATH, 'models', MODEL_OBJECT['tiny.en'])
		const loggerEvents = []
		const leakedWhisperOutput = []
		const logger = {
			debug: (...args) => loggerEvents.push(['debug', ...args]),
			error: (...args) => loggerEvents.push(['error', ...args]),
			log: (...args) => loggerEvents.push(['log', ...args]),
		}

		fs.rmSync(outputFile, { force: true })
		t.after(() => fs.rmSync(outputFile, { force: true }))

		const originalStdoutWrite = process.stdout.write
		const originalStderrWrite = process.stderr.write
		const captureWhisperLeak = (stream, originalWrite) =>
			function (chunk, ...args) {
				const text = chunk.toString()
				if (text.includes('whisper_init_with_params_no_state:') || text.includes('[00:00:')) {
					leakedWhisperOutput.push([stream, text])
					return true
				}
				return originalWrite.call(this, chunk, ...args)
			}

		process.stdout.write = captureWhisperLeak('stdout', originalStdoutWrite)
		process.stderr.write = captureWhisperLeak('stderr', originalStderrWrite)

		let transcript
		try {
			transcript = await nodewhisper(audioFile, {
				modelName: 'tiny.en',
				autoDownloadModelName: 'tiny.en',
				logger,
				whisperOptions: {
					noGpu: true,
					outputInVtt: true,
					splitOnWord: true,
					timestamps_length: 14,
				},
			})
		} finally {
			process.stdout.write = originalStdoutWrite
			process.stderr.write = originalStderrWrite
		}

		const normalizedTranscript = transcript.replace(/\s+/g, ' ').toLowerCase()
		const debugOutput = loggerEvents
			.filter(([level]) => level === 'debug')
			.flatMap(([, ...args]) => args)
			.join(' ')
		const loggedTranscript = loggerEvents
			.filter(([level]) => level === 'log')
			.flatMap(([, ...args]) => args)
			.join(' ')

		assert.equal(fs.existsSync(modelFile), true, 'tiny.en model should be available')
		assert.match(normalizedTranscript, /i do not want.*your money/)
		assert.match(normalizedTranscript, /i want your.*forgiveness/)
		assert.match(loggedTranscript.toLowerCase(), /i do not want/)
		assert.match(debugOutput, /whisper_init_with_params_no_state:/)
		assert.match(debugOutput, /-sow(?:\s|$)/)
		assert.doesNotMatch(debugOutput, /-sow\s+true/)
		assert.deepEqual(leakedWhisperOutput, [])

		assert.equal(fs.existsSync(outputFile), true, 'VTT output should be created')
		const vtt = fs.readFileSync(outputFile, 'utf8').toLowerCase()
		assert.match(vtt, /^webvtt/)
		assert.match(vtt, /i do not want/)
	}
)
