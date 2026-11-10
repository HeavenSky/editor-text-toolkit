# Open large files in plain text mode

**English** · [简体中文](../zh/docs/plain-text-mode.md)

This page shows how to read, search and edit a large text or log file without lag, and what the mode changes in your settings; it works on any file VS Code can open as text.

## Enter the mode

The Explorer is the fastest way in, because the file is never rendered normally first. Any of these work:

- Explorer right-click → `Open in Plain Text Mode`: opens the file and enters the mode in one step. Accepts a multi-selection; folders are skipped.
- `Text Toolkit: Toggle Plain Text Mode`: for the file already in front of you.
- The size prompt: opening a file of at least `textToolkit.plainText.promptSizeMB` MB (default `2`) asks whether to switch. `Don't ask again` is remembered; re-enable it from the Plain Text Mode entry in the picker. Set the value to `0` to never be asked.
- Files VS Code refuses to show: above `workbench.editorLargeFileConfirmation` MB, VS Code shows _"The file is not displayed in the text editor because it is very large"_ instead of the content. A notification offers plain text mode for that tab; the file opens through the extension host, which is not bound by that limit, so you do not need `Open Anyway` first. It follows the same `Don't ask again` switch and the same `0` value.
- Automatically: files whose extension is listed in `textToolkit.plainText.autoApplyExtensions`, for example `[".log", ".csv"]`, enter the mode without asking.

## What changes while the mode is on

The document language becomes `plaintext`, which stops tokenization, semantic highlighting and every language-specific provider for that file. A `Plain Text` status bar item shows the mode is on; click it, or toggle again, to leave.

**Language extensions never wake up** when you open a file from the Explorer command. VS Code activates a language extension the moment a file of that language is opened, so a large `.ts` would otherwise start the TypeScript server. The extension briefly adds a `files.associations` entry for exactly that file to your User settings, opens the file as `plaintext`, and removes the entry again. An entry you already had for the same pattern is left alone.

The extension writes 29 editor settings under the `[plaintext]` scope: word wrap turns on, and minimap, folding, sticky scroll, bracket colorization, guides, hovers, suggestions, code lens, links and the Unicode scanners turn off. Because they are language-scoped, your code files are unaffected. The full list is the default value of `textToolkit.plainText.editorOverrides`, visible in the Settings UI and in `settings.json`.

## Leave the mode and restore everything

Leaving the mode restores the language the file would otherwise have had. Editor settings are shared by mode documents in the same settings scope, including those in other windows; their original values are restored when the last such document leaves the mode or closes, including values that were not set before. Starting another window keeps those overrides in place while an existing window still uses them.

Settings go to Workspace settings when a folder is open, otherwise to User settings. On startup, the extension restores editor settings left by a crashed session if no active window still uses them. The temporary `files.associations` entry always goes to User settings, so nothing is written to a repository's `.vscode/settings.json` for it; an association left behind by a crashed window is removed the next time the extension starts.

## Recover an older settings backup

If a warning says an older plain text settings backup has no workspace identity, open the workspace where you originally enabled the mode and choose `Restore Backup to This Workspace`, or choose `Delete Backup` to discard it when the original values are no longer needed — deleting the backup loses the recorded values, so re-apply those settings by hand if the workspace still has the overrides. The extension keeps the backup until you restore, delete or dismiss it, and pauses editor setting overrides until it is resolved. You can still switch document languages while the backup is unresolved. Dismissing only silences the current window; the warning reappears in the next window until the backup is restored or deleted.

Older User settings backups recover automatically when the extension starts in a window without a folder open.

## What it cannot speed up

The mode removes rendering and language-service work; it does not change how VS Code loads a file. The whole document still lives in memory, and find and replace still run over all of it. Files of tens of MB get noticeably faster; files of hundreds of MB do not.

The `workbench.editorLargeFileConfirmation` limit does not apply, but `files.maxMemoryForLargeFilesMB` still does. The extension deliberately leaves that one alone, because raising it trades stalls for out-of-memory crashes.

## Tune the overrides

Three settings control the mode, and `textToolkit.plainText.editorOverrides` changes the table:

| Setting id                                         | Effect                                                                     |
| -------------------------------------------------- | -------------------------------------------------------------------------- |
| `textToolkit.plainText.applyEditorSettings`        | `false` only switches the language and writes none of the 29 overrides     |
| `textToolkit.plainText.disableLineNumbers`         | `true` also hides line numbers while the mode is on                        |
| `textToolkit.plainText.suppressLanguageActivation` | `false` opens Explorer files normally and switches the language afterwards |

`textToolkit.plainText.editorOverrides` is merged into the built-in table, not used instead of it:

- a setting id with a value changes that entry: `"editor.minimap.enabled": true` keeps the minimap;
- a setting id with `null` removes the entry, so your own global value applies;
- any other `editor.*` setting id is added to the table.

```json
{
	"textToolkit.plainText.disableLineNumbers": true,
	"textToolkit.plainText.editorOverrides": {
		"editor.minimap.enabled": true,
		"editor.hover.enabled": null
	}
}
```

## The 29 built-in overrides

The default value of `textToolkit.plainText.editorOverrides` is the full table — open it in the Settings UI or in `settings.json` to see every entry with its built-in value. Edit entries the same way: change a value, set one to `null`, or add a new `editor.*` id.
