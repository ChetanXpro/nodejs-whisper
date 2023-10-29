import fs from 'fs'
import path from 'path'
import shell from 'shelljs'
import { MODELS } from './constants'

const WHISPER_CPP_PATH = path.join(__dirname, '..', 'cpp', 'whisper.cpp')
const WHISPER_CPP_MAIN_PATH = './main'
export interface IShellOptions {
	silent: boolean // true: won't print to console
	async: boolean
}

const defaultShellOptions = {
	silent: true, // true: won't print to console
	async: true,
}

const projectDir = process.cwd()

export async function whisperShell(command: string, options: IShellOptions = defaultShellOptions): Promise<any> {
	return new Promise(async (resolve, reject) => {
		try {
			// docs: https://github.com/shelljs/shelljs#execcommand--options--callback
			shell.exec(command, options, (code: number, stdout: string, stderr: string) => {
				if (code === 0) {
					if (stdout.match(/^error:/gm)) {
						shell.cd(projectDir)
						throw new Error('whisper.cpp error:\n' + stdout)
					}
					console.log('[Nodejs-whisper] Transcribing Done!')
					shell.cd(projectDir)
					resolve(stdout)
				} else {
					shell.cd(projectDir)
					reject(stderr)
				}
			})
		} catch (error) {
			reject(error)
		}
	})
}

export const executeCppCommand = async (command: string) => {
	try {
		shell.cd(WHISPER_CPP_PATH)

		if (!shell.which(WHISPER_CPP_MAIN_PATH)) {
			shell.echo('[Nodejs-whisper] whisper.cpp not initialized.', __dirname)
			shell.echo("[Nodejs-whisper] Attempting to run 'make' command in /whisper directory...")
			shell.exec('make')

			if (!shell.which(WHISPER_CPP_MAIN_PATH)) {
				console.log(
					" [Nodejs-whisper] 'make' command failed. Please run 'make' command in /whisper.cpp directory. Current shelljs directory: ",
					__dirname
				)
				shell.cd(projectDir)
				process.exit(1)
			} else {
				console.log("[Nodejs-whisper] 'make' command successful. Current directory: ", __dirname)

				return await whisperShell(command, defaultShellOptions)
			}
		} else {
			return await whisperShell(command, defaultShellOptions)
		}
	} catch (error) {
		shell.cd(projectDir)
		console.log('[Nodejs-whisper] Error in whisper.ts catch block.')
		throw error
	}
}
