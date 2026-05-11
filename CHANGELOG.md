# Changelog

All notable changes to this project will be documented in this file.

## [1.0.0] - 11.05.2026

v1.0.0 collects the work since v0.6.0 and makes Acton the main TON development workflow in VS Code.

The headline change is that Acton is no longer just an external command you run next to the editor. It is now integrated
through the project lifecycle: the extension detects and updates the Acton toolchain, understands Acton.toml, offers
code lenses and context actions for builds, checks, formatting, tests and wrapper generation, runs and reruns tests
through the VS Code Testing view, debugs tests, scripts and real-chain retraces, opens Acton-powered assembly views
with source mappings, initializes dApps from Acton.toml, and turns terminal output into clickable TON links.

This release also brings Tolk support forward for the Acton era: void-type parameters from Tolk 1.4, richer annotations,
mapping-aware imports, computed enum value hints, faster analysis, cleaner completion in Acton projects and formatting
through `acton fmt`. The old Sandbox UI has been removed in favor of the Acton workflow, and CI now runs the e2e suite
to keep the extension behavior covered.

### Acton

- feat(acton): support void-type parameters from Tolk 1.4 in https://github.com/ton-blockchain/ton-language-server/pull/285
- feat(acton): support latest changes in Acton.toml in https://github.com/ton-blockchain/ton-language-server/pull/286
- feat(acton): better test fail message in https://github.com/ton-blockchain/ton-language-server/pull/287
- feat(acton): support debug for tests and scripts in https://github.com/ton-blockchain/ton-language-server/pull/288
- feat(acton): use tonscan in https://github.com/ton-blockchain/ton-language-server/pull/290
- feat(acton): show Tolk version from Acton in https://github.com/ton-blockchain/ton-language-server/pull/291
- feat(acton): add action to retrace and debug transaction from real blockchain in https://github.com/ton-blockchain/ton-language-server/pull/292
- feat(acton): add code lenses for `[fmt]`, `[check]` and add one more for `[test]` to run tests with UI in https://github.com/ton-blockchain/ton-language-server/pull/293
- feat(acton): better linter support in https://github.com/ton-blockchain/ton-language-server/pull/297
- feat(acton): support `scripts.wallet()` completion in https://github.com/ton-blockchain/ton-language-server/pull/300
- feat(acton): save files on quick fix application in https://github.com/ton-blockchain/ton-language-server/pull/303
- feat(acton): add auto installation in https://github.com/ton-blockchain/ton-language-server/pull/307
- feat(acton): add code lenses for Tolk and TypeScript wrappers in Acton.toml in https://github.com/ton-blockchain/ton-language-server/pull/309
- feat(acton): don't mention localnet yet in https://github.com/ton-blockchain/ton-language-server/pull/310
- feat(acton): support range formatting in https://github.com/ton-blockchain/ton-language-server/pull/311
- feat(acton): use `acton disasm` instead ton-assembly library in https://github.com/ton-blockchain/ton-language-server/pull/314
- feat(acton): make addresses in terminal clickable and add setting for explorer in https://github.com/ton-blockchain/ton-language-server/pull/327
- feat(acton): rerun failed tests in https://github.com/ton-blockchain/ton-language-server/pull/328
- feat(acton): enrich VS Code test runner integration in https://github.com/ton-blockchain/ton-language-server/pull/329
- feat(acton): make `--backtrace full` clickable for scripts in https://github.com/ton-blockchain/ton-language-server/pull/330
- feat(acton): add disassembly view with mapping from Tolk to assembly and vice versa in https://github.com/ton-blockchain/ton-language-server/pull/331
- feat(acton): add context action for Acton.toml to initialize dApp in https://github.com/ton-blockchain/ton-language-server/pull/332
- feat(acton): check for new version in https://github.com/ton-blockchain/ton-language-server/pull/333
- feat(acton): better Acton.toml parsing in https://github.com/ton-blockchain/ton-language-server/pull/337
- fix(acton): fix long initialization in https://github.com/ton-blockchain/ton-language-server/pull/338

### Tolk

