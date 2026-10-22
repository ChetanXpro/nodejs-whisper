const assert = require('node:assert/strict')
const test = require('node:test')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { validateWhisperOptions } = require('../src/WhisperHelper')

const validate = whisperOptions => validateWhisperOptions({ modelName: 'tiny.en', whisperOptions })

test('invalid JavaScript option types fail before selecting a backend', () => {
	for (const [options, message] of [
		[{ threads: '4' }, /threads must be a number/],
		[{ language: 123 }, /language.*string/],
		[{ vadModelPath: 123 }, /vadModelPath must be a string/],
		[{ vad: 'true' }, /vad must be a boolean/],
		[{ noGpu: 'false' }, /noGpu must be a boolean/],
		[{ outputInJsonFull: 'true' }, /outputInJsonFull must be a boolean/],
	]) {
		assert.throws(
			() => validate(options),
			error => error instanceof TypeError && message.test(error.message)
		)
	}
	for (const threads of [NaN, Infinity, 0, 1.5, 2 ** 32]) {
		assert.throws(() => validate({ threads }), /threads/)
	}
	assert.doesNotThrow(() => validate({ threads: 4, language: undefined, vadModelPath: undefined }))
})

test('VAD requires an existing model file before entering either backend', async t => {
	const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'whisper-options-'))
	t.after(() => fs.rm(directory, { recursive: true, force: true }))
	for (const vadModelPath of [undefined, '']) {
		assert.throws(() => validate({ vad: true, vadModelPath }), /VAD requires whisperOptions.vadModelPath/)
	}
	for (const vadModelPath of [directory, path.join(directory, 'missing.bin')]) {
		assert.throws(() => validate({ vad: true, vadModelPath }), /VAD model file does not exist/)
	}
	const model = path.join(directory, 'model.bin')
	await fs.writeFile(model, 'validation only checks the file path; the backend validates model contents')
	assert.doesNotThrow(() => validate({ vad: true, vadModelPath: model }))
})
