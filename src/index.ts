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

	verbose?: boolean
	removeWavFileAfterTranscription?: boolean
}

export async function nodewhisper(filePath: string, options: IOptions) {
	const { verbose = false } = options
	const { removeWavFileAfterTranscription = true } = options
	if (options.autoDownloadModelName) {
		await autoDownloadModel(options.autoDownloadModelName, verbose, options.withCuda)
	}

	checkIfFileExists(filePath)

	const outputFilePath = await convertToWavType(filePath, verbose)

	checkIfFileExists(outputFilePath)

	const command = constructCommand(outputFilePath, options!)

	if (verbose) {
		console.log(`[Nodejs-whisper]  Executing command: ${command}\n`)
	}

	const transcript = await executeCppCommand(command, verbose, options.withCuda)

	if (!transcript) {
		throw new Error('Something went wrong while executing the command.')
	}

	if (removeWavFileAfterTranscription) {
		if (verbose) {
			console.log(`[Nodejs-whisper]  Removing wav file: ${outputFilePath}\n`)
		}
		fs.unlinkSync(outputFilePath)
	}
	return transcript
}
