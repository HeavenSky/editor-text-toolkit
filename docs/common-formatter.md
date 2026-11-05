# Format documents with an installed CLI

**English** · [简体中文](../zh/docs/common-formatter.md)

Use this page to connect a formatter already installed on your system to VS Code's document formatting and format-on-save commands.

## Connect your formatter

Your command must read the document from stdin and write only the formatted text to stdout.
For example, with Prettier installed and available to the extension host, add this to `settings.json`:

```json
{
	"commonFormatter.list": [
		{
			"name": "Prettier",
			"languages": ["javascript", "typescript", "json"],
			"command": "prettier",
			"args": ["--stdin-filepath", "${file}"]
		}
	],
	"[typescript]": {
		"editor.defaultFormatter": "HeavenSky.editor-text-toolkit",
		"editor.formatOnSave": true
	}
}
```

Open a TypeScript file and save it, or run `Text Toolkit: Format Document with CLI`.
The CLI receives the current editor text, including unsaved changes.
The extension applies the returned text through VS Code, so you can undo the formatting.
It does not run the formatter with a write-in-place flag.

The toolkit picker also has a **Common Formatter** menu with actions to format the document, open its settings, and show formatter output.
An empty list disables the formatter Provider.
The complete field definitions and defaults are available in the Settings editor under `commonFormatter.list`.

## Choose which command runs

The first enabled entry whose `languages` contains the document's current VS Code language ID runs.
This is a priority list, not a pipeline: a missing command or other failure does not try the next entry.
Names must be unique within the effective list.

User, workspace and workspace-folder settings follow VS Code precedence; a higher-priority array replaces the entire lower-priority list.
The extension reads settings for the document being formatted.
In a multi-root workspace, each folder can therefore use a different list.

`command` is an executable name or path; each `args` element is one argument, even when it contains spaces.
Do not add quotes around `${file}` to protect spaces, and do not put a shell pipeline in `command`.
Aliases, shell functions, `~` and `$NAME` are not expanded; use an executable, `${userHome}` and `${env:NAME}` instead.

The default working directory is the file's directory.
A relative `cwd` resolves against the document's workspace folder, or its own directory outside a workspace.
A relative executable path containing a path separator resolves against the resulting `cwd`.
An executable name is looked up using the final child-process `PATH`.
The extension does not install commands or probe them with `--version`.

## Use variables and platform overrides

Variable names follow the [VS Code variables reference](https://code.visualstudio.com/docs/reference/variables-reference).
File variables always refer to the document being formatted, even if a different editor gains focus.

- File paths: `${file}`, `${fileBasename}`, `${fileBasenameNoExtension}`, `${fileExtname}`, `${fileDirname}`, `${fileDirnameBasename}`.
- Workspace paths: `${workspaceFolder}`, `${workspaceFolderBasename}`, `${fileWorkspaceFolder}`, `${relativeFile}`, `${relativeFileDirname}`, `${workspaceFolder:Name}`.
- Host values: `${userHome}`, `${pathSeparator}`, `${/}`, `${env:NAME}`.
- VS Code settings: `${config:setting.name}`; strings, numbers and booleans are accepted.

Variables are supported in `command`, `args` elements, `cwd`, and string values in `env`.
Keys, names and language IDs are not substituted.
Each variable is evaluated once per request; substituted values are not expanded again.
Unknown variables, missing values, nested expressions and unavailable workspace context produce an error identifying the rule and field.
Interactive variables such as `${input:...}` and `${command:...}`, and cursor-dependent variables, are not supported.

Environment overrides inherit the extension-host environment; `null` removes a variable.
`${env:NAME}` always reads that inherited environment, not another override in the same entry.
For example:

```json
{
	"commonFormatter.list": [
		{
			"name": "My formatter",
			"languages": ["typescript"],
			"command": "${userHome}/tools/my-formatter",
			"args": ["--stdin-filepath", "${file}"],
			"cwd": "${workspaceFolder}",
			"env": {
				"FORMATTER_CONFIG": "${workspaceFolder}/config/formatter.json",
				"UNUSED_VARIABLE": null
			},
			"windows": { "command": "my-formatter.cmd" }
		}
	]
}
```

`windows`, `linux` and `osx` override execution fields for the extension-host operating system.
An overridden `args` replaces the whole array; `env` merges by key.
With Remote SSH, WSL or containers, install the CLI in that environment and use paths visible there.
The extension requires a Node extension host; it cannot launch local processes from a browser-only workspace.

## Diagnose a failed format

Use `Text Toolkit: Show Formatter Output` to read the rule name, invalid field or process error, and stderr diagnostics.
The log does not record the document text, stdout or environment values.
Avoid putting credentials in CLI diagnostics.

If a command is not found, check its availability in the extension-host environment or configure its absolute path.
An integrated terminal can have a different `PATH` because its shell startup files change it.
If formatting takes too long, adjust the entry's `timeout` in milliseconds or fix the formatter's startup/configuration problem.
Repeated identical errors show one notification until settings are refreshed; diagnostics continue to be logged.

Exit code `0` means success; stderr alone does not mean failure.
An empty stdout is a valid empty document.
Stdout above 32 MiB stops the process; stderr is drained with only its first 64 KiB retained.
Cancellation, closing or changing the document, and a newer request for the same document discard the old result.

CLI execution requires a trusted workspace; the other toolkit features remain available in Restricted Mode.
Only documents with file paths are supported: Untitled documents, virtual comparisons and selection formatting are excluded.
Plain text mode matches the document's current `plaintext` language, not the language it had before the mode was enabled.
