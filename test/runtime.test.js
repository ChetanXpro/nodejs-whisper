const assert = require('node:assert/strict')
const test = require('node:test')
const { setTimeout: delay } = require('node:timers/promises')
const { TaskPool } = require('../src/taskPool')
const { configureWhisper, disposeWhisper, getWhisperStatus } = require('../src/runtime')

function deferred() {
	let resolve
	const promise = new Promise(r => {
		resolve = r
	})
	return { promise, resolve }
}
function fixture(overrides = {}) {
	let created = 0
	const destroyed = []
	const pool = new TaskPool(
		{ maxConcurrency: 1, maxQueue: 2, idleTimeoutMs: 0, queueTimeoutMs: 0, ...overrides },
		() => ({ id: ++created }),
		async resource => {
			destroyed.push(resource.id)
		}
	)
	return { pool, destroyed, created: () => created }
}

test('bounds active work, rejects overflow, and runs queued work in order after a failure', async () => {
	const { pool, destroyed } = fixture()
	const gate = deferred()
	const events = []
	const first = pool.run('model', 'one', async resource => {
		events.push(['first', resource.id])
		await gate.promise
		throw new Error('inference failed')
	})
	const failed = assert.rejects(first, /inference failed/)
	const second = pool.run('model', 'two', async resource => {
		events.push(['second', resource.id])
		return 2
	})
	const third = pool.run('model', 'three', async resource => {
		events.push(['third', resource.id])
		return 3
	})
	await assert.rejects(
		pool.run('model', 'four', async () => 4),
		{ code: 'ERR_WHISPER_QUEUE_FULL' }
	)
	assert.equal(pool.status.active, 1)
	assert.equal(pool.status.queued, 2)
	gate.resolve()
	await failed
	assert.deepEqual(await Promise.all([second, third]), [2, 3])
	assert.deepEqual(events, [
		['first', 1],
		['second', 1],
		['third', 1],
	])
	await pool.close()
	assert.deepEqual(destroyed, [1])
})

test('permits concurrent unrelated files but serializes writes to the same output', async () => {
	const { pool, created } = fixture({ maxConcurrency: 2, maxQueue: 1 })
	const gate = deferred()
	const events = []
	const first = pool.run('model', 'same.wav', async () => {
		events.push('first')
		await gate.promise
	})
	const second = pool.run('model', 'same.wav', async () => {
		events.push('second')
	})
	const other = pool.run('model', 'other.wav', async () => {
		events.push('other')
	})
	await other
	assert.deepEqual(events, ['first', 'other'])
	assert.equal(created(), 2)
	gate.resolve()
	await Promise.all([first, second])
	assert.deepEqual(events, ['first', 'other', 'second'])
	await pool.close()
})

test('queue timeout removes a job without executing it or preventing later work', async () => {
	const { pool } = fixture({ queueTimeoutMs: 20 })
	const gate = deferred()
	const first = pool.run('model', 'first', () => gate.promise)
	let ran = false
	await assert.rejects(
		pool.run('model', 'second', async () => {
			ran = true
		}),
		{ code: 'ERR_WHISPER_QUEUE_TIMEOUT' }
	)
	assert.equal(pool.status.queued, 0)
	gate.resolve()
	await first
	assert.equal(ran, false)
	assert.equal(await pool.run('model', 'third', async () => 3), 3)
	await pool.close()
})

test('shutdown drains accepted work, rejects new work and closes each resource once', async () => {
	const { pool, destroyed } = fixture()
	const gate = deferred()
	const first = pool.run('model', 'first', () => gate.promise)
	const second = pool.run('model', 'second', async () => 'done')
	const closed = pool.close()
	assert.equal(pool.close(), closed)
	await assert.rejects(
		pool.run('model', 'late', async () => {}),
		{ code: 'ERR_WHISPER_CLOSING' }
	)
	assert.deepEqual(destroyed, [])
	gate.resolve()
	await Promise.all([first, second, closed])
	assert.deepEqual(destroyed, [1])
})

test('idle expiration frees resources, and later work recreates them', async () => {
	const { pool, destroyed } = fixture({ idleTimeoutMs: 10 })
	await pool.run('model', 'first', async resource => resource.id)
	await delay(30)
	assert.deepEqual(destroyed, [1])
	assert.equal(await pool.run('model', 'second', async resource => resource.id), 2)
	await pool.close()
	assert.deepEqual(destroyed, [1, 2])
})

test('retiring resources count toward the limit until cleanup has completed', async () => {
	const gate = deferred()
	let created = 0
	const pool = new TaskPool(
		{ maxConcurrency: 1, maxQueue: 2, idleTimeoutMs: 5, queueTimeoutMs: 0 },
		() => ++created,
		() => gate.promise
	)
	await pool.run('one', 'first', async resource => resource)
	await delay(20)
	const next = pool.run('two', 'second', async resource => resource)
	assert.equal(created, 1)
	assert.equal(pool.status.queued, 1)
	gate.resolve()
	assert.equal(await next, 2)
	await pool.close()
})

test('zero queue capacity accepts immediate work and rejects waiting work', async () => {
	const { pool } = fixture({ maxQueue: 0 })
	const gate = deferred()
	const first = pool.run('model', 'first', () => gate.promise)
	await assert.rejects(
		pool.run('model', 'second', async () => {}),
		{ code: 'ERR_WHISPER_QUEUE_FULL' }
	)
	gate.resolve()
	await first
	await pool.close()
})

test('configuration validates limits and disposal leaves a reusable runtime', async () => {
	for (const options of [
		{ maxConcurrency: 0 },
		{ maxQueue: -1 },
		{ threadsPerWorker: 0 },
		{ idleTimeoutMs: Infinity },
		{ queueTimeoutMs: 1.5 },
		{ backend: 'invalid' },
	]) {
		await assert.rejects(configureWhisper(options))
	}
	await configureWhisper({ maxConcurrency: 2, maxQueue: 10, threadsPerWorker: 1 })
	assert.equal(getWhisperStatus().maxConcurrency, 2)
	await disposeWhisper()
	assert.equal(getWhisperStatus().closing, false)
	await configureWhisper({})
})

test('aborting a queued request frees capacity immediately, including during shutdown', async () => {
	const { pool } = fixture({ maxQueue: 1 })
	const gate = deferred()
	const first = pool.run('model', 'first', () => gate.promise)
	const controller = new AbortController()
	let ran = false
	const queued = pool.run(
		'model',
		'second',
		async () => {
			ran = true
		},
		controller.signal
	)
	const cancelled = assert.rejects(queued, { name: 'AbortError' })
	assert.equal(pool.status.queued, 1)
	controller.abort()
	assert.equal(pool.status.queued, 0)
	const next = pool.run('model', 'third', async () => 3)
	const closed = pool.close()
	gate.resolve()
	await cancelled
	assert.equal(await next, 3)
	await Promise.all([first, closed])
	assert.equal(ran, false)
})
