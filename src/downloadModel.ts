import path from 'path'
import shell from 'shelljs'
import readlineSync from 'readline-sync'
import { MODELS_LIST, DEFAULT_MODEL, MODELS } from './constants'
import fs from 'fs'

const askForModel = async (): Promise<string> => {
	const answer = await readlineSync.question(
		`\n[Nodejs-whisper] Enter model name (e.g. 'tiny.en') or 'cancel' to exit\n(ENTER for tiny.en): `
	)

	if (answer === 'cancel') {
		console.log('[Nodejs-whisper] Exiting model downloader.\n')
		process.exit(0)
	}
	// User presses enter
	else if (answer === '') {
		console.log('[Nodejs-whisper] Going with', DEFAULT_MODEL)
		return DEFAULT_MODEL
	} else if (!MODELS_LIST.includes(answer)) {
		console.log(
			'\n[Nodejs-whisper] FAIL: Name not found. Check your spelling OR quit wizard and use custom model.\n'
		)

		return await askForModel()
	}

	return answer
}

export default async function downloadModel() {
	try {
		shell.cd(path.join(__dirname, '..', './cpp/whisper.cpp/models'))

		let anyModelExist = []

		MODELS.forEach(model => {
			if (!fs.existsSync(path.join(__dirname, '..', `./cpp/whisper.cpp/models/${model}`))) {
			} else {
				anyModelExist.push(model)
			}
		})

		if (anyModelExist.length > 0) {
			return
			// console.log('Models already exist. Skipping download.')
		} else {
			console.log('[Nodejs-whisper] Models do not exist. Please Select a model to download.\n')
		}

		console.log(`
| Model     | Disk   | RAM     |
|-----------|--------|---------|
| tiny      |  75 MB | ~390 MB |
| tiny.en   |  75 MB | ~390 MB |
| base      | 142 MB | ~500 MB |
| base.en   | 142 MB | ~500 MB |
| small     | 466 MB | ~1.0 GB |
| small.en  | 466 MB | ~1.0 GB |
| medium    | 1.5 GB | ~2.6 GB |
| medium.en | 1.5 GB | ~2.6 GB |
| large-v1  | 2.9 GB | ~4.7 GB |
| large     | 2.9 GB | ~4.7 GB |
`)

		if (!shell.which('./download-ggml-model.sh')) {
			throw '[Nodejs-whisper] Error: Downloader not found.\n'
		}

		const modelName = await askForModel()

		let scriptPath = './download-ggml-model.sh'
		// windows .cmd version
		if (process.platform === 'win32') scriptPath = 'download-ggml-model.cmd'

		// todo: check if windows or unix to run bat command or .sh command
		shell.chmod('+x', scriptPath)
		shell.exec(`${scriptPath} ${modelName}`)

		console.log('[Nodejs-whisper] Attempting to compile model...\n')

		shell.cd('../')

		shell.exec('make')

		process.exit(0)
	} catch (error) {
		console.log('[Nodejs-whisper] Error Caught in downloadModel\n')
		console.log(error)
		return error
	}
}
