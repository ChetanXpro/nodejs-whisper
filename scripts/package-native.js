const fs = require('node:fs')
const path = require('node:path')
const platform = require('./native-platform')
const variant = process.argv.includes('--cuda') ? 'cuda' : 'default'
const root = path.resolve(__dirname, '..')
const directory = path.join(root, 'prebuilds', platform, variant)
fs.mkdirSync(directory, { recursive: true })
fs.copyFileSync(
	path.join(root, 'build', variant, 'Release', 'nodejs_whisper.node'),
	path.join(directory, 'nodejs_whisper.node')
)
console.log(`Prepared prebuilds/${platform}/${variant}/nodejs_whisper.node`)
