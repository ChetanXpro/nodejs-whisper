import fs from 'fs'
import path from 'path'
import shell from 'shelljs'
import { MODELS } from './constants'

const WHISPER_CPP_PATH = path.join(__dirname, '..', 'cpp', 'whisper.cpp')
const WHISPER_CPP_MAIN_PATH = './main'
const projectDir = process.cwd()

export interface IShellOptions {
	silent: boolean
	async: boolean
}

const defaultShellOptions: IShellOptions = {
	silent: true,
	async: true,
}

function handleError(error: Error) {
	console.error('[Nodejs-whisper] Error:', error.message)
	shell.cd(projectDir)
	throw error
}

export async function whisperShell(
	command: string,
	options: IShellOptions = defaultShellOptions,
	verbose: boolean
): Promise<string> {
	return new Promise<string>((resolve, reject) => {
		shell.exec(command, options, (code, stdout, stderr) => {
			console.log('code---', code)
			console.log('stdout---', stdout)
			console.log('stderr---', stderr)

			if (code === 0) {
				if (stdout.includes('error:')) {
					reject(new Error('Error in whisper.cpp:\n' + stdout))
					return
				}
				if (verbose) {
					console.log('stdout---', stdout)
					console.log('[Nodejs-whisper] Transcribing Done!')
				}

				resolve(stdout)
			} else {
				reject(new Error(stderr))
			}
		})
	}).catch((error: Error) => {
		handleError(error)
		return Promise.reject(error)
	})
}

export async function executeCppCommand(command: string, verbose: boolean, withCuda: boolean): Promise<string> {
	try {
		shell.cd(WHISPER_CPP_PATH)
		if (!shell.which(WHISPER_CPP_MAIN_PATH)) {
			console.log('[Nodejs-whisper] whisper.cpp not initialized.')
			const makeCommand = withCuda ? 'WHISPER_CUDA=1 make -j' : 'make -j'
			shell.exec(makeCommand)

			if (!shell.which(WHISPER_CPP_MAIN_PATH)) {
				throw new Error(
					"[Nodejs-whisper] 'make' command failed. Please run 'make' command in /whisper.cpp directory."
				)
			}
			console.log("[Nodejs-whisper] 'make' command successful.")
		}
		return await whisperShell(command, defaultShellOptions, verbose)
	} catch (error) {
		handleError(error as Error)
		throw new Error('Failed to execute C++ command')
	}
}
