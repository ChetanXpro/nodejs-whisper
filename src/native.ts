import fs from 'fs'
import path from 'path'
import { Worker } from 'worker_threads'
import { Logger, WhisperOptions } from './types'
import { NativeResult, Segment } from './output'
import { WhisperRuntimeError } from './taskPool'
import { LeveledLogger, normalizeLogger } from './logger'
import { RequestControl } from './control'

const nativePlatform: string = require('../scripts/native-platform')

type WorkerMessage =
	| { type: 'info' | 'debug'; message: string }
	| { type: 'error'; code: string; message: string }
	| { type: 'result'; result: NativeResult }
	| { type: 'segment'; segment: Segment }
	| { type: 'progress'; progress: number }

export function findNativeAddon(withCuda = false): string | undefined {
	const root = path.join(__dirname, '..')
	const variant = withCuda ? 'cuda' : 'default'
	// Local builds take precedence over portable release artifacts.
	return [
		path.join(root, 'build', variant, 'Release', 'nodejs_whisper.node'),
		path.join(root, 'prebuilds', nativePlatform, variant, 'nodejs_whisper.node'),
	].find(file => fs.existsSync(file))
}

export class NativeWorker {
	private worker: Worker
	private pending?: {
		resolve: (value: NativeResult) => void
		reject: (error: Error) => void
		logger: LeveledLogger
		control: RequestControl
		unsubscribe: () => void
	}
	private exited: Promise<void>
	private closed = false
	private closePromise?: Promise<void>

	constructor(addonPath: string, modelPath: string, useGpu: boolean, withCuda: boolean) {
		const entry = path.join(__dirname, `nativeWorker${path.extname(__filename)}`)
		// ts-node's CLI installs a loader only in the calling thread. Bootstrap it
		// explicitly for source checkouts; published JS workers need no TS runtime.
		const source = path.extname(entry) === '.ts'
		const workerEntry = source
			? `require(${JSON.stringify(require.resolve('ts-node/register'))}); require(${JSON.stringify(entry)});`
			: entry
		// Native diagnostics travel as messages. Attaching readers to explicit
		// worker stdio streams would keep their internal MessagePort referenced.
		this.worker = new Worker(workerEntry, {
			eval: source,
			workerData: { addonPath, modelPath, useGpu, withCuda },
		})
		this.worker.on('message', (message: WorkerMessage) => {
			const pending = this.pending
			if (!pending) return
			if (message.type === 'segment') {
				pending.control.segment(message.segment)
				return
			}
			if (message.type === 'progress') {
				pending.control.progress(Math.min(0.99, message.progress))
				return
			}
			if (message.type === 'info' || message.type === 'debug') {
				try {
					pending.logger[message.type](message.message)
				} catch {
					/* A logger must not strand a worker. */
				}
				return
			}
			this.pending = undefined
			pending.unsubscribe()
			this.worker.unref()
			if (pending.control.signal.aborted) pending.reject(pending.control.signal.reason)
			else if (message.type === 'error') pending.reject(new WhisperRuntimeError(message.code, message.message))
			else if (message.type === 'result') pending.resolve(message.result)
		})
		this.worker.on('error', error => this.fail(error))
		this.exited = new Promise(resolve =>
			this.worker.once('exit', code => {
				this.closed = true
				this.fail(new Error(`Whisper worker exited unexpectedly (code ${code})`))
				resolve()
			})
		)
		this.worker.unref()
	}

	get alive() {
		return !this.closed
	}

	transcribe(
		filePath: string,
		options: WhisperOptions,
		logger: Logger,
		control: RequestControl,
		includeTokens = false
	): Promise<NativeResult> {
		if (this.closed) return Promise.reject(new Error('Whisper worker is closed'))
		if (this.pending) return Promise.reject(new Error('Whisper worker is already busy'))
		return new Promise((resolve, reject) => {
			control.check()
			const cancellation = new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT))
			const cancel = () => Atomics.store(cancellation, 0, 1)
			control.signal.addEventListener('abort', cancel, { once: true })
			this.pending = {
				resolve,
				reject,
				logger: normalizeLogger(logger),
				control,
				unsubscribe: () => control.signal.removeEventListener('abort', cancel),
			}
			this.worker.ref()
			try {
				this.worker.postMessage({ type: 'transcribe', filePath, options, cancellation, includeTokens })
			} catch (error) {
				this.fail(error)
			}
		})
	}

	private fail(error: unknown) {
		const pending = this.pending
		if (pending) {
			pending.unsubscribe()
			const reason = pending.control.signal.aborted ? pending.control.signal.reason : error
			pending.reject(reason instanceof Error ? reason : new Error(String(reason)))
		}
		this.pending = undefined
		this.worker.unref()
	}

	close(): Promise<void> {
		if (!this.closePromise) {
			this.closePromise = (async () => {
				if (!this.closed) {
					this.worker.ref()
					this.worker.postMessage({ type: 'close' })
				}
				await this.exited
			})()
		}
		return this.closePromise
	}
}
