import path from 'path'
import shell from 'shelljs'
import fs from 'fs'
import { DOWNLOAD_MODEL_ALIASES, isModelName, LEGACY_MODEL_FILES, MODEL_OBJECT, WHISPER_CPP_PATH } from './constants'
import { Logger } from './types'
import { getCmakeConfigureCommand } from './buildConfig'

export default async function autoDownloadModel(
	logger: Logger = console,
	autoDownloadModelName?: string,
	withCuda: boolean = false,
	modelRootPath?: string
) {
	const projectDir = process.cwd()

	if (!autoDownloadModelName) {
		throw new Error('[Nodejs-whisper] Error: Model name must be provided.')
	}

	if (!isModelName(autoDownloadModelName)) {
		throw new Error('[Nodejs-whisper] Error: Provide a valid model name')
	}

	try {
		const modelDirectory = path.join(WHISPER_CPP_PATH, 'models')
		const downloadDirectory = modelRootPath ? path.resolve(modelRootPath) : modelDirectory

		fs.mkdirSync(downloadDirectory, { recursive: true })
		shell.cd(modelDirectory)
		const modelFiles = [MODEL_OBJECT[autoDownloadModelName], ...(LEGACY_MODEL_FILES[autoDownloadModelName] || [])]
		const modelAlreadyExist = modelFiles.some(modelFile => fs.existsSync(path.join(downloadDirectory, modelFile)))

		if (modelAlreadyExist) {
			logger.debug(`[Nodejs-whisper] ${autoDownloadModelName} already exist. Skipping download.`)
			return 'Models already exist. Skipping download.'
		}

		logger.debug(`[Nodejs-whisper] Auto-download Model: ${autoDownloadModelName}`)
		const downloadModelName = DOWNLOAD_MODEL_ALIASES[autoDownloadModelName] || autoDownloadModelName

		let scriptPath = './download-ggml-model.sh'
		if (process.platform === 'win32') {
			scriptPath = 'download-ggml-model.cmd'
		}

		shell.chmod('+x', scriptPath)
		const downloadPathArg = modelRootPath ? ` ${quoteShellArg(downloadDirectory)}` : ''
		const result = shell.exec(`${scriptPath} ${downloadModelName}${downloadPathArg}`)

		if (result.code !== 0) {
			throw new Error(`[Nodejs-whisper] Failed to download model: ${result.stderr}`)
		}

		logger.debug('[Nodejs-whisper] Model downloaded. Attempting to build whisper.cpp...')
		shell.cd(WHISPER_CPP_PATH)

		// Configure CMake build
		logger.debug('[Nodejs-whisper] Configuring CMake build...')
		const configureCommand = getCmakeConfigureCommand(withCuda)

		const configResult = shell.exec(configureCommand)
		if (configResult.code !== 0) {
			throw new Error(`[Nodejs-whisper] CMake configuration failed: ${configResult.stderr}`)
		}

		// Build the project
		logger.debug('[Nodejs-whisper] Building whisper.cpp...')
		const buildCommand = 'cmake --build build --config Release'
		const buildResult = shell.exec(buildCommand)

		if (buildResult.code !== 0) {
			throw new Error(`[Nodejs-whisper] Build failed: ${buildResult.stderr}`)
		}

		return 'Model downloaded and built successfully'
	} catch (error) {
		logger.error('[Nodejs-whisper] Error caught in autoDownloadModel:', error)
		throw error
	} finally {
		shell.cd(projectDir)
	}
}

function quoteShellArg(arg: string): string {
	if (process.platform === 'win32') {
		return arg
	}

	return `"${arg.replace(/"/g, '\\"')}"`
}
