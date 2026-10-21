# 更新日志

[English](../CHANGELOG.md) · **简体中文**

## v0.0.8 2026-10-16 文档重写

### 变更

- 文档：README 改为简短的概览，每个工具在[使用指南](https://github.com/HeavenSky/editor-text-toolkit/blob/HEAD/zh/docs/README.md)下各有一页，故障排查也在其中；中文页面统一放在 `zh/` 下。

## v0.0.7 2026-10-12 比较、路径与纯文本模式修复

### 变更

- 文档：README 为每个功能配了截图。图片在浏览页面时从 GitHub 加载，不打包进扩展。

### 修复

- 直接在 `settings.json` 里修改 `textToolkit.diff.normalizationRules` 后，状态栏的 `$(filter)N` 计数和所有已打开的比较都会立即刷新。以前两者都要等到下一次比较操作才跟上，尽管提示文字说计数始终是当前值。
- 从比较里执行 `打开来源文件`，现在会一直选到最后一行的行尾。以前选区停在最后一行的第 0 列：单行来源得到的是空选区，多行来源则漏掉最后一行。
- Windows 上 `textToolkit.copyPath` 重新会把 home 目录替换成 `~`。`fsPath` 给出的盘符是小写，home 目录却是大写，区分大小写的前缀判断永远匹配不上；现在 Windows 路径按不区分大小写比较，路径其余部分保持原有大小写。
- 纯文本模式不再删除你为同一文件原本就有的 `files.associations` 条目。用户设置里已有相同的匹配模式时，不再写入临时条目；清理时也只删除本扩展添加的条目。

## v0.0.6 2026-08-13 维护：打包改用白名单

使用上没有任何变化。所有命令、设置和默认行为与 v0.0.5 完全相同，打包出的 VSIX 仍是同样的 11 个条目；这一版只改了决定打包内容的方式，并删掉了背后的死代码。

### 变更

- VSIX 的内容改由 `package.json` 里的 `files` 白名单声明，不再用 `.vscodeignore` 黑名单。黑名单只能挡住事先想到的路径，新增的构建产物会悄无声息地混进包里；`vsce` 两种方式只支持其一，所以删除了 `.vscodeignore`。打包脚本仍会用一份独立从清单推导出的白名单核对最终的 VSIX 内容，新增贡献点却漏了对应的 `files` 条目，或残留了过时的条目，构建照样会失败。
- 与项目骨架共用的 17 个文件（`build.mjs`、`scripts/`、`vitest.config.ts`、`.template-shared`）已与骨架当前版本重新同步；发布工作流补了注释，说明为什么必须用 `npm ci` 并提交 lockfile。这些文件的行为都没有变化。

### 移除

- `DiffConfig.contextMenu` 与 `DiffContextMenu` 类型。`textToolkit.diff.contextMenu` 只用在编辑器右键菜单的两个 `when` 子句里，由 VS Code 自己求值，运行时再读取它就是死代码，还会让人误以为存在一个其实没有的依赖。**设置本身不变**：键名相同，取值同样是 `both` / `markOnly` / `none`，效果也相同。
- `docs/` 下的两份集成设计文档。它们描述的两项改动（合并三个扩展，以及按 `partial-diff` 的能力实现比较模块）都已发布，文档不再指导任何工作，反而和 README、本文件争当事实来源。`docs/` 现在是空的。

### 未变

- 250 个测试全部通过；一致性检查（`npm run check`）、类型检查和打包断言均通过。依旧零运行时依赖。

## v0.0.5 2026-08-12 纯文本模式打开大文件时不再唤起语言扩展

### 新增

- 文件大到 VS Code 不肯显示时，现在会弹出通知提供纯文本模式，不必先点 `仍然打开`（[用法](https://github.com/HeavenSky/editor-text-toolkit/blob/HEAD/zh/docs/plain-text-mode.md#进入纯文本模式)）。
- 内置层（`textToolkit.advanced`）新增 `plainText.suppressLanguageActivation`，默认 `true`。
- 新增 13 个测试，覆盖原语言推断和两个新的纯函数辅助（测试总数从 237 增至 250）。

### 变更

- 内置的 `[plaintext]` 覆盖表现在**开启**自动换行（`editor.wordWrap`: `"on"`，以前是 `"off"`），进入模式后遇到长行不必再按 `Alt+Z`。覆盖表仍是 29 项；想要原来的行为，设置 `{ "textToolkit.advanced": { "plainText.editorOverrides": { "editor.wordWrap": "off" } } }`。

### 修复

- `以纯文本模式打开` 不再等 TypeScript 这类语言扩展激活完才显示大文件（[原理](https://github.com/HeavenSky/editor-text-toolkit/blob/HEAD/zh/docs/plain-text-mode.md#模式开启后会改变什么)）。
- 退出纯文本模式时仍会还原文件本来的语言：写入临时条目之前，先根据各扩展贡献的语言定义和你的 `files.associations` 推断出原语言。

## v0.0.4 2026-08-10 可编辑的比较副本

### 新增

- **可编辑的比较**：`把当前比较改成可编辑副本`（`textToolkit.diff.editableCopy`）让眼前这个比较的**两侧**都能编辑。本扩展打开的比较右上角有一个 `✎` 按钮，比较选择器里也有这一项；在 diff 编辑器里触发时，会在同一个编辑器组里原地替换该标签页。
- 两个完整文件会打开为**真实文件的原生可编辑 diff**；其他情况写成两个副本文件，**从不回写**到它们来源的选区（[详情](https://github.com/HeavenSky/editor-text-toolkit/blob/HEAD/zh/docs/compare.md#把比较改成可编辑副本)）。
- `打开来源文件`（`textToolkit.diff.openSource`）：在两种比较里都能跳回某一侧的来源文件，并选中参与比较的那几行。标题栏上也有对应按钮。
- `清理比较副本文件`（`textToolkit.diff.cleanUpCopies`）：删除所有副本文件。**不会自动清理**：你可能刚往副本里保存过内容，所以扩展从不背着你删除副本。
- 归一化规则只在写出副本时套用一次，之后再切换规则也不会覆盖你的编辑。只读比较仍和以前一样刷新。
- 对副本执行 `交换比较两侧`，交换的还是这两个文件，不会再写一份副本，未保存的编辑在交换后依然保留。
- 新增 13 个测试，覆盖副本文件命名和 diff 核心里的两个新纯函数（测试总数从 224 增至 237）。

### 变更

- 命令面板里的命令从 8 个增至 9 个：新增 `清理比较副本文件`；`把当前比较改成可编辑副本` 和 `打开来源文件` 只出现在菜单和按钮上，仍可绑定快捷键。

## v0.0.3 2026-08-07 比较 (Diff)

### 新增

- **比较 (Diff)**：第五个功能，按本扩展自己的约定重新实现 [ryu1kn/vscode-partial-diff](https://github.com/ryu1kn/vscode-partial-diff)（MIT，见 `NOTICE.md`）的能力，没有遥测，依旧零运行时依赖。可以比较跨文件的两段选区、选区与剪贴板、两个可见编辑器，或任意两个已打开的标签页。没有选区时比较整个文件；多光标的选区按在文档中的位置拼接。
- 比较前的归一化规则（`textToolkit.diff.normalizationRules`）只改写 diff 里显示的内容，从不改动文件。元素字段与上游一致：`name`、`match`、`replaceWith`（取文本或 `{ "letterCase": ... }`）和 `enableOnStart`，原来的数组可以直接复制过来。
- `切换归一化规则` 在运行时启停规则，并**刷新已经打开的比较**；上游要关掉 diff 重新执行才行（[#24](https://github.com/ryu1kn/vscode-partial-diff/issues/24)）。
- 每一侧沿用来源文件的语言，剪贴板一侧沿用另一侧的语言，所以剪贴板内容与 `.ts` 选区比较时按 TypeScript 高亮（[#38](https://github.com/ryu1kn/vscode-partial-diff/issues/38)、[#28](https://github.com/ryu1kn/vscode-partial-diff/issues/28)）。
- 虚拟文档的 URI 和标签页标题带上来源文件名与行号范围，不再是固定的 `reg1` / `reg2`，其他扩展可以据此知道每一侧来自哪里（[#66](https://github.com/ryu1kn/vscode-partial-diff/issues/66)）。
- `比较两个已打开的标签页` 也能用于当前不可见的标签页，上游做不到（[#33](https://github.com/ryu1kn/vscode-partial-diff/issues/33)）。
- `交换比较两侧` 对调最近一次比较的两侧；`textToolkit.diff.clipboardSide` 决定剪贴板比较时剪贴板默认在哪一侧（[#96](https://github.com/ryu1kn/vscode-partial-diff/issues/96)）。
- 状态栏有一项显示当前的比较标记及其行号范围，以及生效中的归一化规则数；点击它打开比较选择器。diff 标题里的 `~` 只是打开那一刻的快照，要看准确状态以状态栏的计数为准。
- 剪贴板里没有文本时（只复制了图片的话，VS Code 剪贴板 API 读到的是空字符串），`与剪贴板比较` 会提示没有可比较的内容，不再打开一侧空白的 diff。剪贴板里图片和文本都有时，比较其中的文本。
- `textToolkit.diff.contextMenu` 用一个枚举（`both` / `markOnly` / `none`）控制编辑器右键菜单，取代上游的五个布尔设置；`与标记的文本比较` 只在已有标记时出现。
- 新增 58 个测试，覆盖归一化规则、diff 标题、URI 编码、选区汇总和语言判定（测试总数从 137 增至 195）。

### 变更

- 命令面板里的命令从 5 个增至 8 个：三个核心比较命令进入面板，其余五个比较命令只在菜单里出现，仍可绑定快捷键。
- 两级选择器新增第五个类别 `比较 (Diff)`。
- 对外暴露的设置层从 7 项增至 10 项。`textToolkit.advanced` 不变。
- 新图标。旧图标只体现了对齐功能；新图标体现了五个功能中的三个：`Aa` 代表大小写转换，左边参差、右边齐平的几行代表正则对齐，两者之间的竖线代表 diff 的分隔栏。左列每行一种颜色，表示「转换前」；右列统一一种颜色，表示「转换后」，颜色本身也承载了一部分含义。

## v0.0.2 2026-08-05

### 新增

- 资源管理器右键菜单新增**以纯文本模式打开**（`textToolkit.plainText.open`）：打开文件和进入纯文本模式一步完成，大文件不会先按正常方式渲染一遍。支持多选，会跳过文件夹。该命令不在命令面板里显示，命令面板仍然正好列出五个命令。
- `textToolkit.advanced` 在设置界面里自带说明：每个键都列出类型、内置默认值和可选值；`plainText.editorOverrides` 写明全部 29 项内置 `[plaintext]` 覆盖的取值和可选项；另有两个 `settings.json` 代码片段，分别写出整个高级配置对象或完整的覆盖表，拿来就能改。
- README 用表格列出 29 项内置覆盖及可选值；以前的文字提到了一张其实并不存在的表格。
- 测试把 `package.json` 与 `src/shared/advanced.ts` 锁在一起：声明的键、schema 默认值和覆盖代码片段必须与内置层一致，每个 `%placeholder%` 都必须同时存在于 `package.nls.json` 和 `package.nls.zh-cn.json`，且不能有未使用的条目（测试总数从 131 增至 137）。

### 变更

- 命令标题简化：`切换纯文本模式(大文件)` → `切换纯文本模式`（英文：`Toggle Plain Text Mode (Large File)` → `Toggle Plain Text Mode`）。命令 ID 不变。

## v0.0.1 2026-08-05

首次发布。把三个扩展合并为一个，零运行时依赖。

### 变更（相对原扩展的破坏性变更）

- 所有命令 ID 改用 `textToolkit.` 前缀；旧 ID（`copyPath.lineNumber.copy`、`extension.changeCase.*`、`align.by.regex`）不再注册。原来按风格分开的 16 个 Change Case 命令合并为带 `style` 参数的 `textToolkit.changeCase`。迁移方法：把快捷键改指向新 ID，例如 `extension.changeCase.kebab` → `textToolkit.changeCase`，并加上 `"args": { "style": "kebab" }`。
- 所有设置改用 `textToolkit.` 前缀，不会自动迁移。`copyPath.pathStyle` 的取值改为不带前缀的简写（`absolute`、`relative`、`tilde`、`fileName`），`changeCase.includeDotInCurrentWord` 移入 `textToolkit.advanced`。迁移方法：在 `settings.json` 里把旧值抄到新键下。
- `sentence` 只把首字母大写；`title` 把每个单词的首字母大写；字母与数字的交界处不再拆分。

### 功能

- **复制路径与行号**（`textToolkit.copyPathWithLines`，编辑器右键菜单里也有），配有 `pathStyle`（默认 `absolute`）、`separator` 和 `multiLineFormat` 设置。快捷键参数可以传 `{ "pathStyle": ... }`，临时换一种路径写法。
- 行号引用支持多光标、多选区产生的多个片段：单行写 `path:a`，闭区间写 `path:a-b`，多个片段写 `path:a-b,c-d`。另一种 `path:a+n` 写法（从 `a` 开始的 `n` 行）通过 `textToolkit.advanced` → `copyPath.useLineCountSyntax` 开启，默认关闭。
- **转换大小写风格**（`textToolkit.changeCase`）：16 种转换，由打包进扩展的 `change-case@5` 实现。不带参数时打开带实时预览的风格选择器；传 `{ "style": "camel" }` 则直接执行一种。
- **按正则对齐**（`textToolkit.alignByRegex`），支持命名的正则模板；接受 `{ "regex": ... }` 或 `{ "template": ... }`。
- **纯文本模式**（`textToolkit.plainText.toggle`）：把文档切换为 `plaintext`，并应用 `[plaintext]` 作用域的设置，关掉 minimap、折叠、粘性滚动、悬停提示、建议、括号着色和 Unicode 扫描，让大文本和日志文件保持流畅。文件超过 `textToolkit.plainText.promptSizeMB`（默认 2 MB）时询问是否进入，`textToolkit.plainText.autoApplyExtensions` 里的扩展名直接进入，退出时还原原来的语言和设置值。
- **两级选择器**（`textToolkit.commands`）：第一级是四个类别，第二级是具体动作，每级都有统一的 `← 返回` 项。命令面板因此只占五项，而不是二十二项。
- **没有默认快捷键**：装好后不绑定任何按键，不会与已有绑定或其他扩展冲突。
- **英文和简体中文界面**，跟随 VS Code 的显示语言（`package.nls*.json` + `l10n/bundle.l10n.zh-cn.json`）。
- **双层设置**：对外暴露 7 项设置，其余全部内置，通过唯一的 `textToolkit.advanced` 对象增量覆盖。在 `plainText.editorOverrides` 里，`null` 表示移除某项内置覆盖，而不是替换它；未知的键和类型不对的值回退为内置默认值。

### 相对原扩展的修复

- 按正则对齐：列宽只在该列仍有匹配的行之间计算。匹配较少的行不会再撑宽别的行的中间列，只有一行匹配的列保持原样。
- 转换大小写风格：多行选区按文档自己的换行符拆分，不再用 `os.EOL`。平台换行符与文档换行符不同时（例如 Windows 上的 LF 文件），上游会把多行选区揉成一行。
- 转换大小写风格：`includeDotInCurrentWord` 现在真正生效（上游把它声明在 `contributes` 之外，所以从来没有注册上）。
- 转换大小写风格：快速选择框取消时不再抛错，没有活动编辑器时也不再抛错，并且会应用 `placeHolder` 和按描述匹配的选项。
- 按正则对齐：选区结束在第一行之后那一行的行首时，不再构造出非法范围。
