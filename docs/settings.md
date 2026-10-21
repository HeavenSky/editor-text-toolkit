# Adjust settings

**English** · [简体中文](../zh/docs/settings.md)

This page explains how the extension's settings are split and how to change a built-in default that has no entry of its own in the Settings UI.

## Find the right layer

Settings come in two layers so the Settings UI stays short. Ten top-level `textToolkit.*` settings cover what you are likely to tune; they appear in the Settings UI and on the marketplace page's **Feature Contributions** tab, and each feature page explains their values. Everything else is a key inside the single `textToolkit.advanced` object.

## Override built-in defaults

Write only the keys you want to change into `textToolkit.advanced`; every key you leave out keeps its built-in default:

```json
{
	"textToolkit.advanced": {
		"copyPath.useLineCountSyntax": true,
		"alignByRegex.rememberLastInput": false
	}
}
```

| Key                                    | Built-in default | Explained in                                                                                        |
| -------------------------------------- | ---------------- | --------------------------------------------------------------------------------------------------- |
| `copyPath.useLineCountSyntax`          | `false`          | [Choose how lines are written](copy-path.md#choose-how-lines-are-written)                           |
| `changeCase.includeDotInCurrentWord`   | `false`          | [What counts as the word under the cursor](change-case.md#what-counts-as-the-word-under-the-cursor) |
| `alignByRegex.rememberLastInput`       | `true`           | [Align a selection](align-by-regex.md#align-a-selection)                                            |
| `plainText.applyEditorSettings`        | `true`           | [Tune the overrides](plain-text-mode.md#tune-the-overrides)                                         |
| `plainText.disableLineNumbers`         | `false`          | [Tune the overrides](plain-text-mode.md#tune-the-overrides)                                         |
| `plainText.suppressLanguageActivation` | `true`           | [Tune the overrides](plain-text-mode.md#tune-the-overrides)                                         |
| `plainText.editorOverrides`            | `{}`             | [Tune the overrides](plain-text-mode.md#tune-the-overrides)                                         |

`settings.json` completes every key with its type and default, and the value of `textToolkit.advanced` offers a snippet that writes out all built-in defaults. Unknown keys and values of the wrong type are ignored and the built-in default is kept, so a typo never leaves the extension broken.
