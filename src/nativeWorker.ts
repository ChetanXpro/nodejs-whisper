import { parentPort, workerData } from 'worker_threads'
import { readWav } from './audio'
import { formatSegment, NativeResult, Segment } from './output'
import { WhisperOptions } from './types'

type WorkerRequest =
	| { type: 'close' }
	| {
			type: 'transcribe'
			filePath: string
			options: WhisperOptions
			cancellation: Int32Array
			includeTokens: boolean
	  }

const port = parentPort!
let addon: any
let context: any
let unavailable: string | undefined
try {
	addon = require(workerData.addonPath)
	if (addon.apiVersion !== 2) throw new Error('Native addon is outdated; rebuild with npm run build:native')
	if (workerData.withCuda && !addon.cuda) throw new Error('The installed native addon has no CUDA support')
} catch (error) {
	unavailable = error instanceof Error ? error.message : String(error)
}

const flushLogs = () => {
	const message = addon?.takeLogs()
	if (message) port.postMessage({ type: 'debug', message })
}

port.on('message', (message: WorkerRequest) => {
	if (message.type === 'close') {
		context?.close()
		port.close()
		return
	}
	if (unavailable) {
		port.postMessage({ type: 'error', code: 'ERR_WHISPER_NATIVE_UNAVAILABLE', message: unavailable })
		return
	}
	try {
		const checkCancelled = () => {
			if (Atomics.load(message.cancellation, 0)) throw new Error('Transcription aborted')
		}
		checkCancelled()
		// Decode before loading a model so bad inputs cannot cause a large allocation.
		const audio = readWav(message.filePath)
		checkCancelled()
		if (!context) {
			context = new addon.Context(workerData.modelPath, workerData.useGpu)
			flushLogs()
		}
		checkCancelled()
		let firstSegment = true
		const result: NativeResult = context.transcribe(
			audio,
			{ ...message.options, includeTokens: message.includeTokens },
			(segment: Segment) => {
				port.postMessage({ type: 'segment', segment })
				port.postMessage({ type: 'info', message: (firstSegment ? '\n' : '') + formatSegment(segment) })
				firstSegment = false
			},
			(progress: number) => port.postMessage({ type: 'progress', progress }),
			message.cancellation
		)
		checkCancelled()
		flushLogs()
		port.postMessage({ type: 'result', result })
	} catch (error) {
		flushLogs()
		// Discard potentially damaged inference state before the next request.
		context?.close()
		context = undefined
		port.postMessage({
			type: 'error',
			code: 'ERR_WHISPER_NATIVE',
			message: error instanceof Error ? error.message : String(error),
		})
	}
})
