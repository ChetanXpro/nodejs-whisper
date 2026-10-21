import { spawn } from 'child_process'
import path from 'path'
import fs from 'fs'
import { WHISPER_CPP_PATH } from './constants'
import { Logger } from './types'
import { getCmakeConfigureCommand } from './buildConfig'
import { normalizeLogger } from './logger'

export interface IShellOptions {
	silent: boolean
	async: boolean
}
const defaultShellOptions: IShellOptions = { silent: true, async: true }

export function getWhisperExecutablePath(withCuda = false): string | undefined {
	const name = process.platform === 'win32' ? 'whisper-cli.exe' : 'whisper-cli'
	const build = withCuda ? 'build-cuda' : 'build'
	return [`${build}/bin`, `${build}/bin/Release`, `${build}/bin/Debug`, build, ...(withCuda ? [] : ['.'])]
		.map(dir => path.join(WHISPER_CPP_PATH, dir, name))
		.find(file => fs.existsSync(file))
}

export function whisperShell(
	command: string,
	_options: IShellOptions = defaultShellOptions,
	logger: Logger = console,
	projectDir: string = process.cwd()
): Promise<string> {
	const log = normalizeLogger(logger)
	return new Promise<string>((resolve, reject) => {
		const child = spawn(command, {
			cwd: projectDir,
			shell: true,
			windowsHide: true,
			stdio: ['ignore', 'pipe', 'pipe'],
		})
		let stdout = '',
			stderr = ''
		child.stdout.on('data', data => {
			stdout += data.toString()
			log.info(data.toString())
		})
		child.stderr.on('data', data => {
			stderr = (stderr + data.toString()).slice(-65_536)
			log.debug(data.toString())
		})
		child.on('error', reject)
		child.on('close', code => {
			if (code === 0 && !stdout.includes('error:')) resolve(stdout)
			else reject(new Error(stderr || stdout || `Command failed with exit code ${code}`))
		})
	}).catch(error => {
		log.error(`[Nodejs-whisper] Error: ${error.message}`)
		throw error
	})
}

const builds = new Map<boolean, Promise<void>>()
export async function ensureWhisperExecutable(logger: Logger = console, withCuda = false): Promise<void> {
	const existing = builds.get(withCuda)
	if (existing) return existing
	if (getWhisperExecutablePath(withCuda)) return
	const buildDirectory = withCuda ? 'build-cuda' : 'build'
	const building = (async () => {
		const buildLogger = {
			debug: (...args: any[]) => logger.debug(...args),
			info: (...args: any[]) => logger.debug(...args),
			error: (...args: any[]) => logger.error(...args),
		}
		await whisperShell(getCmakeConfigureCommand(withCuda, buildDirectory), undefined, buildLogger, WHISPER_CPP_PATH)
		await whisperShell(
			`cmake --build ${buildDirectory} --config Release --target whisper-cli`,
			undefined,
			buildLogger,
			WHISPER_CPP_PATH
		)
		if (!getWhisperExecutablePath(withCuda)) throw new Error('whisper-cli executable not found after building')
	})()
	builds.set(withCuda, building)
	try {
		await building
	} finally {
		builds.delete(withCuda)
	}
}

export async function executeCppCommand(command: string, logger: Logger = console, withCuda = false): Promise<string> {
	await ensureWhisperExecutable(logger, withCuda)
	return whisperShell(command, defaultShellOptions, logger, WHISPER_CPP_PATH)
}
