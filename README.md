# Editor Text Toolkit

**English** · [简体中文](./zh/README.md)

Copy `path:12-14` references, convert case, align columns by a regex, open large files as plain text, and compare any two pieces of text.

[![VS Marketplace](https://vsmarketplacebadges.dev/version-short/HeavenSky.editor-text-toolkit.svg?label=VS%20Marketplace)](https://marketplace.visualstudio.com/items?itemName=HeavenSky.editor-text-toolkit)
[![Installs](https://vsmarketplacebadges.dev/installs-short/HeavenSky.editor-text-toolkit.svg)](https://marketplace.visualstudio.com/items?itemName=HeavenSky.editor-text-toolkit)
[![License](https://img.shields.io/badge/license-MIT-blue)](./LICENSE.txt)

It is for people who paste code locations into reviews and chats, reshape identifiers, and diff snippets many times a day. Instead of one extension per task, you get one picker that lists every action the extension offers in the editor next to the settings in effect, so you never need to remember a command name. It binds no keys by default, has no runtime dependencies, and sends no telemetry.

![The picker lists the five tools with the settings currently in effect](media/screenshots/commands.png)

## Get started

1. Run `code --install-extension HeavenSky.editor-text-toolkit`, or install from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=HeavenSky.editor-text-toolkit).
2. Press `Ctrl+Shift+P` (`Cmd+Shift+P` on macOS) and run `Text Toolkit: Show All Commands`.
3. Pick a tool, then an action. Once you know what you use, [bind a key to it](docs/commands-and-keybindings.md#bind-keys-with-arguments).

## Share an exact code location

`Copy Path With Line Numbers` turns every cursor and selection into one reference that people, issue trackers and AI assistants can trace back to the exact lines. Selecting lines 3–4, 8 and 12–14 copies:

```text
src/app.ts:3-4,8,12-14
```

The path can be absolute, workspace-relative, `~`-relative or just the file name. See [Copy a path with line numbers](docs/copy-path.md).

## Rename and line up text in place

`Change Case...` converts the selection, or the word under the cursor, to any of 16 styles; for a single-line selection it previews each result before you apply it.

![Change Case previews every style for the selection](media/screenshots/change-case.png)

`Align by RegEx` lines up the selected lines on any separator, and keeps a short line from widening a column it does not reach:

```text
# before                # after
const a = 1;            const a  = 1;
let bbbb = 22;          let bbbb = 22;
var cc = 333;           var cc   = 333;
```

See [Convert case](docs/change-case.md) and [Align lines by a regular expression](docs/align-by-regex.md).

## Open a large log without the editor stalling

Plain text mode switches a file to `plaintext` and turns off highlighting, minimap, folding, hovers and suggestions for plain text only. **Your code files keep their settings.** Opened from the Explorer, a large `.ts` file shows up without waking the TypeScript extension, and leaving the mode restores the language and every setting it changed. See [Open large files in plain text mode](docs/plain-text-mode.md).

## Compare two snippets without saving them

Mark one selection and compare it with another, with the clipboard, with a visible editor or with any open tab. The result opens in VS Code's own diff editor, and each side keeps the language of the file it came from.

![Two selections from the same file compared side by side](media/screenshots/diff.png)

Normalization rules hide predictable noise such as timestamps or tabs, and one click turns a comparison into editable copies. See [Compare two pieces of text](docs/compare.md).

## Open a path straight from terminal output

Jump from a path printed in the terminal to that file and line, even where VS Code's own link detection splits the path wrongly; relative paths resolve against the terminal's current folder. Select the path, then hold Cmd (Ctrl on Windows and Linux) and click the selection, or right-click it and choose `Open Terminal Selection as Path`:

```text
# selected in the terminal      # opens in the editor
src/app.ts:12:5                 src/app.ts, cursor at line 12, column 5
```

Quotes, brackets and trailing punctuation are stripped, and `path(12,5)`, `#L12`, `~` and `file://` forms work too. See [Open a terminal selection as a path](docs/open-terminal-selection.md).

## When not to use it

Plain text mode removes rendering and language-service work, not the cost of loading the file: a file of hundreds of MB still loads in full, so use a pager such as `less` for those. To compare two whole files on disk with Git integration, VS Code's built-in `Select for Compare` is enough.

## Learn more

The [guide](docs/README.md) covers every option, limit and error message. Commands and settings are listed on the marketplace page's **Feature Contributions** tab. See the [changelog](./CHANGELOG.md) for what changed in each release.

## License

[MIT](./LICENSE.txt). Third-party notices are in [NOTICE.md](./NOTICE.md).
