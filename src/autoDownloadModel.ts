import path from 'path'
import fs from 'fs'
import { isModelName, LEGACY_MODEL_FILES, MODEL_OBJECT, WHISPER_CPP_PATH } from './constants'
import { Logger } from './types'
import { downloadModelFile, isGgmlModel } from './download'

export default async function autoDownloadModel(
	logger: Logger = console,
	modelName?: string,
	_withCuda = false,
	modelRootPath?: string
) {
	if (!isModelName(modelName)) throw new Error('[Nodejs-whisper] Error: Provide a valid model name')
	const directory = modelRootPath ? path.resolve(modelRootPath) : path.join(WHISPER_CPP_PATH, 'models')
	const filenames = [MODEL_OBJECT[modelName], ...(LEGACY_MODEL_FILES[modelName] || [])]
	await fs.promises.mkdir(directory, { recursive: true })
	if (filenames.some(name => isGgmlModel(path.join(directory, name)))) {
		logger.debug(`[Nodejs-whisper] ${modelName} already exists. Skipping download.`)
		return 'Models already exist. Skipping download.'
	}
	const destination = path.join(directory, MODEL_OBJECT[modelName])
	if (fs.existsSync(destination)) throw new Error(`Existing model is invalid: ${destination}`)
	const repository = modelName === 'small.en-tdrz' ? 'akashmjn/tinydiarize-whisper.cpp' : 'ggerganov/whisper.cpp'
	logger.debug(`[Nodejs-whisper] Downloading model: ${modelName}`)
	await downloadModelFile(`https://huggingface.co/${repository}/resolve/main/${MODEL_OBJECT[modelName]}`, destination)
	return 'Model downloaded successfully'
}
