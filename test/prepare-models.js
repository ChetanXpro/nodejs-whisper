const { setTimeout: delay } = require('node:timers/promises')
const autoDownloadModel = require('../src/autoDownloadModel').default
const autoDownloadVadModel = require('../src/autoDownloadVadModel').default

async function prepare(name, download) {
	for (let attempt = 1; attempt <= 3; attempt++) {
		const started = Date.now()
		console.info(`[test models] Preparing ${name} (attempt ${attempt}/3)`)
		try {
			await download()
			console.info(`[test models] ${name} ready in ${((Date.now() - started) / 1000).toFixed(1)}s`)
			return
		} catch (error) {
			console.error(`[test models] ${name}: ${error.message}`)
			if (attempt === 3) throw error
			await delay(2000)
		}
	}
}

async function main() {
	await prepare('tiny.en', () => autoDownloadModel(console, 'tiny.en'))
	await prepare('silero-v6.2.0', () => autoDownloadVadModel(console, 'silero-v6.2.0'))
}

main().catch(error => {
	console.error(error)
	process.exitCode = 1
})
