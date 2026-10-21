const assert = require('node:assert/strict')
const test = require('node:test')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const https = require('node:https')
const { PassThrough } = require('node:stream')
const { EventEmitter } = require('node:events')
const { downloadModelFile } = require('../src/download')

test('concurrent downloads share one transfer and publish only a complete model; failures can retry', async t => {
	const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'whisper-download-'))
	const saved = https.get
	t.after(async () => {
		https.get = saved
		await fs.rm(directory, { recursive: true, force: true })
	})
	let requests = 0,
		fail = false
	https.get = (_url, callback) => {
		requests++
		const response = new PassThrough()
		response.statusCode = 200
		response.headers = {}
		const request = new EventEmitter()
		request.setTimeout = () => request
		process.nextTick(() => {
			callback(response)
			process.nextTick(() =>
				fail
					? response.destroy(new Error('network interrupted'))
					: response.end(Buffer.from([0x6c, 0x6d, 0x67, 0x67, 1, 2, 3, 4]))
			)
		})
		return request
	}
	const target = path.join(directory, 'model.bin')
	const first = downloadModelFile('https://example.test/model', target)
	const second = downloadModelFile('https://example.test/model', target)
	assert.equal(first, second)
	await Promise.all([first, second])
	assert.equal(requests, 1)
	assert.equal((await fs.stat(target)).size, 8)
	const retry = path.join(directory, 'retry.bin')
	fail = true
	await assert.rejects(downloadModelFile('https://example.test/retry', retry), /network interrupted/)
	assert.deepEqual(await fs.readdir(directory), ['model.bin'])
	fail = false
	await downloadModelFile('https://example.test/retry', retry)
	assert.equal(requests, 3)
	assert.equal((await fs.stat(retry)).size, 8)
})
