import fs from 'fs'
import https from 'https'
import { IncomingMessage } from 'http'
import { randomUUID } from 'crypto'
import { pipeline } from 'stream/promises'

const downloads = new Map<string, Promise<void>>()

export function isGgmlModel(filePath: string): boolean {
	if (!fs.existsSync(filePath) || fs.statSync(filePath).size < 4) return false
	const file = fs.openSync(filePath, 'r')
	try {
		const magic = Buffer.alloc(4)
		fs.readSync(file, magic, 0, 4, 0)
		return magic.readUInt32LE(0) === 0x67676d6c
	} finally {
		fs.closeSync(file)
	}
}

/** One download per destination; only complete, validated files become visible. */
export function downloadModelFile(url: string, destination: string): Promise<void> {
	const existing = downloads.get(destination)
	if (existing) return existing
	const downloading = (async () => {
		const temporaryPath = `${destination}.${randomUUID()}.download`
		try {
			const response = await getResponse(url)
			await pipeline(response, fs.createWriteStream(temporaryPath, { flags: 'wx' }))
			if (!isGgmlModel(temporaryPath)) throw new Error('Downloaded file is not a GGML model')
			await fs.promises.rename(temporaryPath, destination)
		} finally {
			await fs.promises.rm(temporaryPath, { force: true })
		}
	})().finally(() => {
		downloads.delete(destination)
	})
	downloads.set(destination, downloading)
	return downloading
}

function getResponse(url: string, redirectsRemaining = 5): Promise<IncomingMessage> {
	return new Promise((resolve, reject) => {
		const request = https.get(url, response => {
			// Cover errors between receiving headers and attaching the file pipeline.
			response.on('error', reject)
			const status = response.statusCode || 0
			if (status >= 300 && status < 400 && response.headers.location) {
				response.resume()
				if (!redirectsRemaining) {
					reject(new Error('Too many download redirects'))
					return
				}
				getResponse(new URL(response.headers.location, url).toString(), redirectsRemaining - 1).then(
					resolve,
					reject
				)
			} else if (status !== 200) {
				response.resume()
				reject(new Error(`Download request returned HTTP ${status}`))
			} else resolve(response)
		})
		request.setTimeout(60_000, () => request.destroy(new Error('Download request timed out')))
		request.on('error', reject)
	})
}
