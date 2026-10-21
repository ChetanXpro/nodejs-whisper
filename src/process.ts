import { spawn } from 'child_process'
import { Logger } from './types'

export function runProcess(command: string, args: string[], logger: Logger, cwd?: string): Promise<void> {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, { cwd, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
		let diagnostics = ''
		child.stdout.on('data', chunk => logger.debug(chunk.toString()))
		child.stderr.on('data', chunk => {
			diagnostics = (diagnostics + chunk.toString()).slice(-16_384)
			logger.debug(chunk.toString())
		})
		child.on('error', reject)
		child.on('close', code =>
			code === 0 ? resolve() : reject(new Error(`${command} failed (${code}): ${diagnostics}`))
		)
	})
}
