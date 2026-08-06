# Editor Text Toolkit

Editing tools merged into one VS Code extension, with zero runtime dependencies. UI available in English and 简体中文 (follows the VS Code display language).

1. **Copy Path With Line Numbers** — copy `path:3-4,8` style references with a configurable path style, separator and multi-line format.
2. **Change Case** — convert the selection(s) or the word under the cursor between 16 case styles, with a preview picker.
3. **Align by RegEx** — align selected lines by a regular expression, with reusable named templates.
4. **Plain Text Mode** — strip highlighting, minimap, folding, hovers and suggestions so large text/log files stay responsive for reading, searching and replacing.
5. **Compare (Diff)** — diff two selections, a selection against the clipboard, two visible editors or any two open tabs, with optional pre-comparison normalization rules.

## Commands

Eight commands in the Command Palette, all under the `Text Toolkit` category. Everything else is reachable through the two-level picker instead of flooding the palette.

| Command ID | Title | Arguments (for keybindings) |
| --- | --- | --- |
| `textToolkit.commands` | Show All Commands | — |
| `textToolkit.copyPathWithLines` | Copy Path With Line Numbers | `{ "pathStyle": "absolute" \| "relative" \| "tilde" \| "fileName" }` |
| `textToolkit.changeCase` | Change Case... | `{ "style": "camel" }` (any of the 16 styles) |
| `textToolkit.alignByRegex` | Align by RegEx | `{ "regex": "=" }` or `{ "template": "assign" }` |
| `textToolkit.plainText.toggle` | Toggle Plain Text Mode | — |
| `textToolkit.diff.markSelection` | Select Text for Compare | — |
| `textToolkit.diff.compareWithMarked` | Compare Text with Marked Selection | — |
| `textToolkit.diff.compareWithClipboard` | Compare Text with Clipboard | — |

Six further commands are menu-only and hidden from the palette — either they need a file to act on, or they are low-frequency enough that the picker is the better home. All of them still accept keybindings:

| Command ID | Title | Where |
| --- | --- | --- |
| `textToolkit.plainText.open` | Open in Plain Text Mode | Explorer right-click, on files (not folders) |
| `textToolkit.diff.compareVisibleEditors` | Compare Text in Visible Editors | Compare (Diff) picker |
| `textToolkit.diff.compareTabs` | Compare Text in Two Open Tabs | Compare (Diff) picker |
| `textToolkit.diff.swapSides` | Swap Diff Sides | Compare (Diff) picker |
| `textToolkit.diff.toggleNormalizationRules` | Toggle Normalization Rules | Compare (Diff) picker |
| `textToolkit.diff.showMenu` | Show Compare Menu | Compare status bar item |

### Two-level picker

`Text Toolkit: Show All Commands` opens a first level of five categories, each showing the settings currently in effect. Picking one opens the second level:

| Category | Second level |
| --- | --- |
| Copy Path With Line Numbers | Copy using current setting, plus each of the four path styles as a one-off (never writes your settings) |
| Change Case | The 16 styles; with a single-line selection each entry previews the converted text |
| Align by RegEx | `Enter a regular expression...`, plus every saved template listed with its pattern |
| Plain Text Mode | Enable / Disable (whichever applies), and Re-enable large file prompt |
| Compare (Diff) | Mark, compare with the mark, compare with the clipboard, compare visible editors, compare two open tabs, swap sides, toggle normalization rules, and clear the mark when one is set |

Rules that hold everywhere: the second level always starts with `← Back`, which returns to the first level; `Esc` cancels the whole flow without changing anything; the first level never performs an action by itself.

### Keybindings

This extension contributes **no default keybindings** — nothing is bound out of the box, so it cannot collide with your existing bindings or with other extensions. Bind what you use, optionally with arguments:

```json
[
  { "key": "shift+alt+c", "command": "textToolkit.copyPathWithLines", "when": "editorTextFocus" },
  { "key": "shift+alt+p", "command": "textToolkit.copyPathWithLines", "args": { "pathStyle": "absolute" }, "when": "editorTextFocus" },
  { "key": "ctrl+alt+k", "command": "textToolkit.changeCase", "args": { "style": "kebab" }, "when": "editorTextFocus" },
  { "key": "ctrl+alt+a", "command": "textToolkit.alignByRegex", "args": { "template": "assign" }, "when": "editorHasSelection" },
  { "key": "ctrl+alt+t", "command": "textToolkit.commands" },
  { "key": "ctrl+1", "command": "textToolkit.diff.markSelection", "when": "editorTextFocus" },
  { "key": "ctrl+2", "command": "textToolkit.diff.compareWithMarked", "when": "editorTextFocus" },
  { "key": "ctrl+3", "command": "textToolkit.diff.compareWithClipboard", "when": "editorTextFocus" }
]
```

