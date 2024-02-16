import path from 'path'
import shell from 'shelljs'

import { MODELS_LIST, MODELS } from './constants'
import fs from 'fs'

export default async function autoDownloadModel(autoDownloadModelName?: string, verbose?: boolean) {
	const projectDir = process.cwd()
	try {
		if (autoDownloadModelName) {
			if (!MODELS_LIST.includes(autoDownloadModelName))
				throw new Error('[Nodejs-whisper] Error: Provide valid model name')

			shell.cd(path.join(__dirname, '..', './cpp/whisper.cpp/models'))

			let anyModelExist = []

			MODELS.forEach(model => {
				if (fs.existsSync(path.join(__dirname, '..', `./cpp/whisper.cpp/models/${model}`))) {
					anyModelExist.push(model)
					// console.log('anyModelExist found', model)
				}
			})

			return new Promise((resolve, reject) => {
				if (anyModelExist.length > 0) {
					if (verbose) {
						console.log('[Nodejs-whisper] Models already exist. Skipping download.')
					}

					resolve('Models already exist. Skipping download.')

					// console.log('Models already exist. Skipping download.')
				} else {
					console.log(`[Nodejs-whisper] Autodownload Model: ${autoDownloadModelName}\n`)

					let scriptPath = './download-ggml-model.sh'

					if (process.platform === 'win32') scriptPath = 'download-ggml-model.cmd'

					shell.chmod('+x', scriptPath)
					shell.exec(`${scriptPath} ${autoDownloadModelName}`)

					console.log('[Nodejs-whisper] Attempting to compile model...\n')

					shell.cd('../')

					shell.exec('make')

					resolve('Model Downloaded Successfully')
				}
			})
		}
	} catch (error) {
		console.log('[Nodejs-whisper] Error Caught in downloadModel\n')
		console.log(error)
		shell.cd(projectDir)
		return error
	}
}