- feat(tolk): remove call argument inspection since we are using acton check for linting in https://github.com/ton-blockchain/ton-language-server/pull/289
- feat(tolk): don't show symbols with `__` prefix in completion in https://github.com/ton-blockchain/ton-language-server/pull/294
- feat(tolk): don't show `.acton` symbols in `contract/` in https://github.com/ton-blockchain/ton-language-server/pull/295
- feat(tolk): don't show `.acton` imports in `contract/` import completion in https://github.com/ton-blockchain/ton-language-server/pull/296
- feat(tolk): don't add parameters hints for obvious functions in https://github.com/ton-blockchain/ton-language-server/pull/304
- feat(tolk): support dotted annotations, annotations for structs and annotations with types in https://github.com/ton-blockchain/ton-language-server/pull/305
- feat(tolk): add code lenses for building and generating Tolk and TypeScript wrappers in https://github.com/ton-blockchain/ton-language-server/pull/306
- feat(tolk): add intention to generate 32-bit opcode for structs in https://github.com/ton-blockchain/ton-language-server/pull/308
- feat(tolk): remove `symbolsNamespace` field support from contract header in https://github.com/ton-blockchain/ton-language-server/pull/312
- feat(tolk): faster analysis in https://github.com/ton-blockchain/ton-language-server/pull/317
- feat(tolk): add computed enum value inlay hint in https://github.com/ton-blockchain/ton-language-server/pull/320
- feat(tolk): don't add autocompletion for declaration names in https://github.com/ton-blockchain/ton-language-server/pull/321
- feat(tolk): better support for annotations in https://github.com/ton-blockchain/ton-language-server/pull/334
- fix(tolk): fix completion tests and add more in https://github.com/ton-blockchain/ton-language-server/pull/313
- fix(tolk): fix completion in incomplete assert in https://github.com/ton-blockchain/ton-language-server/pull/316
- fix(tolk): fix formatting with Acton in https://github.com/ton-blockchain/ton-language-server/pull/335
- fix(tolk): fix auto import with mappings in https://github.com/ton-blockchain/ton-language-server/pull/336

### Other

- feat(all): better support for external changes in https://github.com/ton-blockchain/ton-language-server/pull/315
- feat(all): enable production mode in https://github.com/ton-blockchain/ton-language-server/pull/324
- feat(all): add various additional files in https://github.com/ton-blockchain/ton-language-server/pull/326
- feat(ci): run e2e tests on CI in https://github.com/ton-blockchain/ton-language-server/pull/319
- fix(server): normalize URI file in https://github.com/ton-blockchain/ton-language-server/pull/302
- fix(all): fix e2e tests in https://github.com/ton-blockchain/ton-language-server/pull/318
- fix(tests): fix e2e flake and remove tolkfmt completely in https://github.com/ton-blockchain/ton-language-server/pull/323
- fix(ci): permission `Zizmor` to upload `SARIF` report in https://github.com/ton-blockchain/ton-language-server/pull/301
- chore(all): update dependencies with vulnerabilities in https://github.com/ton-blockchain/ton-language-server/pull/284
- chore(all): update security for the project in https://github.com/ton-blockchain/ton-language-server/pull/298
- chore(all): remove Sandbox UI, use Acton in https://github.com/ton-blockchain/ton-language-server/pull/322
- chore(all): cleanup in https://github.com/ton-blockchain/ton-language-server/pull/325
- chore(all): update dependencies with vulnerabilities in https://github.com/ton-blockchain/ton-language-server/pull/340
- chore(ci): add `Zizmor` check in https://github.com/ton-blockchain/ton-language-server/pull/299

## [0.6.0] - 26.03.2026

### Tolk

