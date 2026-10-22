# Open a terminal selection as a path

**English** · [简体中文](../zh/docs/open-terminal-selection.md)

This page shows how to select a path in VS Code's integrated terminal and open exactly the path you selected, even where VS Code's own link detection splits it wrongly, with relative paths resolved against the terminal's current folder. Shell integration, on by default, keeps that folder in step with every `cd`; without it the feature still works, with a less accurate folder.

## Open the selection

Select the path with the mouse, then use whichever entry is at hand; all three open the selected text the same way.

| Entry                     | Do this                                                                                                 |
| ------------------------- | ------------------------------------------------------------------------------------------------------- |
| Key                       | Press Cmd+U while the terminal has focus on macOS; on Windows and Linux [bind a key](#bind-a-key) first |
| Terminal right-click menu | Right-click the selection and choose `Open Terminal Selection as Path`, below Copy and Paste            |
| Command Palette           | Run `Text Toolkit: Open Terminal Selection as Path`                                                     |

For this compiler output, selecting `src/app.ts:12:5` opens `src/app.ts` with the cursor on line 12, column 5, even where VS Code's own link detection would not take it as one path:

```text
$ npm run build
src/app.ts:12:5 - error TS2322: Type 'string' is not assignable to type 'number'.
```

Cmd+U acts only while the terminal has focus; in the editor it keeps its usual meaning. It runs even with nothing selected, so it can offer the path that a full-screen program such as Claude Code copied; see [Select text in full-screen programs such as Claude Code](#select-text-in-full-screen-programs-such-as-claude-code). Cmd+Y opens the path in the clipboard instead of the selection. Cmd+click on the selection is off by default; see [Turn on the selection link](#turn-on-the-selection-link).

The command appears in the Command Palette once a terminal is open and acts on the active terminal; the right-click entry appears only while text is selected and acts on the terminal you clicked.

## Write paths the way tools print them

The selected text is used as one path, spaces included; it is never split at spaces or other separators. Surrounding noise is stripped first: whitespace, matching quotes, brackets and backticks, and trailing punctuation such as `,` `.` `:`.

| You select                                                 | It opens                                                                    |
| ---------------------------------------------------------- | --------------------------------------------------------------------------- |
| `src/my file.ts`                                           | `src/my file.ts` in the terminal's folder                                   |
| `"src/app.ts",` or `(src/app.ts)`                          | `src/app.ts`                                                                |
| `src/app.ts:12`, `src/app.ts:12:5`, `src/app.ts:12-20`     | Line 12, column 5 when given; a range opens at its start                    |
| `src/app.ts(12,5)`                                         | Line 12, column 5                                                           |
| `src/app.ts#L12`, `src/app.ts#L12C5`, `src/app.ts#L12-L20` | Line 12, column 5 when given                                                |
| `File "app/main.py", line 42, in <module>`                 | `app/main.py` at line 42                                                    |
| `~/notes/todo.md`                                          | `notes/todo.md` in your home folder                                         |
| `file:///home/you/app.ts#L12`                              | `/home/you/app.ts` at line 12; percent-encoded characters are decoded       |
| `a/src/app.ts` or `b/src/app.ts` from `git diff`           | `a/src/app.ts` if it exists, otherwise `src/app.ts`                         |
| `my\ file.txt` on macOS and Linux                          | `my\ file.txt` if it exists, otherwise `my file.txt`                        |
| `C:\work\app.ts:3` on Windows                              | `C:\work\app.ts` at line 3; the drive letter is never read as a line number |

When text can be read more than one way, the first reading that exists on disk wins. `build.log:3` opens line 3 of `build.log`, and only if that file is missing does a file literally named `build.log:3` open. Line 0 means no line; a line or column past the end lands on the last one. Images and other binary files open in the editor VS Code picks for them, and the line is ignored.

Web links such as `https://…` are left to VS Code. Environment variables like `$HOME` or `%USERPROFILE%` and `~user/` paths are not expanded.

A selection over several lines gives one candidate per line, up to 20, and a notice says when later lines are ignored; a line that only wrapped on screen is joined back by the terminal. Clicking the selection link on one line opens just that line.

## Know which folder relative paths start from

Relative paths start from the terminal's current folder, taken from the first source below that gives a folder which exists:

1. The folder of the program running in the foreground, such as Claude Code or vim, read from the operating system on macOS and Linux. It is used only while such a program runs, and it is right even for a one-liner such as `cd docs && claude`, where shell integration still reports the folder from before the line ran.
2. The folder reported by shell integration. It follows every `cd`.
3. The folder of the shell process, read from the operating system on macOS and Linux. It also follows `cd`; it is skipped on Windows and once the terminal has exited.
4. The folder the terminal was started in. It does not follow `cd`.
5. The first workspace folder.
6. None. Only absolute, `~` and `file://` paths open.

**Folders inside tmux, screen or ssh are not tracked.** Those programs report the folder they were started in, not the folder of the shell running inside them. A reported folder that does not exist on this machine is skipped.

When the extension can find the shell integration folder, the selection link's tooltip shows it as `Open selection as path (relative to …)`. In a Remote-SSH, WSL or Dev Container window, folders, `~` and absolute paths refer to the remote machine.

## Open a folder

A selection that names a folder shows that folder instead of opening an editor, and any line number is ignored:

| Where the folder is                                                | What happens                                                                             |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| Inside a workspace folder                                          | It is revealed and selected in the Explorer                                              |
| Outside the workspace, in a local or WSL window                    | It is shown in Finder, File Explorer or your Linux file manager                          |
| Outside the workspace, in an SSH, container or other remote window | `Folder is outside the current workspace: …` offers `Open in New Window` and `Copy Path` |

## Pick one of several paths

When two or more lines of the selection exist on disk, a list with the prompt `Multiple paths found in the selection; pick one to open` shows every line, the ones that exist first. When exactly one line exists, it opens directly and the other lines are ignored.

Each entry is marked `File`, `Folder`, `Not found` or `Inaccessible`, and shows `Selection line … · …` with the full path, so you can filter by path. Picking a `Not found` entry lets you fix it as described next; `Esc` cancels.

## Fix a path that does not exist

When nothing in the selection exists, an input box titled `Open Terminal Selection as Path` opens prefilled with the selected line unchanged, quotes and line numbers included (the first line when several were selected):

1. Read the prompt under the box. It shows the folder that relative paths start from and its source, for example `Relative paths resolve against: … (Shell integration)`.
2. Edit the text. While the path does not exist, the box shows `Not found: …` and Enter does nothing; once it exists, the message changes to `Will open file: …` or `Will open folder: …`.
3. Press Enter. The file opens at the line you wrote; `Esc` cancels and changes nothing.

The box stays open when you click back into the terminal, so you can check the original output. You can also type an absolute path, a `~` path or a `file://` URI. A path that exists but cannot be read, because of permissions or a file system that does not answer within 1.5 seconds, reports `Cannot access …: …` instead of opening the box; see [Troubleshooting](troubleshooting.md).

## Select text in full-screen programs such as Claude Code

Programs that capture the mouse, such as Claude Code in full-screen mode, draw their own drag highlight, so the terminal itself has no selection: the selection link and the right-click entry do not appear, and the command reports that nothing is selected. Either of these works:

1. Hold Option while dragging (Shift on Windows and Linux) to make a real terminal selection, then use any entry. On macOS this needs `"terminal.integrated.macOptionClickForcesSelection": true`; the command's notification offers `Enable Option+Drag Selection` to turn it on.
2. Select inside the program as usual. Claude Code copies the selection to the clipboard when you release the mouse; press Cmd+Y, or run `Text Toolkit: Open Clipboard as Path in Terminal Folder`, to open that path. Relative paths resolve against the active terminal's current folder, which for Claude Code is the folder it was started in. Cmd+U with nothing selected also offers `Open Clipboard Path` when the clipboard holds a path that exists.

Clipboard text is read the same way as a selection: noise is stripped, line numbers are honored, several lines give a list, and a path that does not exist opens the input box. The relative paths need a terminal to start from, so with no terminal open the command shows `Focus a terminal first: relative paths in the clipboard resolve against the terminal's current folder.`

## Bind a key

On macOS, while the terminal has focus, Cmd+U opens the selection and Cmd+Y opens the clipboard; no key is bound on Windows and Linux. To use other keys, add bindings to `keybindings.json` (`Preferences: Open Keyboard Shortcuts (JSON)`):

```jsonc
// keybindings.json
[
	// macOS: turn off the default Cmd+U and use Ctrl+Cmd+U instead
	{ "key": "cmd+u", "command": "-textToolkit.terminal.openSelection" },
	{
		"key": "ctrl+cmd+u",
		"command": "textToolkit.terminal.openSelection",
		"when": "terminalFocus",
	},
	// Windows / Linux
	{
		"key": "ctrl+alt+o",
		"command": "textToolkit.terminal.openSelection",
		"when": "terminalFocus",
	},
	{
		"key": "ctrl+alt+shift+o",
		"command": "textToolkit.terminal.openClipboardPath",
		"when": "terminalFocus",
	},
]
```

Leave `terminalTextSelected` out of `when`: a full-screen program such as Claude Code leaves the terminal without a selection, and the key would then do nothing.

On macOS a key with `cmd` works in the terminal as is. Any other key, which means every key on Windows and Linux, goes to the shell instead, so also add the commands to `settings.json`; without it the shell receives the key and nothing opens:

```json
{
	"terminal.integrated.commandsToSkipShell": [
		"textToolkit.terminal.openSelection",
		"textToolkit.terminal.openClipboardPath"
	]
}
```

## Turn on the selection link

The selection link lets you hold the link modifier and click the selected text instead of pressing a key. It is off by default because it appears only after the pointer has moved to another line and back; see [Known limits](#known-limits). To turn it on:

```json
{ "textToolkit.advanced": { "terminalOpen.selectionLink": true } }
```

The change takes effect immediately. The link modifier is Cmd on macOS and Ctrl on Windows and Linux, or Alt when `editor.multiCursorModifier` is `ctrlCmd`. The link covers only the selected text, so clicking anything else behaves as before; on the selected text it takes priority over VS Code's own link.

## Known limits

- With the selection link on, it appears only once the pointer has moved to another line and come back after you select. VS Code asks for a line's links only when the pointer moves onto a different line, and keeps reusing the answer it got before you selected; leaving the terminal and returning to the same line, or moving along the line, does not count. The right-click entry and keys do not have this delay.
- On a line longer than 2000 characters VS Code does not ask extensions for links, so no selection link appears; use the right-click entry or a key.
- A selection that starts or ends inside a word, such as `opyPath` out of `copyPath`, gets no link.
- While text is selected, the same text elsewhere on screen also becomes a link and opens the same path.
- Claude Code runs its commands in a folder of its own: after its Bash tool runs `cd sub`, relative paths in later command output are relative to `sub`, but the extension still sees the folder Claude Code was started in. Such a path is not found, or opens a file of the same name in the start folder; select the absolute path, or fix the path in the input box.
- When a line wraps on screen exactly at a space, the terminal drops that space, so the path is not found; restore the space in the input box.
- Reading the selection relies on a VS Code API that is not finalized. If your VS Code version does not provide it, the selection link never appears and the other entries report that nothing is selected; copy the path and run `Open Clipboard as Path in Terminal Folder` instead.
