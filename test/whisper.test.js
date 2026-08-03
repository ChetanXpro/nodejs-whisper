const assert = require('node:assert/strict')
const test = require('node:test')

const { whisperShell } = require('../src/whisper')

const quoteArgument = value => `"${value.replace(/"/g, '\\"')}"`

test('whisperShell streams child output through the logger without leaking to the parent process', async () => {
	const stdoutChunks = ['logger-routing-stdout-1', 'logger-routing-stdout-2']
	const stderrChunk = 'logger-routing-stderr'
	const childScript = [
		`process.stdout.write('${stdoutChunks[0]}')`,
		`setTimeout(() => {`,
		`process.stderr.write('${stderrChunk}')`,
		`process.stdout.write('${stdoutChunks[1]}')`,
		`}, 50)`,
	].join(';')
	const encodedScript = Buffer.from(childScript).toString('base64')
	const command = `${quoteArgument(process.execPath)} -e "eval(Buffer.from('${encodedScript}','base64').toString())"`

	const loggerEvents = []
	const leakedOutput = []
	let commandCompleted = false
	const logger = {
		debug: (...args) => loggerEvents.push({ level: 'debug', args, commandCompleted }),
		error: (...args) => loggerEvents.push({ level: 'error', args, commandCompleted }),
		log: (...args) => loggerEvents.push({ level: 'log', args, commandCompleted }),
	}

	const originalStdoutWrite = process.stdout.write
	const originalStderrWrite = process.stderr.write
	process.stdout.write = function (chunk, ...args) {
		const text = chunk.toString()
		if (stdoutChunks.some(marker => text.includes(marker))) {
			leakedOutput.push({ stream: 'stdout', text })
			return true
		}
		return originalStdoutWrite.call(this, chunk, ...args)
	}
	process.stderr.write = function (chunk, ...args) {
		const text = chunk.toString()
		if (text.includes(stderrChunk)) {
			leakedOutput.push({ stream: 'stderr', text })
			return true
		}
		return originalStderrWrite.call(this, chunk, ...args)
	}

	let transcript
	try {
		transcript = await whisperShell(command, undefined, logger)
		commandCompleted = true
	} finally {
		process.stdout.write = originalStdoutWrite
		process.stderr.write = originalStderrWrite
	}

	assert.equal(transcript, stdoutChunks.join(''))
	assert.deepEqual(leakedOutput, [])

	const childOutputEvents = loggerEvents.filter(event => [...stdoutChunks, stderrChunk].includes(event.args[0]))
	assert.deepEqual(
		childOutputEvents.filter(event => event.level === 'log').map(event => event.args[0]),
		stdoutChunks
	)
	assert.deepEqual(
		childOutputEvents.filter(event => event.level === 'debug').map(event => event.args[0]),
		[stderrChunk]
	)
	assert.ok(childOutputEvents.every(event => event.commandCompleted === false))
})

test('whisperShell rejects failed commands while preserving diagnostic output', async () => {
	const stderrMessage = 'intentional-whisper-failure'
	const encodedScript = Buffer.from(`process.stderr.write('${stderrMessage}'); process.exit(7)`).toString('base64')
	const command = `${quoteArgument(process.execPath)} -e "eval(Buffer.from('${encodedScript}','base64').toString())"`
	const events = []
	const logger = {
		debug: (...args) => events.push(['debug', ...args]),
		error: (...args) => events.push(['error', ...args]),
		log: (...args) => events.push(['log', ...args]),
	}

	await assert.rejects(() => whisperShell(command, undefined, logger), new RegExp(stderrMessage))
	assert.ok(events.some(([level, message]) => level === 'debug' && message === stderrMessage))
	assert.ok(
		events.some(
			([level, message, detail]) =>
				level === 'error' && message === '[Nodejs-whisper] Error:' && detail.includes(stderrMessage)
		)
	)
})
