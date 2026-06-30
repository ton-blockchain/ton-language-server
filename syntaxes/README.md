# Syntaxes

`tolk.tmLanguage.json` intentionally lives in this top-level `syntaxes/`
directory.

GitHub Linguist only discovers JSON TextMate grammars from directories named
`syntaxes` or `grammars`, unless a grammar repository is allowlisted for a
non-standard path. The rest of this extension keeps editor assets under
`editors/code/src/...`, but Linguist ignores grammar files under `src`, so the
Tolk grammar must stay here for upstream integration.

When moving or renaming this file, update the VS Code grammar contribution in
`package.json`, the TextMate grammar tests, and the Linguist grammar
registration.
