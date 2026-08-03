export interface WhisperOptions {
	outputInText?: boolean
	outputInVtt?: boolean
	outputInSrt?: boolean
	outputInCsv?: boolean
	translateToEnglish?: boolean
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

export type VadModelName = 'silero-v5.1.2' | 'silero-v6.2.0'

export interface IOptions {
	modelName: string
	modelRootPath?: string
	autoDownloadModelName?: string
	autoDownloadVadModelName?: VadModelName
	whisperOptions?: WhisperOptions
	withCuda?: boolean
	removeWavFileAfterTranscription?: boolean
	logger?: Console
}

export declare function nodewhisper(filePath: string, options: IOptions): Promise<string>
