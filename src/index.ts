import dotenv from 'dotenv'
import path from 'path'
import fs from 'fs'
import { WhisperOptions } from './types'
import { executeCppCommand } from './whisper'
import downloadModel from './downloadModel'
import { MODELS } from './constants'
import { constructCommand } from './WhisperHelper'
import { checkIfFileExists, convertToWavType } from './utils'

dotenv.config()

export interface IOptions {
	modelName: string
	whisperOptions: WhisperOptions
}

async function whisperNodejs(filePath: string, options: IOptions) {
	checkIfFileExists(filePath)
	await downloadModel()

	const outputFilePath = await convertToWavType(filePath)

	checkIfFileExists(outputFilePath)

	const command = constructCommand(outputFilePath, options!)

	console.log('command', command)

	let transcript = await executeCppCommand(command)
	console.log('transcript', transcript)
}

// For testing purposes
const filePath = path.resolve(__dirname, '..', 'basicaudio.wav')

whisperNodejs(filePath, {
	modelName: 'tiny.en',
	whisperOptions: {
		outputInText: false,
		outputInVtt: false,
		outputInSrt: false,
		outputInCsv: true,
		translateToEnglish: false,
		wordTimestamps: false,
		timestamps_length: 20,
	},
})
