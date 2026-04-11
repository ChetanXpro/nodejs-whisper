#! /usr/bin/env node

// npx nodejs-whisper download

import path from 'path'
import shell from 'shelljs'
import readlineSync from 'readline-sync'
import { MODELS_LIST, DEFAULT_MODEL, MODELS, WHISPER_CPP_PATH, MODEL_OBJECT } from './constants'
import fs from 'fs'
import { Logger } from './types'
import { getCmakeConfigureCommand } from './buildConfig'
const askForModel = async (logger: Logger = console): Promise<string> => {
	const answer = await readlineSync.question(
		`\n[Nodejs-whisper] Enter model name (e.g. 'tiny.en') or 'cancel' to exit\n(ENTER for tiny.en): `
	)

	if (answer === 'cancel') {
		logger.log('[Nodejs-whisper] Exiting model downloader.\n')
		process.exit(0)
	}
	// User presses enter
	else if (answer === '') {
		logger.log('[Nodejs-whisper] Going with', DEFAULT_MODEL)
		return DEFAULT_MODEL
	} else if (!MODELS_LIST.includes(answer)) {
		logger.log(
			'\n[Nodejs-whisper] FAIL: Name not found. Check your spelling OR quit wizard and use custom model.\n'
		)

		return await askForModel()
	}

	return answer
}

const askIfUserWantToUseCuda = async (logger: Logger = console) => {
	const answer = await readlineSync.question(
		`\n[Nodejs-whisper] Do you want to use CUDA for compilation? (y/n)\n(ENTER for n): `
	)

	if (answer === 'y') {
		logger.log('[Nodejs-whisper] Using CUDA for compilation.')
		return true
	} else {
		logger.log('[Nodejs-whisper] Not using CUDA for compilation.')
		return false
	}
}

async function downloadModel(logger: Logger = console) {
	const projectDir = process.cwd()

	try {
		shell.cd(path.join(WHISPER_CPP_PATH, 'models'))

		let anyModelExist = []

		MODELS_LIST.forEach(model => {
			if (!fs.existsSync(path.join(WHISPER_CPP_PATH, 'models', MODEL_OBJECT[model]))) {
			} else {
				anyModelExist.push(model)
			}
		})

		if (anyModelExist.length > 0) {
			logger.log('\n[Nodejs-whisper] Currently installed models:')
			anyModelExist.forEach(model => logger.log(`- ${model}`))
			logger.log('\n[Nodejs-whisper] You can install additional models from the list below.\n')
		}

		logger.log(`
| Model          | Disk   | RAM     |
|----------------|--------|---------|
| tiny           |  75 MB | ~390 MB |
| tiny.en        |  75 MB | ~390 MB |
| base           | 142 MB | ~500 MB |
| base.en        | 142 MB | ~500 MB |
| small          | 466 MB | ~1.0 GB |
| small.en       | 466 MB | ~1.0 GB |
| medium         | 1.5 GB | ~2.6 GB |
| medium.en      | 1.5 GB | ~2.6 GB |
| large-v1       | 2.9 GB | ~4.7 GB |
| large          | 2.9 GB | ~4.7 GB |
| large-v3-turbo | 1.5 GB | ~2.6 GB |
`)

		const downloaderScript = process.platform === 'win32' ? 'download-ggml-model.cmd' : './download-ggml-model.sh'

		if (!shell.test('-f', downloaderScript)) {
			throw '[Nodejs-whisper] Error: Downloader not found.\n'
		}

		const modelName = await askForModel()

		const scriptPath = downloaderScript

		shell.chmod('+x', scriptPath)
		shell.exec(`${scriptPath} ${modelName}`)

		logger.log('[Nodejs-whisper] Attempting to build whisper.cpp...\n')
		shell.cd('../')

		const withCuda = await askIfUserWantToUseCuda()

		// Use CMake instead of make
		logger.log('[Nodejs-whisper] Configuring CMake build...')
		const configureCommand = getCmakeConfigureCommand(withCuda)

		shell.exec(configureCommand)

		logger.log('[Nodejs-whisper] Building with CMake...')
		shell.exec('cmake --build build --config Release')
	} catch (error) {
		logger.error('[Nodejs-whisper] Error Caught in downloadModel\n')
		logger.error(error)
		throw error
	} finally {
		shell.cd(projectDir)
	}
}
downloadModel().catch(error => {
	console.error('Failed to download:', error)
	process.exit(1)
})
