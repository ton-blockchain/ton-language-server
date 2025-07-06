# Contributing

This repository hosts two main parts: a VS Code extension for TON's languages support and a united Language Server. The
Language Server implements the [Language Server Protocol (LSP)](https://microsoft.github.io/language-server-protocol/),
enabling smart features like autocompletion and go-to-definition for the VS Code extension and other LSP-compatible
editors.

## Getting Started

### Prerequisites

Ensure you have the following software installed:

- **Node.js**: Version 22.x is recommended (aligns with our CI/CD pipelines).
- **Yarn**: Classic or Berry.
- **Visual Studio Code**: For extension development.

### Installation

1. Clone the repository:

```bash
git clone https://github.com/ton-blockchain/ton-language-server.git
cd ton-language-server
```

2. Install dependencies:

```bash
yarn install
```

## Building the Project

To build the VS Code extension and Language Server, run:

```bash
yarn build
```

This command uses Webpack to bundle the project files.

For development, enable watch mode to automatically rebuild on file changes:

```bash
yarn watch
```

## VS Code extension

The VS Code extension code resides in the `client/` directory. The root `package.json` file serves as the extension's
manifest, defining properties like syntax highlighting paths.

Language-specific editor features like comment toggling, bracket matching, and auto-closing pairs are defined in:

- [client/src/languages/tolk-language-configuration.json](client/src/languages/tolk-language-configuration.json) (for Tolk)
- [client/src/languages/fift-language-configuration.json](client/src/languages/fift-language-configuration.json) (for
  Fift)
- [client/src/languages/tasm-language-configuration.json](client/src/languages/tasm-language-configuration.json) (for
  TASM)
- [client/src/languages/tlb-language-configuration.json](client/src/languages/tlb-language-configuration.json) (for
  TL-B)

Language-specific highlighting grammars are defined in:

- [client/src/languages/syntaxes/tolk.tmLanguage.json](client/src/languages/syntaxes/tolk.tmLanguage.json) (for Tolk)
- [client/src/languages/syntaxes/fift.tmLanguage.json](client/src/languages/syntaxes/fift.tmLanguage.json) (for Fift)
- [client/src/languages/syntaxes/tasm.tmLanguage.json](client/src/languages/syntaxes/tasm.tmLanguage.json) (for TASM)
- [client/src/languages/syntaxes/tlb.tmLanguage.json](client/src/languages/syntaxes/tlb.tmLanguage.json) (for TL-B)

Refer to
the [VS Code Language Configuration Guide](https://code.visualstudio.com/api/language-extensions/language-configuration-guide)
for more details on these files.

To begin developing the extension:

1. Run `yarn watch` in the project root. This starts the build in watch mode.
2. Open the project folder in VS Code.
3. The main extension point is in `client/src/extension.ts`.
4. Press `F5` to start debugging the extension.

When you make changes, the project will automatically rebuild. Reload the VS Code window (Developer: Reload Window)
where you are testing the extension to see the changes. For general information, see
the [VS Code extension documentation](https://code.visualstudio.com/api/get-started/your-first-extension).

This development setup also facilitates debugging the Language Server, as it runs within the same development host.

## Language Server

The Language Server is located in the `server/` folder.

The general architecture of the LS can be described as follows:

### High-level architecture

#### Parsing

We use [Tree-sitter](https://tree-sitter.github.io/tree-sitter/) to parse code and build Concrete Syntax Trees (CSTs).
The primary grammars are:

1. [server/src/languages/tolk/tree-sitter-tolk](server/src/languages/tolk/tree-sitter-tolk) — Tolk grammar
2. [server/src/languages/fift/tree-sitter-fift](server/src/languages/fift/tree-sitter-fift) — TVM Assembly grammar
3. [server/src/languages/tlb/tree-sitter-tlb](server/src/languages/tlb/tree-sitter-tlb) — TL-B grammar

#### Indexes

To simplify the architecture and leverage the typically small size of Tolk projects, the Language Server loads all
project files and the standard library into memory upon initialization. This approach provides instant access to
definitions across files.

#### Endpoints

The main entry points for Language Server features are defined in `server/src/server.ts`. Implementations for more
complex features are organized into separate directories, while simpler ones may be found directly within `server.ts`.

##### Documentation

TVM instruction descriptions for assembler documentation and autocompletion are sourced from a JSON specification file.
A local copy is maintained at `server/src/completion/data/asm.json`, originally based on
the [TVM Spec](https://github.com/ton-community/tvm-spec/issues).

### Testing

For LS testing, we use end-to-end (e2e) tests that run in a separate instance of VS Code. This setup allows us to test
the LS in conditions that closely mimic real-world usage.

All tests are located in the [server/src/e2e](server/src/e2e) folder.

#### Running Tests

To run all tests, execute the following command:

```bash
yarn test:e2e
```

To run all tests with coverage, execute the following command:

```bash
yarn test:e2e:coverage
```

#### Test Filtering

The test system supports filtering by test suite, specific files, and test patterns:

```bash
# Run specific test suite
yarn test:e2e --suite completion

# Run specific test file
yarn test:e2e --file structs.test

# Run tests matching a pattern
yarn test:e2e --test "struct fields"

# Update snapshots
yarn test:e2e --update-snapshots

# Run with verbose logging
yarn test:e2e --verbose
```

For detailed documentation on all filtering options, predefined scripts, and usage examples,
see [server/src/e2e/README.md](server/src/e2e/README.md).

#### Test Structure

Each feature has its tests in a separate folder within [server/src/e2e/suite](server/src/e2e/tolk).

The following test format is used for tests:

```
========================================================================
<name of the test>
========================================================================
<code>
------------------------------------------------------------------------
<expected result>
```

To update test snapshots automatically:

```
yarn test:e2e:update
```

To add a new test, create a file with a `.test` extension in the relevant feature's test directory.

Other available test scripts include:

- `yarn test`: Runs Jest tests.

## Grammar Development

If you are working on the Tolk or Fift language grammars, you can use the following scripts to generate the necessary
WebAssembly files:

- To build both Tolk and Fift WASM files:
    ```bash
    yarn grammar:wasm
    ```
- To build only the Tolk WASM file:
    ```bash
    yarn grammar:tolk:wasm
    ```
- To build only the Fift WASM file:
    ```bash
    yarn grammar:fift:wasm
    ```
    These scripts navigate to the respective `tree-sitter-tolk` or `tree-sitter-fift` directories, generate the parser,
    and build the WASM module.

## Packaging the Extension

To package the VS Code extension into a `.vsix` file for distribution or local installation, run:

```bash
yarn package
```

This script uses `vsce package` to create the extension package. Ensure you have `vsce` installed globally or use
`npx vsce`.

## Code Style

This project uses ESLint for linting and Prettier for formatting.

- To lint your code, run:
    ```bash
    yarn lint
    ```
- To format your code, run:
    ```bash
    yarn fmt
    ```
- To check for formatting issues without applying changes, run:
    ```bash
    yarn fmt:check
    ```

We recommend configuring your editor to format code on save and installing an ESLint plugin for real-time linting
feedback.

## Pre-commit Hooks

This project uses [Husky](https://typicode.github.io/husky/) to manage pre-commit hooks. These hooks automatically run
linters and formatters before each commit, helping to maintain code quality and consistency. Husky is set up via the
`postinstall` script in `package.json`.

## Release process

This section outlines the steps for releasing the Tolk Language Server to NPM and packaging the VS Code extension for
the VS Code Marketplace.

### VS Code Extension (Marketplace)

To package the VS Code extension for release:

1. Ensure the `version` in the root `package.json` is updated and all changes are committed.
   The `README-extension.md` (used for the marketplace description) should also be up to date.
2. Run the packaging script:
    ```bash
    yarn build && yarn package
    ```
    This command uses `npx vsce package` to create a `.vsix` file (e.g.,
    `vscode-ton-0.7.1.vsix`) in the root of the project.
3. The generated `.vsix` file can then be uploaded to
   the [VS Code Marketplace](https://marketplace.visualstudio.com/manage/publishers/)
   and [Open VSIX Registry](https://open-vsx.org).

Refer to the
official [VS Code documentation for publishing extensions](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)
and [Open VSIX Registry documentation for publishing extensions](https://github.com/EclipseFdn/open-vsx.org/wiki/Publishing-Extensions)
for more details on the marketplace upload process.
