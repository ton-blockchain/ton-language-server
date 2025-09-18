# Changelog

All notable changes to this project will be documented in this file.

## [0.5.0] - 19.09.2025

### Tolk

- feat(tolk): add constant evaluator, inlay hints for evaluated constants and show this value on hover in https://github.com/ton-blockchain/ton-language-server/pull/150
- feat(tolk): support `readonly` and `private` modifiers from Tolk 1.1 in https://github.com/ton-blockchain/ton-language-server/pull/156
- feat(tolk): support assembly get methods in https://github.com/ton-blockchain/ton-language-server/pull/147
- feat(tolk): support enums from Tolk 1.1 in https://github.com/ton-blockchain/ton-language-server/pull/143
- feat(tolk): use the latest tests and stdlib from Tolk 1.1 in https://github.com/ton-blockchain/ton-language-server/pull/164
- feat(tolk/highlighting): support highlighting for `enum`, `readonly` and `private` keywords in https://github.com/ton-blockchain/ton-language-server/pull/141
- feat(tolk/inlay-hints): don't show `constString` parameter hint for compile-time stdlib functions in https://github.com/ton-blockchain/ton-language-server/pull/151
- feat(tolk/inspections): add `CallArgumentsCountMismatch` inspection in https://github.com/ton-blockchain/ton-language-server/pull/138
- feat(tolk/inspections): warn about unused `packToBuilder` and `unpackFromSlice` methods for non-alias types and with wrong signature in https://github.com/ton-blockchain/ton-language-server/pull/158
- fix(tolk): fix completion for enums in https://github.com/ton-blockchain/ton-language-server/pull/157
- fix(tolk/grammar): fix triple quote string parsing in https://github.com/ton-blockchain/ton-language-server/pull/153
- refactor(tolk): small fixes in https://github.com/ton-blockchain/ton-language-server/pull/144
- refactor(tolk/type-inference): simplify type inference implementation in https://github.com/ton-blockchain/ton-language-server/pull/162

### FunC

- fix(func/inspections): support transitively includes in https://github.com/ton-blockchain/ton-language-server/pull/159

### Other

- chore(ci): enabled the `FunC` build by @Danil42Russia in https://github.com/ton-blockchain/ton-language-server/pull/168
- chore(deps): bump the npm_and_yarn group across 2 directories with 2 updates by @dependabot[bot] in https://github.com/ton-blockchain/ton-language-server/pull/165
- chore: add missed commas in README.md in https://github.com/ton-blockchain/ton-language-server/pull/139
- chore: update tolkfmt with enum support in https://github.com/ton-blockchain/ton-language-server/pull/145
- feat(ci): checking packages for vulnerabilities by @Danil42Russia in https://github.com/ton-blockchain/ton-language-server/pull/166

## [0.4.1] - 12.08.2025

### Added

- feat(tolk/grammar): support `type int = builtin` and use new syntax for stubs in https://github.com/ton-blockchain/ton-language-server/pull/129
- feat(tolk/grammar): don't use `builtin_type` at all in https://github.com/ton-blockchain/ton-language-server/pull/130

### Fixes

- fix(tolk/completion): fix `onBouncedMessage` completion in https://github.com/ton-blockchain/ton-language-server/pull/134
- fix(tolk/type-inference): correctly handle cyclic structs in https://github.com/ton-blockchain/ton-language-server/pull/133

## [0.4.0] - 11.08.2025

### Added

- feat(tolk/vscode): better support for triple-quotes strings in https://github.com/ton-blockchain/ton-language-server/pull/104
- feat(tolk/stdlib): support TOLK_STDLIB env for stdlib search in https://github.com/ton-blockchain/ton-language-server/pull/102
- feat(tolk/fmt): bump tolkfmt to v0.0.15 in https://github.com/ton-blockchain/ton-language-server/pull/93
- feat(tolk/completion): add `storage` snippet in https://github.com/ton-blockchain/ton-language-server/pull/107
- feat(tolk/completion): add snippet for `catch`, fix completion for catch variable names in https://github.com/ton-blockchain/ton-language-server/pull/110
- feat(tolk/completion): add completion option for field with `Cell<Foo>` type, to create `Foo {}.toCell()` expression in https://github.com/ton-blockchain/ton-language-server/pull/112
- feat(tolk/completion): add completion for entry point function names and for builtin methods in https://github.com/ton-blockchain/ton-language-server/pull/114
- feat(tolk/completion): better support for nullable methods in https://github.com/ton-blockchain/ton-language-server/pull/118
- feat(tolk/signature-help): support signature help for multiline calls in https://github.com/ton-blockchain/ton-language-server/pull/111
- feat(tolk/inspections): don't require `;` in grammar and give an error later in https://github.com/ton-blockchain/ton-language-server/pull/126
- feat(tolk/documentation): show size of alias/struct in https://github.com/ton-blockchain/ton-language-server/pull/115
- feat(fift/navigation): add lens to go to Tolk sources for this definition in https://github.com/ton-blockchain/ton-language-server/pull/124

### Fixes

- fix(tolk/grammar): support annotations with several arguments in grammar in https://github.com/ton-blockchain/ton-language-server/pull/95
- fix(tolk/intentions): add the correct default value for field with alias type in https://github.com/ton-blockchain/ton-language-server/pull/97
- fix(tolk/type-inference): correctly infer return type of function with several return with boolean literals in https://github.com/ton-blockchain/ton-language-server/pull/98
- fix(tolk/completion): show the correct type for variable in completion in https://github.com/ton-blockchain/ton-language-server/pull/106
- fix(tolk/find-references): correctly find reference for methods in https://github.com/ton-blockchain/ton-language-server/pull/108
- fix(tolk/type-inference): fix type inference inside generic calls in https://github.com/ton-blockchain/ton-language-server/pull/119
- fix(tolk/type-inference): fix type inference for some operators in https://github.com/ton-blockchain/ton-language-server/pull/120
- fix(boc): use the latest TASM in https://github.com/ton-blockchain/ton-language-server/pull/100
- fix(fift/highlighting): fix highlighting and go to definition for Fift names with dot in https://github.com/ton-blockchain/ton-language-server/pull/122

### Other

- chore: bump tolkfmt to v0.0.16 in https://github.com/ton-blockchain/ton-language-server/pull/113
- feat(tests): improve completion tests in https://github.com/ton-blockchain/ton-language-server/pull/116

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
