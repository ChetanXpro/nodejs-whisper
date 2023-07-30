import fs from 'fs'
import path from 'path'
import shell from 'shelljs'

const WHISPER_CPP_PATH = path.join(__dirname, 'cpp', 'whisper.cpp')
const WHISPER_CPP_MAIN_PATH = './main'
export interface IShellOptions {
	silent: boolean // true: won't print to console
	async: boolean
}

const defaultShellOptions = {
	silent: false, // true: won't print to console
	async: false,
}

export async function whisperShell(command: string, options: IShellOptions = defaultShellOptions): Promise<any> {
	return new Promise(async (resolve, reject) => {
		try {
			// docs: https://github.com/shelljs/shelljs#execcommand--options--callback
			shell.exec(command, options, (code: number, stdout: string, stderr: string) => {
				if (code === 0) resolve(stdout)
				else reject(stderr)
			})
		} catch (error) {
			reject(error)
		}
	})
}

export const executeCppCommand = async (command: string) => {
	try {
		shell.cd(WHISPER_CPP_PATH)

		// console.log('shell.pwd() =====', shell.pwd()[0])

		fs.access(WHISPER_CPP_MAIN_PATH, fs.constants.X_OK, err => {
			if (err) {
				console.log('main file is not executable')
				// fs.chmodSync(WHISPER_CPP_MAIN_PATH, '755')
				return
			}
		})

		if (!shell.which(WHISPER_CPP_MAIN_PATH)) {
			shell.echo('whisper.cpp not initialized.', __dirname)
			shell.echo("Attempting to run 'make' command in /whisper directory...")
			shell.exec('make')

			if (!shell.which(WHISPER_CPP_MAIN_PATH)) {
				console.log(
					"'make' command failed. Please run 'make' command in /whisper directory. Current shelljs directory: ",
					__dirname
				)
				process.exit(1)
			} else {
				console.log("'make' command successful. Current directory: ", __dirname)
				await whisperShell(command, defaultShellOptions)
			}
		} else {
			await whisperShell(command, defaultShellOptions)
		}
	} catch (error) {
		console.log('Error in whisper.ts catch block.')
		throw error
	}
}
