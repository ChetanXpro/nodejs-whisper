import { spawn } from 'child_process'
import { Logger } from './types'
import { checkSignal } from './control'

export interface ProcessOptions {
	cwd?: string
	signal?: AbortSignal
	onStdout?: (text: string) => void
	onStderr?: (text: string) => void
}

export function runProcess(
	command: string,
	args: string[],
	logger: Logger,
	options: ProcessOptions = {}
): Promise<void> {
	return new Promise((resolve, reject) => {
		checkSignal(options.signal)
		const child = spawn(command, args, { cwd: options.cwd, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
		let diagnostics = ''
		let failure: Error | undefined
		let killTimer: NodeJS.Timeout | undefined
		const stop = (error: unknown) => {
			if (failure) return
			failure = error instanceof Error ? error : new Error(String(error))
			child.kill()
			killTimer = setTimeout(() => child.kill('SIGKILL'), 1000)
			killTimer.unref()
		}
		const abort = () => stop(options.signal!.reason)
		options.signal?.addEventListener('abort', abort, { once: true })
		child.stdout.setEncoding('utf8')
		child.stderr.setEncoding('utf8')
		child.stdout.on('data', (text: string) => {
			if (failure) return
			try {
				if (options.onStdout) options.onStdout(text)
				else logger.debug(text)
			} catch (error) {
				stop(error)
			}
		})
		child.stderr.on('data', (text: string) => {
			diagnostics = (diagnostics + text).slice(-16_384)
			if (failure) return
			try {
				logger.debug(text)
				options.onStderr?.(text)
			} catch (error) {
				stop(error)
			}
		})
		child.on('error', error => {
			failure ??= error
		})
		child.on('close', code => {
			clearTimeout(killTimer)
			options.signal?.removeEventListener('abort', abort)
			if (failure) reject(failure)
			else if (code === 0) resolve()
			else reject(new Error(`${command} failed (${code}): ${diagnostics}`))
		})
	})
}
