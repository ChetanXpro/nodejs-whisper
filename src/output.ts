import fs from 'fs/promises'
import { TranscriptionResult, TranscriptionSegment, WhisperOptions } from './types'

export interface Segment {
	text: string
	start: number
	end: number
	tokens?: Array<{ text: string; id: number; p: number; t_dtw: number; start?: number; end?: number }>
}

export interface NativeResult {
	segments: Segment[]
	language: string
	systeminfo: string
	model: Record<string, unknown>
}

export function detailedResult(
	result: NativeResult,
	includeTokens: boolean,
	tokenTimestamps = true
): TranscriptionResult {
	return {
		text: result.segments
			.map(segment => segment.text)
			.join('')
			.trim(),
		language: result.language,
		segments: result.segments.map(({ text, start, end, tokens }) => {
			const segment: TranscriptionSegment = { text, start, end }
			if (includeTokens) {
				segment.tokens = (tokens || [])
					.filter(token => !/^\[_.*\]$/.test(token.text))
					.map(token => ({
						text: token.text,
						id: token.id,
						probability: token.p,
						...(tokenTimestamps && token.start !== undefined && token.end !== undefined
							? { start: token.start, end: token.end }
							: {}),
					}))
			}
			return segment
		}),
	}
}

export function timestamp(ms: number, comma = false): string {
	const pad = (value: number, width = 2) => String(value).padStart(width, '0')
	return `${pad(Math.floor(ms / 3600000))}:${pad(Math.floor(ms / 60000) % 60)}:${pad(Math.floor(ms / 1000) % 60)}${comma ? ',' : '.'}${pad(ms % 1000, 3)}`
}

export const formatSegment = (segment: Segment) =>
	`[${timestamp(segment.start)} --> ${timestamp(segment.end)}]  ${segment.text}\n`

const times = (value: { start: number; end: number }) => ({
	timestamps: { from: timestamp(value.start, true), to: timestamp(value.end, true) },
	offsets: { from: value.start, to: value.end },
})

export async function writeOutputs(filePath: string, modelPath: string, options: WhisperOptions, result: NativeResult) {
	const segments = result.segments
	const writes: Promise<void>[] = []
	const write = (extension: string, text: string) => writes.push(fs.writeFile(`${filePath}.${extension}`, text))
	if (options.outputInText) write('txt', segments.map(s => `${s.text}\n`).join(''))
	if (options.outputInVtt)
		write(
			'vtt',
			'WEBVTT\n\n' + segments.map(s => `${timestamp(s.start)} --> ${timestamp(s.end)}\n${s.text}\n\n`).join('')
		)
	if (options.outputInSrt)
		write(
			'srt',
			segments
				.map((s, i) => `${i + 1}\n${timestamp(s.start, true)} --> ${timestamp(s.end, true)}\n${s.text}\n\n`)
				.join('')
		)
	if (options.outputInCsv)
		write(
			'csv',
			'start,end,text\n' + segments.map(s => `${s.start},${s.end},"${s.text.replace(/"/g, '""')}"\n`).join('')
		)
	if (options.outputInLrc)
		write(
			'lrc',
			'[by:whisper.cpp]\n' +
				segments
					.map(s => {
						const minutes = String(Math.floor(s.start / 60000)).padStart(2, '0')
						return `[${minutes}:${timestamp(s.start).slice(6, 11)}]${s.text}\n`
					})
					.join('')
		)
	if (options.outputInJson || options.outputInJsonFull) {
		write(
			'json',
			JSON.stringify(
				{
					systeminfo: result.systeminfo,
					model: result.model,
					params: {
						model: modelPath,
						language: options.language || 'auto',
						translate: !!options.translateToEnglish,
					},
					result: { language: result.language },
					transcription: segments.map(s => ({
						...times(s),
						text: s.text,
						...(options.outputInJsonFull
							? {
									tokens: (s.tokens || []).map(({ start, end, ...token }) => ({
										text: token.text,
										...(start !== undefined && end !== undefined ? times({ start, end }) : {}),
										id: token.id,
										p: token.p,
										t_dtw: token.t_dtw,
									})),
								}
							: {}),
					})),
				},
				null,
				'\t'
			) + '\n'
		)
	}
	// Await every writer even on failure before allowing another request to use
	// these paths, Promise.all alone would release the queue slot too early.
	const results = await Promise.allSettled(writes)
	const failed = results.find((r): r is PromiseRejectedResult => r.status === 'rejected')
	if (failed) throw failed.reason
}
