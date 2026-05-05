# Acton Integration

The VS Code extension treats Acton projects as the primary TON smart contract workflow.

An Acton project is detected by an `Acton.toml` file in the workspace. Once detected, the extension provides:

- code lenses for building, testing, running, and generating wrappers
- `acton check` diagnostics on Tolk file changes
- `acton fmt` formatting for Tolk files
- native Acton test discovery through the VS Code Testing view
- retrace debugging commands for transactions
- wallet management from the TON Wallets view

## Requirements

Install the Acton CLI and make sure it is available in `PATH`.

If the executable is installed elsewhere, set:

```json
{
    "ton.acton.path": "/absolute/path/to/acton"
}
```

## Formatting

Tolk formatting is performed by `acton fmt`.

Formatting can be disabled with:

```json
{
    "ton.tolk.formatter.useFormatter": false
}
```

## Diagnostics

The Acton linter runs `acton check` after Tolk file changes. It can be configured with:

```json
{
    "ton.acton.linter.enabled": true,
    "ton.acton.linter.debounce": 100
}
```

## Tests

The extension keeps an Acton test controller registered for projects with `Acton.toml`.
Tests can be run from the VS Code Testing view or from Acton code lenses.
