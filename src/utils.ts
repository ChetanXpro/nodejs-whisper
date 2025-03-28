import fs from 'fs'
import path from 'path'
import shell from 'shelljs'
import { FilePath } from '.'

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

export const convertToWavType = async (inputAudioSrc: FilePath | Buffer, logger = console) => {
	//When Buffer data is received
	if (Buffer.isBuffer(inputAudioSrc)) {
		logger.debug('[Nodejs-whisper] Starting audio buffer conversion process')

		//Create temporary input file
		const tempInputPath = `Nodejs-whisper-input_${Date.now()}`
		fs.writeFileSync(tempInputPath, inputAudioSrc)
		logger.debug(`[Nodejs-whisper] Temporary input file created: ${tempInputPath}`)

		//Set output WAV file path
		const outputFilePath = `Nodejs-whisper-temp_${Date.now()}.wav`
		logger.debug(`[Nodejs-whisper] Output WAV path set: ${outputFilePath}`)

		try {
			//Same logic as before
			const command = `ffmpeg -nostats -loglevel error -y -i "${tempInputPath}" -ar 16000 -ac 1 -c:a pcm_s16le "${outputFilePath}"`
			logger.debug(`[Nodejs-whisper] Executing ffmpeg command: ${command}`)

			const result = shell.exec(command)
			if (result.code !== 0) {
				console.error(`[Nodejs-whisper] Conversion failed with code ${result.code}`)
				throw new Error(`[Nodejs-whisper] Failed to convert buffer to WAV: ${result.stderr}`)
			}

			logger.debug('[Nodejs-whisper] Audio conversion completed successfully')

			fs.unlinkSync(tempInputPath)
			logger.debug(`[Nodejs-whisper] Temporary input file cleaned up: ${tempInputPath}`)

			return outputFilePath
		} catch (error) {
			console.error('[Nodejs-whisper] Error during conversion:', error)
			if (fs.existsSync(tempInputPath)) {
				fs.unlinkSync(tempInputPath)
				logger.debug(`[Nodejs-whisper] Cleaned up temp input file: ${tempInputPath}`)
			}
			if (fs.existsSync(outputFilePath)) {
				fs.unlinkSync(outputFilePath)
				logger.debug(`[Nodejs-whisper] Cleaned up output file: ${outputFilePath}`)
			}
			throw error
		}
	}

	const fileExtension = path.extname(inputAudioSrc).toLowerCase()

	logger.debug(`[Nodejs-whisper] Checking if the file is a valid WAV: ${inputAudioSrc}`)

	if (fileExtension === '.wav') {
		const isWav = await isValidWavHeader(inputAudioSrc)
		if (isWav) {
			logger.debug(`[Nodejs-whisper] File is a valid WAV file.`)

			return inputAudioSrc
		} else {
			logger.debug(`[Nodejs-whisper] File has a .wav extension but is not a valid WAV, overwriting...`)

			// Overwrite the original WAV file
			const command = `ffmpeg -nostats -loglevel error -y -i "${inputAudioSrc}" -ar 16000 -ac 1 -c:a pcm_s16le "${inputAudioSrc}"`
			const result = shell.exec(command)
			if (result.code !== 0) {
				throw new Error(`[Nodejs-whisper] Failed to convert audio file: ${result.stderr}`)
			}
			return inputAudioSrc
		}
	} else {
		// Convert to a new WAV file
		const outputFilePath = path.join(
			path.dirname(inputAudioSrc),
			`${path.basename(inputAudioSrc, fileExtension)}.wav`
		)

		logger.debug(`[Nodejs-whisper] Converting to a new WAV file: ${outputFilePath}`)

		const command = `ffmpeg -nostats -loglevel error -y -i "${inputAudioSrc}" -ar 16000 -ac 1 -c:a pcm_s16le "${outputFilePath}"`
		const result = shell.exec(command)
		if (result.code !== 0) {
			throw new Error(`[Nodejs-whisper] Failed to convert audio file: ${result.stderr}`)
		}
		return outputFilePath
	}
}
