const assert = require('node:assert/strict')
const test = require('node:test')
const { checkPortableBuild } = require('../scripts/check-portable-build')

test('packaging rejects the 0.4.0 x86 configuration despite GGML_NATIVE being off', () => {
	const oldCache = 'GGML_NATIVE:BOOL=OFF\nGGML_AVX2:BOOL=ON\nGGML_FMA:BOOL=ON\nGGML_F16C:BOOL=ON\n'
	assert.throws(() => checkPortableBuild(oldCache, 'x64'), /Non-portable CPU flags: GGML_AVX2, GGML_FMA, GGML_F16C/)
	assert.throws(() => checkPortableBuild('GGML_NATIVE:BOOL=ON\n', 'arm64'), /requires GGML_NATIVE=OFF/)
	assert.throws(() => checkPortableBuild('', 'x64'), /requires GGML_NATIVE=OFF/)
	assert.doesNotThrow(() =>
		checkPortableBuild('GGML_NATIVE:BOOL=OFF\nGGML_AVX2:BOOL=OFF\nGGML_FMA:BOOL=OFF\n', 'x64')
	)
	assert.doesNotThrow(() => checkPortableBuild('GGML_NATIVE:BOOL=OFF\r\nGGML_AVX2:BOOL=OFF\r\n', 'x64'))
	assert.doesNotThrow(() => checkPortableBuild('GGML_NATIVE:BOOL=OFF\nGGML_METAL:BOOL=ON\n', 'arm64'))
})
