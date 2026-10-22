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
