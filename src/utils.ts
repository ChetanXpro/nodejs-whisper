import fs from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import { Logger } from './types'
import { runProcess } from './process'

export const checkIfFileExists = (filePath: string) => {
	if (!fs.existsSync(filePath)) throw new Error(`[Nodejs-whisper] Error: No such file: ${filePath}`)
}

async function isValidWavHeader(filePath: string): Promise<boolean> {
	const file = await fs.promises.open(filePath, 'r')
	try {
		const header = Buffer.alloc(36)
		const { bytesRead } = await file.read(header, 0, header.length, 0)
		return (
			bytesRead === 36 &&
			header.toString('ascii', 0, 4) === 'RIFF' &&
			header.toString('ascii', 8, 12) === 'WAVE' &&
			header.toString('ascii', 12, 16) === 'fmt ' &&
			header.readUInt32LE(24) === 16000 &&
			((header.readUInt16LE(20) === 1 && [8, 16, 24, 32].includes(header.readUInt16LE(34))) ||
				(header.readUInt16LE(20) === 3 && header.readUInt16LE(34) === 32))
		)
	} finally {
		await file.close()
	}
}

export async function convertToWavType(inputFilePath: string, logger: Logger = console): Promise<string> {
	const extension = path.extname(inputFilePath)
	const isWav = extension.toLowerCase() === '.wav'
	if (isWav && (await isValidWavHeader(inputFilePath))) return inputFilePath
	const outputPath = isWav
		? inputFilePath
		: path.join(path.dirname(inputFilePath), path.basename(inputFilePath, extension) + '.wav')
	const temporaryPath = `${outputPath}.${randomUUID()}.temp.wav`
	logger.debug('[Nodejs-whisper] Converting audio to 16 kHz WAV:', inputFilePath)
	try {
		await runProcess(
			'ffmpeg',
			[
				'-nostats',
				'-loglevel',
				'error',
				'-y',
				'-i',
				inputFilePath,
				'-ar',
				'16000',
				'-ac',
				'1',
				'-c:a',
				'pcm_s16le',
				temporaryPath,
			],
			logger
		)
		await fs.promises.rename(temporaryPath, outputPath)
		return outputPath
	} finally {
		await fs.promises.rm(temporaryPath, { force: true })
	}
}
