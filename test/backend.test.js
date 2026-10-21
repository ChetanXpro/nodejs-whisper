const assert = require('node:assert/strict')
const test = require('node:test')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const native = require('../src/native')
const cli = require('../src/whisper')
const { nodewhisper, configureWhisper, disposeWhisper } = require('../src')

// Exercise backend selection through the public API without requiring a compiler
// or real model in the fast suite. CLI execution is the only mocked operation.
test('auto falls back for missing/incompatible addons; forced native reports the cause', async t => {
	const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'whisper-backend-'))
	const saved = [
		native.findNativeAddon,
		cli.ensureWhisperExecutable,
		cli.getWhisperExecutablePath,
		cli.executeCppCommand,
	]
	t.after(async () => {
		await disposeWhisper()
		;[native.findNativeAddon, cli.ensureWhisperExecutable, cli.getWhisperExecutablePath, cli.executeCppCommand] =
			saved
		await fs.rm(directory, { recursive: true, force: true })
	})
	await configureWhisper({})
	const wav = Buffer.alloc(46)
	wav.write('RIFF')
	wav.writeUInt32LE(38, 4)
	wav.write('WAVEfmt ', 8)
	wav.writeUInt32LE(16, 16)
	wav.writeUInt16LE(1, 20)
	wav.writeUInt16LE(1, 22)
	wav.writeUInt32LE(16000, 24)
	wav.writeUInt32LE(32000, 28)
	wav.writeUInt16LE(2, 32)
	wav.writeUInt16LE(16, 34)
	wav.write('data', 36)
	wav.writeUInt32LE(2, 40)
	const input = path.join(directory, 'audio.wav')
	await fs.writeFile(input, wav)
	await fs.writeFile(path.join(directory, 'ggml-tiny.en.bin'), Buffer.from([0x6c, 0x6d, 0x67, 0x67]))
	const commands = [],
		events = []
	cli.ensureWhisperExecutable = async () => {}
	cli.getWhisperExecutablePath = () => '/fake/whisper-cli'
	cli.executeCppCommand = async command => {
		commands.push(command)
		return 'transcript'
	}
	const logger = { debug: (...args) => events.push(args.join(' ')), log() {}, error() {} }
	const options = { modelName: 'tiny.en', modelRootPath: directory, logger, whisperOptions: { noGpu: true } }
	native.findNativeAddon = () => undefined
	assert.equal(await nodewhisper(input, options), 'transcript')
	assert.equal(commands.length, 1)
	await assert.rejects(nodewhisper(input, { ...options, backend: 'native' }), {
		code: 'ERR_WHISPER_NATIVE_UNAVAILABLE',
	})
	assert.equal(commands.length, 1)
	const broken = path.join(directory, 'broken.node')
	await fs.writeFile(broken, 'invalid native binary')
	native.findNativeAddon = () => broken
	assert.equal(await nodewhisper(input, options), 'transcript')
	assert.equal(await nodewhisper(input, options), 'transcript')
	assert.equal(commands.length, 3)
	assert.ok(events.some(text => text.includes('Falling back to CLI')))
	assert.equal(process.cwd(), path.resolve(__dirname, '..'))
})
