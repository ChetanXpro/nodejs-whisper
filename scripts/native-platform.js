const platform =
	process.platform === 'linux'
		? `linux-${process.arch}-${process.report?.getReport().header.glibcVersionRuntime ? 'glibc' : 'musl'}`
		: `${process.platform}-${process.arch}`
module.exports = platform
