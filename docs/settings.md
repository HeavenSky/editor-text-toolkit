# Adjust settings

**English** · [简体中文](../zh/docs/settings.md)

This page explains how the extension's settings are organized and what happens to configurations written for versions before v0.0.11.

## Find the setting you want

Every tunable option is its own top-level setting in the Settings UI and on the marketplace page's **Feature Contributions** tab: `textToolkit.copyPath.*`, `textToolkit.changeCase.*`, `textToolkit.alignByRegex.*`, `textToolkit.plainText.*`, `textToolkit.terminalOpen.*`, `textToolkit.diff.*` and `commonFormatter.list`. Each feature page explains what its settings do; every setting shows its actual default value right in the Settings UI, and `textToolkit.plainText.editorOverrides` lists the full built-in override table as its default.

## Old `textToolkit.advanced` configurations

Versions before v0.0.11 hid those settings as keys inside a single `textToolkit.advanced` object. That object is deprecated but still honored: write only the keys you want to change into it, every key you leave out keeps its built-in default, and unknown keys and values of the wrong type are ignored:

```json
{
	"textToolkit.advanced": {
		"copyPath.useLineCountSyntax": true,
		"alignByRegex.rememberLastInput": false
	}
}
```

Migration is optional and lossless: move each key to its top-level setting (for example `copyPath.useLineCountSyntax` becomes `textToolkit.copyPath.useLineCountSyntax`) and delete the `textToolkit.advanced` object. When both are set, the top-level setting wins.
