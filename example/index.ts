import path from 'node:path'
import { nodewhisper } from '../src/index'

// Copied from https://www.wavsource.com/people/famous.htm
const AUDIO_FILE = 'mother_teresa.wav'

// Need to provide exact path to your audio file.
const filePath = path.resolve(__dirname, AUDIO_FILE)

async function convert() {
	try {
		await nodewhisper(filePath, {
			modelName: 'tiny.en',
			autoDownloadModelName: 'tiny.en',
			whisperOptions: {
				outputInVtt: true,
				// Default is 20 which is too long
				timestamps_length: 14,
			},
		})
	} catch (exc) {
		console.error(exc)
		process.exit(1)
	}
}

void convert()
