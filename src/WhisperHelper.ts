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

	// Construct command with proper path escaping
	const escapeArg = (arg: string) => {
		if (process.platform === 'win32') {
			return `"${arg.replace(/"/g, '\\"')}"`
		}
		return `"${arg}"`
	}

	const modelArg = args.modelRootPath ? modelPath : `./models/${modelFileName}`

	let command = `${escapeArg(executablePath)} ${constructOptionsFlags(args)} -l ${args.whisperOptions?.language || 'auto'} -m ${escapeArg(modelArg)} -f ${escapeArg(filePath)}`

	return command
}

const constructOptionsFlags = (args: IOptions): string => {
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
	].join('')

	return flags.trim()
}
