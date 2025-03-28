import shell from 'shelljs'
import { WHISPER_CPP_PATH, WHISPER_CPP_MAIN_PATH } from './constants'

shell.config.execPath = shell.which('node').stdout

const projectDir = process.cwd()

export interface IShellOptions {
	silent: boolean
	async: boolean
}

const defaultShellOptions: IShellOptions = {
	silent: false,
	async: true,
}

function handleError(error: Error, logger = console) {
	logger.error('[Nodejs-whisper] Error:', error.message)
	shell.cd(projectDir)
	throw error
}

export async function whisperShell(
	command: string,
	options: IShellOptions = defaultShellOptions,
	logger = console
): Promise<string> {
	return new Promise<string>((resolve, reject) => {
		shell.exec(command, options, (code, stdout, stderr) => {
			logger.debug('code---', code)
			logger.debug('stdout---', stdout)
			logger.debug('stderr---', stderr)

			if (code === 0) {
				if (stdout.includes('error:')) {
					reject(new Error('Error in whisper.cpp:\n' + stdout))
					return
				}

				logger.debug('[Nodejs-whisper] Transcribing Done!')

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

export async function executeCppCommand(command: string, logger = console, withCuda: boolean): Promise<string> {
	try {
		shell.cd(WHISPER_CPP_PATH)
		if (!shell.which(WHISPER_CPP_MAIN_PATH.replace(/\\/g, '/'))) {
			logger.debug('[Nodejs-whisper] whisper.cpp not initialized.')

			const makeCommand = withCuda ? 'WHISPER_CUDA=1 make -j' : 'make -j'
			shell.exec(makeCommand)

			if (!shell.which(WHISPER_CPP_MAIN_PATH.replace(/\\/g, '/'))) {
				throw new Error(
					"[Nodejs-whisper] 'make' command failed. Please run 'make' command in /whisper.cpp directory."
				)
			}

			logger.log("[Nodejs-whisper] 'make' command successful.")
		}
		return await whisperShell(command, defaultShellOptions, logger)
	} catch (error) {
		handleError(error as Error)
	}
}
