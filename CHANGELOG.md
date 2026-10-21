# Change Log

**English** · [简体中文](./zh/CHANGELOG.md)

## Unreleased

### Added

- Open a path selected in the integrated terminal, resolved against the terminal's current folder and positioned at the line and column it names: hold Cmd or Ctrl and click the selection, or use `Open Terminal Selection as Path` from the terminal's right-click menu or the Command Palette. See [Open a terminal selection as a path](https://github.com/HeavenSky/editor-text-toolkit/blob/HEAD/docs/open-terminal-selection.md).

## v0.0.8 2026-10-16 Rewritten docs

### Changed

- Docs: the README is now a short overview; each tool has its own page under [docs](https://github.com/HeavenSky/editor-text-toolkit/blob/HEAD/docs/README.md), including troubleshooting, and the Chinese pages now live under `zh/`.

## v0.0.7 2026-10-12 Comparison, path and plain text fixes

### Changed

- Docs: the README now shows a screenshot of each feature. The images are loaded from GitHub when the page is viewed and are not packaged into the extension.

### Fixed

- Editing `textToolkit.diff.normalizationRules` directly in `settings.json` now updates the `$(filter)N` status bar count and re-renders every open comparison right away. Previously both only caught up on the next compare action, although the tooltip promised the count was always current.
- `Open Source File` from a comparison now selects the original lines through the end of the last one. It used to stop at column 0 of the last line, which left a single-line source with an empty selection and dropped the last line of a multi-line one.
- `textToolkit.copyPath` replaces the home directory with `~` on Windows again. `fsPath` reports the drive letter in lower case while the home directory uses upper case, so the case-sensitive prefix check never matched; Windows paths are now compared case-insensitively, and the rest of the path keeps its original case.
- Plain text mode no longer deletes a `files.associations` entry you already had for the same file. The temporary entry is skipped when that pattern already exists in User settings, and cleanup only removes entries this extension added.

## v0.0.6 2026-08-13 Maintenance: packaging switched to an allowlist

No user-visible change. Every command, setting and default behaves exactly as in v0.0.5, and the packaged VSIX holds the same 11 entries; this release only changes how that packaging is decided and removes dead code behind it.

### Changed

- What goes into the VSIX is now declared as the `files` allowlist in `package.json` instead of the `.vscodeignore` denylist. A denylist can only stop paths that were anticipated, so any new build output would have slipped into the package silently; `vsce` supports only one of the two, so `.vscodeignore` is deleted. The packaging script keeps asserting the final VSIX content against an allowlist derived independently from the manifest, so a contribution added without a matching `files` entry — or a stale entry left behind — still fails the build.
- The 17 files shared with the project skeleton (`build.mjs`, `scripts/`, `vitest.config.ts`, `.template-shared`) are back in sync with its current version, and the release workflow gained comments explaining why `npm ci` and a committed lockfile are required. No behaviour change in any of them.

### Removed

- `DiffConfig.contextMenu` and the `DiffContextMenu` type. `textToolkit.diff.contextMenu` is consumed only by the two `when` clauses on the editor context menu, which VS Code evaluates itself, so reading it at runtime was dead code that suggested a dependency that never existed. **The setting itself is unchanged** — same key, same `both` / `markOnly` / `none` values, same effect.
- The two integration design documents under `docs/`. Both changes they described — merging three extensions, and building the Compare module from `partial-diff`'s capabilities — have shipped, so the documents had stopped guiding anything and only competed with the README and this file as a source of truth. `docs/` is now empty.

### Unchanged

- 250 tests, all passing; the consistency checks (`npm run check`), typecheck and packaging assertions are green. Still zero runtime dependencies.

## v0.0.5 2026-08-12 Plain text mode opens large files without waking language extensions

### Added

- Files too large for VS Code to display now offer plain text mode from a notification, so you no longer need `Open Anyway` first ([how it works](https://github.com/HeavenSky/editor-text-toolkit/blob/HEAD/docs/plain-text-mode.md#enter-the-mode)).
- `plainText.suppressLanguageActivation` in the built-in layer (`textToolkit.advanced`), default `true`.
- 13 new tests covering the original-language inference and the two new pure helpers (250 tests, up from 237).

### Changed

- The built-in `[plaintext]` override table now turns word wrap **on** (`editor.wordWrap`: `"on"`, previously `"off"`), so a long line no longer needs `Alt+Z` after entering the mode. The table still has 29 entries; set `{ "textToolkit.advanced": { "plainText.editorOverrides": { "editor.wordWrap": "off" } } }` for the old behaviour.

### Fixed

- `Open in Plain Text Mode` no longer waits for language extensions such as TypeScript to activate before showing a large file ([how it works](https://github.com/HeavenSky/editor-text-toolkit/blob/HEAD/docs/plain-text-mode.md#what-changes-while-the-mode-is-on)).
- Leaving plain text mode still restores the language the file would have had: it is inferred from the contributed language definitions and your `files.associations` before the temporary entry is written.

## v0.0.4 2026-08-10 Editable comparison copies

### Added

- **Editable comparisons** — `Edit This Comparison as a Copy` (`textToolkit.diff.editableCopy`) makes the comparison you are looking at editable on **both** sides. It appears as a `✎` button in the top-right corner of a comparison this extension opened, and in the Compare picker; triggered from the diff editor it replaces that tab in place, in the same editor group.
- Two whole files open as a **native editable diff of the real files**; anything else is written to two copy files that are **never written back** to the selection they came from ([details](https://github.com/HeavenSky/editor-text-toolkit/blob/HEAD/docs/compare.md#edit-a-comparison-as-a-copy)).
- `Open the Source File` (`textToolkit.diff.openSource`) jumps from either kind of comparison back to the file a side came from, selecting the lines that took part in the comparison. Also available as a title-bar button.
- `Clean Up Comparison Copies` (`textToolkit.diff.cleanUpCopies`) deletes all copy files. **Nothing is cleaned up automatically** — the extension never deletes a copy behind your back, because you may have just saved into it.
- Normalization rules are applied once, when a copy is written, so toggling rules afterwards can never overwrite your edits. Read-only comparisons still refresh as before.
- `Swap Diff Sides` on a copy flips the same two files instead of writing a second copy, so unsaved edits survive the swap.
- 13 new tests covering copy file naming and the two new pure functions in the diff core (237 tests, up from 224).

### Changed

- The Command Palette now lists nine commands instead of eight: `Clean Up Comparison Copies` is on it, while `Edit This Comparison as a Copy` and `Open the Source File` are menu- and button-only, and still bindable to a key.

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

### Changed (breaking vs the original extensions)

- All command IDs use the `textToolkit.` prefix; the old IDs (`copyPath.lineNumber.copy`, `extension.changeCase.*`, `align.by.regex`) are not registered. The 16 per-style Change Case commands are replaced by `textToolkit.changeCase` with a `style` argument. To migrate, point your keybindings at the new IDs, for example `extension.changeCase.kebab` → `textToolkit.changeCase` with `"args": { "style": "kebab" }`.
- All settings use the `textToolkit.` prefix and are not migrated automatically. `copyPath.pathStyle` values are now bare (`absolute`, `relative`, `tilde`, `fileName`), and `changeCase.includeDotInCurrentWord` moved into `textToolkit.advanced`. To migrate, copy your old values under the new keys in `settings.json`.
- `sentence` capitalises the first letter; `title` capitalises every word; letter/digit boundaries are no longer split.

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
