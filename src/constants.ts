import path from 'path'

export const MODEL_OBJECT = {
	tiny: 'ggml-tiny.bin',
	'tiny.en': 'ggml-tiny.en.bin',
	'tiny-q5_1': 'ggml-tiny-q5_1.bin',
	'tiny.en-q5_1': 'ggml-tiny.en-q5_1.bin',
	'tiny-q8_0': 'ggml-tiny-q8_0.bin',
	base: 'ggml-base.bin',
	'base.en': 'ggml-base.en.bin',
	'base-q5_1': 'ggml-base-q5_1.bin',
	'base.en-q5_1': 'ggml-base.en-q5_1.bin',
	'base-q8_0': 'ggml-base-q8_0.bin',
	small: 'ggml-small.bin',
	'small.en': 'ggml-small.en.bin',
	'small.en-tdrz': 'ggml-small.en-tdrz.bin',
	'small-q5_1': 'ggml-small-q5_1.bin',
	'small.en-q5_1': 'ggml-small.en-q5_1.bin',
	'small-q8_0': 'ggml-small-q8_0.bin',
	medium: 'ggml-medium.bin',
	'medium.en': 'ggml-medium.en.bin',
	'medium-q5_0': 'ggml-medium-q5_0.bin',
	'medium.en-q5_0': 'ggml-medium.en-q5_0.bin',
	'medium-q8_0': 'ggml-medium-q8_0.bin',
	'large-v1': 'ggml-large-v1.bin',
	'large-v2': 'ggml-large-v2.bin',
	'large-v2-q5_0': 'ggml-large-v2-q5_0.bin',
	'large-v2-q8_0': 'ggml-large-v2-q8_0.bin',
	'large-v3': 'ggml-large-v3.bin',
	'large-v3-q5_0': 'ggml-large-v3-q5_0.bin',
	'large-v3-turbo': 'ggml-large-v3-turbo.bin',
	'large-v3-turbo-q5_0': 'ggml-large-v3-turbo-q5_0.bin',
	'large-v3-turbo-q8_0': 'ggml-large-v3-turbo-q8_0.bin',
	large: 'ggml-large-v3.bin',
}

export type ModelName = keyof typeof MODEL_OBJECT

export const MODELS_LIST = Object.keys(MODEL_OBJECT) as ModelName[]
export const MODELS = Object.values(MODEL_OBJECT)

export const DOWNLOAD_MODEL_ALIASES: Partial<Record<ModelName, ModelName>> = {
	large: 'large-v3',
}

export const LEGACY_MODEL_FILES: Partial<Record<ModelName, string[]>> = {
	large: ['ggml-large.bin'],
}

export const isModelName = (modelName: unknown): modelName is ModelName =>
	typeof modelName === 'string' && Object.prototype.hasOwnProperty.call(MODEL_OBJECT, modelName)

export const DEFAULT_MODEL = 'tiny.en'

export const VAD_MODEL_OBJECT = {
	'silero-v5.1.2': 'ggml-silero-v5.1.2.bin',
	'silero-v6.2.0': 'ggml-silero-v6.2.0.bin',
}

export type VadModelName = keyof typeof VAD_MODEL_OBJECT

export const isVadModelName = (modelName: unknown): modelName is VadModelName =>
	typeof modelName === 'string' && Object.prototype.hasOwnProperty.call(VAD_MODEL_OBJECT, modelName)

export const WHISPER_CPP_PATH = path.join(__dirname, '..', 'cpp', 'whisper.cpp')

export const WHISPER_CPP_MAIN_PATH =
	process.platform === 'win32' ? 'build\\bin\\Release\\whisper-cli.exe' : './build/bin/whisper-cli'
