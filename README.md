# TON Language Server

Language server and an [extension for VS Code](./editors/code) and VSCode-based editors with comprehensive support for
TON Blockchain languages and technologies including Tolk, FunC, Fift assembly, TL-B, BoC and Blueprint.

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

1. Get the latest `.vsix` file from [releases](https://github.com/ton-blockchain/ton-language-server/releases) from
   [VS Code marketplace](https://marketplace.visualstudio.com/items?itemName=ton-core.vscode-ton)
   or from [Open VSX Registry](https://open-vsx.org/extension/ton-core/vscode-ton)
2. In VS Code:
    - Open the Command Palette (`Ctrl+Shift+P` or `Cmd+Shift+P`)
    - Type "Install from VSIX"
    - Select the downloaded `.vsix` file
    - Reload VS Code

### Other Editors

1. Get the latest archive from [releases](https://github.com/ton-blockchain/ton-language-server/releases):
    - `ton-language-server-*.tar.gz` for Linux/macOS
    - `ton-language-server-*.zip` for Windows
2. Extract it to a convenient location
3. Configure your editor to use the language server (see editor-specific instructions below)

### Building from Source

If you want to build the language server yourself:

```shell
git clone https://github.com/ton-blockchain/ton-language-server
cd ton-language-server
yarn install
yarn build
```

To obtain the `.vsix` package with the VS Code extension, additionally run:

```shell
yarn package
```

Then run either of those to install the extension from the `.vsix` package:

```shell
# VSCode, replace VERSION with the actual version from package.json
code --install-extension vscode-ton-VERSION.vsix

# VSCodium, replace VERSION with the actual version from package.json
codium --install-extension vscode-ton-VERSION.vsix
```

## Editor Setup

### Sublime Text

1. Install [LSP](https://packagecontrol.io/packages/LSP) package:

    - Open Command Palette (`Ctrl+Shift+P` or `Cmd+Shift+P`)
    - Select "Package Control: Install Package"
    - Search for and select "LSP"

2. Add the following configuration to your LSP settings (`Preferences > Package Settings > LSP > Settings`):

    ```jsonc
    {
        "clients": {
            "ton": {
                "enabled": true,
                "command": ["node", "path/to/language-server/server.js", "--stdio"],
                "selector": "source.tolk, source.fift, source.tlb",
            },
        },
        "inhibit_snippet_completions": true,
        "semantic_highlighting": true,
    }
    ```

3. Create a new file or open an existing file with the `.tolk`, `.fift`, or `.tlb` extension to verify the setup

### Neovim

Prerequisites:

- [nvim-lspconfig](https://github.com/neovim/nvim-lspconfig)
- Neovim 0.5.0 or newer

Setup steps:

1. Add `ton.lua` to your `lua/lspconfig/server_configurations` directory with the following content:

    ```lua
    local util = require 'lspconfig.util'

    return {
      default_config = {
        cmd = { 'node', '/absolute/path/to/language-server/server.js', '--stdio' },
        filetypes = { 'tolk', 'fift', 'tlb' },
        root_dir = util.root_pattern('package.json', '.git'),
      },
      docs = {
        description = [[
          TON Language Server
          https://github.com/ton-blockchain/ton-language-server
        ]],
        default_config = {
          root_dir = [[root_pattern("package.json", ".git")]],
        },
      },
    }
    ```

2. Add the following to your `init.lua`:

    ```lua
    require'lspconfig'.ton.setup {}
    ```

### Vim

Prerequisites:

- Vim 8 or newer
- Async LSP Client for Vim: [vim-lsp](https://github.com/prabirshrestha/vim-lsp)

Recommended, but not required:

- Auto-configurations for many language servers: [vim-lsp-settings](https://github.com/mattn/vim-lsp-settings)

Setup steps:

1. Install the [vim-lsp](https://github.com/prabirshrestha/vim-lsp) plugin if it isn't already installed. For that,
   use [vim-plug](https://github.com/junegunn/vim-plug) or the built-in package manager of Vim 8+, see [
   `:help packages`](https://vimhelp.org/repeat.txt.html#packages).

- If it wasn't installed before, you should set up basic keybindings with the language client. Add the following to your
  `~/.vimrc` (or `~/_vimrc` if you're on Windows):

    ```vim
    function! s:on_lsp_buffer_enabled() abort
        setlocal omnifunc=lsp#complete
        setlocal signcolumn=yes
        if exists('+tagfunc') | setlocal tagfunc=lsp#tagfunc | endif
        nmap <buffer> gd <plug>(lsp-definition)
        nmap <buffer> gs <plug>(lsp-document-symbol-search)
        nmap <buffer> gS <plug>(lsp-workspace-symbol-search)
        nmap <buffer> gr <plug>(lsp-references)
        nmap <buffer> gi <plug>(lsp-implementation)
        nmap <buffer> gt <plug>(lsp-type-definition)
        nmap <buffer> <leader>rn <plug>(lsp-rename)
        nmap <buffer> [g <plug>(lsp-previous-diagnostic)
        nmap <buffer> ]g <plug>(lsp-next-diagnostic)
        nmap <buffer> K <plug>(lsp-hover)
        nnoremap <buffer> <expr><c-f> lsp#scroll(+4)
        nnoremap <buffer> <expr><c-d> lsp#scroll(-4)

        let g:lsp_format_sync_timeout = 1000
        autocmd! BufWritePre *.rs,*.go call execute('LspDocumentFormatSync')

        " Refer to the doc to add more commands:
        " https://github.com/prabirshrestha/vim-lsp#supported-commands
    endfunction

    augroup lsp_install
        au!
        " call s:on_lsp_buffer_enabled only for languages that have the server registered.
        autocmd User lsp_buffer_enabled call s:on_lsp_buffer_enabled()
    augroup END
    ```

2. Add the following to your `~/.vimrc` (or `~/_vimrc` if you're on Windows):

    ```vim
    if executable('node')
      au User lsp_setup call lsp#register_server({
            \ 'name': 'tolk',
            \ 'cmd': {server_info->['node', '/absolute/path/to/language-server/server.js', '--stdio']},
            \ 'allowlist': ['tolk'],
            \ })
    endif
    ```

### Helix

1. Add the following configuration to your `~/.config/helix/languages.toml`:

    ```toml
    [[language]]
    name = "tolk"
    language-servers = ["ton-language-server"]

    [language-server.ton-language-server]
    command = "node"
    args = ["/absolute/path/to/language-server/server.js", "--stdio"]
    ```

2. Replace `path/to/language-server` with the actual path where you cloned the repository
3. Restart Helix for changes to take effect

## Troubleshooting

See [TROUBLESHOOTING.md](./docs/manual/troubleshooting.md).

## Thanks

- Big thanks to [TonTech](https://ton.tech) for [FunC debugger
  implementation](https://github.com/krigga/tvm-debugger)!

## License

MIT
