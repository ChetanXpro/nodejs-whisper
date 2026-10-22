import path from 'node:path'
import { disposeWhisper, transcribeDetailed } from '../src'

async function main() {
	const controller = new AbortController()
	const cancel = () => controller.abort()
	process.once('SIGINT', cancel)
	try {
		const result = await transcribeDetailed(path.resolve(__dirname, 'mother_teresa.wav'), {
			modelName: 'tiny.en',
			autoDownloadModelName: 'tiny.en',
			includeTokens: true,
			signal: controller.signal,
			logger: { info() {}, debug() {}, error: console.error },
			onProgress: progress => console.info(`Progress: ${Math.round(progress * 100)}%`),
			onSegment: segment => console.info(`[${segment.start}-${segment.end}ms] ${segment.text}`),
		})
		console.info(JSON.stringify(result, null, 2))
	} catch (error) {
		if (error instanceof Error && error.name === 'AbortError') console.info('Cancelled')
		else throw error
	} finally {
		process.removeListener('SIGINT', cancel)
		await disposeWhisper()
	}
}

void main().catch(error => {
	console.error(error)
	process.exitCode = 1
})
