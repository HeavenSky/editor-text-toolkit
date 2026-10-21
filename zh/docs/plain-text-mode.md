# 以纯文本模式打开大文件

[English](../../docs/plain-text-mode.md) · **简体中文**

本页说明怎样流畅地阅读、搜索和编辑大文本或日志文件，以及这个模式会改动哪些设置；VS Code 能当作文本打开的文件都适用。

## 进入纯文本模式

从资源管理器进入最快，因为文件不会先按正常方式渲染一遍。下面几种方式都可以：

- 资源管理器右键 → `以纯文本模式打开`：一步完成打开与进入。支持多选，文件夹会被跳过。
- `文本工具箱: 切换纯文本模式`：作用于当前打开的文件。
- 大文件提示：打开不小于 `textToolkit.plainText.promptSizeMB` MB（默认 `2`）的文件时，会询问是否切换。选 `不再询问` 后会记住，可以在选择器的纯文本模式一项里重新启用。设为 `0` 则永不询问。
- VS Code 拒绝显示的文件：超过 `workbench.editorLargeFileConfirmation` MB 时，VS Code 不显示内容，只显示占位提示「此文件未显示在文本编辑器中，因为它非常大。」（英文界面：_The file is not displayed in the text editor because it is very large_）。这时会弹出通知，提示以纯文本模式打开该标签页；文件经扩展宿主打开，不受这个上限约束，不必先点 `仍然打开`。它与大文件提示共用 `不再询问` 开关和 `0` 这个取值。
- 自动进入：扩展名列在 `textToolkit.plainText.autoApplyExtensions` 里的文件（例如 `[".log", ".csv"]`）不经询问直接进入。

## 模式开启后会改变什么

文档语言变成 `plaintext`，该文件的分词、语义高亮和所有语言相关功能随之停止。状态栏出现 `纯文本` 项表示模式已开启；点它或再切换一次即可退出。

**从资源管理器命令打开时，语言扩展不会被唤醒。**VS Code 在打开某种语言的文件时就会激活对应的语言扩展，所以正常打开一个大 `.ts` 会启动 TypeScript 服务。扩展会临时往用户设置里加一条只匹配该文件的 `files.associations`，以 `plaintext` 打开文件后立即删掉这一条。你原本为同一路径模式写的条目保持原样。

扩展会在 `[plaintext]` 作用域下写入 29 项编辑器设置：打开自动换行，关闭 minimap、折叠、粘性滚动、括号着色、参考线、悬停提示、自动补全、CodeLens、链接和 Unicode 扫描等。这些设置限定在语言作用域内，代码文件不受影响。完整清单见 [29 项内置覆盖](#29-项内置覆盖)。

## 退出模式并还原

退出模式会还原文件原本应有的语言，以及被替换的每一项设置，原先未设置的也会恢复为未设置。打开了文件夹时设置写入工作区设置，否则写入用户设置；临时的 `files.associations` 始终写入用户设置，不会为此改动仓库里的 `.vscode/settings.json`。窗口崩溃遗留的条目会在扩展下次启动时清理。

## 无法加速的部分

这个模式省掉的是渲染和语言服务的开销，不改变 VS Code 加载文件的方式。整个文档仍在内存里，查找替换仍然扫描全文。几十 MB 的文件会明显变快，几百 MB 的文件则不会。

`workbench.editorLargeFileConfirmation` 这个上限对本模式无效，但 `files.maxMemoryForLargeFilesMB` 仍然有效。扩展刻意不去改它，因为调高它等于拿卡顿换内存溢出崩溃。

## 调整覆盖项

`textToolkit.advanced` 里有四个键控制本模式：

| 键                                     | 默认值  | 作用                                                  |
| -------------------------------------- | ------- | ----------------------------------------------------- |
| `plainText.applyEditorSettings`        | `true`  | 设为 `false` 时只切换语言，29 项覆盖一项都不写        |
| `plainText.disableLineNumbers`         | `false` | 设为 `true` 时模式开启期间同时隐藏行号                |
| `plainText.suppressLanguageActivation` | `true`  | 设为 `false` 时资源管理器照常打开文件，之后再切换语言 |
| `plainText.editorOverrides`            | `{}`    | 修改、移除或追加覆盖表中的条目                        |

`plainText.editorOverrides` 叠加在内置表之上，而不是替换它：

- 设置 id 配一个值：修改该项，例如 `"editor.minimap.enabled": true` 保留 minimap；
- 设置 id 配 `null`：移除该项，沿用你自己的全局设置；
- 其他任意 `editor.*` 设置 id：追加到表中。

```json
{
	"textToolkit.advanced": {
		"plainText.disableLineNumbers": true,
		"plainText.editorOverrides": {
			"editor.minimap.enabled": true,
			"editor.hover.enabled": null
		}
	}
}
```

在 `settings.json` 里编辑 `plainText.editorOverrides` 的值时，有一个代码片段能写出整张表，直接改即可。

## 29 项内置覆盖

| 设置 id                                       | 内置值                                                    |
| --------------------------------------------- | --------------------------------------------------------- |
| `editor.minimap.enabled`                      | `false`                                                   |
| `editor.wordWrap`                             | `"on"`                                                    |
| `editor.folding`                              | `false`                                                   |
| `editor.stickyScroll.enabled`                 | `false`                                                   |
| `editor.bracketPairColorization.enabled`      | `false`                                                   |
| `editor.guides.indentation`                   | `false`                                                   |
| `editor.guides.bracketPairs`                  | `false`                                                   |
| `editor.matchBrackets`                        | `"never"`                                                 |
| `editor.occurrencesHighlight`                 | `"off"`                                                   |
| `editor.selectionHighlight`                   | `false`                                                   |
| `editor.renderWhitespace`                     | `"none"`                                                  |
| `editor.renderControlCharacters`              | `false`                                                   |
| `editor.codeLens`                             | `false`                                                   |
| `editor.colorDecorators`                      | `false`                                                   |
| `editor.links`                                | `false`                                                   |
| `editor.hover.enabled`                        | `false`                                                   |
| `editor.parameterHints.enabled`               | `false`                                                   |
| `editor.suggestOnTriggerCharacters`           | `false`                                                   |
| `editor.wordBasedSuggestions`                 | `"off"`                                                   |
| `editor.quickSuggestions`                     | `{ "other": false, "comments": false, "strings": false }` |
| `editor.formatOnType`                         | `false`                                                   |
| `editor.formatOnPaste`                        | `false`                                                   |
| `editor.autoClosingBrackets`                  | `"never"`                                                 |
| `editor.autoClosingQuotes`                    | `"never"`                                                 |
| `editor.trimAutoWhitespace`                   | `false`                                                   |
| `editor.semanticHighlighting.enabled`         | `false`                                                   |
| `editor.unicodeHighlight.nonBasicASCII`       | `false`                                                   |
| `editor.unicodeHighlight.invisibleCharacters` | `false`                                                   |
| `editor.unicodeHighlight.ambiguousCharacters` | `false`                                                   |
