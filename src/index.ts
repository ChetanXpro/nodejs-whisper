import dotenv from 'dotenv'
import path from 'path'
import fs from 'fs'
import { WhisperOptions } from './types'
import downloadModel from './downloadModel'

dotenv.config()

interface IOptions {
	modelName: string
	whisperOptions: WhisperOptions
}

async function whisperNodejs(filePath: string, options: IOptions) {
	downloadModel()
	// const newfilePath = path.resolve(__dirname, filePath)
	// fs.access(filePath, fs.constants.F_OK, err => {
	// 	if (err) {
	// 		console.error(`No such file or directory: ${filePath}`)
	// 		process.exit(1)
	// 	}
	// })
}
