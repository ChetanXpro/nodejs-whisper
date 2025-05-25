# nodejs-whisper

Node.js bindings for OpenAI's Whisper model.

[![MIT License](https://img.shields.io/badge/License-MIT-green.svg)](https://choosealicense.com/licenses/mit/)

## Features

-   Automatically convert the audio to WAV format with a 16000 Hz frequency to support the whisper model.
-   Output transcripts to (.txt .srt .vtt .json .wts .lrc)
-   Optimized for CPU (Including Apple Silicon ARM)
-   Timestamp precision to single word
-   Split on word rather than on token (Optional)
-   Translate from source language to english (Optional)
-   Convert audio format to wav to support whisper model

## Installation

1. Install make tools

```bash
sudo apt update
sudo apt install build-essential
```

2. Install nodejs-whisper with npm

```bash
  npm i nodejs-whisper
```

3. Download whisper model

```bash
  npx nodejs-whisper download
```

-   NOTE: user may need to install make tool

### Windows Installation

1. Install MinGW-w64 or MSYS2 (which includes make tools)
   - Option 1: Install MSYS2 from https://www.msys2.org/
   - Option 2: Install MinGW-w64 from https://www.mingw-w64.org/

2. Install nodejs-whisper with npm
```bash
npm i nodejs-whisper
```

3. Download whisper model
```bash
npx nodejs-whisper download
```

- Note: Make sure mingw32-make or make is available in your system PATH.

## Usage/Examples

See `example/index.ts` (can be run with `$ npm run test`)

```javascript
import path from 'path'
import { nodewhisper } from 'nodejs-whisper'

// Need to provide exact path to your audio file.
const filePath = path.resolve(__dirname, 'YourAudioFileName')

await nodewhisper(filePath, {
	modelName: 'base.en', //Downloaded models name
	autoDownloadModelName: 'base.en', // (optional) auto download a model if model is not present
	removeWavFileAfterTranscription: false, // (optional) remove wav file once transcribed
	withCuda: false, // (optional) use cuda for faster processing
	logger: console, // (optional) Logging instance, defaults to console
	whisperOptions: {
		outputInCsv: false, // get output result in csv file
		outputInJson: false, // get output result in json file
		outputInJsonFull: false, // get output result in json file including more information
		outputInLrc: false, // get output result in lrc file
		outputInSrt: true, // get output result in srt file
		outputInText: false, // get output result in txt file
		outputInVtt: false, // get output result in vtt file
		outputInWords: false, // get output result in wts file for karaoke
		translateToEnglish: false, // translate from source language to english
		wordTimestamps: false, // word-level timestamps
		timestamps_length: 20, // amount of dialogue per timestamp pair
		splitOnWord: true, // split on word rather than on token
	},
})

// Model list
const MODELS_LIST = [
	'tiny',
	'tiny.en',
	'base',
	'base.en',
	'small',
	'small.en',
	'medium',
	'medium.en',
	'large-v1',
	'large',
	'large-v3-turbo',
]
```

## Types

```
 interface IOptions {
	modelName: string
	removeWavFileAfterTranscription?: boolean
	withCuda?: boolean
	autoDownloadModelName?: string
	whisperOptions?: WhisperOptions
	logger?: Console
}

 interface WhisperOptions {
	outputInCsv?: boolean
	outputInJson?: boolean
	outputInJsonFull?: boolean
	outputInLrc?: boolean
	outputInSrt?: boolean
	outputInText?: boolean
	outputInVtt?: boolean
	outputInWords?: boolean
	translateToEnglish?: boolean
	timestamps_length?: number
	wordTimestamps?: boolean
	splitOnWord?: boolean
}

```

## Run locally

Clone the project

```bash
  git clone https://github.com/ChetanXpro/nodejs-whisper
```

Go to the project directory

```bash
  cd nodejs-whisper
```

Install dependencies

```bash
  npm install
```

Start the server

```bash
  npm run dev
```

Build project

```bash
  npm run build
```

## Made with

-   [Whisper OpenAI (using C++ port by: ggerganov)](https://github.com/ggerganov/whisper.cpp)

## Feedback

If you have any feedback, please reach out to us at chetanbaliyan10@gmail.com

## Authors

-   [@chetanXpro](https://www.github.com/chetanXpro)
