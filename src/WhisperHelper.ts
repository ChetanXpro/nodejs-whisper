import { WhisperOptions } from './types'

export const constructCommand = (filePath: string, args: WhisperOptions) => {
	let command = `./main ${constructOptionsFlags(args)}  -f ${filePath}  `
}

const constructOptionsFlags = (args: WhisperOptions) => {
	let flag = ''
	if (args.outputInText) {
		flag += `-otxt`
	}
	if (args.outputInVtt) {
		flag += `-ovtt `
	}
	if (args.outputInSrt) {
		flag += `-osrt `
	}
	if (args.outputInCsv) {
		flag += `-ocsv `
	}
	if (args.translateToEnglish) {
		flag += `-tr `
	}
	if (args.wordTimestamps) {
		flag += `-ml 1 `
	}
	if (args.timestamps_length) {
		flag += `-ml ${args.timestamps_length} `
	}
	return flag
}
