export interface WhisperOptions {
	outputInText?: boolean
	outputInVtt?: boolean
	outputInSrt?: boolean
	outputInCsv?: boolean
	translateToEnglish?: boolean
	language?: string
	timestamps_length?: number
	wordTimestamps?: boolean
	splitOnWord?: boolean
}
