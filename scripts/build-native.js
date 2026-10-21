#!/usr/bin/env node
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const platform = require('./native-platform')
const optional = process.argv.includes('--optional')
const cuda = process.argv.includes('--cuda') || process.env.NODEJS_WHISPER_CUDA === '1'
const variant = cuda ? 'cuda' : 'default'
const output = path.join(root, 'build', variant)

// Also used by the prebuild workflow. CUDA builds are deliberately separate:
// withCuda must never silently select a CPU-only addon.
async function build() {
	if (process.env.NODEJS_WHISPER_SKIP_NATIVE === '1') return
	const bundled = path.join(root, 'prebuilds', platform, variant, 'nodejs_whisper.node')
	if (optional && fs.existsSync(bundled) && !process.env.NODEJS_WHISPER_CMAKE_ARGS) return
	const { BuildSystem } = require('cmake-js')
	const flags = parseFlags(process.env.NODEJS_WHISPER_CMAKE_ARGS || '')
	const system = new BuildSystem({
		directory: path.join(root, 'native'),
		out: output,
		config: 'Release',
		target: 'nodejs_whisper',
		parallel: Math.min(4, require('node:os').cpus().length || 1),
		cMakeOptions: { ...flags, GGML_CUDA: cuda ? 'ON' : 'OFF' },
	})
	// Reconfigure so changed backend/compiler definitions are not silently ignored.
	await system.configure()
	await system.build()
}

// Accept CMake definitions without evaluating shell syntax.
function parseFlags(input) {
	const tokens = input.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || []
	const flags = {}
	for (const token of tokens) {
		const match = /^-D([^:=]+)(?::[^=]+)?=(.*)$/.exec(token)
		if (!match) throw new Error('NODEJS_WHISPER_CMAKE_ARGS must contain -DNAME=value definitions')
		flags[match[1]] = match[2].replace(/^(?:"(.*)"|'(.*)')$/, (_, double, single) => double ?? single)
	}
	return flags
}

Promise.resolve()
	.then(build)
	.catch(error => {
		console.error(`[nodejs-whisper] Native build failed: ${error.message}`)
		if (optional) {
			console.error('[nodejs-whisper] The CLI backend remains available. Run npm run build:native to retry.')
		} else {
			process.exitCode = 1
		}
	})
