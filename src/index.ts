import { Logger, WhisperOptions } from './types'
import { executeCppCommand } from './whisper'
import fs from 'fs'
import { constructCommand } from './WhisperHelper'
import { checkIfFileExists, convertToWavType } from './utils'
import autoDownloadModel from './autoDownloadModel'
import autoDownloadVadModel from './autoDownloadVadModel'
import { VadModelName } from './constants'

export type { VadModelName } from './constants'

export interface IOptions {
	modelName: string
	modelRootPath?: string
	autoDownloadModelName?: string
	autoDownloadVadModelName?: VadModelName
	whisperOptions?: WhisperOptions
	withCuda?: boolean
	removeWavFileAfterTranscription?: boolean
	logger?: Logger
}

export async function nodewhisper(filePath: string, options: IOptions) {
	const { removeWavFileAfterTranscription = false, logger = console } = options

	try {
		let runtimeOptions = options

		if (options.autoDownloadModelName) {
			logger.debug(`[Nodejs-whisper] Checking and downloading model if needed: ${options.autoDownloadModelName}`)

			logger.debug('autoDownloadModelName', options.autoDownloadModelName)
			logger.debug('options', options)

			await autoDownloadModel(logger, options.autoDownloadModelName, options.withCuda, options.modelRootPath)
		}

		if (options.autoDownloadVadModelName) {
			logger.debug(
				`[Nodejs-whisper] Checking and downloading VAD model if needed: ${options.autoDownloadVadModelName}`
			)
			const vadModelPath = await autoDownloadVadModel(
				logger,
				options.autoDownloadVadModelName,
				options.modelRootPath
			)
			runtimeOptions = {
				...options,
				whisperOptions: {
					...options.whisperOptions,
					vad: true,
					vadModelPath,
				},
			}
		}

		logger.debug(`[Nodejs-whisper] Checking file existence: ${filePath}`)
		checkIfFileExists(filePath)

		logger.debug(`[Nodejs-whisper] Converting file to WAV format: ${filePath}`)
		const outputFilePath = await convertToWavType(filePath, logger)

		logger.debug(`[Nodejs-whisper] Constructing command for file: ${outputFilePath}`)
		const command = constructCommand(outputFilePath, runtimeOptions)

		logger.debug(`[Nodejs-whisper] Executing command: ${command}`)
		const transcript = await executeCppCommand(command, logger, options.withCuda)

		if (!transcript) {
			throw new Error('Transcription failed or produced no output.')
		}

		if (removeWavFileAfterTranscription && fs.existsSync(outputFilePath)) {
			logger.debug(`[Nodejs-whisper] Removing temporary WAV file: ${outputFilePath}`)
			fs.unlinkSync(outputFilePath)
		}

		return transcript
	} catch (error) {
		logger.error(`[Nodejs-whisper] Error during processing: ${error.message}`)
		throw new Error(`Operation failed: ${error.message}`)
	}
}
