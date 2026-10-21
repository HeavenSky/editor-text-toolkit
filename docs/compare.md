# Compare two pieces of text

**English** · [简体中文](../zh/docs/compare.md)

This page shows every way to start a comparison, how to edit one, and how to hide noise from it; neither side needs to be saved as a file.

![Two selections from the same file compared side by side](../media/screenshots/diff.png)

## Start a comparison

Whatever you compare, both sides open read-only in VS Code's own diff editor unless you [edit the comparison as a copy](#edit-a-comparison-as-a-copy); pick the row that matches what you have.

| To compare                              | Do this                                                                                         |
| --------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Two selections, in one file or two      | `Select Text for Compare` on the first, then `Compare Text with Marked Selection` on the second |
| A selection and the clipboard           | `Compare Text with Clipboard`                                                                   |
| Two files split on screen               | `Compare Text in Visible Editors`                                                               |
| Any two open tabs, visible or not       | `Compare Text in Two Open Tabs`, then pick left and right                                       |
| The last comparison the other way round | `Swap Diff Sides`                                                                               |

With no selection, a compare command uses the whole file. With multiple cursors, the non-empty selections are joined with newlines in document order. A mark stays until you replace or clear it, so you can set it in one file and use it in another.

The clipboard goes on the left by default; set `textToolkit.diff.clipboardSide` to `right` to flip it. `Swap Diff Sides` flips a single comparison without changing that setting.

Each side keeps the language of the file it came from, and the clipboard side borrows the other side's language, so a clipboard diff against a `.ts` selection is highlighted as TypeScript.

## Read the status bar and titles

While a mark is set, a status bar item shows where it came from and its line range, plus the number of active normalization rules. Click it to open the Compare picker: mark, compare, swap, toggle rules, clean up copies, and clear the mark.

A `~` in a diff title, instead of `↔`, means at least one normalization rule was active when that comparison opened. The title is a snapshot; the status bar count is always the current one.

`textToolkit.diff.contextMenu` decides which compare entries the editor's right-click menu shows: `both` (default), `markOnly` or `none`.

## Edit a comparison as a copy

Click `✎` in the diff editor's title bar, or pick `Edit This Comparison as a Copy` in the Compare picker, to make both sides editable. What you get depends on what is compared:

- Two whole files (no selection on either side): a native editable diff of the real files. Edits save to disk and Git integration works; nothing is copied.
- Anything else, such as a selection, the clipboard or a read-only `git:` document: two copy files in the extension's storage folder, named after their origin, for example `service (ll.3-7).ts` and `Clipboard.ts`. **Edits are never written back** to the text they came from.

| Situation                | Behavior                                                                                                                             |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| Saving                   | `Ctrl+S` saves the copy file; use `File: Save As` to put the result somewhere else                                                   |
| Closing                  | A copy starts clean and asks to save only after you change it                                                                        |
| Title                    | Starts with `✎ `, so a copy is never mistaken for a read-only comparison                                                             |
| Highlighting             | Follows the copy's file name; a side without an extension borrows the other side's                                                   |
| Normalization rules      | Applied once when the copy is written; toggling rules later never overwrites your edits                                              |
| `Swap Diff Sides`        | Flips the same two files, so unsaved edits survive                                                                                   |
| Going back to the source | The go-to-file button next to `✎`, or `Open the Source File` in the picker, opens the original file with the compared lines selected |
| Cleaning up              | Copies stay until you run `Text Toolkit: Clean Up Comparison Copies`; close copy tabs first                                          |

## Hide noise with normalization rules

Normalization rules rewrite what the diff shows, never your files, so timestamps, tabs or uneven spacing stop showing up as changes:

```json
{
	"textToolkit.diff.normalizationRules": [
		{ "name": "Replace tabs with spaces", "match": "\t", "replaceWith": "  " },
		{ "name": "One space after a comma", "match": ",\\s*([^,\n]+)", "replaceWith": ", $1" },
		{
			"name": "Ignore letter case",
			"match": ".*",
			"replaceWith": { "letterCase": "upper" },
			"enableOnStart": false
		}
	]
}
```

| Field           | Required | Meaning                                                                                                                              |
| --------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `match`         | yes      | Regular expression; the global flag is added for you                                                                                 |
| `replaceWith`   | yes      | Replacement text where `$1`, `$2` … refer to capture groups, or `{ "letterCase": "upper" \| "lower" }` to fold the case of the match |
| `name`          | no       | Shown in the toggle picker                                                                                                           |
| `enableOnStart` | no       | `false` keeps the rule off until you enable it; defaults to `true`                                                                   |

Rules apply in array order. `Toggle Normalization Rules` switches them on and off without editing your settings and refreshes every open read-only comparison. Editing the array in `settings.json` resets each rule to its `enableOnStart` value. A rule with an invalid `match` or a missing field is skipped instead of breaking the feature; see [Troubleshooting](troubleshooting.md#a-normalization-rule-has-no-effect).

## Use what the diff editor already does

The comparison is a stock VS Code diff editor, so its own features need no extra setup:

| To                                          | Use                                                                    |
| ------------------------------------------- | ---------------------------------------------------------------------- |
| Jump to the next or previous change         | `F7` / `Shift+F7`                                                      |
| Collapse unchanged regions                  | `diffEditor.hideUnchangedRegions.enabled`                              |
| Show changes inline instead of side by side | `diffEditor.renderSideBySide`, or the `⋯` menu in the diff editor      |
| Change diff colors                          | Your color theme, or `diffEditor.*` in `workbench.colorCustomizations` |
| Compare two files from the Explorer         | Built-in `Select for Compare` / `Compare with Selected`                |
| Compare a file with its saved version       | Built-in `File: Compare Active File with Saved`                        |
