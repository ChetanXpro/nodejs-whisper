import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import type { IOptions } from './index'
import { constructArguments, resolveModelPath } from './WhisperHelper'
import { getWhisperExecutablePath } from './whisper'
import { runProcess } from './process'
import { RequestControl } from './control'
import { NativeResult, Segment, writeOutputs } from './output'
import { normalizeLogger } from './logger'
import { WHISPER_CPP_PATH } from './constants'

/** Buffer whole UTF-8 lines: child-process chunks need not match segment/progress boundaries. */
export function lineReader(onLine: (line: string) => void) {
	let pending = ''
	return {
		push(text: string) {
			pending += text
			const lines = pending.split(/\r?\n|\r/)
			pending = lines.pop()!
			for (const line of lines) onLine(line)
		},
		end() {
			if (pending) onLine(pending)
			pending = ''
		},
	}
}

export function parseSegment(line: string) {
	const match = line.match(/^\s*\[(\d+):(\d+):(\d+)\.(\d+)\s+-->\s+(\d+):(\d+):(\d+)\.(\d+)\] {2}(.*)$/)
	if (!match) return
	const time = (i: number) =>
		Number(match[i]) * 3600000 +
		Number(match[i + 1]) * 60000 +
		Number(match[i + 2]) * 1000 +
		Number(match[i + 3].padEnd(3, '0'))
	return { text: match[9], start: time(1), end: time(5) }
}

export function parseCliResult(json: any): NativeResult {
	if (!json || typeof json.result?.language !== 'string' || !Array.isArray(json.transcription)) {
		throw new Error('Invalid transcription JSON from whisper-cli')
	}
	const segments = json.transcription.map((segment: any) => {
		if (
			typeof segment.text !== 'string' ||
			!Number.isFinite(segment.offsets?.from) ||
			!Number.isFinite(segment.offsets?.to)
		) {
			throw new Error('Invalid segment in whisper-cli JSON')
		}
		const result: Segment = {
			text: segment.text,
			start: segment.offsets.from,
			end: segment.offsets.to,
		}
		if (Array.isArray(segment.tokens)) {
			result.tokens = segment.tokens.map((token: any) => ({
				text: token.text,
				id: token.id,
				p: token.p,
				t_dtw: token.t_dtw,
				...(Number.isFinite(token.offsets?.from) &&
				Number.isFinite(token.offsets?.to) &&
				token.offsets.from >= 0 &&
				token.offsets.to >= 0
					? { start: token.offsets.from, end: token.offsets.to }
					: {}),
			}))
		}
		return result
	})
	return { segments, language: json.result.language, systeminfo: json.systeminfo, model: json.model }
}

export async function transcribeCli(
	filePath: string,
	options: IOptions,
	control: RequestControl,
	detailed: boolean,
	includeTokens: boolean
) {
	control.check()
	const executable = getWhisperExecutablePath(options.withCuda)
	if (!executable) throw new Error('whisper-cli executable not found')
	const logger = normalizeLogger(options.logger)
	const directory = detailed ? await fs.mkdtemp(path.join(os.tmpdir(), 'nodejs-whisper-')) : undefined
	try {
		const cliOptions = { ...options, whisperOptions: { ...options.whisperOptions } }
		// Detailed requests use the same exporters as native requests. Only karaoke needs the CLI exporter.
		if (detailed) {
			for (const key of [
				'outputInText',
				'outputInVtt',
				'outputInSrt',
				'outputInCsv',
				'outputInLrc',
				'outputInJson',
				'outputInJsonFull',
			] as const) {
				delete cliOptions.whisperOptions[key]
			}
		}
		const args = constructArguments(filePath, cliOptions)
		const output = directory ? path.join(directory, 'result') : undefined
		if (output) args.push('-of', output, includeTokens || options.whisperOptions?.outputInJsonFull ? '-ojf' : '-oj')
		if (options.onProgress) args.push('-pp')
		logger.debug(`[Nodejs-whisper] Executing command: ${executable} ${args.join(' ')}`)
		let transcript = ''
		const stdout = lineReader(line => {
			const segment = parseSegment(line)
			if (segment) control.segment(segment)
		})
		const stderr = lineReader(line => {
			const progress = line.match(/progress\s*=\s*(\d+(?:\.\d+)?)%/)
			if (progress) control.progress(Math.min(0.99, Number(progress[1]) / 100))
		})
		await runProcess(executable, args, logger, {
			cwd: WHISPER_CPP_PATH,
			signal: control.signal,
			onStdout: text => {
				transcript += text
				stdout.push(text)
				logger.info(text)
			},
			onStderr: text => stderr.push(text),
		})
		stdout.end()
		stderr.end()
		control.check()
		if (!detailed && transcript.includes('error:')) throw new Error(transcript)
		let result: NativeResult | undefined
		if (output) {
			result = parseCliResult(JSON.parse(await fs.readFile(`${output}.json`, 'utf8')))
			control.check()
			await writeOutputs(filePath, resolveModelPath(options), options.whisperOptions || {}, result)
			if (options.whisperOptions?.outputInWords) await fs.copyFile(`${output}.wts`, `${filePath}.wts`)
		}
		return { transcript, result }
	} finally {
		if (directory) await fs.rm(directory, { recursive: true, force: true })
	}
}