- feat(tolk): add explicit return type for `unpackFromSlice` completion in https://github.com/ton-blockchain/ton-language-server/pull/279
- feat(tolk): better TextMate grammar in https://github.com/ton-blockchain/ton-language-server/pull/234
- feat(tolk): highlight self parameter as keyword in https://github.com/ton-blockchain/ton-language-server/pull/243
- feat(tolk): support `??` operator from Tolk 1.3 in https://github.com/ton-blockchain/ton-language-server/pull/256
- feat(tolk): support arrays from Tolk 1.3 in https://github.com/ton-blockchain/ton-language-server/pull/263
- feat(tolk): support contract declaration from Tolk 1.3 in https://github.com/ton-blockchain/ton-language-server/pull/261
- feat(tolk): support mappings from Tolk 1.3 in https://github.com/ton-blockchain/ton-language-server/pull/265
- feat(tolk): support string type from Tolk 1.3 in https://github.com/ton-blockchain/ton-language-server/pull/258
- feat(tolk): update tolkfmt version in https://github.com/ton-blockchain/ton-language-server/pull/271
- fix(tolk): better handling for recursive types in type inference in https://github.com/ton-blockchain/ton-language-server/pull/233
- fix(tolk): better resolving for generic method call in https://github.com/ton-blockchain/ton-language-server/pull/242
- fix(tolk): don't require field with `T=void` in https://github.com/ton-blockchain/ton-language-server/pull/225
- fix(tolk): don't show private fields in completion in https://github.com/ton-blockchain/ton-language-server/pull/231
- fix(tolk/signature-help): fix signature help for generic method call with explicit type arguments in https://github.com/ton-blockchain/ton-language-server/pull/245
- fix(tolkfmt): fix assembly function rearrange formatting in https://github.com/ton-blockchain/ton-language-server/pull/209

## [0.5.1] - 09.11.2025

### Added

- Sandbox by @i582 in https://github.com/ton-blockchain/ton-language-server/pull/177
- feat(vscode): added more `TON`-related extensions to the conflicting by @Danil42Russia in https://github.com/ton-blockchain/ton-language-server/pull/179
- feat(sandbox): add a go-to-exit code throw position button if available by @i582 in https://github.com/ton-blockchain/ton-language-server/pull/181
- feat(tlb): add an inlay hint with calculated type hash by @i582 in https://github.com/ton-blockchain/ton-language-server/pull/189
- feat: use the latest TVM specification by @i582 in https://github.com/ton-blockchain/ton-language-server/pull/193
- feat(tolk): support lambdas from Tolk 1.2 by @i582 in https://github.com/ton-blockchain/ton-language-server/pull/202

### Other

- chore(utils): migration from `jssha` to the standard `crypto` library by @Danil42Russia in https://github.com/ton-blockchain/ton-language-server/pull/170
- chore(deps): bump the npm_and_yarn group across 3 directories with 1 update by @dependabot[bot] in https://github.com/ton-blockchain/ton-language-server/pull/173
- chore(grammar): removed unnecessary dependencies by @Danil42Russia in https://github.com/ton-blockchain/ton-language-server/pull/175
- refactor(all): reformat imports by @i582 in https://github.com/ton-blockchain/ton-language-server/pull/178
- feat(ci): disable grammar synchronization for forks by @Danil42Russia in https://github.com/ton-blockchain/ton-language-server/pull/180
- fix(all): rules in editorconfig by @Danil42Russia in https://github.com/ton-blockchain/ton-language-server/pull/182
- chore(all): updated yarn to version 4.10.3 by @Danil42Russia in https://github.com/ton-blockchain/ton-language-server/pull/183
- fix(ci): `setup-emsdk` action by @Danil42Russia in https://github.com/ton-blockchain/ton-language-server/pull/184
- chore(ci): check `stylelint` by @Danil42Russia in https://github.com/ton-blockchain/ton-language-server/pull/185
- feat(ci): removed unnecessary launches for building `tree-sitter` by @Danil42Russia in https://github.com/ton-blockchain/ton-language-server/pull/186
- chore(ci): for branches, run security checks only when changes are made by @Danil42Russia in https://github.com/ton-blockchain/ton-language-server/pull/190
- chore(ci): updated actions versions by @Danil42Russia in https://github.com/ton-blockchain/ton-language-server/pull/191
- feat(tree-sitter-tolk): add Rust bindings by @i582 in https://github.com/ton-blockchain/ton-language-server/pull/194
- fix(tree-sitter-tolk): fix Rust bindings by @i582 in https://github.com/ton-blockchain/ton-language-server/pull/195
- fix(tree-sitter-tolk): remove the target folder by @Danil42Russia in https://github.com/ton-blockchain/ton-language-server/pull/197
- Remove artifacts and ignore by @Trinketer22 in https://github.com/ton-blockchain/ton-language-server/pull/200
- feat(tolk/fmt): bump tolkfmt version to 0.0.23 by @i582 in https://github.com/ton-blockchain/ton-language-server/pull/203

## New Contributors

- @Trinketer22 made their first contribution in https://github.com/ton-blockchain/ton-language-server/pull/200

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
