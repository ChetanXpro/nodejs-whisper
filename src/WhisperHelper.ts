import path from 'path'
import fs from 'fs'
import { isModelName, LEGACY_MODEL_FILES, MODELS_LIST, MODEL_OBJECT, WHISPER_CPP_PATH } from './constants'
import { IOptions } from '.'

// Get the correct executable path based on platform and build system
function getExecutablePath(): string {
	const execName = process.platform === 'win32' ? 'whisper-cli.exe' : 'whisper-cli'

	// Check common CMake build locations
	const possiblePaths = [
		path.join(WHISPER_CPP_PATH, 'build', 'bin', execName), // Unix CMake
		path.join(WHISPER_CPP_PATH, 'build', 'bin', 'Release', execName), // Windows CMake Release
		path.join(WHISPER_CPP_PATH, 'build', 'bin', 'Debug', execName), // Windows CMake Debug
		path.join(WHISPER_CPP_PATH, 'build', execName), // Alternative location
		path.join(WHISPER_CPP_PATH, execName), // Root directory
	]

	for (const execPath of possiblePaths) {
		if (fs.existsSync(execPath)) {
			return execPath
		}
	}

	return '' // Not found
}

export const constructCommand = (filePath: string, args: IOptions): string => {
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

	// Get the actual executable path
	const executablePath = getExecutablePath()
	if (!executablePath) {
		throw new Error('[Nodejs-whisper] Error: whisper-cli executable not found')
	}

	const modelArg = args.modelRootPath ? modelPath : `./models/${modelFileName}`

	let command = `${escapeArg(executablePath)} ${constructOptionsFlags(args)} -l ${args.whisperOptions?.language || 'auto'} -m ${escapeArg(modelArg)} -f ${escapeArg(filePath)}`

	return command
}

const constructOptionsFlags = (args: IOptions): string => {
	const vadFlags = constructVadFlags(args)
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
		args.whisperOptions?.splitOnWord ? '-sow ' : '',
		args.whisperOptions?.noGpu ? '-ng ' : '',
		vadFlags,
	].join('')

	return flags.trim()
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
	if (!fs.existsSync(vadModelPath)) {
		throw new Error(`[Nodejs-whisper] Error: VAD model file does not exist at ${vadModelPath}.`)
	}

	validateNumber('vadThreshold', options.vadThreshold, 0, 1)
	validateNumber('vadMinSpeechDurationMs', options.vadMinSpeechDurationMs, 0, undefined, true)
	validateNumber('vadMinSilenceDurationMs', options.vadMinSilenceDurationMs, 0, undefined, true)
	validateNumber('vadMaxSpeechDurationS', options.vadMaxSpeechDurationS, Number.MIN_VALUE)
	validateNumber('vadSpeechPadMs', options.vadSpeechPadMs, 0, undefined, true)
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
		return `"${arg.replace(/"/g, '\\"')}"`
	}
	return `"${arg}"`
}
