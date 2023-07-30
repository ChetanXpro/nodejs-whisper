import { WhisperOptions } from './types'
import { executeCppCommand } from './whisper'
import downloadModel from './downloadModel'

import { constructCommand } from './WhisperHelper'
import { checkIfFileExists, convertToWavType } from './utils'
import path from 'path'

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

// const filePath = path.resolve(__dirname, '..', 'test.wav')

// nodewhisper(filePath, {
// 	modelName: 'base.en',
// 	whisperOptions: {
// 		outputInText: false,
// 		outputInVtt: false,
// 		outputInSrt: true,
// 		outputInCsv: false,
// 		translateToEnglish: false,
// 		wordTimestamps: false,
// 		timestamps_length: 20,
// 		splitOnWord: true,
// 	},
// })
