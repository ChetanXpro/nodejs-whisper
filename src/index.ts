import fs from 'fs'
import path from 'path'
import { Logger, TranscriptionControls, TranscriptionResult, WhisperOptions } from './types'
import { resolveModelPath, validateWhisperOptions } from './WhisperHelper'
import { checkIfFileExists, convertToWavType } from './utils'
import autoDownloadModel from './autoDownloadModel'
import autoDownloadVadModel from './autoDownloadVadModel'
import { VadModelName } from './constants'
import { ensureWhisperExecutable } from './whisper'
import { findNativeAddon } from './native'
import { detailedResult, formatSegment, NativeResult, writeOutputs } from './output'
import { runWhisperTask } from './runtime'
import { WhisperRuntimeError } from './taskPool'
import { normalizeLogger } from './logger'
import { RequestControl } from './control'
import { transcribeCli } from './cli'

export type { VadModelName } from './constants'
export type {
	Logger,
	WhisperOptions,
	WhisperRuntimeOptions,
	TranscriptionControls,
	TranscriptionResult,
	TranscriptionSegment,
	TranscriptionToken,
} from './types'
export { configureWhisper, disposeWhisper, getWhisperStatus } from './runtime'
export { WhisperRuntimeError } from './taskPool'

export interface IOptions extends TranscriptionControls {
	modelName: string
	modelRootPath?: string
	autoDownloadModelName?: string
	autoDownloadVadModelName?: VadModelName
	whisperOptions?: WhisperOptions
	withCuda?: boolean
	removeWavFileAfterTranscription?: boolean
	logger?: Logger
	/** Override the runtime backend for this request. Default: auto. */
	backend?: 'auto' | 'native' | 'cli'
}

export interface DetailedOptions extends IOptions {
	/** Include token probabilities and available token timestamps. Default: false. */
	includeTokens?: boolean
}

const unavailableAddons = new Map<string, string>()

export async function nodewhisper(filePath: string, options: IOptions): Promise<string> {
	return (await transcribe(filePath, options, false, false)).transcript
}

export async function transcribeDetailed(filePath: string, options: DetailedOptions): Promise<TranscriptionResult> {
	if (options.includeTokens !== undefined && typeof options.includeTokens !== 'boolean') {
		throw new TypeError('includeTokens must be a boolean')
	}
	const includeTokens = options.includeTokens ?? false
	// The bundled engine maps VAD segment times back to the input, but leaves token times on the trimmed audio.
	const tokenTimestamps = !options.autoDownloadVadModelName && !options.whisperOptions?.vad
	const { result } = await transcribe(filePath, options, true, includeTokens)
	return detailedResult(result!, includeTokens, tokenTimestamps)
}

