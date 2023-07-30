import fs from 'fs'
import path from 'path'
import shell from 'shelljs'
export const checkIfFileExists = (filePath: string) => {
	fs.access(filePath, fs.constants.F_OK, err => {
		if (err) {
			console.error(`[Nodejs-whisper] Error: No such file or directory: ${filePath}\n`)
			process.exit(1)
		}
	})
}

export const convertToWavType = async (inputFilePath: string) => {
	const fileExtension = inputFilePath.split('.').pop()

	const outputFilePath = path.join(
		path.dirname(inputFilePath),
		path.basename(inputFilePath, path.extname(inputFilePath))
	)

	if (fileExtension !== 'wav') {
		console.warn('[Nodejs-whisper] Warning: Unsupported audio format.')
		console.log('[Nodejs-whisper]  Converting audio to wav File Type...\n')
		const command = `ffmpeg -i ${inputFilePath} -ar 16000 -ac 1 -c:a pcm_s16le  ${outputFilePath}.wav`

		shell.exec(command)
		return `${outputFilePath}.wav`
	} else {
		return inputFilePath
	}
}
