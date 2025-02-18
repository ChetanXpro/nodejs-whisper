import path from 'path'

import fs from 'fs'
import { MODELS_LIST, MODEL_OBJECT, WHISPER_CPP_PATH, WHISPER_CPP_MAIN_PATH } from './constants'
import { IOptions } from '.'

export const constructCommand = (filePath: string, args: IOptions): string => {
	let errors: string[] = []

	if (!args.modelName) {
		errors.push('[Nodejs-whisper] Error: Provide model name')
	}

	if (!MODELS_LIST.includes(args.modelName)) {
		errors.push(`[Nodejs-whisper] Error: Enter a valid model name. Available models are: ${MODELS_LIST.join(', ')}`)
	}

	const modelPath = path.join(WHISPER_CPP_PATH, 'models', MODEL_OBJECT[args.modelName])
	if (!fs.existsSync(modelPath)) {
		errors.push(
			'[Nodejs-whisper] Error: Model file does not exist. Please ensure the model is downloaded and correctly placed.'
		)
	}

	if (errors.length > 0) {
		throw new Error(errors.join('\n'))
	}

	const modelName = MODEL_OBJECT[args.modelName as keyof typeof MODEL_OBJECT]
	let command = `${WHISPER_CPP_MAIN_PATH} ${constructOptionsFlags(args)} -l ${args.whisperOptions?.language ? args.whisperOptions?.language : 'auto'} -m "./models/${modelName}"  -f "${filePath}"`

	return command
}

const constructOptionsFlags = (args: IOptions): string => {
	if (args.responseFormat) {
		// Include the response format...
		args.whisperOptions['outputIn' + capitalize(args.responseFormat)] = true
	}

	let flags = [
		args.whisperOptions?.outputInCsv ? '-ocsv ' : '',
		args.whisperOptions?.outputInJson ? '-oj ' : '',
		args.whisperOptions?.outputInJsonFull ? '-ojf ' : '',
		args.whisperOptions?.outputInLrc ? '-olrc ' : '',
		args.whisperOptions?.outputInSrt ? '-osrt ' : '',
		args.whisperOptions?.outputInText ? '-otxt ' : '',
		args.whisperOptions?.outputInVtt ? '-ovtt ' : '',
		args.whisperOptions?.outputInWords ? '-owts ' : '',
		args.whisperOptions?.translateToEnglish ? '-tr ' : '',
		args.whisperOptions?.wordTimestamps ? '-ml 1 ' : '',
		args.whisperOptions?.timestamps_length ? `-ml ${args.whisperOptions.timestamps_length} ` : '',
		args.whisperOptions?.splitOnWord ? '-sow true ' : '',
	].join('')

	return flags.trim()
}

function capitalize(s) {
	return s && String(s[0]).toUpperCase() + String(s).slice(1)
}