async function transcribe(
	filePath: string,
	options: IOptions,
	detailed: boolean,
	includeTokens: boolean
): Promise<{ transcript: string; result?: NativeResult }> {
	const logger = normalizeLogger(options.logger || console)
	// Snapshot options and resolve relative paths at submission time.
	const inputPath = path.resolve(filePath)
	const runtimeOptions: IOptions & { whisperOptions: WhisperOptions } = {
		...options,
		modelRootPath: options.modelRootPath ? path.resolve(options.modelRootPath) : undefined,
		whisperOptions: { ...options.whisperOptions },
	}
	if (typeof runtimeOptions.whisperOptions.vadModelPath === 'string' && runtimeOptions.whisperOptions.vadModelPath) {
		runtimeOptions.whisperOptions.vadModelPath = path.resolve(runtimeOptions.whisperOptions.vadModelPath)
	}
	const key = JSON.stringify([
		runtimeOptions.modelRootPath,
		options.modelName,
		!!options.withCuda,
		!!options.whisperOptions?.noGpu,
	])
	// Keep existing output filenames and prevent concurrent writes to one stem.
	const extension = path.extname(inputPath)
	let lock = path.join(path.dirname(inputPath), path.basename(inputPath, extension) + '.wav')
	if (process.platform === 'win32') lock = lock.toLowerCase()
	const control = new RequestControl(runtimeOptions)
	try {
		control.check()
		return await runWhisperTask(
			key,
			lock,
			async (slot, config) => {
				control.check()
				control.progress(0)
				control.check()
				const selectedBackend = runtimeOptions.backend || config.backend
				if (!['auto', 'native', 'cli'].includes(selectedBackend))
					throw new Error('backend must be auto, native or cli')
				checkIfFileExists(inputPath)
				if (runtimeOptions.autoDownloadModelName) {
					await autoDownloadModel(
						logger,
						runtimeOptions.autoDownloadModelName,
						runtimeOptions.withCuda,
						runtimeOptions.modelRootPath
					)
				}
				control.check()
				if (runtimeOptions.autoDownloadVadModelName) {
					runtimeOptions.whisperOptions.vadModelPath = await autoDownloadVadModel(
						logger,
						runtimeOptions.autoDownloadVadModelName,
						runtimeOptions.modelRootPath
					)
					runtimeOptions.whisperOptions.vad = true
				}
				control.check()
				runtimeOptions.whisperOptions.threads ??= config.threadsPerWorker
				validateWhisperOptions(runtimeOptions)
				const modelPath = resolveModelPath(runtimeOptions)
				const outputPath = await convertToWavType(inputPath, logger, control.signal)
				control.check()
				const addonPath = findNativeAddon(runtimeOptions.withCuda)
				const fallbackReason = runtimeOptions.whisperOptions.outputInWords
					? 'Karaoke script output uses the CLI backend'
					: !addonPath
						? 'Native addon is unavailable; run npm run build:native (add -- --cuda for CUDA)'
						: unavailableAddons.get(addonPath)
				let transcript: string | undefined
				let result: NativeResult | undefined
				if (selectedBackend !== 'cli') {
					if (fallbackReason && selectedBackend === 'native') {
						throw new WhisperRuntimeError('ERR_WHISPER_NATIVE_UNAVAILABLE', fallbackReason)
					}
					if (!fallbackReason && addonPath) {
						// whisper.cpp retains VAD model/mapping state inside its context.
						// Never reuse it for a different VAD model or a non-VAD request.
						const workerKey = JSON.stringify([
							addonPath,
							modelPath,
							!runtimeOptions.whisperOptions.noGpu,
							!!runtimeOptions.whisperOptions.vad,
							runtimeOptions.whisperOptions.vadModelPath,
						])
						const worker = await slot.native(
							workerKey,
							addonPath,
							modelPath,
							!runtimeOptions.whisperOptions.noGpu,
							!!runtimeOptions.withCuda
						)
						control.check()
						logger.debug(`[Nodejs-whisper] Transcribing with native backend: ${modelPath}`)
						try {
							result = await worker.transcribe(
								outputPath,
								runtimeOptions.whisperOptions,
								logger,
								control,
								includeTokens
							)
							control.check()
							await writeOutputs(outputPath, modelPath, runtimeOptions.whisperOptions, result)
							transcript = result.segments.length
								? '\n' + result.segments.map(formatSegment).join('')
								: ''
						} catch (error) {
							if (
								!(error instanceof WhisperRuntimeError) ||
								error.code !== 'ERR_WHISPER_NATIVE_UNAVAILABLE' ||
								selectedBackend === 'native'
							)
								throw error
							unavailableAddons.set(addonPath, error.message)
							logger.debug(`[Nodejs-whisper] Falling back to CLI: ${error.message}`)
							await slot.close()
						}
					} else logger.debug(`[Nodejs-whisper] Falling back to CLI: ${fallbackReason}`)
				}
				if (transcript === undefined) {
					await slot.close()
					control.check()
					await ensureWhisperExecutable(logger, runtimeOptions.withCuda)
					control.check()
					const cliResult = await transcribeCli(
						outputPath,
						{ ...runtimeOptions, logger },
						control,
						detailed,
						includeTokens
					)
					transcript = cliResult.transcript
					result = cliResult.result
				}
				control.check()
				if (!detailed && !transcript) throw new Error('Transcription failed or produced no output.')
				if (runtimeOptions.removeWavFileAfterTranscription && fs.existsSync(outputPath)) {
					await fs.promises.unlink(outputPath)
				}
				control.check()
				control.progress(1)
				control.check()
				return { transcript, result }
			},
			control.signal
		)
	} catch (error) {
		control.check()
		const message = error instanceof Error ? error.message : String(error)
		logger.error(`[Nodejs-whisper] Error during processing: ${message}`)
		if (error instanceof WhisperRuntimeError) throw error
		throw new Error(`Operation failed: ${message}`)
	} finally {
		control.dispose()
	}
}
