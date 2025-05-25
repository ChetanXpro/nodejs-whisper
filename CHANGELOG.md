# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Nothing yet

### Changed

- Nothing yet

### Fixed

- Nothing yet

---

## [0.2.9] - 2025-05-15

### Fixed

- Fixed CLI download command not executing (missing function call)
- `npx nodejs-whisper download` now works as expected
- Fixed restrictive Console logger type that didn't work with popular loggers like Pino, Winston ([#158](https://github.com/ChetanXpro/nodejs-whisper/issues/158))
- Fixed inconsistent console usage in downloadModel.ts, now properly uses logger parameter ([#157](https://github.com/ChetanXpro/nodejs-whisper/issues/157))
- Fixed WAV validation that incorrectly reported non-16kHz files as valid ([#113](https://github.com/ChetanXpro/nodejs-whisper/issues/113))
- WAV files with incorrect sample rates are now automatically converted to 16kHz
- Eliminates "WAV file must be 16 kHz" errors from whisper.cpp

### Changed

- Replaced Console type with flexible Logger interface for better logger compatibility
- Updated all internal logging to use logger parameter instead of direct console calls

### Added

- Added CHANGELOG.md for version tracking

## [0.2.7] - 2025-05-15

### Fixed

- Fixed Windows build failures by migrating from make to CMake build system ([#185](https://github.com/ChetanXpro/nodejs-whisper/issues/185))
- Fixed "WHISPER_CUDA unknown on Windows" error ([#193](https://github.com/ChetanXpro/nodejs-whisper/issues/193))
- Fixed Windows executable detection issues ([#163](https://github.com/ChetanXpro/nodejs-whisper/issues/163))
- Improved cross-platform compatibility for Windows, macOS, and Linux builds

### Changed

- **BREAKING**: Migrated from Makefile-based builds to CMake as primary build system
- Replaced make/mingw32-make commands with `cmake --build` for better Windows support
- Updated CUDA compilation to use `-DGGML_CUDA=1` instead of environment variables
- Improved executable path detection for CMake output structure

### Technical Details

- Added support for Visual Studio, MinGW, and other Windows compilers
- Enhanced build detection to avoid unnecessary rebuilds
- Better error messages for build failures

## [0.2.6] - 2024-XX-XX

### Note

- Previous versions before changelog was maintained
- Major Windows compatibility improvements started with 0.2.7

---

## Links

- [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)
- [Semantic Versioning](https://semver.org/spec/v2.0.0.html)
- [GitHub Releases](https://github.com/ChetanXpro/nodejs-whisper/releases)
