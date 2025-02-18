import { WhisperOptions } from './types'
import { executeCppCommand } from './whisper'
import fs from 'fs'
import { constructCommand } from './WhisperHelper'
import { checkIfFileExists, convertToWavType } from './utils'
import autoDownloadModel from './autoDownloadModel'

export interface IOptions {
	modelName: string
	autoDownloadModelName?: string
	whisperOptions?: WhisperOptions
	withCuda?: boolean
	removeWavFileAfterTranscription?: boolean
	logger?: Console
	responseFormat?: 'json' | 'csv' | 'srt' | 'vtt' | 'lrc' | 'text'
}

export async function nodewhisper(filePath: string, options: IOptions) {
	const { removeWavFileAfterTranscription = false, logger = console, responseFormat } = options

	try {
		if (options.autoDownloadModelName) {
			logger.debug(`[Nodejs-whisper] Checking and downloading model if needed: ${options.autoDownloadModelName}`)

			logger.debug('autoDownloadModelName', options.autoDownloadModelName)
			logger.debug('options', options)

			await autoDownloadModel(logger, options.autoDownloadModelName, options.withCuda)
		}

		logger.debug(`[Nodejs-whisper] Checking file existence: ${filePath}`)
		checkIfFileExists(filePath)

		logger.debug(`[Nodejs-whisper] Converting file to WAV format: ${filePath}`)
		const outputFilePath = await convertToWavType(filePath, logger)

		logger.debug(`[Nodejs-whisper] Constructing command for file: ${outputFilePath}`)
		const command = constructCommand(outputFilePath, options)

		logger.debug(`[Nodejs-whisper] Executing command: ${command}`)
		const transcript = await executeCppCommand(command, logger, options.withCuda)

		if (!transcript) {
			throw new Error('Transcription failed or produced no output.')
		}

		if (removeWavFileAfterTranscription && fs.existsSync(outputFilePath)) {
			logger.debug(`[Nodejs-whisper] Removing temporary WAV file: ${outputFilePath}`)
			fs.unlinkSync(outputFilePath)
		}

		if (responseFormat) {
			logger.debug(`[Nodejs-whisper] Retrieving response from: ${command}`)
			const response = fs.readFileSync(`${outputFilePath}.${responseFormat}`, 'utf8')
			return responseFormat === 'json' ? JSON.parse(response) : response
		}

		return transcript
	} catch (error) {
		logger.error(`[Nodejs-whisper] Error during processing: ${error.message}`)
		throw new Error(`Operation failed: ${error.message}`)
	}
}
