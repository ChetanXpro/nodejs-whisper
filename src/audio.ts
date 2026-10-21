import fs from 'fs'

/** Decode the 16 kHz PCM WAV accepted by the native backend, off the main thread. */
export function readWav(filePath: string): Float32Array {
	const buffer = fs.readFileSync(filePath)
	if (buffer.length < 12 || buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') {
		throw new Error('Expected a RIFF/WAVE audio file')
	}
	let format = 0,
		channels = 0,
		sampleRate = 0,
		bits = 0,
		blockAlign = 0
	let data: Buffer | undefined
	for (let offset = 12; offset + 8 <= buffer.length; ) {
		const id = buffer.toString('ascii', offset, offset + 4)
		const length = buffer.readUInt32LE(offset + 4)
		const start = offset + 8
		if (start + length > buffer.length) throw new Error('Truncated WAV chunk')
		if (id === 'fmt ' && length >= 16) {
			format = buffer.readUInt16LE(start)
			channels = buffer.readUInt16LE(start + 2)
			sampleRate = buffer.readUInt32LE(start + 4)
			blockAlign = buffer.readUInt16LE(start + 12)
			bits = buffer.readUInt16LE(start + 14)
			if (format === 0xfffe && length >= 40) format = buffer.readUInt16LE(start + 24)
		} else if (id === 'data') {
			data = buffer.subarray(start, start + length)
		}
		offset = start + length + (length % 2)
	}
	if (
		!data ||
		sampleRate !== 16000 ||
		channels < 1 ||
		blockAlign !== (channels * bits) / 8 ||
		!((format === 1 && [8, 16, 24, 32].includes(bits)) || (format === 3 && bits === 32))
	) {
		throw new Error('Unsupported WAV encoding; expected 16 kHz PCM or float32 audio')
	}
	const samples = new Float32Array(Math.floor(data.length / blockAlign))
	for (let i = 0; i < samples.length; i++) {
		let value = 0
		for (let c = 0; c < channels; c++) {
			const offset = i * blockAlign + (c * bits) / 8
			value +=
				format === 3
					? data.readFloatLE(offset)
					: bits === 8
						? (data.readUInt8(offset) - 128) / 128
						: bits === 16
							? data.readInt16LE(offset) / 32768
							: bits === 24
								? data.readIntLE(offset, 3) / 8388608
								: data.readInt32LE(offset) / 2147483648
		}
		if (!Number.isFinite(value)) throw new Error('Audio contains non-finite samples')
		samples[i] = value / channels
	}
	return samples
}
