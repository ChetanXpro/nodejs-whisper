import { checkSignal } from './control'

export interface PoolOptions {
	maxConcurrency: number
	maxQueue: number
	idleTimeoutMs: number
	queueTimeoutMs: number
}

export class WhisperRuntimeError extends Error {
	constructor(
		public readonly code: string,
		message: string
	) {
		super(message)
		this.name = 'WhisperRuntimeError'
	}
}

interface Slot<Resource> {
	resource: Resource
	key: string
	busy: boolean
	timer?: NodeJS.Timeout
	closing?: Promise<void>
}

interface Job<Resource> {
	key: string
	lock: string
	run: (resource: Resource) => Promise<() => void>
	reject: (error: unknown) => void
	timer?: NodeJS.Timeout
	unsubscribe?: () => void
}

/** Bounds the whole request, including downloads, conversion and file exports. */
export class TaskPool<Resource> {
	private slots: Slot<Resource>[] = []
	private queue: Job<Resource>[] = []
	private locks = new Set<string>()
	private closing = false
	private closePromise?: Promise<void>
	private idleWaiters: Array<() => void> = []

	constructor(
		readonly options: PoolOptions,
		private create: () => Resource,
		private destroy: (resource: Resource) => Promise<void>
	) {}

	get status() {
		return {
			active: this.slots.filter(s => s.busy).length,
			queued: this.queue.length,
			closing: this.closing,
			maxConcurrency: this.options.maxConcurrency,
			maxQueue: this.options.maxQueue,
		}
	}

	get resources(): Resource[] {
		return this.slots.map(s => s.resource)
	}

	run<T>(key: string, lock: string, run: (resource: Resource) => Promise<T>, signal?: AbortSignal): Promise<T> {
		try {
			checkSignal(signal)
		} catch (error) {
			return Promise.reject(error)
		}
		if (this.closing)
			return Promise.reject(new WhisperRuntimeError('ERR_WHISPER_CLOSING', 'Whisper is shutting down'))
		const canStart =
			!this.locks.has(lock) &&
			!this.queue.some(job => !this.locks.has(job.lock)) &&
			(this.slots.length < this.options.maxConcurrency || this.slots.some(s => !s.busy && !s.closing))
		if (!canStart && this.queue.length >= this.options.maxQueue) {
			return Promise.reject(new WhisperRuntimeError('ERR_WHISPER_QUEUE_FULL', 'Whisper request queue is full'))
		}
		return new Promise<T>((resolve, reject) => {
			const job: Job<Resource> = {
				key,
				lock,
				run: async resource => {
					checkSignal(signal)
					const value = await run(resource)
					// Preserve this request's result type until the pool releases its slot.
					return () => resolve(value)
				},
				reject,
			}
			const rejectQueued = (error: unknown) => {
				const index = this.queue.indexOf(job)
				if (index < 0) return // Active work owns cancellation until its resources are safe to reuse.
				this.queue.splice(index, 1)
				clearTimeout(job.timer)
				job.unsubscribe?.()
				reject(error)
				this.drain()
				this.notifyIdle()
			}
			const cancel = () => rejectQueued(signal!.reason)
			job.unsubscribe = () => signal?.removeEventListener('abort', cancel)
			signal?.addEventListener('abort', cancel, { once: true })
			this.queue.push(job)
			this.drain()
			if (this.queue.includes(job) && this.options.queueTimeoutMs > 0) {
				job.timer = setTimeout(() => {
					rejectQueued(
						new WhisperRuntimeError('ERR_WHISPER_QUEUE_TIMEOUT', 'Timed out waiting for a Whisper worker')
					)
				}, this.options.queueTimeoutMs)
			}
		})
	}

	private drain() {
		while (this.queue.length) {
			// Oldest eligible request first. A file being written by another request
			// does not prevent unrelated files from using an available worker.
			const index = this.queue.findIndex(job => !this.locks.has(job.lock))
			if (index < 0) break
			const job = this.queue[index]
			let slot =
				this.slots.find(s => !s.busy && !s.closing && s.key === job.key) ||
				this.slots.find(s => !s.busy && !s.closing)
			if (!slot && this.slots.length < this.options.maxConcurrency) {
				slot = { resource: this.create(), key: job.key, busy: false }
				this.slots.push(slot)
			}
			if (!slot) break
			this.queue.splice(index, 1)
			job.unsubscribe?.()
			clearTimeout(job.timer)
			clearTimeout(slot.timer)
			slot.key = job.key
			slot.busy = true
			this.locks.add(job.lock)
			const current = slot
			Promise.resolve()
				.then(() => job.run(current.resource))
				.then(
					resolve => {
						this.finish(current, job)
						resolve()
					},
					error => {
						this.finish(current, job)
						job.reject(error)
					}
				)
		}
	}

	private finish(slot: Slot<Resource>, job: Job<Resource>) {
		slot.busy = false
		this.locks.delete(job.lock)
		this.drain()
		if (!slot.busy && !this.closing && this.options.idleTimeoutMs > 0) {
			slot.timer = setTimeout(() => {
				void this.retire(slot)
			}, this.options.idleTimeoutMs)
			slot.timer.unref()
		}
		this.notifyIdle()
	}

	private retire(slot: Slot<Resource>): Promise<void> {
		if (slot.closing) return slot.closing
		clearTimeout(slot.timer)
		slot.closing = this.destroy(slot.resource).finally(() => {
			const index = this.slots.indexOf(slot)
			if (index >= 0) this.slots.splice(index, 1)
			this.drain()
			this.notifyIdle()
		})
		return slot.closing
	}

	private notifyIdle() {
		if (this.queue.length || this.slots.some(s => s.busy)) return
		for (const resolve of this.idleWaiters.splice(0)) resolve()
	}

	/** Stop accepting work, finish accepted requests, then release every context. */
	close(): Promise<void> {
		if (this.closePromise) return this.closePromise
		this.closing = true
		this.closePromise = (async () => {
			if (this.queue.length || this.slots.some(s => s.busy)) {
				await new Promise<void>(resolve => this.idleWaiters.push(resolve))
			}
			await Promise.all(this.slots.map(slot => this.retire(slot)))
		})()
		return this.closePromise
	}
}
