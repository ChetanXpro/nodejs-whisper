const assert = require('node:assert/strict')
const test = require('node:test')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { writeOutputs, formatSegment, timestamp } = require('../src/output')
const { readWav } = require('../src/audio')

test('preserves CLI subtitle, CSV, LRC and JSON conventions including Unicode', async t => {
	const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'whisper-output-'))
	t.after(() => fs.rm(directory, { recursive: true, force: true }))
	const input = path.join(directory, 'audio.wav')
	const segment = {
		start: 61020,
		end: 62340,
		text: ' Hello, "世界"',
		tokens: [{ text: '世界', id: 5, p: 0.9, t_dtw: -1, start: 61200, end: 62000 }],
	}
	await writeOutputs(
		input,
		'/models/tiny.bin',
		{
			outputInText: true,
			outputInSrt: true,
			outputInVtt: true,
			outputInCsv: true,
			outputInLrc: true,
			outputInJsonFull: true,
		},
		{ segments: [segment], language: 'en', systeminfo: 'cpu', model: { type: 'tiny' } }
	)
	assert.equal(await fs.readFile(input + '.txt', 'utf8'), ' Hello, "世界"\n')
	assert.equal(
		await fs.readFile(input + '.vtt', 'utf8'),
		'WEBVTT\n\n00:01:01.020 --> 00:01:02.340\n Hello, "世界"\n\n'
	)
	assert.equal(await fs.readFile(input + '.srt', 'utf8'), '1\n00:01:01,020 --> 00:01:02,340\n Hello, "世界"\n\n')
	assert.equal(await fs.readFile(input + '.csv', 'utf8'), 'start,end,text\n61020,62340," Hello, ""世界"""\n')
	assert.equal(await fs.readFile(input + '.lrc', 'utf8'), '[by:whisper.cpp]\n[01:01.02] Hello, "世界"\n')
	const json = JSON.parse(await fs.readFile(input + '.json', 'utf8'))
	assert.deepEqual(json.transcription[0].offsets, { from: 61020, to: 62340 })
	assert.deepEqual(json.transcription[0].tokens[0].timestamps, { from: '00:01:01,200', to: '00:01:02,000' })
	assert.equal(json.transcription[0].tokens[0].text, '世界')
	assert.equal(formatSegment(segment), '[00:01:01.020 --> 00:01:02.340]   Hello, "世界"\n')
	assert.equal(timestamp(3661001), '01:01:01.001')
})

test('WAV parser handles metadata, stereo downmixing and malformed input', async t => {
	const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'whisper-audio-'))
	t.after(() => fs.rm(directory, { recursive: true, force: true }))
	const input = path.join(directory, 'audio.wav')
	const buffer = Buffer.alloc(58)
	buffer.write('RIFF')
	buffer.writeUInt32LE(50, 4)
	buffer.write('WAVE', 8)
	buffer.write('fmt ', 12)
	buffer.writeUInt32LE(16, 16)
	buffer.writeUInt16LE(1, 20)
	buffer.writeUInt16LE(2, 22)
	buffer.writeUInt32LE(16000, 24)
	buffer.writeUInt32LE(64000, 28)
	buffer.writeUInt16LE(4, 32)
	buffer.writeUInt16LE(16, 34)
	buffer.write('JUNK', 36)
	buffer.writeUInt32LE(1, 40)
	buffer.write('data', 46)
	buffer.writeUInt32LE(4, 50)
	buffer.writeInt16LE(16384, 54)
	buffer.writeInt16LE(0, 56)
	await fs.writeFile(input, buffer)
	assert.deepEqual([...readWav(input)], [0.25])
	await fs.writeFile(input, buffer.subarray(0, 57))
	assert.throws(() => readWav(input), /Truncated WAV/)
	buffer.writeUInt32LE(44100, 24)
	await fs.writeFile(input, buffer)
	assert.throws(() => readWav(input), /Unsupported WAV/)
})
