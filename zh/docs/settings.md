# 调整设置

[English](../../docs/settings.md) · **简体中文**

本页说明扩展的设置怎样分层，以及怎样修改设置界面里没有单独条目的内置默认值。

## 找到对应的设置层

设置分两层，让设置界面保持简短。十项顶层 `textToolkit.*` 设置覆盖最可能要调的选项，它们出现在设置界面和扩展市场页的 **Feature Contributions** 标签页里，取值含义见各功能页。其余选项都是 `textToolkit.advanced` 这一个对象里的键。

## 覆盖内置默认值

只把想改的键写进 `textToolkit.advanced`；没写的键保持内置默认值：

```json
{
	"textToolkit.advanced": {
		"copyPath.useLineCountSyntax": true,
		"alignByRegex.rememberLastInput": false
	}
}
```

| 键                                     | 内置默认值 | 说明见                                                  |
| -------------------------------------- | ---------- | ------------------------------------------------------- |
| `copyPath.useLineCountSyntax`          | `false`    | [选择行号的写法](copy-path.md#选择行号的写法)           |
| `changeCase.includeDotInCurrentWord`   | `false`    | [怎样算光标所在的词](change-case.md#怎样算光标所在的词) |
| `alignByRegex.rememberLastInput`       | `true`     | [对齐选中的行](align-by-regex.md#对齐选中的行)          |
| `plainText.applyEditorSettings`        | `true`     | [调整覆盖项](plain-text-mode.md#调整覆盖项)             |
| `plainText.disableLineNumbers`         | `false`    | [调整覆盖项](plain-text-mode.md#调整覆盖项)             |
| `plainText.suppressLanguageActivation` | `true`     | [调整覆盖项](plain-text-mode.md#调整覆盖项)             |
| `plainText.editorOverrides`            | `{}`       | [调整覆盖项](plain-text-mode.md#调整覆盖项)             |

在 `settings.json` 里输入时，每个键都会补全类型和默认值；编辑 `textToolkit.advanced` 的值时，还有一个代码片段能写出全部内置默认值。未知的键和类型不符的值会被忽略并保留内置默认值，写错一处也不会让扩展失灵。
