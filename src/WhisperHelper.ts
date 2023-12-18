import path from 'path'
import { IOptions } from '.'
import fs from 'fs'
import { MODELS, MODELS_LIST, MODEL_OBJECT } from './constants'

export const constructCommand = (filePath: string, args: IOptions) => {
	if (args?.modelName == undefined) {
		throw new Error('[Nodejs-whisper] Error: Provide model name')
	}

	const isValidModelName = MODELS_LIST.findIndex(model => model == args.modelName)

	if (isValidModelName == -1) {
		console.log('[Nodejs-whisper] Error: Enter a valid model name')
		console.log('[Nodejs-whisper] Available models are:\n', MODELS_LIST)
		process.exit(1)
	}

	let anyModelExist = []

	MODELS.forEach(model => {
		if (!fs.existsSync(path.join(__dirname, '..', 'cpp', 'whisper.cpp', 'models', MODEL_OBJECT[args?.modelName]))) {
		} else {
			anyModelExist.push(model)
		}
	})

	if (anyModelExist.length == 0) {
		console.log('[Nodejs-whisper] Error: Models do not exist. Please Select a downloaded model.\n')
		throw new Error('[Nodejs-whisper] Error: Model not found')
	}

	const modelName = MODEL_OBJECT[args.modelName as keyof typeof MODEL_OBJECT]

	if (MODELS_LIST.indexOf(args?.modelName) === -1) {
		throw new Error('[Nodejs-whisper] Error: Model not found')
	}

	let command = `./main  ${constructOptionsFlags(args)} -l auto -m ./models/${modelName}  -f ${filePath}  `

	return command
}

const constructOptionsFlags = (args: IOptions) => {
	let flag = ''
	if (args?.whisperOptions?.outputInText) {
		flag += `-otxt `
	}
	if (args?.whisperOptions?.outputInVtt) {
		flag += `-ovtt `
	}
	if (args?.whisperOptions?.outputInSrt) {
		flag += `-osrt `
	}
	if (args?.whisperOptions?.outputInCsv) {
		flag += `-ocsv `
	}
	if (args?.whisperOptions?.translateToEnglish) {
		flag += `-tr `
	}
	if (args?.whisperOptions?.wordTimestamps) {
		flag += `-ml 1 `
	}
	if (args?.whisperOptions?.timestamps_length) {
		flag += `-ml ${args.whisperOptions.timestamps_length} `
	}
	if (args?.whisperOptions?.splitOnWord) {
		flag += `-sow true `
	}
	if (args?.whisperOptions?.language){
		flag += `-l ${args.whisperOptions.language}`
	}
	return flag
}
