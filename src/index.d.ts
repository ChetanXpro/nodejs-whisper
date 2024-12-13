export interface WhisperOptions {
	outputInText?: boolean
	outputInVtt?: boolean
	outputInSrt?: boolean
	outputInCsv?: boolean
	translateToEnglish?: boolean
	timestamps_length?: number
	wordTimestamps?: boolean
	splitOnWord?: boolean
}

export interface IOptions {
	modelName: string
	autoDownloadModelName?: string
	whisperOptions?: WhisperOptions
	withCuda?: boolean
	removeWavFileAfterTranscription?: boolean
	logger?: Console
}

export declare function nodewhisper(filePath: string, options: IOptions): Promise<string>
