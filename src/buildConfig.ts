export function getCmakeConfigureCommand(withCuda: boolean = false): string {
	const configureCommand = ['cmake', '-B', 'build']
	const extraCmakeArgs = process.env.NODEJS_WHISPER_CMAKE_ARGS?.trim()

	if (withCuda) {
		configureCommand.push('-DGGML_CUDA=1')
	}

	if (extraCmakeArgs) {
		configureCommand.push(extraCmakeArgs)
	}

	return configureCommand.join(' ')
}
