import { WhisperOptions } from './types'
import { executeCppCommand } from './whisper'
import downloadModel from './downloadModel'

import { constructCommand } from './WhisperHelper'
import { checkIfFileExists, convertToWavType } from './utils'

export interface IOptions {
	modelName: string
	whisperOptions?: WhisperOptions
}

export async function nodewhisper(filePath: string, options: IOptions) {
	checkIfFileExists(filePath)
	await downloadModel()

	const outputFilePath = await convertToWavType(filePath)

	checkIfFileExists(outputFilePath)

	const command = constructCommand(outputFilePath, options!)

	// console.log(`[Nodejs-whisper]  Executing command: ${command}\n`)

	const transcript = await executeCppCommand(command)

	return transcript
}
