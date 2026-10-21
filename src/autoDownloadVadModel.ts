import fs from 'fs'
import path from 'path'
import { isVadModelName, VAD_MODEL_OBJECT, VadModelName, WHISPER_CPP_PATH } from './constants'
import { Logger } from './types'
import { downloadModelFile, isGgmlModel } from './download'

export default async function autoDownloadVadModel(
	logger: Logger = console,
	modelName: VadModelName,
	modelRootPath?: string
): Promise<string> {
	if (!isVadModelName(modelName)) throw new Error('[Nodejs-whisper] Error: Provide a valid VAD model name')
	const directory = modelRootPath ? path.resolve(modelRootPath) : path.join(WHISPER_CPP_PATH, 'models')
	const modelPath = path.join(directory, VAD_MODEL_OBJECT[modelName])
	await fs.promises.mkdir(directory, { recursive: true })
	if (isGgmlModel(modelPath)) {
		logger.debug(`[Nodejs-whisper] ${modelName} already exists. Skipping download.`)
		return modelPath
	}
	if (fs.existsSync(modelPath)) throw new Error(`[Nodejs-whisper] Existing VAD model is invalid: ${modelPath}`)
	logger.debug(`[Nodejs-whisper] Auto-download VAD model: ${modelName}`)
	await downloadModelFile(
		`https://huggingface.co/ggml-org/whisper-vad/resolve/main/${VAD_MODEL_OBJECT[modelName]}`,
		modelPath
	)
	return modelPath
}
