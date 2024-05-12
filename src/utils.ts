import fs from 'fs'
import path from 'path'
import shell from 'shelljs'

export const checkIfFileExists = (filePath: string) => {
	if (!fs.existsSync(filePath)) {
		throw new Error(`[Nodejs-whisper] Error: No such file: ${filePath}`)
	}
}

export const convertToWavType = async (inputFilePath: string, verbose: boolean) => {
	const fileExtension = path.extname(inputFilePath).toLowerCase()

	if (fileExtension === '.wav') {
		return inputFilePath
	}

	const outputFilePath = path.join(path.dirname(inputFilePath), `${path.basename(inputFilePath, fileExtension)}.wav`)

	if (verbose) {
		console.log(`[Nodejs-whisper] Converting audio to WAV file type...\n`)
	}

	const command = `ffmpeg -nostats -loglevel error -y -i "${inputFilePath}" -ar 16000 -ac 1 -c:a pcm_s16le "${outputFilePath}"`
	const result = shell.exec(command, { silent: !verbose })

	if (result.code !== 0) {
		throw new Error(`[Nodejs-whisper] Failed to convert audio file: ${result.stderr}`)
	}

	return outputFilePath
}
