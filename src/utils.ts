import fs from 'fs'
import path from 'path'
import shell from 'shelljs'

shell.config.execPath = shell.which('node').stdout

export const checkIfFileExists = (filePath: string) => {
	if (!fs.existsSync(filePath)) {
		throw new Error(`[Nodejs-whisper] Error: No such file: ${filePath}`)
	}
}

async function isValidWavHeader(filePath) {
	return new Promise((resolve, reject) => {
		const readable = fs.createReadStream(filePath, { end: 11 })
		let data = ''

		readable.on('data', chunk => {
			data += chunk.toString('binary')
		})

		readable.on('end', () => {
			const isValid = data.startsWith('RIFF') || data.startsWith('RIFX')
			resolve(isValid)
		})

		readable.on('error', err => {
			reject(err)
		})
	})
}

export const convertToWavType = async (inputFilePath, logger = console) => {
	const fileExtension = path.extname(inputFilePath).toLowerCase()

	logger.debug(`[Nodejs-whisper] Checking if the file is a valid WAV: ${inputFilePath}`)

	if (fileExtension === '.wav') {
		const isWav = await isValidWavHeader(inputFilePath)
		if (isWav) {
			logger.debug(`[Nodejs-whisper] File is a valid WAV file.`)

			return inputFilePath
		} else {
			logger.debug(`[Nodejs-whisper] File has a .wav extension but is not a valid WAV, overwriting...`)

			// Overwrite the original WAV file
			const command = `ffmpeg -nostats -loglevel error -y -i "${inputFilePath}" -ar 16000 -ac 1 -c:a pcm_s16le "${inputFilePath}"`
			const result = shell.exec(command)
			if (result.code !== 0) {
				throw new Error(`[Nodejs-whisper] Failed to convert audio file: ${result.stderr}`)
			}
			return inputFilePath
		}
	} else {
		// Convert to a new WAV file
		const outputFilePath = path.join(
			path.dirname(inputFilePath),
			`${path.basename(inputFilePath, fileExtension)}.wav`
		)

		logger.debug(`[Nodejs-whisper] Converting to a new WAV file: ${outputFilePath}`)

		const command = `ffmpeg -nostats -loglevel error -y -i "${inputFilePath}" -ar 16000 -ac 1 -c:a pcm_s16le "${outputFilePath}"`
		const result = shell.exec(command)
		if (result.code !== 0) {
			throw new Error(`[Nodejs-whisper] Failed to convert audio file: ${result.stderr}`)
		}
		return outputFilePath
	}
}
