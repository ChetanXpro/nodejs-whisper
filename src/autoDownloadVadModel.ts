import fs from 'fs'
import path from 'path'
import shell from 'shelljs'
import { isVadModelName, VAD_MODEL_OBJECT, VadModelName, WHISPER_CPP_PATH } from './constants'
import { Logger } from './types'

export default async function autoDownloadVadModel(
	logger: Logger = console,
	modelName: VadModelName,
	modelRootPath?: string
): Promise<string> {
	if (!isVadModelName(modelName)) {
		throw new Error('[Nodejs-whisper] Error: Provide a valid VAD model name')
	}

	const modelDirectory = modelRootPath ? path.resolve(modelRootPath) : path.join(WHISPER_CPP_PATH, 'models')
	const modelPath = path.join(modelDirectory, VAD_MODEL_OBJECT[modelName])

	fs.mkdirSync(modelDirectory, { recursive: true })

	if (isValidVadModel(modelPath)) {
		logger.debug(`[Nodejs-whisper] ${modelName} already exists. Skipping download.`)
		return modelPath
	}

	if (fs.existsSync(modelPath)) {
		throw new Error(`[Nodejs-whisper] Existing VAD model is invalid: ${modelPath}`)
	}

	const scriptName = process.platform === 'win32' ? 'download-vad-model.cmd' : 'download-vad-model.sh'
	const scriptPath = path.join(WHISPER_CPP_PATH, 'models', scriptName)

	if (!fs.existsSync(scriptPath)) {
		throw new Error(`[Nodejs-whisper] Error: VAD model downloader not found at ${scriptPath}`)
	}

	if (process.platform !== 'win32') {
		shell.chmod('+x', scriptPath)
	}

	logger.debug(`[Nodejs-whisper] Auto-download VAD model: ${modelName}`)
	const result = shell.exec(
		`${quoteShellArg(scriptPath)} ${quoteShellArg(modelName)} ${quoteShellArg(modelDirectory)}`,
		{ silent: true }
	)

	if (result.stdout) {
		logger.debug(result.stdout)
	}
	if (result.stderr) {
		logger.debug(result.stderr)
	}

	if (result.code !== 0 || !isValidVadModel(modelPath)) {
		if (fs.existsSync(modelPath)) {
			fs.unlinkSync(modelPath)
		}
		throw new Error(`[Nodejs-whisper] Failed to download VAD model: ${result.stderr || result.stdout}`)
	}

	return modelPath
}

function isValidVadModel(modelPath: string): boolean {
	if (!fs.existsSync(modelPath) || fs.statSync(modelPath).size < 4) {
		return false
	}

	const file = fs.openSync(modelPath, 'r')
	try {
		const magic = Buffer.alloc(4)
		fs.readSync(file, magic, 0, magic.length, 0)
		return magic.readUInt32LE(0) === 0x67676d6c
	} finally {
		fs.closeSync(file)
	}
}

function quoteShellArg(arg: string): string {
	if (process.platform === 'win32') {
		return `"${arg.replace(/"/g, '""')}"`
	}

	return `'${arg.replace(/'/g, `'\\''`)}'`
}
