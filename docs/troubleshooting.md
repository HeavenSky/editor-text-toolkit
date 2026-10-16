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
