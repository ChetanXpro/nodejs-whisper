import fs from 'fs'
import path from 'path'
import shell from 'shelljs'
export const checkIfFileExists = (filePath: string) => {
	fs.access(filePath, fs.constants.F_OK, err => {
		if (err) {
			console.error(`No such file or directory: ${filePath}`)
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

	// console.log('cc', cc)

	if (fileExtension !== 'wav') {
		console.log('converting to wav...')
		const command = `ffmpeg -i ${inputFilePath} -ar 16000 ${outputFilePath}.wav`

		shell.exec(command)
		return `${outputFilePath}.wav`
	} else {
		return inputFilePath
	}
}
