# nodejs-whisper

Node.js bindings for OpenAI's Whisper model.

[![MIT License](https://img.shields.io/badge/License-MIT-green.svg)](https://choosealicense.com/licenses/mit/)

## Features

-   Automatically convert the audio to WAV format with a 16000 Hz frequency to support the whisper model.
-   Output transcripts to (.txt .srt .vtt)
-   Optimized for CPU (Including Apple Silicon ARM)
-   Timestamp precision to single word
-   Split on word rather than on token (Optional)
-   Translate from source language to english (Optional)
-   Convert audio formet to wav to support whisper model


## Installation

1. Install make tools

```bash
sudo apt update
sudo apt install  build-essential
```

1. Install nodejs-whisper with npm

```bash
  npm i nodejs-whisper
```

2.  Download whisper model

```bash
  npx nodejs-whisper download
```

-   NOTE: user may need to install make tool

## Usage/Examples

```javascript
import path from 'path'
import { nodewhisper } from 'nodejs-whisper'

// Need to provide exact path to your audio file.
const filePath = path.resolve(__dirname, 'YourAudioFileName')

await nodewhisper(filePath, {
	modelName: 'base.en', //Downloaded models name
	autoDownloadModelName: 'base.en', // (optional) autodownload a model if model is not present
        verbose?: boolean
	removeWavFileAfterTranscription?: boolean
	withCuda?: boolean // (optional) use cuda for faster processing
	whisperOptions: {
		outputInText: false, // get output result in txt file
		outputInVtt: false, // get output result in vtt file
		outputInSrt: true, // get output result in srt file
		outputInCsv: false, // get output result in csv file
		translateToEnglish: false, //translate from source language to english
		wordTimestamps: false, // Word-level timestamps
		timestamps_length: 20, // amount of dialogue per timestamp pair
		splitOnWord: true, //split on word rather than on token
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
]
```

## Types

```
 interface IOptions {
	modelName: string
	verbose?: boolean
	removeWavFileAfterTranscription?: boolean
	withCuda?: boolean
	autoDownloadModelName?: string
	whisperOptions?: WhisperOptions
}

 interface WhisperOptions {
	outputInText?: boolean
	outputInVtt?: boolean
	outputInSrt?: boolean
	outputInCsv?: boolean
	translateToEnglish?: boolean
	timestamps_length?: number
	wordTimestamps?: boolean
	splitOnWord?: boolean
}

```

## Run Locally

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

Build Project

```bash
  npm run build
```

## Made with

-   [Whisper OpenAI (using C++ port by: ggerganov)](https://github.com/ggerganov/whisper.cpp)

## Feedback

If you have any feedback, please reach out to us at chetanbaliyan10@gmail.com

## Authors

-   [@chetanXpro](https://www.github.com/chetanXpro)
