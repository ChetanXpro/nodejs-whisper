import os from 'os'
import { NativeWorker } from './native'
import { TaskPool, WhisperRuntimeError } from './taskPool'
import { WhisperRuntimeOptions } from './types'

export class ExecutionSlot {
	worker?: NativeWorker
	key?: string
	async native(key: string, addonPath: string, modelPath: string, useGpu: boolean, withCuda: boolean) {
		if (this.key !== key || !this.worker?.alive) {
			await this.close()
			this.worker = new NativeWorker(addonPath, modelPath, useGpu, withCuda)
			this.key = key
		}
		return this.worker
	}
	async close() {
		const worker = this.worker
		this.worker = undefined
		this.key = undefined
		await worker?.close()
	}
}

function settings(options: WhisperRuntimeOptions): Required<WhisperRuntimeOptions> {
	const maxConcurrency = options.maxConcurrency ?? 1
	const config = {
		maxConcurrency,
		maxQueue: options.maxQueue ?? 100,
		idleTimeoutMs: options.idleTimeoutMs ?? 60_000,
		queueTimeoutMs: options.queueTimeoutMs ?? 0,
		threadsPerWorker:
			options.threadsPerWorker ?? Math.max(1, Math.min(4, Math.floor(os.cpus().length / maxConcurrency))),
		backend: options.backend ?? 'auto',
	}
	for (const key of ['maxConcurrency', 'maxQueue', 'idleTimeoutMs', 'queueTimeoutMs', 'threadsPerWorker'] as const) {
		const min = key === 'maxConcurrency' || key === 'threadsPerWorker' ? 1 : 0
		if (!Number.isSafeInteger(config[key]) || config[key] < min || config[key] > 2147483647) {
			throw new RangeError(`${key} must be an integer between ${min} and 2147483647`)
		}
	}
	if (!['auto', 'native', 'cli'].includes(config.backend)) throw new Error('backend must be auto, native or cli')
	return config
}

let config = settings({})
const createPool = () =>
	new TaskPool(
		config,
		() => new ExecutionSlot(),
		slot => slot.close()
	)
let pool = createPool()
let disposing: Promise<void> | undefined
let configuring = false

export function runWhisperTask<T>(
	key: string,
	lock: string,
	task: (slot: ExecutionSlot, config: Required<WhisperRuntimeOptions>) => Promise<T>
) {
	const current = config
	return pool.run(key, lock, slot => task(slot, current))
}

/** Configure before starting work, or after all requests have completed. */
export async function configureWhisper(options: WhisperRuntimeOptions): Promise<void> {
	const next = settings(options)
	if (configuring || disposing || pool.status.active || pool.status.queued) {
		throw new WhisperRuntimeError(
			'ERR_WHISPER_BUSY',
			'Wait for pending requests and disposal before configuring Whisper'
		)
	}
	configuring = true
	try {
		await pool.close()
		config = next
		pool = createPool()
	} finally {
		configuring = false
	}
}

/** Drain accepted requests and release models. Later calls create fresh workers. */
export function disposeWhisper(): Promise<void> {
	if (configuring) return Promise.reject(new WhisperRuntimeError('ERR_WHISPER_BUSY', 'Whisper is being configured'))
	if (!disposing) {
		disposing = pool
			.close()
			.then(() => {
				pool = createPool()
			})
			.finally(() => {
				disposing = undefined
			})
	}
	return disposing
}

export function getWhisperStatus() {
	return {
		...pool.status,
		workers: pool.resources.filter(slot => slot.worker?.alive).length,
		backend: config.backend,
		threadsPerWorker: config.threadsPerWorker,
	}
}
