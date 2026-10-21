# Troubleshooting

**English** · [简体中文](../zh/docs/troubleshooting.md)

Find the message or symptom you see; each entry gives the cause and the fix. Messages are quoted from the English UI.

## Current document is not saved as a file.

- **Cause:** `Copy Path With Line Numbers` ran on an untitled document or on something without a file, such as an output channel or a virtual document.
- **Fix:** save the document to disk first; there is no path to copy until then.

## No align template named "…".

- **Cause:** the name you entered, or the `template` argument of a keybinding, is not a key in `textToolkit.alignByRegex.templates`.
- **Fix:** pick the template from the list in the input box, or check the spelling of the key in your settings.

## The clipboard has no text to compare. Images and other non-text content cannot be compared.

- **Cause:** the VS Code clipboard API only exposes text. Copying only an image reads as an empty string, which is the same as an empty clipboard.
- **Fix:** copy text. When you copy an image and text together, the text is compared.

## This command needs exactly 2 visible editors, but … are visible.

- **Cause:** `Compare Text in Visible Editors` needs exactly two editors on screen.
- **Fix:** split the editor so two files are visible, or use `Compare Text in Two Open Tabs`, which works on tabs that are not visible.

## A normalization rule has no effect

- **Cause:** the rule's `match` is not a valid regular expression, `match` or `replaceWith` is missing, or the rule is off because of `"enableOnStart": false`.
- **Fix:** invalid rules are skipped and reported in the Developer Tools console (`Help > Toggle Developer Tools`) as `[Text Toolkit] compare: skipped …`. Correct the rule, or turn it on with `Toggle Normalization Rules`. A `~` in the diff title shows that a rule was active when the comparison opened.

## The large file prompt no longer appears

- **Cause:** you chose `Don't ask again`, or `textToolkit.plainText.promptSizeMB` is `0`.
- **Fix:** open `Text Toolkit: Show All Commands` → Plain Text Mode → `Re-enable large file prompt`, and set `promptSizeMB` to a value above `0`.

## A large file is still slow in plain text mode

- **Cause:** the mode removes rendering and language-service work, but VS Code still loads the whole file into memory. Files of hundreds of MB stay slow, and `files.maxMemoryForLargeFilesMB` still limits what VS Code opens.
- **Fix:** use a pager or log viewer outside VS Code for files that size. See [What it cannot speed up](plain-text-mode.md#what-it-cannot-speed-up).

## A comparison copy turned into an editor for a deleted file

- **Cause:** `Clean Up Comparison Copies` deleted the copy files while their tabs were still open.
- **Fix:** close those tabs. Close copy tabs before cleaning up next time; nothing is deleted automatically.

## No link appears when you hold Cmd or Ctrl over a terminal selection

- **Cause:** the pointer has not left the line since you selected, the line is longer than 2000 characters, the selection starts or ends inside a word, `terminalOpen.selectionLink` is `false`, or your VS Code version does not let extensions read the terminal selection.
- **Fix:** move the pointer off the line and back, or use `Open Terminal Selection as Path` from the terminal's right-click menu or a key. See [Known limits](open-terminal-selection.md#known-limits).

## Select text in the terminal first.

- **Cause:** `Open Terminal Selection as Path` found no selected text. Right after you finish selecting, VS Code may not have passed the selection to the extension yet. When the extension falls back to the clipboard, VS Code reports the same case itself as `The terminal has no selection to copy`.
- **Fix:** select the path and run the command again. A key bound with `"when": "terminalFocus && terminalTextSelected"` only fires while text is selected; see [Bind a key](open-terminal-selection.md#bind-a-key).

## The selection is too long to be a path.

- **Cause:** the selection is longer than 4096 characters, which no single path reaches.
- **Fix:** select only the path, or just the lines that contain paths.

## Cannot read the terminal selection: …

- **Cause:** your VS Code version does not let extensions read the terminal selection directly, so the extension copies it through the clipboard, and that copy failed or took longer than 2 seconds (`timed out`). The text after the colon is the reason.
- **Fix:** click into the terminal so it is the active one, select the path again and retry.

## Failed to restore the clipboard.

- **Cause:** after copying the selection through the clipboard, the extension could not put your previous clipboard text back.
- **Fix:** the clipboard now holds the selection or a temporary marker; copy what you need again.

## Not found: …

- **Cause:** nothing exists at the path shown, often because the relative path starts from a different folder than you expected. The prompt under the input box names that folder and its source; a program running in the shell, such as vim after `:cd`, tmux or `ssh`, does not change it. If the path disappears after you press Enter, the box opens again with `Still not found: …`.
- **Fix:** edit the text until the message changes to `Will open file: …` or `Will open folder: …`, or type an absolute or `~` path. Keep shell integration on so the folder follows `cd`; see [Know which folder relative paths start from](open-terminal-selection.md#know-which-folder-relative-paths-start-from).

## Cannot determine the terminal working directory; enter an absolute path

- **Cause:** no source gave the terminal a current folder: there is no shell integration, the shell's folder cannot be read (always the case on Windows or after the terminal exits), the terminal was not started with a known folder, and no workspace folder is open. The input box prompt then reads `Cannot determine the terminal working directory; enter an absolute path, a ~ path or a file:// URI`.
- **Fix:** type an absolute path, a `~` path or a `file://` URI, or open a folder in VS Code so relative paths have a base.

## Cannot parse a path from the input

- **Cause:** nothing that looks like a path is left after quotes, brackets and punctuation are stripped, or the text is a web link such as `https://…`, which this command leaves to VS Code. `Enter a path` means the box is empty.
- **Fix:** type a path; a `:line` or `:line:column` suffix is optional.

## Cannot access …: …

- **Cause:** the path exists but cannot be read: you lack permission, or the file system did not answer within 1.5 seconds (`timed out`), as happens on a slow network drive. While you type in the input box, the same condition shows as `Cannot confirm it exists: …`, and Enter still works. The message also appears when VS Code fails to reveal a folder.
- **Fix:** check the permissions of the path and its parent folders, or wait until the drive responds and try again.

## Cannot open ….

- **Cause:** the path was found, but VS Code failed to open it, for example because the file was removed or replaced in the meantime.
- **Fix:** open the file from the Explorer or with `Go to File...` to see VS Code's own error.

## Could not open the terminal selection: …

- **Cause:** an unexpected error stopped the command; the text after the colon is the error.
- **Fix:** try again. If it repeats, [open an issue](https://github.com/HeavenSky/editor-text-toolkit/issues) with the message and the text you selected.
