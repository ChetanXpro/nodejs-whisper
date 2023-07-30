import path from 'path'
import shell from 'shelljs'
import readlineSync from 'readline-sync'
import { MODELS_LIST, DEFAULT_MODEL, MODELS } from './constants'
import fs from 'fs'

const askForModel = async (): Promise<string> => {
	const answer = await readlineSync.question(
		`\nEnter model name (e.g. 'tiny.en') or 'cancel' to exit\n(ENTER for tiny.en): `
	)

	if (answer === 'cancel') {
		console.log('Exiting model downloader.')
		process.exit(0)
	}
	// user presses enter
	else if (answer === '') {
		console.log('[whisper-node] Going with', DEFAULT_MODEL)
		return DEFAULT_MODEL
	} else if (!MODELS_LIST.includes(answer)) {
		console.log('\nFAIL: Name not found. Check your spelling OR quit wizard and use custom model.')

		// re-ask question
		return await askForModel()
	}

	return answer
}

export default async function downloadModel() {
	try {
		// process.chdir(path.join(__dirname, './cpp/whisper.cpp/models'))

		shell.cd(path.join(__dirname, './cpp/whisper.cpp/models'))
		// console.log()

		let anyModelExist = []

		MODELS.forEach(model => {
			if (!fs.existsSync(path.join(__dirname, `./cpp/whisper.cpp/models/${model}`))) {
			} else {
				console.log('Exist', path.join(__dirname, `./cpp/whisper.cpp/models/${model}`))

				anyModelExist.push(model)
			}
		})

		if (anyModelExist.length > 0) {
			return
			// console.log('Models already exist. Skipping download.')
		} else {
			console.log('Models do not exist. Downloading...')
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
			throw 'Downloader not found.'
		}

		const modelName = await askForModel()

		let scriptPath = './download-ggml-model.sh'
		// windows .cmd version
		if (process.platform === 'win32') scriptPath = 'download-ggml-model.cmd'

		// todo: check if windows or unix to run bat command or .sh command
		shell.chmod('+x', scriptPath)
		shell.exec(`${scriptPath} ${modelName}`)

		console.log('Attempting to compile model...')

		shell.cd('../')

		shell.exec('make')

		process.exit(0)
	} catch (error) {
		console.log('ERROR Caught in downloadModel')
		console.log(error)
		return error
	}
}
