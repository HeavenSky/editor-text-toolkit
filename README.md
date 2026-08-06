# Editor Text Toolkit

**English** · [简体中文](README.zh-cn.md)

Five everyday editing tools in one VS Code extension — copy a `path:12-14` reference, convert case, align by a regex, tame a huge log file, and diff two text fragments.

Zero runtime dependencies. English and 简体中文 UI, following the VS Code display language. No telemetry. No default keybindings, so nothing collides with what you already have.

## Quick start

1. Press `Ctrl+Shift+P` / `Cmd+Shift+P` and run **`Text Toolkit: Show All Commands`**.
2. Pick a category. The picker shows the settings currently in effect and lists every action, so you can use the whole extension without memorising a single command name.
3. Once you know what you reach for, [bind a key](#keybindings) to it.

## Contents

- [Copy Path With Line Numbers](#copy-path-with-line-numbers)
- [Change Case](#change-case)
- [Align by RegEx](#align-by-regex)
- [Plain Text Mode](#plain-text-mode)
- [Compare (Diff)](#compare-diff)
- [Commands and keybindings](#commands-and-keybindings)
- [Settings](#settings)
- [Localization](#localization)
- [Development](#development)
- [License](#license)

---

## Copy Path With Line Numbers

Copies a reference to where you are, in the form other people (and AI assistants, and issue trackers) can paste back:

```text
src/features/diff/core.ts:112-118
```

**Run it:** `Text Toolkit: Copy Path With Line Numbers`, or right-click in the editor, or the picker.

**The path part** follows `textToolkit.copyPath.pathStyle`, and the picker also offers every style as a one-off that never writes your settings:

| Style | Result |
| --- | --- |
| `absolute` (default) | `/Users/you/project/src/app.ts` |
| `relative` | `src/app.ts` — falls back to the absolute path when no workspace folder contains the file |
| `tilde` | `~/project/src/app.ts` — only rewrites the prefix when the file is under your home directory |
| `fileName` | `app.ts` |

**The line part** collects line numbers from every cursor and selection, deduplicates them, sorts them, and merges consecutive ones into a fragment:

| Form | Meaning |
| --- | --- |
| `path:a` | a single line |
| `path:a-b` | a closed interval, lines `a` through `b` |
| `path:a-b,c-d` | several fragments, comma separated |
| `path:a+n` | `n` lines starting at `a` — opt-in, see below |

`textToolkit.copyPath.multiLineFormat` picks the shape. For selected lines 3, 4, 8, 12, 13, 14:

| Format | Output |
| --- | --- |
| `range` (default) | `path:3-4,8,12-14` |
| `list` | `path:3,4,8,12,13,14` |
| `perLine` | `path:3`, `path:4`, … one per line |

The `a+n` form is off by default. Turn it on with `{ "textToolkit.advanced": { "copyPath.useLineCountSyntax": true } }` and the same selection copies as `path:3+2,8,12+3`. Single lines stay `a` and fragments stay comma separated either way; `list` and `perLine` are unaffected, because they never emit fragments.

Use `textToolkit.copyPath.separator` to change the `:` between path and lines.

**Note:** unsaved documents and non-file documents (output channels, virtual documents) show a message instead of copying, because they have no path to copy.

---

## Change Case

Converts the selection, several selections at once, or the word under the cursor between 16 styles.

**Run it:** `Text Toolkit: Change Case...` opens the style picker; with a single-line selection each entry **previews the converted text**, so you can see the result before committing. From a keybinding you can skip the picker entirely with `{ "style": "kebab" }`.

All 16 styles, applied to the input `fooBar baz-qux`:

| Style | Result | Notes |
| --- | --- | --- |
| `camel` | `fooBarBazQux` | |
| `pascal` | `FooBarBazQux` | |
| `snake` | `foo_bar_baz_qux` | |
| `constant` | `FOO_BAR_BAZ_QUX` | |
| `kebab` | `foo-bar-baz-qux` | |
| `param` | `foo-bar-baz-qux` | alias of `kebab` |
| `dot` | `foo.bar.baz.qux` | |
| `path` | `foo/bar/baz/qux` | |
| `no` | `foo bar baz qux` | lower case, space separated |
| `sentence` | `Foo bar baz qux` | first character upper cased |
| `title` | `Foo Bar Baz Qux` | every word capitalised |
| `lower` | `foobar baz-qux` | whole string, separators untouched |
| `upper` | `FOOBAR BAZ-QUX` | whole string, separators untouched |
| `lowerFirst` | `fooBar baz-qux` | only the first character |
| `upperFirst` | `FooBar baz-qux` | only the first character |
| `swap` | `FOObAR BAZ-QUX` | every character's case reversed |

**What counts as "the word under the cursor":** wider than the editor's own definition — `_`, `-`, `/` and `$` are always treated as word characters, so `foo_bar-baz` converts as one unit. The `.` is **not** included by default; turn it on with `{ "textToolkit.advanced": { "changeCase.includeDotInCurrentWord": true } }`, and then a cursor inside `foo_bar.baz` converts the whole thing instead of just `baz`.

Multi-line selections are split on the document's own end-of-line sequence, so an LF file on Windows behaves correctly.

---

## Align by RegEx

Aligns the selected lines on a separator so columns line up.

**Run it:** select the lines, then `Text Toolkit: Align by RegEx`. Enter a regular expression, or the name of a saved template. The picker lists your templates with their patterns, so you never have to recall a name.

Save templates in settings:

```json
{ "textToolkit.alignByRegex.templates": { "assign": "=|,|:", "arrow": "=>" } }
```

From a keybinding, pass either form directly: `{ "regex": "=" }` or `{ "template": "assign" }`.

It aligns whole lines covered by the primary selection; a selection that stops at column 0 of the following line does not drag that line in. Column widths use your `editor.tabSize`. The input box pre-fills with your last expression — turn that off with `{ "textToolkit.advanced": { "alignByRegex.rememberLastInput": false } }`.

Three lines aligned on `=`:

```text
# before                # after
const a = 1;            const a  = 1;
let bbbb = 22;          let bbbb = 22;
var cc = 333;           var cc   = 333;
```

**The lines do not have to contain the same number of matches.** Each column's width is computed only among the lines that actually have a match in that column, so a short line never widens an unrelated column, and a column matched by a single line is left untouched:

```text
# before                # after
x = 111111111;          x  = 111111111;
yy = 2; zzz = 3;        yy = 2; zzz   = 3;
w = 4; vvvvv = 5;       w  = 4; vvvvv = 5;
```

---

## Plain Text Mode

Makes a large text or log file responsive to read, search and edit, by removing the rendering and language-service work VS Code would otherwise do on it.

**Four ways in:**

- **Explorer right-click → `Open in Plain Text Mode`** — opens the file and enters the mode in one step, so it is never rendered normally first. Accepts a multi-selection; folders are skipped.
- `Text Toolkit: Toggle Plain Text Mode` for the file already in front of you.
- **Automatically**, when you open a file of at least `textToolkit.plainText.promptSizeMB` MB (default 2) and accept the prompt. `Don't ask again` is remembered; undo it from the Plain Text Mode entry in the picker. Set the value to `0` to never be asked.
- **Silently**, for extensions listed in `textToolkit.plainText.autoApplyExtensions`, for example `[".log", ".csv"]`.

**What it does:**

- Sets the document language to `plaintext`, which stops tokenization, semantic highlighting and every language-specific provider for that document.
- Writes 29 `[plaintext]`-scoped editor overrides — minimap, folding, sticky scroll, bracket colorization, guides, hovers, suggestions, code lens, links, the unicode scanners and more. The full table is [in the settings reference](#the-29-built-in-plaintext-overrides). Because they are language-scoped, **your code files are unaffected** while the mode is on.
- Shows a `Plain Text` status bar item. Click it, or toggle again, to restore the original language and every setting value that was replaced.

**Scope and limits — read before relying on it:**

- This removes **rendering and language-service** cost. It does **not** change how VS Code loads files: the whole document still lives in a `TextModel`, and in-file find/replace still runs on that model. Expect a solid improvement in the 5–50 MB range, and no order-of-magnitude change for hundreds of MB.
- Settings are written to Workspace settings when a workspace is open, otherwise to User settings. Original values — including "was not set" — are recorded and restored on exit.
- Files VS Code refuses to open at all are unaffected by this mode. That limit is `files.maxMemoryForLargeFilesMB`, which this extension deliberately does not touch, because raising it trades stalls for out-of-memory crashes.

Set `{ "textToolkit.advanced": { "plainText.applyEditorSettings": false } }` to only switch the language and skip the overrides entirely, or `"plainText.disableLineNumbers": true` to also hide line numbers while the mode is on.

---

## Compare (Diff)

Diff two pieces of text without saving either of them to a file.

**Five ways to start a comparison:**

| Want to compare | Do this |
| --- | --- |
| Two selections, in the same file or different files | `Select Text for Compare` on the first, then `Compare Text with Marked Selection` on the second |
| A selection against the clipboard | `Compare Text with Clipboard` |
| Two files split on screen | `Compare Text in Visible Editors` |
| Any two open tabs, visible or not | `Compare Text in Two Open Tabs`, then pick left and right |
| The sides the other way round | `Swap Diff Sides` re-opens the most recent comparison exchanged |

**Selection rules:** running a compare command with **no selection** uses the whole file. **Multiple cursors** work — the non-empty selections are sorted by document position and joined with newlines. The mark survives until you replace it or clear it, and can be set in one file and used in another.

**Status bar:** while a mark is set, an item on the right shows its source and line range. Click it to open the Compare picker (mark, compare, swap, toggle rules, clear).

**Syntax highlighting:** each side inherits the language of the file it came from, and the clipboard side inherits the language of the other side — so a clipboard diff against a `.ts` selection is highlighted as TypeScript.

**Non-text clipboard content:** the VS Code clipboard API only exposes text. Copying an image *and* text gives you the text, which is what gets compared. Copying only an image yields an empty string, indistinguishable from an empty clipboard, so the command tells you there is nothing to compare instead of opening a diff with one blank side.

### Normalization rules

`textToolkit.diff.normalizationRules` keeps predictable noise — timestamps, tabs, inconsistent spacing — out of a comparison. Rules rewrite only what the diff shows; **your files are never touched**.

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
| `replaceWith` | yes | Replacement text, where `$1`, `$2` … refer to capture groups — or `{ "letterCase": "upper" \| "lower" }` to fold the case of whatever matched |
| `name` | no | Shown in the toggle picker |
| `enableOnStart` | no | `false` keeps the rule off until you enable it; defaults to `true` |

Rules apply in array order. `Toggle Normalization Rules` turns them on and off at runtime without editing your settings, and **refreshes every comparison that is already open** — no need to close the diff and run it again. Editing the array in `settings.json` resets each rule to its own `enableOnStart`.

Two indicators, with deliberately different meanings:

- The `~` in a diff title (instead of `↔`) says that comparison **was opened** with at least one rule active. It is a snapshot and does not change afterwards.
- The filter count in the status bar is the **current** number of active rules, and is always accurate.

An entry with an invalid `match` regex, or missing `match` / `replaceWith`, is skipped with a note in the extension log rather than breaking the feature.

### What VS Code already does

The comparison opens in a stock VS Code diff editor, so everything the diff editor can do is already yours:

| Want | Use |
| --- | --- |
| Character-level highlighting inside a changed line | On by default in the diff editor |
| Jump to the next / previous difference | `F7` / `Shift+F7` |
| Collapse unchanged regions | `diffEditor.hideUnchangedRegions.enabled` |
| Inline instead of side-by-side | `diffEditor.renderSideBySide`, or the `⋯` menu in the diff editor |
| Different diff colours | Your colour theme, or `workbench.colorCustomizations` → `diffEditor.*` |
| Compare two **files** from the Explorer | Built-in `Select for Compare` / `Compare with Selected` — editable and Git-aware |
| Compare against the version on disk | Built-in `File: Compare Active File with Saved` |
| The diff at full width | Drag the diff tab into its own editor group |

---

## Commands and keybindings

### The two-level picker

`Text Toolkit: Show All Commands` is the front door. The first level lists five categories, each showing the settings currently in effect; picking one opens the second level:

| Category | Second level |
| --- | --- |
| Copy Path With Line Numbers | Copy using current setting, plus each of the four path styles as a one-off (never writes your settings) |
| Change Case | The 16 styles; with a single-line selection each entry previews the converted text |
| Align by RegEx | `Enter a regular expression...`, plus every saved template listed with its pattern |
| Plain Text Mode | Enable / Disable (whichever applies), and Re-enable large file prompt |
| Compare (Diff) | Mark, compare with the mark, compare with the clipboard, compare visible editors, compare two open tabs, swap sides, toggle normalization rules, and clear the mark when one is set |

Three rules hold everywhere: the second level always starts with `← Back`; `Esc` cancels the whole flow without changing anything; the first level never performs an action by itself.

### Command reference

Eight commands appear in the Command Palette, all under the `Text Toolkit` category:

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

Six more are hidden from the palette — they either need a file to act on, or are low-frequency enough that the picker is the better home. **All of them still accept keybindings:**

| Command ID | Title | Where |
| --- | --- | --- |
| `textToolkit.plainText.open` | Open in Plain Text Mode | Explorer right-click, on files (not folders) |
| `textToolkit.diff.compareVisibleEditors` | Compare Text in Visible Editors | Compare (Diff) picker |
| `textToolkit.diff.compareTabs` | Compare Text in Two Open Tabs | Compare (Diff) picker |
| `textToolkit.diff.swapSides` | Swap Diff Sides | Compare (Diff) picker |
| `textToolkit.diff.toggleNormalizationRules` | Toggle Normalization Rules | Compare (Diff) picker |
| `textToolkit.diff.showMenu` | Show Compare Menu | Compare status bar item |

### Context menus

- **Editor right-click:** `Copy Path With Line Numbers`, `Select Text for Compare`, and `Compare Text with Marked Selection` once something is marked. Control the compare entries with `textToolkit.diff.contextMenu` (`both` / `markOnly` / `none`).
- **Explorer right-click:** `Open in Plain Text Mode`, on files.

### Keybindings

This extension contributes **no default keybindings**, so it cannot collide with your existing bindings or with another extension. Bind what you use, optionally with arguments:

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

---

## Settings

Settings come in two layers, so the Settings UI stays short: ten entries you are likely to tune, and one object for everything else.

### Exposed layer

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
| `textToolkit.diff.normalizationRules` | array | `[]` | see [Normalization rules](#normalization-rules) |
| `textToolkit.diff.contextMenu` | string | `both` | `both`, `markOnly`, `none` |
| `textToolkit.diff.clipboardSide` | string | `left` | `left`, `right` |
| `textToolkit.advanced` | object | `{}` | see below |

### Built-in layer — `textToolkit.advanced`

Everything else has a built-in default and is **not** declared as its own setting. Override only what you need; every key you omit keeps its built-in value.

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

You do not need this README to discover any of it: the Settings UI shows every key with its type, built-in default and accepted values, and `settings.json` completes each key as you type. Two snippets are offered on the value — **All built-in defaults** writes out the whole `textToolkit.advanced` object, and **All 29 built-in `[plaintext]` overrides** writes out the full override table, both ready to edit.

`plainText.editorOverrides` merges into the built-in table rather than replacing it:

- setting id → value: change that entry (`"editor.minimap.enabled": true` keeps the minimap on),
- setting id → `null`: drop that entry, so the setting keeps whatever you have configured globally,
- any other `editor.*` id: added to the table, even if it is not listed below.

Unknown keys and values of the wrong type are ignored and the built-in default is kept, so a typo can never leave the extension in a broken state.

### The 29 built-in `[plaintext]` overrides

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

---

## Localization

- Command titles and setting descriptions: `package.nls.json` (English) and `package.nls.zh-cn.json`.
- Runtime strings such as messages and picker labels: `l10n/bundle.l10n.zh-cn.json`; English lives in the source as the lookup key.

To add a language, copy either file to the matching locale suffix, for example `package.nls.ja.json` and `l10n/bundle.l10n.ja.json`.

## Development

```bash
npm install
npm run typecheck   # tsc --noEmit
npm test            # vitest run, over the pure logic in test/*.test.ts
npm run check       # consistency gates: icon vs spec, package.nls parity, l10n bundle parity
npm run compile     # bundle to out/extension.js with a sourcemap
npm run build       # same but minified and without a sourcemap (what vscode:prepublish runs)
npm run watch       # rebuild on change
npm run gen:icon    # regenerate media/icon.svg and media/icon.png from scripts/icon-spec.mjs
npm run package     # vsce package into artifacts/, then assert the VSIX contents against an allowlist
```

`npm run package` does **not** run the checks for you — run `typecheck`, `test` and `check` first. `npm run check` is the gate that catches what a build cannot: a missing `package.nls` entry silently renders as `%config.foo%`, and a missing `l10n` entry silently falls back to English, so both directions are asserted — missing entries *and* unused ones.

Each feature lives in `src/features/<name>/`, with the pure logic in files that never import `vscode` so they can be unit-tested directly. `change-case@5` is pure ESM, so the extension is bundled to CJS with esbuild; the packaged `.vsix` contains no `node_modules`.

## License

MIT. Parts of this extension adapt earlier MIT-licensed work; the full third-party notices ship with the extension in `NOTICE.md`.