`Copy Path With Line Numbers`, `Select Text for Compare` and `Compare Text with Marked Selection` are in the editor context menu, and `Open in Plain Text Mode` is in the Explorer context menu.

## Settings

Settings come in two layers, so the Settings UI stays short.

### Exposed layer — the ten settings you actually tune

```json
{
  "textToolkit.copyPath.pathStyle": "absolute",
  "textToolkit.copyPath.separator": ":",
  "textToolkit.copyPath.multiLineFormat": "range",
  "textToolkit.alignByRegex.templates": { "assign": "=|,|:" },
  "textToolkit.plainText.promptSizeMB": 2,
  "textToolkit.plainText.autoApplyExtensions": [".log", ".csv"],
  "textToolkit.diff.normalizationRules": [],
  "textToolkit.diff.contextMenu": "both",
  "textToolkit.diff.clipboardSide": "left",
  "textToolkit.advanced": {}
}
```

| Setting | Type | Default | Values |
| --- | --- | --- | --- |
| `textToolkit.copyPath.pathStyle` | string | `absolute` | `absolute`, `relative`, `tilde`, `fileName` |
| `textToolkit.copyPath.separator` | string | `:` | any string |
| `textToolkit.copyPath.multiLineFormat` | string | `range` | `range`, `list`, `perLine` |
| `textToolkit.alignByRegex.templates` | object | `{}` | `{ "name": "regex" }` |
| `textToolkit.plainText.promptSizeMB` | number | `2` | `0` disables the prompt |
| `textToolkit.plainText.autoApplyExtensions` | string[] | `[]` | e.g. `[".log", ".csv"]` |
| `textToolkit.diff.normalizationRules` | array | `[]` | see [Compare (Diff)](#compare-diff) |
| `textToolkit.diff.contextMenu` | string | `both` | `both`, `markOnly`, `none` |
| `textToolkit.diff.clipboardSide` | string | `left` | `left`, `right` |
| `textToolkit.advanced` | object | `{}` | see below |

Notes:

- `relative` falls back to the absolute path when no workspace folder contains the file.
- `tilde` only rewrites the prefix when the file is under your home directory.
- Unsaved or non-file documents show a message instead of copying.

### Line reference syntax

Multiple cursors or multiple selections produce multiple fragments in one reference. Line numbers are collected from every selection, deduplicated, sorted, and consecutive ones are merged into a fragment:

| Form | Meaning |
| --- | --- |
| `path:a` | single line |
| `path:a-b` | closed interval, lines `a` through `b` |
| `path:a-b,c-d` | multiple fragments, comma separated |
| `path:a+n` | `n` lines starting at `a` (opt-in, see below) |

`multiLineFormat` picks the shape, for selected lines 3, 4, 8, 12, 13, 14:

| Format | Output |
| --- | --- |
| `range` (default) | `path:3-4,8,12-14` |
| `list` | `path:3,4,8,12,13,14` |
| `perLine` | `path:3`, `path:4`, ... one per line |

The `a+n` form is **off by default**. Turn it on in the built-in layer:

```json
{ "textToolkit.advanced": { "copyPath.useLineCountSyntax": true } }
```

The same selection then copies as `path:3+2,8,12+3`. Single lines stay `a` and fragments stay comma separated either way; `list` and `perLine` are unaffected because they never emit fragments.

### Built-in layer — `textToolkit.advanced`

Everything else has a built-in default and is **not** declared as its own setting. Override only what you need; each key you omit keeps its built-in value.

```json
{
  "textToolkit.advanced": {
    "copyPath.useLineCountSyntax": true,
    "changeCase.includeDotInCurrentWord": true,
    "alignByRegex.rememberLastInput": false,
    "plainText.applyEditorSettings": true,
    "plainText.disableLineNumbers": true,
    "plainText.editorOverrides": {
      "editor.minimap.enabled": true,
      "editor.hover.enabled": null
    }
  }
}
```

| Key | Type | Built-in default |
| --- | --- | --- |
| `copyPath.useLineCountSyntax` | boolean | `false` (use `a-b`; `true` uses `a+n`) |
| `changeCase.includeDotInCurrentWord` | boolean | `false` |
| `alignByRegex.rememberLastInput` | boolean | `true` |
| `plainText.applyEditorSettings` | boolean | `true` |
| `plainText.disableLineNumbers` | boolean | `false` |
| `plainText.editorOverrides` | object | `{}`, merged on top of the 29-entry `[plaintext]` table below |

You do not need this README to discover any of it: the Settings UI shows every key with its type, built-in default and accepted values, and in `settings.json` IntelliSense completes each key. Two snippets are offered on the value — **All built-in defaults** writes out the whole `textToolkit.advanced` object, and **All 29 built-in `[plaintext]` overrides** writes out the full override table, both ready to edit.

`plainText.editorOverrides` merges into the built-in table rather than replacing it:

- setting id → value: change that entry (`"editor.minimap.enabled": true` keeps the minimap on),
- setting id → `null`: drop that entry, so the setting keeps whatever you have configured globally,
- any other `editor.*` id: added to the table, even if it is not listed below.

Unknown keys and values of the wrong type are ignored and the built-in default is kept, so a typo can never leave the extension in a broken state.

#### The 29 built-in `[plaintext]` overrides

All of them are written under the `[plaintext]` language scope, so they never affect your code files. "Other accepted values" lists what VS Code itself allows for that setting.

| Setting id | Built-in value | Other accepted values |
| --- | --- | --- |
| `editor.minimap.enabled` | `false` | `true` |
| `editor.wordWrap` | `"off"` | `"on"`, `"wordWrapColumn"`, `"bounded"` |
| `editor.folding` | `false` | `true` |
| `editor.stickyScroll.enabled` | `false` | `true` |
| `editor.bracketPairColorization.enabled` | `false` | `true` |
| `editor.guides.indentation` | `false` | `true` |
| `editor.guides.bracketPairs` | `false` | `true`, `"active"` |
| `editor.matchBrackets` | `"never"` | `"always"`, `"near"` |
| `editor.occurrencesHighlight` | `"off"` | `"singleFile"`, `"multiFile"` |
| `editor.selectionHighlight` | `false` | `true` |
| `editor.renderWhitespace` | `"none"` | `"boundary"`, `"selection"`, `"trailing"`, `"all"` |
| `editor.renderControlCharacters` | `false` | `true` |
| `editor.codeLens` | `false` | `true` |
| `editor.colorDecorators` | `false` | `true` |
| `editor.links` | `false` | `true` |
| `editor.hover.enabled` | `false` | `true` |
| `editor.parameterHints.enabled` | `false` | `true` |
| `editor.suggestOnTriggerCharacters` | `false` | `true` |
| `editor.wordBasedSuggestions` | `"off"` | `"currentDocument"`, `"matchingDocuments"`, `"allDocuments"` |
| `editor.quickSuggestions` | `{ "other": false, "comments": false, "strings": false }` | each context also takes `"on"` / `"inline"` / `"off"` |
| `editor.formatOnType` | `false` | `true` |
| `editor.formatOnPaste` | `false` | `true` |
| `editor.autoClosingBrackets` | `"never"` | `"always"`, `"languageDefined"`, `"beforeWhitespace"` |
| `editor.autoClosingQuotes` | `"never"` | same as `autoClosingBrackets` |
| `editor.trimAutoWhitespace` | `false` | `true` |
| `editor.semanticHighlighting.enabled` | `false` | `true`, `"configuredByTheme"` |
| `editor.unicodeHighlight.nonBasicASCII` | `false` | `true`, `"inUntrustedWorkspace"` |
| `editor.unicodeHighlight.invisibleCharacters` | `false` | `true` |
| `editor.unicodeHighlight.ambiguousCharacters` | `false` | `true` |

Setting `plainText.applyEditorSettings` to `false` skips this table entirely and only switches the document language.

## Align by RegEx

Select the lines to align, run the command, then enter either a regular expression or the name of a template from `textToolkit.alignByRegex.templates`. The two-level picker lists your templates directly, so you don't have to remember their names.

This extension **fixes** the upstream alignment behaviour when the selected lines contain a different number of matches. Column widths are now computed only among the lines that still have a match in that column, so a short line's trailing text can no longer widen another line's middle column:

```text
# input                     # before (upstream)          # now
x = 111111111;              x  = 111111111;              x  = 111111111;
yy = 2; zzz = 3;            yy = 2; zzz    = 3;          yy = 2; zzz   = 3;
w = 4; vvvvv = 5;           w  = 4; vvvvv  = 5;          w  = 4; vvvvv = 5;
```

When only one line has a match in a given column, that column is left untouched instead of being padded to an unrelated width. Input where every line has the same number of matches is aligned exactly as before.

## Plain Text Mode (large files)

Four ways in:

- **Explorer right-click → `Open in Plain Text Mode`** — opens the file and enters the mode in one step, without ever rendering it normally first. Works on a multi-selection; folders in the selection are skipped.
- `Text Toolkit: Toggle Plain Text Mode` from the Command Palette, for the file already in front of you.
- Automatically, when you open a file of at least `textToolkit.plainText.promptSizeMB` MB and accept the prompt (`Don't ask again` is remembered; undo it from the Plain Text Mode entry in the picker).
- Silently, for extensions listed in `textToolkit.plainText.autoApplyExtensions`.

What it does:

- Sets the document language to `plaintext`, which stops tokenization, semantic highlighting and every language-specific provider for that document.
- With `plainText.applyEditorSettings` on, writes `[plaintext]`-scoped overrides for `editor.minimap.enabled`, `wordWrap` (`off`, so lines wrap only at real newlines), `folding`, `stickyScroll`, `bracketPairColorization`, `guides`, `matchBrackets`, `occurrencesHighlight`, `selectionHighlight`, `renderWhitespace`, `renderControlCharacters`, `codeLens`, `colorDecorators`, `links`, `hover`, `parameterHints`, suggestions, `formatOnType`/`formatOnPaste`, auto-closing pairs, `trimAutoWhitespace`, `semanticHighlighting` and the three `unicodeHighlight` scanners.
- Shows a `Plain Text` status bar item; click it (or toggle again) to restore the original language and every setting value that was replaced. Because the overrides are language-scoped, your code files are unaffected while the mode is on.

Scope and limits — read before relying on it:

- This removes **rendering and language-service** cost. It does **not** change how VS Code loads files: the whole document still lives in a `TextModel`, and in-file find/replace still runs on that model. Expect a solid improvement in the 5–50 MB range, and no order-of-magnitude change for hundreds of MB.
- Settings are written to your Workspace settings when a workspace is open, otherwise to User settings. Original values (including "was not set") are recorded and restored on exit.
- Files VS Code refuses to open at all are unaffected by this mode; that limit is `files.maxMemoryForLargeFilesMB`, which this extension deliberately does not touch (raising it trades stalls for out-of-memory crashes).

## Compare (Diff)

Five ways to start a comparison:

- **Two selections** — `Select Text for Compare` on the first one, then `Compare Text with Marked Selection` on the second. The two can live in different files; the mark survives until you replace or clear it.
- **Selection against the clipboard** — `Compare Text with Clipboard`.
- **Two visible editors** — `Compare Text in Visible Editors`, with exactly two files split on screen. Left/right follow what you see; already-open comparisons are not counted.
- **Any two open tabs** — `Compare Text in Two Open Tabs`, which does *not* require them to be visible. Pick the left side, then the right.
- **Swap** — `Swap Diff Sides` re-opens the most recent comparison with the sides exchanged, without touching your `clipboardSide` setting.

Running a compare command with **no selection** uses the whole file. **Multiple cursors** are supported: the non-empty selections are sorted by document position and joined with newlines before comparing.

While a mark is set, a status bar item on the right shows its source and line range; click it to open the Compare picker (mark, compare, swap, toggle rules, clear).

The two sides are read-only virtual documents, so the diff itself is rendered by VS Code's own diff editor — see [Left to VS Code](#left-to-vs-code) below. Each side inherits the language of the file it came from, and the clipboard side inherits the language of the other side, so a clipboard comparison against a `.ts` selection is highlighted as TypeScript.

**Non-text clipboard content:** the VS Code clipboard API only exposes text. Copying an image *and* text gives you the text, which is what gets compared. Copying only an image yields an empty string that is indistinguishable from an empty clipboard, so the command reports that there is nothing to compare instead of opening a diff with one empty side.

### Pre-comparison normalization rules

`textToolkit.diff.normalizationRules` keeps predictable noise out of a diff — timestamps, tabs, inconsistent spacing — **without touching the files**. Only what the diff shows is rewritten.

```json
{
  "textToolkit.diff.normalizationRules": [
    { "name": "Replace tabs with spaces", "match": "\t", "replaceWith": "  " },
    { "name": "One space after a comma", "match": ",\\s*([^,\n]+)", "replaceWith": ", $1" },
    { "name": "Ignore letter case", "match": ".*", "replaceWith": { "letterCase": "upper" }, "enableOnStart": false }
  ]
}
```

| Field | Required | Meaning |
| --- | --- | --- |
| `match` | yes | Regular expression; the global flag is applied automatically |
| `replaceWith` | yes | Replacement text (`$1`, `$2` … refer to capture groups), or `{ "letterCase": "upper" \| "lower" }` |
| `name` | no | Shown in the toggle picker |
| `enableOnStart` | no | `false` keeps the rule off until you enable it; defaults to `true` |

Rules apply in array order. `Toggle Normalization Rules` turns them on and off at runtime without editing your settings, and **refreshes every comparison that is already open** — you do not have to close and re-run the diff. Editing the rules array in `settings.json` resets each rule to its own `enableOnStart`.

Two indicators, with different meanings:

- The `~` in a diff title (instead of `↔`) says that comparison *was opened* with at least one rule active. It is a snapshot and does not change afterwards.
- The `$(filter)N` in the status bar is the current number of active rules, and is always accurate.

Entries with an invalid `match` regex, or missing `match` / `replaceWith`, are skipped with a note in the extension log rather than breaking the whole feature.

### Left to VS Code

The comparison itself is a stock VS Code diff editor, so these are already yours and this extension deliberately does not reimplement them:

| Want | Use |
| --- | --- |
| Character-level highlighting inside a changed line | On by default in the diff editor |
| Jump to the next/previous difference | `F7` / `Shift+F7` |
| Collapse the unchanged regions | `diffEditor.hideUnchangedRegions.enabled` |
| Inline (single-column) instead of side-by-side | `diffEditor.renderSideBySide`, or the `⋯` menu in the diff editor |
| Different diff colours | Your colour theme, or `workbench.colorCustomizations` → `diffEditor.*` |
| Compare two **files** from the Explorer | Built-in `Select for Compare` / `Compare with Selected` (editable, Git-aware) |
| Compare against the version on disk | Built-in `File: Compare Active File with Saved` |
| The diff at full width | Drag the diff tab into its own editor group |

## Migrating from Partial Diff

If you are coming from [ryu1kn/vscode-partial-diff](https://github.com/ryu1kn/vscode-partial-diff), uninstall or disable it first — otherwise both extensions add their own entries to the editor context menu.

| Old command ID | New command ID |
| --- | --- |
| `extension.partialDiff.markSection1` | `textToolkit.diff.markSelection` |
| `extension.partialDiff.markSection2AndTakeDiff` | `textToolkit.diff.compareWithMarked` |
| `extension.partialDiff.diffSelectionWithClipboard` | `textToolkit.diff.compareWithClipboard` |
| `extension.partialDiff.diffVisibleEditors` | `textToolkit.diff.compareVisibleEditors` |
| `extension.partialDiff.togglePreComparisonTextNormalizationRules` | `textToolkit.diff.toggleNormalizationRules` |

| Old setting | New setting | Note |
| --- | --- | --- |
| `partialDiff.preComparisonTextNormalizationRules` | `textToolkit.diff.normalizationRules` | element fields (`name`, `match`, `replaceWith`, `enableOnStart`) are unchanged — copy the array as is |
| `partialDiff.commandsOnContextMenu` | `textToolkit.diff.contextMenu` | one enum instead of five booleans: `both`, `markOnly`, `none` |
| `partialDiff.hideCommandsOnContextMenu` | `textToolkit.diff.contextMenu: "none"` | the upstream setting was already deprecated |
| `partialDiff.enableTelemetry` | — | **this extension has no telemetry**, so there is nothing to turn off |

No command aliases are provided, so update `keybindings.json` rather than expecting the old IDs to keep working. Old settings are **not** migrated automatically.

What is new relative to Partial Diff:

- Toggling normalization rules refreshes comparisons that are already open ([#24](https://github.com/ryu1kn/vscode-partial-diff/issues/24)).
- Both sides inherit the source language instead of falling back to plain text ([#38](https://github.com/ryu1kn/vscode-partial-diff/issues/38), [#28](https://github.com/ryu1kn/vscode-partial-diff/issues/28)).
- The URI and tab title carry the source file name and line range instead of `reg1` / `reg2` ([#66](https://github.com/ryu1kn/vscode-partial-diff/issues/66)).
- Any two open tabs can be compared, not only two visible editors ([#33](https://github.com/ryu1kn/vscode-partial-diff/issues/33)).
- The sides can be swapped, and the clipboard side is configurable ([#96](https://github.com/ryu1kn/vscode-partial-diff/issues/96)).
- A status bar item shows the current mark and the number of active rules.
- An empty clipboard read reports itself instead of opening a diff with one blank side.

## Migrating from the three original extensions

Uninstall the originals first: `turweet.copy-path-line-numbers-flexible`, `wmaurer.change-case`, `janjoerke.align-by-regex`.

Command IDs (update your `keybindings.json` and any scripts):

| Old command ID | New command ID |
| --- | --- |
| `copyPath.lineNumber.copy` | `textToolkit.copyPathWithLines` |
| `extension.changeCase.commands` | `textToolkit.changeCase` (no arguments) |
| `extension.changeCase.<style>` | `textToolkit.changeCase` with `{ "style": "<style>" }` |
| `align.by.regex` | `textToolkit.alignByRegex` |

Settings:

| Old setting | New setting | Note |
| --- | --- | --- |
| `copyPath.lineNumber.pathStyle` | `textToolkit.copyPath.pathStyle` | values changed: `absolute (full path)` → `absolute`, `relative` → `relative`, `tilde (~)` → `tilde`, `fileName (name only)` → `fileName` |
| `copyPath.lineNumber.separatorBetweenPathAndLine` | `textToolkit.copyPath.separator` | — |
| `copyPath.lineNumber.selectionMultiLineFormat` | `textToolkit.copyPath.multiLineFormat` | — |
| `changeCase.includeDotInCurrentWord` | `textToolkit.advanced` → `changeCase.includeDotInCurrentWord` | moved into the built-in layer; the upstream setting was never registered at all (declared outside `contributes`) |
| `align.by.regex.templates` | `textToolkit.alignByRegex.templates` | — |

Old settings are **not** migrated automatically; re-set them once.

## Behaviour changes vs the original extensions

1. `sentence` now capitalises the first letter (`testString` → `Test string`); the old `sentence-case@2` produced all lower case.
2. `title` maps to `capitalCase`, so every word is capitalised — the old `title-case@2` kept small words such as `a`, `of`, `the` lower case.
3. Letter/digit boundaries are no longer split: `fooBarBaz42Quux` → `foo bar baz42 quux`.
4. `Align by RegEx` column widths changed for selections whose lines have different match counts (see above). Uniform selections are unchanged.
5. Multi-line Change Case splits on the document's own end-of-line sequence instead of `os.EOL`, which upstream got wrong whenever the platform EOL differed from the document EOL.

## Localization

- Command titles, setting descriptions: `package.nls.json` (English) and `package.nls.zh-cn.json`.
- Runtime strings (messages, picker labels): `l10n/bundle.l10n.zh-cn.json`, English lives in the source as the lookup key.

To add a language, copy either file to the matching locale suffix (for example `package.nls.ja.json` and `l10n/bundle.l10n.ja.json`).

## Development

```bash
npm install
npm run typecheck   # tsc --noEmit
npm test            # esbuild + mocha over the pure logic
npm run compile     # bundle to out/extension.js
npm run icon        # re-rasterize media/icon.png from the shapes in scripts/render-icon.mjs
npm run package     # typecheck + test + vsce package
```

`change-case@5` is pure ESM, so the extension is bundled to CJS with esbuild; the packaged `.vsix` contains no `node_modules`.

## Credits & License

MIT. This extension merges and adapts:

- [wmaurer/vscode-change-case](https://github.com/wmaurer/vscode-change-case) (MIT)
- [janjoerke/vscode-align-by-regex](https://github.com/janjoerke/vscode-align-by-regex) (MIT)
- Copy Path Line Numbers Flexible (MIT)
- [ryu1kn/vscode-partial-diff](https://github.com/ryu1kn/vscode-partial-diff) (MIT) — Compare (Diff) is a reimplementation of its feature set, not a code port

See `NOTICE.md`.
