import { IOptions } from '.'
import { MODELS_LIST, MODEL_OBJECT } from './constants'
import { WhisperOptions } from './types'

export const constructCommand = (filePath: string, args: IOptions) => {
	const modelName = MODEL_OBJECT[args.modelName as keyof typeof MODEL_OBJECT]

	if (MODELS_LIST.indexOf(args.modelName) === -1) {
		throw new Error('Model not found')
	}
	let command = `./main ${constructOptionsFlags(args)} -m ./models/${modelName}  -f ${filePath}  `

	return command
}

const constructOptionsFlags = (args: IOptions) => {
	let flag = ''
	if (args.whisperOptions.outputInText) {
		flag += `-otxt`
	}
	if (args.whisperOptions.outputInVtt) {
		flag += `-ovtt `
	}
	if (args.whisperOptions.outputInSrt) {
		flag += `-osrt `
	}
	if (args.whisperOptions.outputInCsv) {
		flag += `-ocsv `
	}
	if (args.whisperOptions.translateToEnglish) {
		flag += `-tr `
	}
	if (args.whisperOptions.wordTimestamps) {
		flag += `-ml 1 `
	}
	if (args.whisperOptions.timestamps_length) {
		flag += `-ml ${args.whisperOptions.timestamps_length} `
	}
	return flag
}
