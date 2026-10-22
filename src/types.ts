export interface WhisperOptions {
	/** CPU threads per transcription. Defaults to the runtime's threadsPerWorker. */
	threads?: number
	outputInCsv?: boolean
	outputInJson?: boolean
	outputInJsonFull?: boolean
	outputInLrc?: boolean
	outputInSrt?: boolean
	outputInText?: boolean
	outputInVtt?: boolean
	outputInWords?: boolean
	translateToEnglish?: boolean
	language?: string
	timestamps_length?: number
	wordTimestamps?: boolean
	splitOnWord?: boolean
	noGpu?: boolean
	vad?: boolean
	vadModelPath?: string
	vadThreshold?: number
	vadMinSpeechDurationMs?: number
	vadMinSilenceDurationMs?: number
	vadMaxSpeechDurationS?: number
	vadSpeechPadMs?: number
	vadSamplesOverlap?: number
}

export interface Logger {
	debug: (...args: any[]) => void
	error: (...args: any[]) => void
	info?: (...args: any[]) => void
	/** Legacy fallback when info is absent. */
	log?: (...args: any[]) => void
}

/** Times are milliseconds from the start of the input audio. */
export interface TranscriptionToken {
	text: string
	id: number
	/** Model token probability, not a calibrated accuracy score. */
	probability: number
	/** Milliseconds in the input audio; omitted when VAD is enabled or timing is unavailable. */
	start?: number
	end?: number
}

export interface TranscriptionSegment {
	text: string
	start: number
	end: number
	tokens?: TranscriptionToken[]
}

export interface TranscriptionResult {
	/** Plain transcript without timestamp formatting. */
	text: string
	language: string
	segments: TranscriptionSegment[]
}

export interface TranscriptionControls {
	signal?: AbortSignal
	/** Inference progress from 0 to 1. Callbacks must be synchronous. */
	onProgress?: (progress: number) => void
	/** Completed segments, before the whole file finishes. Callbacks must be synchronous. */
	onSegment?: (segment: TranscriptionSegment) => void
}

export interface WhisperRuntimeOptions {
	/** Maximum active requests and resident native contexts. Default: 1. */
	maxConcurrency?: number
	/** Maximum waiting requests; excess calls reject immediately. Default: 100. */
	maxQueue?: number
	/** Release idle workers after this interval; 0 retains them until disposal. Default: 60000. */
	idleTimeoutMs?: number
	/** Maximum queue wait; 0 disables the timeout. Default: 0. */
	queueTimeoutMs?: number
	/** CPU threads per inference. Default: up to 4, divided across workers. */
	threadsPerWorker?: number
	backend?: 'auto' | 'native' | 'cli'
}
