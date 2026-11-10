# 调整设置

[English](../../docs/settings.md) · **简体中文**

本页说明扩展的设置怎样组织，以及 v0.0.11 之前写入的旧配置如何继续生效。

## 找到你想调的设置

每个可调选项都是设置界面与扩展市场页 **Feature Contributions** 标签页里的独立顶层设置：`textToolkit.copyPath.*`、`textToolkit.changeCase.*`、`textToolkit.alignByRegex.*`、`textToolkit.plainText.*`、`textToolkit.terminalOpen.*`、`textToolkit.diff.*` 与 `commonFormatter.list`。取值含义见各功能页；每项设置都会在设置界面直接显示自己的实际默认值，`textToolkit.plainText.editorOverrides` 的默认值就是完整的内置覆盖表。

## 旧版 `textToolkit.advanced` 配置

v0.0.11 之前的版本把上述设置藏在一个 `textToolkit.advanced` 对象里作为键。该对象已弃用但仍然生效：只把想改的键写进去，没写的键保持内置默认值，未知的键和类型不符的值会被忽略：

```json
{
	"textToolkit.advanced": {
		"copyPath.useLineCountSyntax": true,
		"alignByRegex.rememberLastInput": false
	}
}
```

迁移是可选且无损的：把每个键移到对应的顶层设置（例如 `copyPath.useLineCountSyntax` 变成 `textToolkit.copyPath.useLineCountSyntax`），再删掉 `textToolkit.advanced` 对象。两边都设置时顶层设置优先。
