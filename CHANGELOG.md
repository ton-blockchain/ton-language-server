# Changelog

All notable changes to this project will be documented in this file.

## [0.2.0] - 14.07.2025

This release is dedicated to FunC and Tolk.

We added FunC support with many useful features and even debugging support via sandbox (big thanks to TonTech for FunC
debugger implementation)!

We also improved Tolk support and added an experimental formatter for Tolk, it is still in early stages, but already
supports all syntax of Tolk.

### Added

- feat(tolk/rename): wrap in backticks for keyword names in https://github.com/ton-blockchain/ton-language-server/pull/21
- feat(tolk/inspections): add unused type parameter inspection and fix find references for type parameters in https://github.com/ton-blockchain/ton-language-server/pull/22
- feat(tolk/toolchain): support Tolk global installation in https://github.com/ton-blockchain/ton-language-server/pull/24
- feat: initial FunC support in https://github.com/ton-blockchain/ton-language-server/pull/26
- feat(vscode): warn if FunC or Tolk extension are enabled in https://github.com/ton-blockchain/ton-language-server/pull/34
- feat(vscode): add action to attach to FunC debugger in https://github.com/ton-blockchain/ton-language-server/pull/36
- feat(tolk/completion): support match over struct type and add completion option to fill all cases in https://github.com/ton-blockchain/ton-language-server/pull/42
- feat(tolk): add experimental Tolk formatter in https://github.com/ton-blockchain/ton-language-server/pull/43

### Fixes

- fix(tolk/references): fix reference handling for `Foo<Bar>` in https://github.com/ton-blockchain/ton-language-server/pull/8
- fix: fix paths to language server from archive in README.md in https://github.com/ton-blockchain/ton-language-server/pull/23
- fix(tolk/resolving): fix method resolving for generic structs in https://github.com/ton-blockchain/ton-language-server/pull/25
- fix(tolk/completion): fix completion for generic struct static methods in https://github.com/ton-blockchain/ton-language-server/pull/30
- fix(tolk/settings): fix inlay hints disabling in https://github.com/ton-blockchain/ton-language-server/pull/31
- fix(tolk/grammar): support triple quotes strings in https://github.com/ton-blockchain/ton-language-server/pull/41

### Other

- feat(ci): add artifacts build for releases in https://github.com/ton-blockchain/ton-language-server/pull/10
- chore(README.md): move description after title in https://github.com/ton-blockchain/ton-language-server/pull/13
- fix(webpack): fixed the copying of the icons by @Danil42Russia in https://github.com/ton-blockchain/ton-language-server/pull/16
- fix(assets): removed an unused icon by @Danil42Russia in https://github.com/ton-blockchain/ton-language-server/pull/17
- feat(ci): run linter and grammar checks in https://github.com/ton-blockchain/ton-language-server/pull/28
- refactor(all): move VS Code extension to `editors/code` folder in https://github.com/ton-blockchain/ton-language-server/pull/32
- refactor(server): extract common languages parts in https://github.com/ton-blockchain/ton-language-server/pull/39
- fix(tolk/tests): fix completion tests in https://github.com/ton-blockchain/ton-language-server/pull/45

### New Contributors

- @Danil42Russia made their first contribution in https://github.com/ton-blockchain/ton-language-server/pull/16

**Full Changelog**: https://github.com/ton-blockchain/ton-language-server/compare/v0.1.1...v0.2.0

## [0.1.1] - 07.07.2025

Fix bug with type compatibility, this inspection is disabled by default for now.

## [0.1.0] - 07.07.2025

First stable version

## [0.0.1] - 06.07.2025

Initial development release for alpha testers
