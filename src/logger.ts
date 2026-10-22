import { Logger } from './types'

export interface LeveledLogger {
	info: (...args: any[]) => void
	debug: (...args: any[]) => void
	error: (...args: any[]) => void
}

export function normalizeLogger(logger: Logger = console): LeveledLogger {
	const info = typeof logger.info === 'function' ? logger.info : logger.log
	if (typeof info !== 'function' || typeof logger.debug !== 'function' || typeof logger.error !== 'function') {
		throw new TypeError('logger must provide info (or log), debug, and error methods')
	}
	// Preserve the receiver for loggers such as Pino and for custom class methods.
	return {
		info: info.bind(logger),
		debug: logger.debug.bind(logger),
		error: logger.error.bind(logger),
	}
}
