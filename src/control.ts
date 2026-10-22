import { TranscriptionControls, TranscriptionSegment } from './types'

export function abortError(reason?: unknown): Error & { code: string } {
	const error = Object.assign(new Error('Transcription aborted'), { name: 'AbortError', code: 'ABORT_ERR' })
	if (reason !== undefined) Object.defineProperty(error, 'cause', { value: reason, configurable: true })
	return error
}

export function checkSignal(signal?: AbortSignal): void {
	if (signal?.aborted) throw signal.reason instanceof Error ? signal.reason : abortError(signal.reason)
}

/** Own callback failures and cancellation on the main thread, never inside whisper.cpp. */
export class RequestControl {
	private controller = new AbortController()
	private lastProgress = -1
	private onAbort = () => this.fail(abortError(this.options.signal?.reason))
	readonly signal = this.controller.signal

	constructor(private options: TranscriptionControls) {
		for (const key of ['onProgress', 'onSegment'] as const) {
			if (options[key] !== undefined && typeof options[key] !== 'function') {
				throw new TypeError(`${key} must be a function`)
			}
		}
		if (options.signal !== undefined && !(options.signal instanceof AbortSignal)) {
			throw new TypeError('signal must be an AbortSignal')
		}
		if (options.signal?.aborted) this.onAbort()
		else options.signal?.addEventListener('abort', this.onAbort, { once: true })
	}

	check() {
		checkSignal(this.signal)
	}

	fail(error: unknown) {
		if (!this.signal.aborted) this.controller.abort(error instanceof Error ? error : new Error(String(error)))
	}

	progress(value: number) {
		if (!Number.isFinite(value)) return
		const progress = Math.max(0, Math.min(1, value))
		if (progress <= this.lastProgress) return
		this.lastProgress = progress
		this.emit(this.options.onProgress, progress)
	}

	segment(segment: Pick<TranscriptionSegment, 'text' | 'start' | 'end'>) {
		this.emit(this.options.onSegment, { text: segment.text, start: segment.start, end: segment.end })
	}

	private emit<T>(callback: ((value: T) => void) | undefined, value: T) {
		if (this.signal.aborted || !callback) return
		try {
			const returned: unknown = callback(value)
			if (returned && typeof (returned as PromiseLike<unknown>).then === 'function') {
				// Observe rejected promises too, so a mistaken async callback cannot crash the process.
				void Promise.resolve(returned).catch(() => {})
				throw new TypeError('Transcription callbacks must be synchronous')
			}
		} catch (error) {
			this.fail(error)
		}
	}

	dispose() {
		this.options.signal?.removeEventListener('abort', this.onAbort)
	}
}
