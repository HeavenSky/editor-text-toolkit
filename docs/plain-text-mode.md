# Open large files in plain text mode

**English** · [简体中文](../zh/docs/plain-text-mode.md)

This page shows how to read, search and edit a large text or log file without lag, and what the mode changes in your settings; it works on any file VS Code can open as text.

## Enter the mode

The Explorer is the fastest way in, because the file is never rendered normally first. Any of these work:

- Explorer right-click → `Open in Plain Text Mode`: opens the file and enters the mode in one step. Accepts a multi-selection; folders are skipped.
- `Text Toolkit: Toggle Plain Text Mode`: for the file already in front of you.
- The size prompt: opening a file of at least `textToolkit.plainText.promptSizeMB` MB (default `2`) asks whether to switch. `Don't ask again` is remembered; re-enable it from the Plain Text Mode entry in the picker. Set the value to `0` to never be asked.
- Files VS Code refuses to show: above `workbench.editorLargeFileConfirmation` MB, VS Code shows *"The file is not displayed in the text editor because it is very large"* instead of the content. A notification offers plain text mode for that tab; the file opens through the extension host, which is not bound by that limit, so you do not need `Open Anyway` first. It follows the same `Don't ask again` switch and the same `0` value.
- Automatically: files whose extension is listed in `textToolkit.plainText.autoApplyExtensions`, for example `[".log", ".csv"]`, enter the mode without asking.

## What changes while the mode is on

The document language becomes `plaintext`, which stops tokenization, semantic highlighting and every language-specific provider for that file. A `Plain Text` status bar item shows the mode is on; click it, or toggle again, to leave.

**Language extensions never wake up** when you open a file from the Explorer command. VS Code activates a language extension the moment a file of that language is opened, so a large `.ts` would otherwise start the TypeScript server. The extension briefly adds a `files.associations` entry for exactly that file to your User settings, opens the file as `plaintext`, and removes the entry again. An entry you already had for the same pattern is left alone.

The extension writes 29 editor settings under the `[plaintext]` scope: word wrap turns on, and minimap, folding, sticky scroll, bracket colorization, guides, hovers, suggestions, code lens, links and the Unicode scanners turn off. Because they are language-scoped, your code files are unaffected. The full list is in [The 29 built-in overrides](#the-29-built-in-overrides).

## Leave the mode and restore everything

Leaving the mode restores the language the file would otherwise have had and every setting value it replaced, including values that were not set before. Settings go to Workspace settings when a folder is open, otherwise to User settings; the temporary `files.associations` entry always goes to User settings, so nothing is written to a repository's `.vscode/settings.json` for it. An entry left behind by a crashed window is removed the next time the extension starts.

## What it cannot speed up

The mode removes rendering and language-service work; it does not change how VS Code loads a file. The whole document still lives in memory, and find and replace still run over all of it. Files of tens of MB get noticeably faster; files of hundreds of MB do not.

The `workbench.editorLargeFileConfirmation` limit does not apply, but `files.maxMemoryForLargeFilesMB` still does. The extension deliberately leaves that one alone, because raising it trades stalls for out-of-memory crashes.

## Tune the overrides

Four keys in `textToolkit.advanced` control the mode:

| Key | Default | Effect |
| --- | --- | --- |
| `plainText.applyEditorSettings` | `true` | `false` only switches the language and writes none of the 29 overrides |
| `plainText.disableLineNumbers` | `false` | `true` also hides line numbers while the mode is on |
| `plainText.suppressLanguageActivation` | `true` | `false` opens Explorer files normally and switches the language afterwards |
| `plainText.editorOverrides` | `{}` | Changes, removes or adds entries in the override table |

`plainText.editorOverrides` is merged into the built-in table, not used instead of it:

- a setting id with a value changes that entry: `"editor.minimap.enabled": true` keeps the minimap;
- a setting id with `null` removes the entry, so your own global value applies;
- any other `editor.*` setting id is added to the table.

```json
{
  "textToolkit.advanced": {
    "plainText.disableLineNumbers": true,
    "plainText.editorOverrides": {
      "editor.minimap.enabled": true,
      "editor.hover.enabled": null
    }
  }
}
```

In `settings.json`, the value of `plainText.editorOverrides` offers a snippet that writes out the whole table, ready to edit.

## The 29 built-in overrides

| Setting id | Built-in value |
| --- | --- |
| `editor.minimap.enabled` | `false` |
| `editor.wordWrap` | `"on"` |
| `editor.folding` | `false` |
| `editor.stickyScroll.enabled` | `false` |
| `editor.bracketPairColorization.enabled` | `false` |
| `editor.guides.indentation` | `false` |
| `editor.guides.bracketPairs` | `false` |
| `editor.matchBrackets` | `"never"` |
| `editor.occurrencesHighlight` | `"off"` |
| `editor.selectionHighlight` | `false` |
| `editor.renderWhitespace` | `"none"` |
| `editor.renderControlCharacters` | `false` |
| `editor.codeLens` | `false` |
| `editor.colorDecorators` | `false` |
| `editor.links` | `false` |
| `editor.hover.enabled` | `false` |
| `editor.parameterHints.enabled` | `false` |
| `editor.suggestOnTriggerCharacters` | `false` |
| `editor.wordBasedSuggestions` | `"off"` |
| `editor.quickSuggestions` | `{ "other": false, "comments": false, "strings": false }` |
| `editor.formatOnType` | `false` |
| `editor.formatOnPaste` | `false` |
| `editor.autoClosingBrackets` | `"never"` |
| `editor.autoClosingQuotes` | `"never"` |
| `editor.trimAutoWhitespace` | `false` |
| `editor.semanticHighlighting.enabled` | `false` |
| `editor.unicodeHighlight.nonBasicASCII` | `false` |
| `editor.unicodeHighlight.invisibleCharacters` | `false` |
| `editor.unicodeHighlight.ambiguousCharacters` | `false` |
