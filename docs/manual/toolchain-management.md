# Toolchain Management

The TON Language Server supports managing multiple Tolk compiler installations (toolchains) and easily switching
between them. This feature is particularly useful when working with different versions of Tolk or when developing the
compiler itself.

## What is a Toolchain?

A toolchain is a specific installation of the Tolk compiler. You might have:

- **Auto-detected toolchain**: Automatically found in your project's `node_modules` or system PATH
- **System installation**: Tolk installed globally on your system
- **Local development build**: A custom build of the compiler for development
- **Specific versions**: Different versions for different projects

## VS Code Setup

### Quick Start

1. **Open Command Palette**: Press `Ctrl+Shift+P` (Windows/Linux) or `Cmd+Shift+P` (macOS)
2. **Type**: `Tolk: Show Toolchain Information`
3. **Click**: The Tolk version in the status bar (bottom-left corner)

The extension will automatically detect your Tolk installation in most cases, so you might not need any additional
setup.

### Adding a New Toolchain

If you want to add a specific Tolk installation:

1. **Open Command Palette**: `Ctrl+Shift+P` / `Cmd+Shift+P`
2. **Run**: `Tolk: Add Toolchain`
3. **Follow the wizard**:
    - Enter a unique ID (e.g., `tolk-0.99.0`, `local-dev`)
    - Provide a display name (e.g., `Tolk 0.99.0`, `Local Development`)
    - Choose how to specify the path:
        - **Browse**: Use file picker to select the executable
        - **Manual**: Type the path directly
    - Add an optional description
    - Choose whether to activate immediately

### Switching Between Toolchains

**Method 1: Status Bar**

- Click the Tolk version in the status bar
- Select "Switch Toolchain"
- Choose from the list

**Method 2: Command Palette**

- Press `Ctrl+Shift+P` / `Cmd+Shift+P`
- Run `Tolk: Select Toolchain`
- Pick your desired toolchain

### Managing Toolchains

**View All Toolchains**:

1. Command Palette → `Tolk: Manage Toolchains`
2. Select "List All Toolchains"

**Remove a Toolchain**:

1. Command Palette → `Tolk: Manage Toolchains`
2. Select "Remove Toolchain"
3. Choose which one to remove
4. Confirm the action

### Manual Configuration

You can also edit your VS Code settings directly:

1. **Open Settings**: `Ctrl+,` / `Cmd+,`
2. **Search**: "tolk toolchain"
3. **Edit**: Click "Edit in settings.json"

```json
{
    "ton.tolk.toolchain.activeToolchain": "local-dev",
    "ton.tolk.toolchain.toolchains": {
        "auto": {
            "name": "Auto-detected",
            "path": "",
            "description": "Automatically detect Tolk compiler"
        },
        "local-dev": {
            "name": "Local Development",
            "path": "./build/tolk",
            "description": "My local build"
        }
    }
}
```
