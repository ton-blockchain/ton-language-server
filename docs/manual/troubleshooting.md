# Troubleshooting Guide

This guide helps you resolve common issues with the TON VS Code extension and Language Server in general.

## Common Issues

### Extension Not Working

If the extension is not working as expected:

1. Make sure you have the latest version of VS Code installed
2. Try reloading VS Code (Command Palette > **`Developer: Reload Window`**)
3. Check the extension is enabled (**Extensions** view > search for "Tolk")
4. Check if any other Tolk extensions are disabled to avoid conflicts

### Standard Library Not Found

If you see the error "Tolk standard library is missing! Try installing dependencies with 'yarn/npm install' or specify
`tolk.stdlib.path` in settings":

1. First, try installing dependencies in your project:

    ```bash
    yarn install
    # or
    npm install
    ```

2. If this doesn't help, try set `tolk.stdlib.path` in settings:

    - Open VS Code **Settings**
    - Search for **"Tolk: General › Stdlib Path"**
    - Set the path to your stdlib directory

3. After making any changes:
    - Reload VS Code window (Command Palette > **`Developer: Reload Window`**)
    - Or restart VS Code completely

### Installing Previous Version

If you encounter issues with the latest version, you can install a previous version:

1. Open Command Palette in VS Code (`Ctrl+Shift+P` / `Cmd+Shift+P`)
2. Type and select **"Extensions: Install Specific Version of Extension..."**
3. Select "Tolk Language" from the list
4. Choose the version you want to install from the dropdown
5. VS Code will automatically uninstall current version and install the selected one

To prevent automatic updates:

- Open VS Code **Settings**
- Search for **"Extensions: Auto Update"**
- Uncheck the option to disable automatic updates
- Or add this to your settings.json:
    ```json
    "extensions.autoUpdate": false
    ```

### Finding Logs

The language server generates logs that can help diagnose issues:

For VS Code extension, logs can be found in:

- Windows: `%USERPROFILE%\.vscode\extensions\ton-core.vscode-ton-[version]\dist\ton-language-server.log`
- macOS/Linux: `~/.vscode/extensions/ton-core.vscode-ton-[version]/dist/ton-language-server.log`

Also, you can view extension logs directly in VS Code:

1. Open **"View > Output"** menu (or press `Ctrl+Shift+U` / `Cmd+Shift+U`)
2. Select **"Tolk"** from the dropdown menu in the Output panel

These logs are helpful when reporting issues on GitHub.

### Can't access the Tolk standard library folder

TODO

## Reporting Issues

If you encounter an issue not covered here:

1. Check the [GitHub Issues](https://github.com/ton-blockchain/ton-language-server/issues) to see if it's already
   reported
2. If not, create a new issue with:
    - VS Code version
    - Extension version
    - Steps to reproduce
    - Error messages (if any)
    - Logs from the language server (see above)
    - Logs from the extension (see above)
    - Your project's configuration files

## Getting Help

- Ask questions in the [TON Group](https://t.me/tondev_eng)
- Check the [TON Documentation](https://docs.ton.org)
