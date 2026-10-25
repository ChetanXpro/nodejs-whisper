// Packaging a host-optimized build can crash Node on a different CPU.
function checkPortableBuild(cache, arch = process.arch) {
	cache = cache.replace(/\r\n?/g, '\n')
	if (!/^GGML_NATIVE:BOOL=(OFF|FALSE|NO|0)$/m.test(cache)) {
		throw new Error('Portable packaging requires GGML_NATIVE=OFF; rebuild the native addon first')
	}
	if (arch !== 'x64' && arch !== 'ia32') return
	const enabled = [...cache.matchAll(/^GGML_(SSE42|AVX[^:]*|FMA|F16C|BMI2|AMX_[^:]*):BOOL=(ON|TRUE|YES|1)$/gm)]
	if (enabled.length) {
		throw new Error(
			`Non-portable CPU flags: ${enabled.map(match => `GGML_${match[1]}`).join(', ')}. Rebuild the native addon before packaging`
		)
	}
}

module.exports = { checkPortableBuild }
