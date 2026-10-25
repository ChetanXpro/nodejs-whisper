// Run under qemu-x86_64 with a CPU lacking AVX/FMA, not just on the CI host CPU.
const assert = require('node:assert/strict')
const path = require('node:path')
const { readWav } = require('../dist/audio')
const addonPath = process.argv[2] || path.resolve(__dirname, '../prebuilds/linux-x64-glibc/default/nodejs_whisper.node')
const addon = require(addonPath)
const context = new addon.Context(path.resolve(__dirname, '../cpp/whisper.cpp/models/ggml-tiny.en.bin'), false)
try {
	const result = context.transcribe(
		readWav(path.resolve(__dirname, '../cpp/whisper.cpp/samples/jfk.wav')),
		{ threads: 1, language: 'en' },
		() => {}
	)
	assert.match(
		result.segments
			.map(segment => segment.text)
			.join('')
			.toLowerCase(),
		/country/
	)
	console.info('Portable native inference passed')
} finally {
	context.close()
}
