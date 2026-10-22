export function getCmakeConfigureCommand(withCuda: boolean = false, buildDirectory = 'build'): string {
	const configureCommand = ['cmake', '-B', buildDirectory]
	const extraCmakeArgs = process.env.NODEJS_WHISPER_CMAKE_ARGS?.trim()

	if (withCuda) {
		configureCommand.push('-DGGML_CUDA=1')
	}

	if (extraCmakeArgs) {
		configureCommand.push(extraCmakeArgs)
	}

	return configureCommand.join(' ')
}
