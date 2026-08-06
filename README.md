# Editor Text Toolkit

Editing tools merged into one VS Code extension, with zero runtime dependencies. UI available in English and 简体中文 (follows the VS Code display language).

1. **Copy Path With Line Numbers** — copy `path:3-4,8` style references with a configurable path style, separator and multi-line format.
2. **Change Case** — convert the selection(s) or the word under the cursor between 16 case styles, with a preview picker.
3. **Align by RegEx** — align selected lines by a regular expression, with reusable named templates.
4. **Plain Text Mode** — strip highlighting, minimap, folding, hovers and suggestions so large text/log files stay responsive for reading, searching and replacing.

## Commands

Five commands in the Command Palette, all under the `Text Toolkit` category. Everything else is reachable through the two-level picker instead of flooding the palette.

| Command ID | Title | Arguments (for keybindings) |
| --- | --- | --- |
| `textToolkit.commands` | Show All Commands | — |
| `textToolkit.copyPathWithLines` | Copy Path With Line Numbers | `{ "pathStyle": "absolute" \| "relative" \| "tilde" \| "fileName" }` |
| `textToolkit.changeCase` | Change Case... | `{ "style": "camel" }` (any of the 16 styles) |
| `textToolkit.alignByRegex` | Align by RegEx | `{ "regex": "=" }` or `{ "template": "assign" }` |
| `textToolkit.plainText.toggle` | Toggle Plain Text Mode | — |

One further command is menu-only and hidden from the palette, because it needs a file to act on:

| Command ID | Title | Where |
| --- | --- | --- |
| `textToolkit.plainText.open` | Open in Plain Text Mode | Explorer right-click, on files (not folders) |

### Two-level picker

`Text Toolkit: Show All Commands` opens a first level of four categories, each showing the settings currently in effect. Picking one opens the second level:

| Category | Second level |
| --- | --- |
| Copy Path With Line Numbers | Copy using current setting, plus each of the four path styles as a one-off (never writes your settings) |
| Change Case | The 16 styles; with a single-line selection each entry previews the converted text |
| Align by RegEx | `Enter a regular expression...`, plus every saved template listed with its pattern |
| Plain Text Mode | Enable / Disable (whichever applies), and Re-enable large file prompt |

Rules that hold everywhere: the second level always starts with `← Back`, which returns to the first level; `Esc` cancels the whole flow without changing anything; the first level never performs an action by itself.

### Keybindings

This extension contributes **no default keybindings** — nothing is bound out of the box, so it cannot collide with your existing bindings or with other extensions. Bind what you use, optionally with arguments:

```json
[
  { "key": "shift+alt+c", "command": "textToolkit.copyPathWithLines", "when": "editorTextFocus" },
  { "key": "shift+alt+p", "command": "textToolkit.copyPathWithLines", "args": { "pathStyle": "absolute" }, "when": "editorTextFocus" },
  { "key": "ctrl+alt+k", "command": "textToolkit.changeCase", "args": { "style": "kebab" }, "when": "editorTextFocus" },
  { "key": "ctrl+alt+a", "command": "textToolkit.alignByRegex", "args": { "template": "assign" }, "when": "editorHasSelection" },
  { "key": "ctrl+alt+t", "command": "textToolkit.commands" }
]
```

`Copy Path With Line Numbers` is also in the editor context menu, and `Open in Plain Text Mode` is in the Explorer context menu.

## Settings

Settings come in two layers, so the Settings UI stays short.

### Exposed layer — the seven settings you actually tune

```json
{
  "textToolkit.copyPath.pathStyle": "absolute",
  "textToolkit.copyPath.separator": ":",
  "textToolkit.copyPath.multiLineFormat": "range",
  "textToolkit.alignByRegex.templates": { "assign": "=|,|:" },
  "textToolkit.plainText.promptSizeMB": 2,
  "textToolkit.plainText.autoApplyExtensions": [".log", ".csv"],
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

See `NOTICE.md`.
