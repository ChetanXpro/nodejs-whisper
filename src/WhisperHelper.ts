import path from 'path'
import fs from 'fs'
import { isModelName, LEGACY_MODEL_FILES, MODELS_LIST, MODEL_OBJECT, WHISPER_CPP_PATH } from './constants'
import type { IOptions } from '.'

import { getWhisperExecutablePath } from './whisper'

export const constructCommand = (filePath: string, args: IOptions): string => {
	const modelPath = resolveModelPath(args)
	validateWhisperOptions(args)
	const executablePath = getWhisperExecutablePath(args.withCuda)
	if (!executablePath) throw new Error('[Nodejs-whisper] Error: whisper-cli executable not found')
	return `${escapeArg(executablePath)} ${constructOptionsFlags(args)} -l ${escapeArg(args.whisperOptions?.language || 'auto')} -m ${escapeArg(modelPath)} -f ${escapeArg(filePath)}`
}

export const resolveModelPath = (args: IOptions): string => {
	if (!args.modelName) {
		throw new Error('[Nodejs-whisper] Error: Provide model name')
	}

	if (!isModelName(args.modelName)) {
		throw new Error(
			`[Nodejs-whisper] Error: Enter a valid model name. Available models are: ${MODELS_LIST.join(', ')}`
		)
	}

	const modelName = MODEL_OBJECT[args.modelName]

	const modelDirectory = args.modelRootPath ? path.resolve(args.modelRootPath) : path.join(WHISPER_CPP_PATH, 'models')
	const modelFileNames = [modelName, ...(LEGACY_MODEL_FILES[args.modelName] || [])]
	const modelFileName =
		modelFileNames.find(fileName => fs.existsSync(path.join(modelDirectory, fileName))) || modelName
	const modelPath = path.join(modelDirectory, modelFileName)

	if (!fs.existsSync(modelPath)) {
		throw new Error(
			`[Nodejs-whisper] Error: Model file does not exist at ${modelPath}. Please ensure the model is downloaded and correctly placed.`
		)
	}

	return fs.realpathSync(modelPath)
}

const constructOptionsFlags = (args: IOptions): string => {
	const vadFlags = constructVadFlags(args)
	let flags = [
		args.whisperOptions?.threads ? `-t ${args.whisperOptions.threads} ` : '',
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
		args.whisperOptions?.splitOnWord ? '-sow ' : '',
		args.whisperOptions?.noGpu ? '-ng ' : '',
		vadFlags,
	].join('')

	return flags.trim()
}

export const validateWhisperOptions = (args: IOptions): void => {
	const options = args.whisperOptions
	if (!options) return
	for (const key of [
		'outputInCsv',
		'outputInJson',
		'outputInJsonFull',
		'outputInLrc',
		'outputInSrt',
		'outputInText',
		'outputInVtt',
		'outputInWords',
		'translateToEnglish',
		'wordTimestamps',
		'splitOnWord',
		'noGpu',
		'vad',
	] as const) {
		if (options[key] !== undefined && typeof options[key] !== 'boolean') {
			throw new TypeError(`[Nodejs-whisper] whisperOptions.${key} must be a boolean`)
		}
	}
	if (options.vadModelPath !== undefined && typeof options.vadModelPath !== 'string') {
		throw new TypeError('[Nodejs-whisper] whisperOptions.vadModelPath must be a string')
	}
	validateNumber('threads', options.threads, 1, 2147483647, true)
	validateNumber('timestamps_length', options.timestamps_length, 0, 2147483647, true)
	if (
		options.language !== undefined &&
		(typeof options.language !== 'string' || !/^[a-zA-Z-]+$/.test(options.language))
	) {
		throw new TypeError('[Nodejs-whisper] Invalid language; expected a language code string')
	}
	constructVadFlags(args)
}

const constructVadFlags = (args: IOptions): string => {
	const options = args.whisperOptions
	if (!options?.vad) {
		return ''
	}

	if (!options.vadModelPath) {
		throw new Error('[Nodejs-whisper] Error: VAD requires whisperOptions.vadModelPath or autoDownloadVadModelName.')
	}

	const vadModelPath = path.resolve(options.vadModelPath)
	if (!fs.existsSync(vadModelPath) || !fs.statSync(vadModelPath).isFile()) {
		throw new Error(`[Nodejs-whisper] Error: VAD model file does not exist at ${vadModelPath}.`)
	}

	validateNumber('vadThreshold', options.vadThreshold, 0, 1)
	validateNumber('vadMinSpeechDurationMs', options.vadMinSpeechDurationMs, 0, 2147483647, true)
	validateNumber('vadMinSilenceDurationMs', options.vadMinSilenceDurationMs, 0, 2147483647, true)
	validateNumber('vadMaxSpeechDurationS', options.vadMaxSpeechDurationS, Number.MIN_VALUE)
	validateNumber('vadSpeechPadMs', options.vadSpeechPadMs, 0, 2147483647, true)
	validateNumber('vadSamplesOverlap', options.vadSamplesOverlap, 0)

	return [
		`--vad -vm ${escapeArg(vadModelPath)} `,
		optionFlag('-vt', options.vadThreshold),
		optionFlag('-vspd', options.vadMinSpeechDurationMs),
		optionFlag('-vsd', options.vadMinSilenceDurationMs),
		optionFlag('-vmsd', options.vadMaxSpeechDurationS),
		optionFlag('-vp', options.vadSpeechPadMs),
		optionFlag('-vo', options.vadSamplesOverlap),
	].join('')
}

const optionFlag = (flag: string, value?: number): string => (value === undefined ? '' : `${flag} ${value} `)

const validateNumber = (name: string, value: number | undefined, min: number, max?: number, integer = false) => {
	if (value === undefined) {
		return
	}
	if (typeof value !== 'number') {
		throw new TypeError(`[Nodejs-whisper] whisperOptions.${name} must be a number`)
	}

	if (
		!Number.isFinite(value) ||
		value < min ||
		(max !== undefined && value > max) ||
		(integer && !Number.isInteger(value))
	) {
		const range = max === undefined ? `at least ${min}` : `between ${min} and ${max}`
		throw new Error(
			`[Nodejs-whisper] Error: whisperOptions.${name} must be ${range}${integer ? ' and an integer' : ''}.`
		)
	}
}

const escapeArg = (arg: string) => {
	if (process.platform === 'win32') {
		if (/["%\r\n]/.test(arg)) throw new Error('Unsupported characters in Windows CLI argument')
		return `"${arg}"`
	}
	return "'" + arg.replace(/'/g, "'\"'\"'") + "'"
}
