# TON Extension

Extension for VSCode and VSCode-based editors with comprehensive support for TON Blockchain
languages and technologies including Tolk, FunC, Fift assembly, TL-B, BoC and Blueprint.

**[Features] • [Installation] • [Troubleshooting]**

[Features]: #features
[Installation]: #installation
[Troubleshooting]: #troubleshooting

[![Telegram](https://img.shields.io/badge/TON_Community-white?logo=telegram&style=flat)](https://t.me/tondev_eng)
[![Visual Studio Marketplace Downloads](https://img.shields.io/visual-studio-marketplace/d/ton-core.vscode-ton?color=white&labelColor=white&logo=tsnode&logoColor=black)](https://marketplace.visualstudio.com/items?itemName=ton-core.vscode-ton)
[![Open VSX Downloads](https://img.shields.io/open-vsx/dt/ton-core/vscode-ton?color=white&labelColor=white&logo=vscodium&logoColor=black)](https://open-vsx.org/extension/ton-core/vscode-ton)

---

## Features

Tolk support includes:

- Semantic syntax highlighting
- Code completion with auto import, postfix completion, snippets, imports completion
- Go to definition, type definition
- Find all references, workspace symbol search, symbol renaming
- Automatic import updates when renaming and moving files
- Types and documentation on hover
- Inlay hints for types, parameter names, and more
- On-the-fly inspections with quick fixes
- Signature help inside calls
- Build and test projects based on Blueprint
- Flexible toolchain management

FunC support includes:

- Semantic syntax highlighting
- Code completion, imports completion
- Go to definition
- Find all references, workspace symbol search, symbol renaming
- Automatic import updates when renaming and moving files
- Types and documentation on hover
- Inlay hints for method id
- On-the-fly inspections
- Build and test projects based on Blueprint
- Debug Blueprint-based projects

Fift assembly support includes:

- Basic and semantic syntax highlighting
- Go-to definition
- Inlay hints with instruction gas consumption
- Hover documentation for instructions

TL-B support includes:

- Basic and semantic syntax highlighting
- Go-to definition
- Completion for fields, parameters, and types
- Go-to references for types
- Hover documentation for declarations

BoC support includes:

- Automatic BoC disassembly with syntax highlighting
- Automatic updates on BoC changes

### Sandbox Integration

This extension also includes a comprehensive **TON Sandbox** — a graphical interface for local TON blockchain
testing:

- **One-Click Contract Deployment**: Deploy contracts directly from source code
- **Interactive Message Testing**: Send internal/external messages
- **Transaction Tree Visualization**: Deep inspection of all messages and transactions
- **Flexible History Management**: Rollback to any previous state, export/import scenarios
- **Contract State Monitoring**: Real-time storage and balance inspection
- **Code Lenses**: Instant deployment and method execution from editor

Perfect for rapid prototyping, interactive debugging, and educational purposes. Powered by `@ton/sandbox` package.

Check out the [Sandbox Wiki Page](https://github.com/ton-blockchain/ton-language-server/wiki/Sandbox:-1.-Overview) for
more details.

## Quick start

The easiest way to get started with TON development is to use VS Code or editors based on it:

1. Install the TON extension
   [in VS Code](https://marketplace.visualstudio.com/items?itemName=ton-core.vscode-ton)
   or [in VS Code-based editors](https://open-vsx.org/extension/ton-core/vscode-ton)
2. That's it!

The extension automatically detects your toolchain installation. If you need to work with custom-builds or
configurations, check out the [toolchain management] guide.

[toolchain management]: ./docs/manual/toolchain-management.md

## Installation

### VS Code / VSCodium / Cursor / Windsurf

1. Get the latest `.vsix` file from [releases](https://github.com/ton-blockchain/ton-language-server/releases), from
   [VS Code marketplace](https://marketplace.visualstudio.com/items?itemName=ton-core.vscode-ton),
   or from [Open VSX Registry](https://open-vsx.org/extension/ton-core/vscode-ton)
2. In VS Code:
    - Open the Command Palette (`Ctrl+Shift+P` or `Cmd+Shift+P`)
    - Type "Install from VSIX"
    - Select the downloaded `.vsix` file
    - Reload VS Code

## Troubleshooting

See [TROUBLESHOOTING.md](docs/manual/troubleshooting.md).

# License

MIT
