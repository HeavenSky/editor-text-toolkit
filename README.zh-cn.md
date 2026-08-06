# Editor Text Toolkit

[English](README.md) · **简体中文**

五个日常编辑工具合并成一个 VS Code 扩展 —— 复制 `path:12-14` 形式的引用, 转换大小写风格, 按正则对齐, 驯服超大日志文件, 以及比较两段文本.

零运行时依赖. 界面提供英文与简体中文, 跟随 VS Code 显示语言. 不含遥测. 不预置任何快捷键, 因此不会与你已有的绑定冲突.

## 快速上手

1. 按 `Ctrl+Shift+P` / `Cmd+Shift+P`, 执行 **`Text Toolkit: 显示全部命令`**.
2. 选一个分类. 选择器会显示当前生效的设置并列出全部动作, 因此不必记住任何命令名就能用完整个扩展.
3. 确定了常用的那几个之后, 再给它们[绑定快捷键](#快捷键).

## 目录

- [复制路径与行号](#复制路径与行号)
- [转换大小写风格](#转换大小写风格)
- [按正则对齐](#按正则对齐)
- [纯文本模式](#纯文本模式)
- [比较 (Diff)](#比较-diff)
- [命令与快捷键](#命令与快捷键)
- [设置](#设置)
- [本地化](#本地化)
- [开发](#开发)
- [许可证](#许可证)

---

## 复制路径与行号

复制一条指向当前位置的引用, 格式便于别人(以及 AI 助手, issue 系统)直接粘回去:

```text
src/features/diff/core.ts:112-118
```

**如何执行:** `Text Toolkit: 复制路径与行号`, 或在编辑器中右键, 或通过选择器.

**路径部分**遵循 `textToolkit.copyPath.pathStyle`; 选择器同时把四种风格都列为一次性选项, 选用时不会写回你的设置:

| 风格 | 结果 |
| --- | --- |
| `absolute`(默认) | `/Users/you/project/src/app.ts` |
| `relative` | `src/app.ts` —— 没有工作区文件夹包含该文件时回退为绝对路径 |
| `tilde` | `~/project/src/app.ts` —— 只有文件位于 home 目录下时才替换前缀 |
| `fileName` | `app.ts` |

**行号部分**收集每个光标与选区的行号, 去重, 排序, 并把连续的行号合并成一个片段:

| 形式 | 含义 |
| --- | --- |
| `path:a` | 单行 |
| `path:a-b` | 闭区间, 第 `a` 行到第 `b` 行 |
| `path:a-b,c-d` | 多个片段, 逗号分隔 |
| `path:a+n` | 从第 `a` 行起的 `n` 行 —— 需手动开启, 见下 |

`textToolkit.copyPath.multiLineFormat` 决定输出形状. 以选中第 3, 4, 8, 12, 13, 14 行为例:

| 格式 | 输出 |
| --- | --- |
| `range`(默认) | `path:3-4,8,12-14` |
| `list` | `path:3,4,8,12,13,14` |
| `perLine` | `path:3`, `path:4`, … 每行一条 |

`a+n` 形式默认关闭. 用 `{ "textToolkit.advanced": { "copyPath.useLineCountSyntax": true } }` 打开后, 同样的选区会复制成 `path:3+2,8,12+3`. 两种写法下单行都写作 `a`, 多个片段都用逗号连接; `list` 与 `perLine` 不受影响, 因为它们从不产生片段.

用 `textToolkit.copyPath.separator` 修改路径与行号之间的 `:`.

**注意:** 未保存的文档与非文件文档(输出通道, 虚拟文档)会给出提示而不是复制, 因为它们没有可复制的路径.

---

## 转换大小写风格

把选区, 多个选区, 或光标所在的词在 16 种风格之间转换.

**如何执行:** `Text Toolkit: 转换大小写风格...` 打开风格选择器; 当选区只有一行时, 每一项都会**预览转换后的文本**, 让你在确认前先看到结果. 从快捷键触发时可以用 `{ "style": "kebab" }` 直接跳过选择器.

全部 16 种风格, 以输入 `fooBar baz-qux` 为例:

| 风格 | 结果 | 说明 |
| --- | --- | --- |
| `camel` | `fooBarBazQux` | |
| `pascal` | `FooBarBazQux` | |
| `snake` | `foo_bar_baz_qux` | |
| `constant` | `FOO_BAR_BAZ_QUX` | |
| `kebab` | `foo-bar-baz-qux` | |
| `param` | `foo-bar-baz-qux` | `kebab` 的别名 |
| `dot` | `foo.bar.baz.qux` | |
| `path` | `foo/bar/baz/qux` | |
| `no` | `foo bar baz qux` | 小写, 空格分隔 |
| `sentence` | `Foo bar baz qux` | 首字符大写 |
| `title` | `Foo Bar Baz Qux` | 每个词首字母大写 |
| `lower` | `foobar baz-qux` | 整串转换, 不动分隔符 |
| `upper` | `FOOBAR BAZ-QUX` | 整串转换, 不动分隔符 |
| `lowerFirst` | `fooBar baz-qux` | 只改首字符 |
| `upperFirst` | `FooBar baz-qux` | 只改首字符 |
| `swap` | `FOObAR BAZ-QUX` | 每个字符大小写反转 |

**"光标所在的词"如何界定:** 比编辑器自身的定义更宽 —— `_`, `-`, `/` 与 `$` 始终视为词字符, 因此 `foo_bar-baz` 会作为一个整体转换. `.` 默认**不**计入; 用 `{ "textToolkit.advanced": { "changeCase.includeDotInCurrentWord": true } }` 打开后, 光标位于 `foo_bar.baz` 中会转换整串, 而不只是 `baz`.

多行选区按文档自身的换行符切分, 因此 Windows 上的 LF 文件也能正确处理.

---

## 按正则对齐

按某个分隔符对齐选中的若干行, 使各列纵向对齐.

**如何执行:** 选中要对齐的行, 执行 `Text Toolkit: 按正则对齐`. 输入一个正则表达式, 或一个已保存模板的名称. 选择器会连同模式一起列出你的模板, 因此不必回忆模板名.

在设置中保存模板:

```json
{ "textToolkit.alignByRegex.templates": { "assign": "=|,|:", "arrow": "=>" } }
```

从快捷键触发时, 两种形式都可以直接传入: `{ "regex": "=" }` 或 `{ "template": "assign" }`.

对齐作用于主选区覆盖的整行; 选区若停在下一行的第 0 列, 不会把那一行拖进来. 列宽按你的 `editor.tabSize` 计算. 输入框会预填上一次用过的表达式 —— 用 `{ "textToolkit.advanced": { "alignByRegex.rememberLastInput": false } }` 关闭该行为.

三行按 `=` 对齐:

```text
# 对齐前               # 对齐后
const a = 1;           const a  = 1;
let bbbb = 22;         let bbbb = 22;
var cc = 333;          var cc   = 333;
```

**各行的匹配数量不必相同.** 每一列的宽度只在真正有匹配的行之间计算, 因此短行不会撑宽一个不相干的列, 而只有单行匹配的列会被原样保留:

```text
# 对齐前               # 对齐后
x = 111111111;         x  = 111111111;
yy = 2; zzz = 3;       yy = 2; zzz   = 3;
w = 4; vvvvv = 5;      w  = 4; vvvvv = 5;
```

---

## 纯文本模式

去掉 VS Code 本会施加在文件上的渲染与语言服务开销, 让大文本或日志文件恢复到可读, 可搜索, 可编辑的流畅程度.

**四种进入方式:**

- **资源管理器右键 → `以纯文本模式打开`** —— 一步完成打开与进入, 文件不会先被正常渲染一次. 支持多选; 目录会被跳过.
- `Text Toolkit: 切换纯文本模式`, 作用于当前打开的文件.
- **自动询问**: 打开体积达到 `textToolkit.plainText.promptSizeMB` MB(默认 2)的文件时弹出提示, 接受即进入. 选择 `不再询问` 会被记住; 在选择器的纯文本模式一项中可以恢复. 设为 `0` 表示永不询问.
- **静默进入**: 扩展名列在 `textToolkit.plainText.autoApplyExtensions` 中的文件, 例如 `[".log", ".csv"]`.

**它做了什么:**

- 把文档语言切换为 `plaintext`, 从而停掉分词, 语义高亮以及该文档上的全部语言相关能力.
- 写入 29 项 `[plaintext]` 作用域的编辑器覆盖 —— minimap, 折叠, 粘性滚动, 括号着色, 缩进参考线, 悬停, 建议, code lens, 链接, unicode 扫描等. 完整表格见[设置参考](#29-项内置-plaintext-覆盖). 由于这些覆盖限定在语言作用域内, **你的代码文件完全不受影响**.
- 显示一个 `纯文本` 状态栏项. 点击它, 或再次切换, 即可还原原始语言以及每一个被替换过的设置值.

**适用范围与限制 —— 依赖它之前请先读:**

- 它消除的是**渲染与语言服务**开销, **不改变** VS Code 加载文件的方式: 整个文档仍然存在于 `TextModel` 中, 文件内查找替换也仍然跑在该模型上. 在 5–50 MB 区间会有明显改善, 几百 MB 的文件不会有数量级变化.
- 打开工作区时设置写入工作区设置, 否则写入用户设置. 原值(包括"原本未设置"这一情况)会被记录, 退出时还原.
- VS Code 根本拒绝打开的文件不在本模式的作用范围内. 那个上限由 `files.maxMemoryForLargeFilesMB` 决定, 本扩展刻意不去改动它 —— 调高它等于用卡顿换内存溢出崩溃.

设 `{ "textToolkit.advanced": { "plainText.applyEditorSettings": false } }` 可以只切换语言而完全跳过这些覆盖; 设 `"plainText.disableLineNumbers": true` 则在模式生效期间一并隐藏行号.

---

## 比较 (Diff)

比较两段文本, 两边都不需要先存成文件.

**五种发起比较的方式:**

| 想比较什么 | 怎么做 |
| --- | --- |
| 两段选区, 同一文件或不同文件 | 在第一段上执行 `标记待比较文本`, 再在第二段上执行 `与标记的文本比较` |
| 选区与剪贴板 | `与剪贴板比较` |
| 屏幕上分屏的两个文件 | `比较两个可见编辑器` |
| 任意两个已打开的标签页, 可见与否都行 | `比较两个已打开的标签页`, 然后依次选择左侧与右侧 |
| 把两侧调个个儿 | `交换比较两侧` 会用互换后的顺序重新打开最近一次比较 |

**选区规则:** 在**没有选区**时执行比较命令会使用整个文件. 支持**多光标** —— 各段非空选区按文档位置排序后用换行连接. 标记会一直保留, 直到你替换或清除它, 因此可以在一个文件里标记, 到另一个文件里使用.

**状态栏:** 存在标记时, 右侧会显示一个条目, 展示来源与行号范围. 点击它可打开比较菜单(标记, 比较, 交换, 切换规则, 清除).

**语法高亮:** 每一侧继承其来源文件的语言, 剪贴板一侧则继承另一侧的语言 —— 因此拿剪贴板与一段 `.ts` 选区比较时, 两侧都会按 TypeScript 高亮.

**剪贴板中的非文本内容:** VS Code 的剪贴板 API 只暴露文本. 复制的内容同时包含图片**与**文字时, 拿到的是文字, 参与比较的也是文字. 只复制了图片时, 读到的是空串, 与"剪贴板为空"无法区分, 因此命令会提示没有可比较的内容, 而不是打开一个有一侧全空的 diff.

### 归一化规则

`textToolkit.diff.normalizationRules` 用来把可预期的噪声 —— 时间戳, 制表符, 不一致的空格 —— 挡在比较之外. 规则只改写 diff 中显示的内容, **你的文件不会被改动**.

```json
{
  "textToolkit.diff.normalizationRules": [
    { "name": "Replace tabs with spaces", "match": "\t", "replaceWith": "  " },
    { "name": "One space after a comma", "match": ",\\s*([^,\n]+)", "replaceWith": ", $1" },
    { "name": "Ignore letter case", "match": ".*", "replaceWith": { "letterCase": "upper" }, "enableOnStart": false }
  ]
}
```

| 字段 | 必填 | 含义 |
| --- | --- | --- |
| `match` | 是 | 正则表达式; 自动附加全局标志 |
| `replaceWith` | 是 | 替换文本, 其中 `$1`, `$2` … 对应捕获组 —— 或 `{ "letterCase": "upper" \| "lower" }`, 把匹配到的内容统一转成大写或小写 |
| `name` | 否 | 显示在切换面板中 |
| `enableOnStart` | 否 | 设为 `false` 时该规则默认不生效, 需手动开启; 缺省为 `true` |

规则按数组顺序依次应用. `切换归一化规则` 可以在运行时启停规则而不改动你的设置, 并且会**刷新每一个已经打开的比较** —— 不需要关掉 diff 再重新执行一次. 在 `settings.json` 中编辑该数组会让每条规则重置回各自的 `enableOnStart`.

两个指示器, 含义有意不同:

- diff 标题中的 `~`(而不是 `↔`)表示该比较**打开时**至少有一条规则生效. 它是快照, 之后不会变化.
- 状态栏中的过滤器计数是**当前**激活的规则数, 始终准确.

`match` 不是合法正则, 或缺少 `match` / `replaceWith` 的条目会被跳过并在扩展日志中留下记录, 而不会让整个功能失效.

### VS Code 本身已经提供的能力

比较结果打开在原生的 VS Code diff 编辑器中, 因此 diff 编辑器能做的事你本来就有:

| 想要 | 用什么 |
| --- | --- |
| 变更行内部的字符级高亮 | diff 编辑器默认开启 |
| 跳到下一处 / 上一处差异 | `F7` / `Shift+F7` |
| 折叠无差异的区域 | `diffEditor.hideUnchangedRegions.enabled` |
| 上下 inline 而不是左右并排 | `diffEditor.renderSideBySide`, 或 diff 编辑器里的 `⋯` 菜单 |
| 换一套 diff 配色 | 你的颜色主题, 或 `workbench.colorCustomizations` → `diffEditor.*` |
| 在资源管理器里比较两个**文件** | 内置的 `选择以进行比较` / `与已选项目进行比较`, 可编辑且集成 Git |
| 与磁盘上已保存的版本比较 | 内置的 `文件: 将活动文件与已保存文件进行比较` |
| 让 diff 占满宽度 | 把 diff 标签页拖到独立的编辑器组 |

---

## 命令与快捷键

### 两级选择器

`Text Toolkit: 显示全部命令` 是总入口. 第一级列出五个分类, 每项显示当前生效的设置; 选中之后进入第二级:

| 分类 | 第二级 |
| --- | --- |
| 复制路径与行号 | 按当前设置复制, 外加四种路径风格各自作为一次性选项(不会写回设置) |
| 转换大小写风格 | 16 种风格; 选区为单行时每一项都预览转换后的文本 |
| 按正则对齐 | `输入正则表达式...`, 以及连同模式一起列出的每一个已保存模板 |
| 纯文本模式 | 开启 / 关闭(按当前状态显示其一), 以及重新启用大文件提示 |
| 比较 (Diff) | 标记, 与标记比较, 与剪贴板比较, 比较可见编辑器, 比较两个标签页, 交换两侧, 切换归一化规则, 以及存在标记时的清除标记 |

三条规则处处成立: 第二级的首项固定是 `← 返回`; `Esc` 取消整个流程且不做任何改动; 第一级本身从不执行动作.

### 命令一览

命令面板中共有八条命令, 全部归在 `Text Toolkit` 分类下:

| 命令 ID | 标题 | 参数(用于快捷键) |
| --- | --- | --- |
| `textToolkit.commands` | 显示全部命令 | — |
| `textToolkit.copyPathWithLines` | 复制路径与行号 | `{ "pathStyle": "absolute" \| "relative" \| "tilde" \| "fileName" }` |
| `textToolkit.changeCase` | 转换大小写风格... | `{ "style": "camel" }`(16 种风格中的任意一种) |
| `textToolkit.alignByRegex` | 按正则对齐 | `{ "regex": "=" }` 或 `{ "template": "assign" }` |
| `textToolkit.plainText.toggle` | 切换纯文本模式 | — |
| `textToolkit.diff.markSelection` | 标记待比较文本 | — |
| `textToolkit.diff.compareWithMarked` | 与标记的文本比较 | — |
| `textToolkit.diff.compareWithClipboard` | 与剪贴板比较 | — |

另有六条不在命令面板中 —— 它们要么需要一个文件作为操作对象, 要么使用频率低到更适合放在选择器里. **这六条同样可以绑定快捷键:**

| 命令 ID | 标题 | 位置 |
| --- | --- | --- |
| `textToolkit.plainText.open` | 以纯文本模式打开 | 资源管理器右键, 作用于文件(不含目录) |
| `textToolkit.diff.compareVisibleEditors` | 比较两个可见编辑器 | 比较 (Diff) 选择器 |
| `textToolkit.diff.compareTabs` | 比较两个已打开的标签页 | 比较 (Diff) 选择器 |
| `textToolkit.diff.swapSides` | 交换比较两侧 | 比较 (Diff) 选择器 |
| `textToolkit.diff.toggleNormalizationRules` | 切换归一化规则 | 比较 (Diff) 选择器 |
| `textToolkit.diff.showMenu` | 显示比较菜单 | 比较状态栏项 |

### 右键菜单

- **编辑器右键:** `复制路径与行号`, `标记待比较文本`, 以及存在标记时的 `与标记的文本比较`. 用 `textToolkit.diff.contextMenu`(`both` / `markOnly` / `none`)控制后两项.
- **资源管理器右键:** `以纯文本模式打开`, 作用于文件.

### 快捷键

本扩展**不预置任何快捷键**, 因此不会与你已有的绑定或其他扩展冲突. 按需绑定, 也可以带参数:

```json
[
  { "key": "shift+alt+c", "command": "textToolkit.copyPathWithLines", "when": "editorTextFocus" },
  { "key": "shift+alt+p", "command": "textToolkit.copyPathWithLines", "args": { "pathStyle": "absolute" }, "when": "editorTextFocus" },
  { "key": "ctrl+alt+k", "command": "textToolkit.changeCase", "args": { "style": "kebab" }, "when": "editorTextFocus" },
  { "key": "ctrl+alt+a", "command": "textToolkit.alignByRegex", "args": { "template": "assign" }, "when": "editorHasSelection" },
  { "key": "ctrl+alt+t", "command": "textToolkit.commands" },
  { "key": "ctrl+1", "command": "textToolkit.diff.markSelection", "when": "editorTextFocus" },
  { "key": "ctrl+2", "command": "textToolkit.diff.compareWithMarked", "when": "editorTextFocus" },
  { "key": "ctrl+3", "command": "textToolkit.diff.compareWithClipboard", "when": "editorTextFocus" }
]
```

---

## 设置

设置分为两层, 让设置界面保持简短: 十项你大概率会调的, 以及一个承载其余全部选项的对象.

### 暴露层

```json
{
  "textToolkit.copyPath.pathStyle": "absolute",
  "textToolkit.copyPath.separator": ":",
  "textToolkit.copyPath.multiLineFormat": "range",
  "textToolkit.alignByRegex.templates": { "assign": "=|,|:" },
  "textToolkit.plainText.promptSizeMB": 2,
  "textToolkit.plainText.autoApplyExtensions": [".log", ".csv"],
  "textToolkit.diff.normalizationRules": [],
  "textToolkit.diff.contextMenu": "both",
  "textToolkit.diff.clipboardSide": "left",
  "textToolkit.advanced": {}
}
```

| 设置 | 类型 | 默认值 | 取值 |
| --- | --- | --- | --- |
| `textToolkit.copyPath.pathStyle` | string | `absolute` | `absolute`, `relative`, `tilde`, `fileName` |
| `textToolkit.copyPath.separator` | string | `:` | 任意字符串 |
| `textToolkit.copyPath.multiLineFormat` | string | `range` | `range`, `list`, `perLine` |
| `textToolkit.alignByRegex.templates` | object | `{}` | `{ "name": "regex" }` |
| `textToolkit.plainText.promptSizeMB` | number | `2` | `0` 表示关闭提示 |
| `textToolkit.plainText.autoApplyExtensions` | string[] | `[]` | 例如 `[".log", ".csv"]` |
| `textToolkit.diff.normalizationRules` | array | `[]` | 见[归一化规则](#归一化规则) |
| `textToolkit.diff.contextMenu` | string | `both` | `both`, `markOnly`, `none` |
| `textToolkit.diff.clipboardSide` | string | `left` | `left`, `right` |
| `textToolkit.advanced` | object | `{}` | 见下 |

### 内置层 —— `textToolkit.advanced`

其余选项都有内置默认值, 且**不**各自声明为独立设置. 只覆盖你需要的那些; 每一个你没写的键都保持内置值.

```json
{
  "textToolkit.advanced": {
    "copyPath.useLineCountSyntax": true,
    "changeCase.includeDotInCurrentWord": true,
    "alignByRegex.rememberLastInput": false,
    "plainText.applyEditorSettings": true,
    "plainText.disableLineNumbers": true,
    "plainText.editorOverrides": {
      "editor.minimap.enabled": true,
      "editor.hover.enabled": null
    }
  }
}
```

| 键 | 类型 | 内置默认值 |
| --- | --- | --- |
| `copyPath.useLineCountSyntax` | boolean | `false`(使用 `a-b`; `true` 时使用 `a+n`) |
| `changeCase.includeDotInCurrentWord` | boolean | `false` |
| `alignByRegex.rememberLastInput` | boolean | `true` |
| `plainText.applyEditorSettings` | boolean | `true` |
| `plainText.disableLineNumbers` | boolean | `false` |
| `plainText.editorOverrides` | object | `{}`, 叠加在下面 29 项 `[plaintext]` 覆盖表之上 |

这些内容不必靠本文档去发现: 设置界面会列出每个键的类型, 内置默认值与可接受取值, 在 `settings.json` 中输入时也会自动补全. 值的位置还提供两个代码片段 —— **全部内置默认值**写出整个 `textToolkit.advanced` 对象, **29 项内置 `[plaintext]` 覆盖**写出完整的覆盖表, 均可直接修改.

`plainText.editorOverrides` 是叠加到内置表上, 而不是替换它:

- 设置 id → 值: 修改该项(`"editor.minimap.enabled": true` 会保留 minimap),
- 设置 id → `null`: 移除该项, 于是该设置继续沿用你全局配置的值,
- 任意其他 `editor.*` id: 追加到表中, 即使它没有列在下面.

未知的键与类型不符的值会被忽略并保留内置默认值, 因此一处笔误绝不会让扩展进入损坏状态.

### 29 项内置 `[plaintext]` 覆盖

它们全部写在 `[plaintext]` 语言作用域下, 因此永远不会影响你的代码文件. "其他可接受取值"列出的是 VS Code 自身允许的取值.

| 设置 id | 内置值 | 其他可接受取值 |
| --- | --- | --- |
| `editor.minimap.enabled` | `false` | `true` |
| `editor.wordWrap` | `"off"` | `"on"`, `"wordWrapColumn"`, `"bounded"` |
| `editor.folding` | `false` | `true` |
| `editor.stickyScroll.enabled` | `false` | `true` |
| `editor.bracketPairColorization.enabled` | `false` | `true` |
| `editor.guides.indentation` | `false` | `true` |
| `editor.guides.bracketPairs` | `false` | `true`, `"active"` |
| `editor.matchBrackets` | `"never"` | `"always"`, `"near"` |
| `editor.occurrencesHighlight` | `"off"` | `"singleFile"`, `"multiFile"` |
| `editor.selectionHighlight` | `false` | `true` |
| `editor.renderWhitespace` | `"none"` | `"boundary"`, `"selection"`, `"trailing"`, `"all"` |
| `editor.renderControlCharacters` | `false` | `true` |
| `editor.codeLens` | `false` | `true` |
| `editor.colorDecorators` | `false` | `true` |
| `editor.links` | `false` | `true` |
| `editor.hover.enabled` | `false` | `true` |
| `editor.parameterHints.enabled` | `false` | `true` |
| `editor.suggestOnTriggerCharacters` | `false` | `true` |
| `editor.wordBasedSuggestions` | `"off"` | `"currentDocument"`, `"matchingDocuments"`, `"allDocuments"` |
| `editor.quickSuggestions` | `{ "other": false, "comments": false, "strings": false }` | 每个上下文还接受 `"on"` / `"inline"` / `"off"` |
| `editor.formatOnType` | `false` | `true` |
| `editor.formatOnPaste` | `false` | `true` |
| `editor.autoClosingBrackets` | `"never"` | `"always"`, `"languageDefined"`, `"beforeWhitespace"` |
| `editor.autoClosingQuotes` | `"never"` | 同 `autoClosingBrackets` |
| `editor.trimAutoWhitespace` | `false` | `true` |
| `editor.semanticHighlighting.enabled` | `false` | `true`, `"configuredByTheme"` |
| `editor.unicodeHighlight.nonBasicASCII` | `false` | `true`, `"inUntrustedWorkspace"` |
| `editor.unicodeHighlight.invisibleCharacters` | `false` | `true` |
| `editor.unicodeHighlight.ambiguousCharacters` | `false` | `true` |

把 `plainText.applyEditorSettings` 设为 `false` 会完全跳过这张表, 只切换文档语言.

---

## 本地化

- 命令标题与设置说明: `package.nls.json`(英文)与 `package.nls.zh-cn.json`.
- 运行时文案, 例如消息与选择器标签: `l10n/bundle.l10n.zh-cn.json`; 英文原文即源码中的查找键.

添加一门语言时, 把上述两个文件复制成对应的 locale 后缀即可, 例如 `package.nls.ja.json` 与 `l10n/bundle.l10n.ja.json`.

## 开发

```bash
npm install
npm run typecheck   # tsc --noEmit
npm test            # vitest run, 覆盖 test/*.test.ts 中的纯逻辑
npm run check       # 一致性门禁: 图标与 spec, package.nls 对齐, l10n bundle 对齐
npm run compile     # 打包到 out/extension.js, 带 sourcemap
npm run build       # 同上, 但压缩且不带 sourcemap(vscode:prepublish 执行的就是它)
npm run watch       # 改动后重新构建
npm run gen:icon    # 依据 scripts/icon-spec.mjs 重新生成 media/icon.svg 与 media/icon.png
npm run package     # 打 VSIX 到 artifacts/, 再按允许清单断言包内容
```

`npm run package` **不会**替你跑检查 —— 请先执行 `typecheck`, `test` 与 `check`. `npm run check` 拦的是构建拦不住的问题: 缺失的 `package.nls` 条目会静默渲染成 `%config.foo%`, 缺失的 `l10n` 条目会静默回落英文, 因此两个方向都要断言 —— 既查缺失条目, 也查无人使用的条目.

每个功能位于 `src/features/<name>/`, 纯逻辑放在从不 import `vscode` 的文件里, 以便直接单测. `change-case@5` 是纯 ESM, 因此扩展用 esbuild 打包成 CJS; 发布的 `.vsix` 中不含 `node_modules`.

## 许可证

MIT. 本扩展的部分内容改编自更早的 MIT 授权作品; 完整的第三方声明随扩展一同分发, 见 `NOTICE.md`.
