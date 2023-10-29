import { WhisperOptions } from './types'
import { executeCppCommand } from './whisper'

import { constructCommand } from './WhisperHelper'
import { checkIfFileExists, convertToWavType } from './utils'

import autoDownloadModel from './autoDownloadModel'

export interface IOptions {
	modelName: string
	autoDownloadModelName?: string
	whisperOptions?: WhisperOptions
}

export async function nodewhisper(filePath: string, options: IOptions) {
	if (options.autoDownloadModelName) {
		await autoDownloadModel(options.autoDownloadModelName)
	}

	checkIfFileExists(filePath)

	const outputFilePath = await convertToWavType(filePath)

	checkIfFileExists(outputFilePath)

	const command = constructCommand(outputFilePath, options!)

	console.log(`[Nodejs-whisper]  Executing command: ${command}\n`)

	const transcript = await executeCppCommand(command)

	if (transcript.length === 0) {
		throw new Error('Something went wrong while executing the command.')
	}

	return transcript
}
