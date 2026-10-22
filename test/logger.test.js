const assert = require('node:assert/strict')
const test = require('node:test')
const { normalizeLogger } = require('../src/logger')

test('prefers info over log without changing the logger or losing its receiver', () => {
	const logger = {
		events: [],
		info(message) {
			this.events.push(['info', message])
		},
		debug(message) {
			this.events.push(['debug', message])
		},
		error(message) {
			this.events.push(['error', message])
		},
		log() {
			assert.fail('info must take precedence over log')
		},
	}
	const originalInfo = logger.info
	const { info, debug, error } = normalizeLogger(logger)
	info('transcript')
	debug('details')
	error('failure')
	assert.deepEqual(logger.events, [
		['info', 'transcript'],
		['debug', 'details'],
		['error', 'failure'],
	])
	assert.equal(logger.info, originalInfo)
})

test('adapts existing log-based loggers without changing them', () => {
	const logger = {
		events: [],
		log(message) {
			this.events.push(message)
		},
		debug() {},
		error() {},
	}
	normalizeLogger(logger).info('transcript')
	assert.deepEqual(logger.events, ['transcript'])
	assert.equal(logger.info, undefined)
})

test('reports invalid logger methods before starting asynchronous work', () => {
	for (const logger of [
		{ debug() {}, error() {} },
		{ info() {}, error() {} },
		{ info() {}, debug() {}, error: 'bad' },
	]) {
		assert.throws(() => normalizeLogger(logger), /logger must provide info \(or log\), debug, and error methods/)
	}
})
