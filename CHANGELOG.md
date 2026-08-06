# Change Log

## v0.0.3 2026-08-07 Compare (Diff)

### Added

- **Compare (Diff)** — a fifth feature, reimplementing the capabilities of [ryu1kn/vscode-partial-diff](https://github.com/ryu1kn/vscode-partial-diff) (MIT, see `NOTICE.md`) on this extension's own conventions, with no telemetry and still zero runtime dependencies. Diff two selections across files, a selection against the clipboard, two visible editors, or any two open tabs. No selection compares the whole file; multiple cursors are joined by document position.
- Pre-comparison normalization rules (`textToolkit.diff.normalizationRules`) rewrite only what the diff shows, never the files. Same element fields as upstream (`name`, `match`, `replaceWith` as text or `{ "letterCase": ... }`, `enableOnStart`), so the array can be copied over as is.
- `Toggle Normalization Rules` turns rules on and off at runtime and **refreshes comparisons that are already open** — upstream requires closing the diff and re-running it ([#24](https://github.com/ryu1kn/vscode-partial-diff/issues/24)).
- Each side inherits the language of the file it came from, and the clipboard side inherits the other side's language, so a clipboard diff against a `.ts` selection is highlighted as TypeScript ([#38](https://github.com/ryu1kn/vscode-partial-diff/issues/38), [#28](https://github.com/ryu1kn/vscode-partial-diff/issues/28)).
- The virtual document URI and the tab title carry the source file name and line range instead of a fixed `reg1` / `reg2`, so other extensions can read where a side came from ([#66](https://github.com/ryu1kn/vscode-partial-diff/issues/66)).
- `Compare Text in Two Open Tabs` works on tabs that are not visible, which upstream cannot do ([#33](https://github.com/ryu1kn/vscode-partial-diff/issues/33)).
- `Swap Diff Sides` exchanges the two sides of the most recent comparison, and `textToolkit.diff.clipboardSide` sets the default side for clipboard diffs ([#96](https://github.com/ryu1kn/vscode-partial-diff/issues/96)).
- A status bar item shows the current comparison mark with its line range, plus the number of active normalization rules; clicking it opens the Compare picker. The `~` in a diff title stays a snapshot of the moment it opened, so the status bar count is the accurate indicator.
- `Compare Text with Clipboard` reports that there is nothing to compare when the clipboard holds no text — copying only an image yields an empty string through the VS Code clipboard API — instead of opening a diff with one blank side. Clipboard content that mixes an image with text compares the text.
- `textToolkit.diff.contextMenu` controls the editor context menu with one enum (`both` / `markOnly` / `none`) in place of upstream's five booleans; `Compare Text with Marked Selection` only appears once something is marked.
- 58 new tests covering the normalization rules, diff titles, URI encoding, selection aggregation and language resolution (195 tests, up from 137).

### Changed

- The Command Palette now lists eight commands instead of five: the three core compare commands are on it, the other five compare commands are menu-only and still bindable.
- The two-level picker has a fifth category, `Compare (Diff)`.
- The exposed settings layer grows from seven entries to ten. `textToolkit.advanced` is unchanged.
- New icon. The previous one showed only the alignment feature; the new one carries three of the five: `Aa` for case conversion, ragged-left-to-flush-right rows for regex alignment, and the vertical rule between them for the diff gutter. The left column uses a different colour per row for the "before" state and the right column a single colour for the "after", so the colours carry part of the meaning.

## v0.0.2 2026-08-05

### Added

- **Open in Plain Text Mode** in the Explorer context menu (`textToolkit.plainText.open`): opens the file and enters plain text mode in one step, so a large file is never rendered normally first. Accepts a multi-selection and skips folders. The command is hidden from the Command Palette, which still lists exactly five commands.
- `textToolkit.advanced` is now self-documenting in the Settings UI. Every key lists its type, built-in default and accepted values, `plainText.editorOverrides` documents all 29 built-in `[plaintext]` overrides with their values and alternatives, and two `settings.json` snippets write out either the whole advanced object or the complete override table, ready to edit.
- README documents the 29 built-in overrides as a table with accepted values; the previous text referred to a table that was never actually there.
- Tests lock `package.json` against `src/shared/advanced.ts`: declared keys, schema defaults and the override snippet must match the built-in layer, and every `%placeholder%` must exist in both `package.nls.json` and `package.nls.zh-cn.json` with no unused entries (137 tests, up from 131).

### Changed

- Command title simplified: `Toggle Plain Text Mode (Large File)` → `Toggle Plain Text Mode` (中文: `切换纯文本模式(大文件)` → `切换纯文本模式`). The command ID is unchanged.

## v0.0.1 2026-08-05

First release. Merges three extensions into one, with zero runtime dependencies.

### Features

- **Copy Path With Line Numbers** (`textToolkit.copyPathWithLines`, also in the editor context menu) with `pathStyle` (default `absolute`), `separator` and `multiLineFormat` settings. Accepts `{ "pathStyle": ... }` as a keybinding argument for one-off styles.
- Line references support multiple fragments from multiple cursors/selections: `path:a` for a single line, `path:a-b` for a closed interval, `path:a-b,c-d` for several fragments. The alternative `path:a+n` form (`n` lines starting at `a`) is available through `textToolkit.advanced` → `copyPath.useLineCountSyntax`, off by default.
- **Change Case** (`textToolkit.changeCase`): 16 conversions backed by `change-case@5` bundled into the extension. Without arguments it opens the style picker with a live preview; `{ "style": "camel" }` runs one directly.
- **Align by RegEx** (`textToolkit.alignByRegex`) with named regex templates; accepts `{ "regex": ... }` or `{ "template": ... }`.
- **Plain Text Mode** (`textToolkit.plainText.toggle`): switches the document to `plaintext` and applies `[plaintext]`-scoped settings that turn off minimap, folding, sticky scroll, hovers, suggestions, bracket colorization and the unicode scanners, so large text/log files stay responsive. Offers itself for files over `textToolkit.plainText.promptSizeMB` (default 2 MB), auto-applies for `textToolkit.plainText.autoApplyExtensions`, and restores the original language and setting values on exit.
- **Two-level picker** (`textToolkit.commands`): four categories on the first level, concrete actions on the second, with a consistent `← Back` item. Keeps the Command Palette at five entries instead of twenty-two.
- **No default keybindings** — nothing is bound out of the box, so the extension cannot collide with existing bindings or other extensions.
- **English and 简体中文 UI**, following the VS Code display language (`package.nls*.json` + `l10n/bundle.l10n.zh-cn.json`).
- **Two-layer settings**: seven exposed settings, everything else built-in with incremental overrides through the single `textToolkit.advanced` object. Inside `plainText.editorOverrides`, `null` removes a built-in override instead of replacing it; unknown keys and wrong types fall back to built-in defaults.

### Fixed relative to the original extensions

- Align by RegEx: column widths are computed only among the lines that still have a match in that column. A line with fewer matches can no longer widen another line's middle column, and a column matched by only one line is left untouched.
- Change Case: multi-line selections are split by the document's own end-of-line sequence instead of `os.EOL`. The upstream behaviour mangled a multi-line selection into a single line whenever the platform EOL differed from the document EOL (for example an LF file on Windows).
- Change Case: `includeDotInCurrentWord` now actually takes effect (upstream declared it outside `contributes`, so it was never registered).
- Change Case: the quick pick no longer throws when cancelled, no longer throws without an active editor, and applies its `placeHolder` / match-on-description options.
- Align by RegEx: a selection ending at the very start of the line after the first no longer builds an invalid range.

### Changed (breaking vs the original extensions)

- All command IDs use the `textToolkit.` prefix; the old IDs (`copyPath.lineNumber.copy`, `extension.changeCase.*`, `align.by.regex`) are not registered. The 16 per-style Change Case commands are replaced by `textToolkit.changeCase` with a `style` argument.
- All settings use the `textToolkit.` prefix and are not migrated automatically. `copyPath.pathStyle` values are now bare (`absolute`, `relative`, `tilde`, `fileName`), and `changeCase.includeDotInCurrentWord` moved into `textToolkit.advanced`.
- `sentence` capitalises the first letter; `title` capitalises every word; letter/digit boundaries are no longer split.
