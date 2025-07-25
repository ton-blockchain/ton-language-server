# Changelog

All notable changes to this project will be documented in this file.

## [0.3.0] - 22.07.2025

### Added

#### Tolk

- feat(tolk/documentation): support inline field comments in https://github.com/ton-blockchain/ton-language-server/pull/64
- feat(tolk/inspections): add `NeedNotNullUnwrapping` inspection in https://github.com/ton-blockchain/ton-language-server/pull/72

#### Func

- feat(func/lens): add code lens for integer string literals like `"..."c` for FunC in https://github.com/ton-blockchain/ton-language-server/pull/63
- feat(func/resolving): support catch variables resolving and find references in https://github.com/ton-blockchain/ton-language-server/pull/65
- feat(func/inlay-hints): show implicit constant types in https://github.com/ton-blockchain/ton-language-server/pull/67

### Fixed

#### Tolk

- fix(tolk): don't add `;` for imports in https://github.com/ton-blockchain/ton-language-server/pull/49
- fix(tolk/completion): don't show type parameter in value completion in https://github.com/ton-blockchain/ton-language-server/pull/69
- fix(tolk/completion): don't add `;` for top level declaration in completion in https://github.com/ton-blockchain/ton-language-server/pull/74

#### FunC

- fix(func/resolving): fix resolving for tensor/tuple variables with underscore in https://github.com/ton-blockchain/ton-language-server/pull/68
- fix(func/grammar): accept `<` and `>` as part of identifier in https://github.com/ton-blockchain/ton-language-server/pull/70
- fix(func/documentation): correctly show constant value in hover documentation in https://github.com/ton-blockchain/ton-language-server/pull/71
- fix(func/inspections): disable unused import inspection for now in https://github.com/ton-blockchain/ton-language-server/pull/75

### Other

- feat(ci): add auto mirroring for Tolk tree-sitter grammar in https://github.com/ton-blockchain/ton-language-server/pull/12
- chore: bump tolkfmt to 0.0.13 in https://github.com/ton-blockchain/ton-language-server/pull/47
- refactor(tree-sitter-tolk): improve overall tree-sitter-tolk description in https://github.com/ton-blockchain/ton-language-server/pull/48

## [0.2.0] - 14.07.2025

This release is dedicated to FunC and Tolk.

We added FunC support with many useful features and even debugging support via sandbox (big thanks
to [TonTech](https://ton.tech) for FunC debugger implementation)!

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

## [0.1.1] - 07.07.2025

Fix bug with type compatibility, this inspection is disabled by default for now.

## [0.1.0] - 07.07.2025

First stable version

## [0.0.1] - 06.07.2025

Initial development release for alpha testers
