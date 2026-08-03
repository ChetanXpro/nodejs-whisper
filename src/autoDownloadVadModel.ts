import fs from 'fs'
import https from 'https'
import path from 'path'
import { IncomingMessage } from 'http'
import { pipeline } from 'stream'
import { promisify } from 'util'
import { isVadModelName, VAD_MODEL_OBJECT, VadModelName, WHISPER_CPP_PATH } from './constants'
import { Logger } from './types'

const pipelineAsync = promisify(pipeline)
const VAD_MODEL_BASE_URL = 'https://huggingface.co/ggml-org/whisper-vad/resolve/main'

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

	logger.debug(`[Nodejs-whisper] Auto-download VAD model: ${modelName}`)
	const modelUrl = `${VAD_MODEL_BASE_URL}/${VAD_MODEL_OBJECT[modelName]}`

	try {
		await downloadFile(modelUrl, modelPath)
	} catch (error) {
		throw new Error(`[Nodejs-whisper] Failed to download VAD model: ${error.message}`)
	}

	if (!isValidVadModel(modelPath)) {
		fs.unlinkSync(modelPath)
		throw new Error('[Nodejs-whisper] Failed to download VAD model: downloaded file is invalid')
	}

	logger.debug(`[Nodejs-whisper] VAD model downloaded to ${modelPath}`)
	return modelPath
}

async function downloadFile(url: string, destination: string): Promise<void> {
	const temporaryPath = `${destination}.${process.pid}.download`

	try {
		const response = await getResponse(url)
		await pipelineAsync(response, fs.createWriteStream(temporaryPath, { flags: 'wx' }))
		fs.renameSync(temporaryPath, destination)
	} catch (error) {
		if (fs.existsSync(temporaryPath)) {
			fs.unlinkSync(temporaryPath)
		}
		throw error
	}
}

function getResponse(url: string, redirectsRemaining = 5): Promise<IncomingMessage> {
	return new Promise((resolve, reject) => {
		const request = https.get(url, response => {
			const statusCode = response.statusCode || 0
			const redirectUrl = response.headers.location

			if (statusCode >= 300 && statusCode < 400 && redirectUrl) {
				response.resume()
				if (redirectsRemaining === 0) {
					reject(new Error('too many redirects'))
					return
				}
				getResponse(new URL(redirectUrl, url).toString(), redirectsRemaining - 1).then(resolve, reject)
				return
			}

			if (statusCode !== 200) {
				response.resume()
				reject(new Error(`download request returned HTTP ${statusCode}`))
				return
			}

			resolve(response)
		})

		request.setTimeout(60_000, () => request.destroy(new Error('download request timed out')))
		request.on('error', reject)
	})
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
