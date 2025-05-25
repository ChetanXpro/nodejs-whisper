import path from 'path'
import shell from 'shelljs'
import fs from 'fs'
import { MODEL_OBJECT, MODELS_LIST, WHISPER_CPP_PATH } from './constants'

export default async function autoDownloadModel(
	logger = console,
	autoDownloadModelName?: string,
	withCuda: boolean = false
) {
	const projectDir = process.cwd()

	if (!autoDownloadModelName) {
		throw new Error('[Nodejs-whisper] Error: Model name must be provided.')
	}

	if (!MODELS_LIST.includes(autoDownloadModelName)) {
		throw new Error('[Nodejs-whisper] Error: Provide a valid model name')
	}

	try {
		const modelDirectory = path.join(WHISPER_CPP_PATH, 'models')
		shell.cd(modelDirectory)
		const modelAlreadyExist = fs.existsSync(path.join(modelDirectory, MODEL_OBJECT[autoDownloadModelName]))

		if (modelAlreadyExist) {
			logger.debug(`[Nodejs-whisper] ${autoDownloadModelName} already exist. Skipping download.`)
			return 'Models already exist. Skipping download.'
		}

		logger.debug(`[Nodejs-whisper] Auto-download Model: ${autoDownloadModelName}`)

		let scriptPath = './download-ggml-model.sh'
		if (process.platform === 'win32') {
			scriptPath = 'download-ggml-model.cmd'
		}

		shell.chmod('+x', scriptPath)
		const result = shell.exec(`${scriptPath} ${autoDownloadModelName}`)

		if (result.code !== 0) {
			throw new Error(`[Nodejs-whisper] Failed to download model: ${result.stderr}`)
		}

		logger.debug('[Nodejs-whisper] Model downloaded. Attempting to build whisper.cpp...')
		shell.cd('../')

		// Configure CMake build
		logger.debug('[Nodejs-whisper] Configuring CMake build...')
		let configureCommand = 'cmake -B build'
		if (withCuda) {
			configureCommand += ' -DGGML_CUDA=1'
		}

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
		shell.cd(projectDir)
		throw error
	}
}
