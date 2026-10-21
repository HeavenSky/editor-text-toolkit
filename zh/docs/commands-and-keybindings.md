# 查找命令与绑定快捷键

[English](../../docs/commands-and-keybindings.md) · **简体中文**

本页说明怎样从一个选择器用到全部动作，以及怎样给常用动作绑定快捷键；扩展默认不绑定任何快捷键，不会与已有绑定冲突。

## 使用两级选择器

`文本工具箱: 显示全部命令` 列出五个工具，每项旁边标着当前生效的设置。选中一个工具后进入它的动作列表：

| 工具           | 动作                                                                                                                             |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 复制路径与行号 | 按当前设置复制，或临时选用四种路径写法之一                                                                                       |
| 转换大小写风格 | 16 种风格，选区只有一行时逐项预览                                                                                                |
| 按正则对齐     | `输入正则表达式...`，以及连同表达式列出的每个已保存模板                                                                          |
| 纯文本模式     | 开启或关闭（按当前状态显示其一），以及重新启用大文件提示                                                                         |
| 比较 (Diff)    | 标记、与标记比较、与剪贴板比较、比较可见编辑器或两个标签页、交换两侧、改成可编辑副本、打开来源文件、切换规则、清理副本、清除标记 |

第二级的第一项总是 `← 返回`，按 `Esc` 取消且不做任何改动，第一级本身从不执行动作。

![选择器的第一级](../../media/screenshots/commands.png)

## 带参数绑定快捷键

所有命令都能绑定快捷键，包括不在命令面板里的那些。其中三条接受参数，用来跳过各自的选择器：

| 命令 ID                         | 参数                                                                         |
| ------------------------------- | ---------------------------------------------------------------------------- |
| `textToolkit.copyPathWithLines` | `{ "pathStyle": "absolute" \| "relative" \| "tilde" \| "fileName" }`         |
| `textToolkit.changeCase`        | `{ "style": "camel" }`，或 [16 种风格](change-case.md#16-种风格)中的任意一种 |
| `textToolkit.alignByRegex`      | `{ "regex": "=" }` 或 `{ "template": "assign" }`                             |

把绑定写进 `keybindings.json`（执行 `首选项: 打开键盘快捷方式(JSON)`）：

```json
[
	{ "key": "shift+alt+c", "command": "textToolkit.copyPathWithLines", "when": "editorTextFocus" },
	{
		"key": "shift+alt+p",
		"command": "textToolkit.copyPathWithLines",
		"args": { "pathStyle": "absolute" },
		"when": "editorTextFocus"
	},
	{
		"key": "ctrl+alt+k",
		"command": "textToolkit.changeCase",
		"args": { "style": "kebab" },
		"when": "editorTextFocus"
	},
	{
		"key": "ctrl+alt+a",
		"command": "textToolkit.alignByRegex",
		"args": { "template": "assign" },
		"when": "editorHasSelection"
	},
	{ "key": "ctrl+alt+t", "command": "textToolkit.commands" },
	{ "key": "ctrl+1", "command": "textToolkit.diff.markSelection", "when": "editorTextFocus" },
	{ "key": "ctrl+2", "command": "textToolkit.diff.compareWithMarked", "when": "editorTextFocus" },
	{
		"key": "ctrl+3",
		"command": "textToolkit.diff.compareWithClipboard",
		"when": "editorTextFocus"
	}
]
```

## 找到不在命令面板里的命令

有八条命令要么得有一个文件作为操作对象才能用，要么很少用到，所以不放在命令面板里，改从下面这些位置进入：

| 命令                                                                     | 位置                                                |
| ------------------------------------------------------------------------ | --------------------------------------------------- |
| 以纯文本模式打开                                                         | 资源管理器中右键文件                                |
| 比较两个可见编辑器、比较两个已打开的标签页、交换比较两侧、切换归一化规则 | 比较 (Diff) 选择器                                  |
| 把当前比较改成可编辑副本                                                 | diff 编辑器标题栏的 `✎`，比较 (Diff) 选择器         |
| 打开来源文件                                                             | diff 编辑器标题栏的跳转文件按钮，比较 (Diff) 选择器 |
| 显示比较菜单                                                             | 状态栏中的比较项                                    |

编辑器右键菜单里有 `复制路径与行号`、`标记待比较文本`，存在标记时还有 `与标记的文本比较`；后两项由 `textToolkit.diff.contextMenu` 控制。
