# partial-diff 能力集成为 Compare (Diff) 模块

> **归档说明**: 本文原是工作目录下的过程文件（位于被 gitignore 的 `.ai-ctx/`），现按原貌归档到 `docs/` 以保留决策依据。正文中关于路径、工作区状态、以及「本文件不进入提交」一类的表述反映的是当时情形，不再描述当前仓库；本机绝对路径已替换为 `<骨架仓库>` / `<工作区>` 等占位符。

- 方案状态: 已完成
- 任务规模: 长

## 目标与验收标准

把 VS Code 扩展 `ryu1kn/vscode-partial-diff` 的全部用户可见能力，按本仓库 `editor-text-toolkit` 的既有范式重写为第 5 个功能模块 `Compare (Diff)`，并顺带解决上游 4 个长期未关闭的 open issue。

验收标准（全部可客观判定）：

1. 上游 README 列出的 5 条命令语义在本扩展中均有对应实现：标记待比较文本、与上一段比较、与剪贴板比较、比较两个可见编辑器、切换比较前归一化规则。
2. 多光标选区按文档位置排序后以 `\n` 连接参与比较；无选区时取整个文件。
3. 归一化规则支持 `name` / `match` / `replaceWith`（字符串或 `{letterCase}`）/ `enableOnStart` 四个字段，只影响 diff 内容，不改动源文件。
4. diff 两侧虚拟文档继承来源文件的语言（上游 issue #38 / #28）。
5. diff 的 URI 与标题携带来源文件名与行号，而非固定的 `reg1` / `reg2`（上游 issue #66）。
6. 不关闭已打开的 diff，切换归一化规则后其内容立即刷新（上游 issue #24）。
7. 可比较任意两个**已打开的标签页**，不要求它们同时可见（上游 issue #33）。
8. 可交换最近一次比较的左右两侧，且剪贴板所在侧可配置（上游 issue #96）。
9. 扩展不含任何遥测代码与遥测配置（消解上游 issue #91）。
10. `npm run typecheck`、`npm test`、`npm run check`、`npm run compile` 四条命令全部通过；`package.json` 的 `dependencies` 字段保持不存在（零运行时依赖）。

## 当前事实与证据路径

### 上游仓库事实

代码取自 `https://github.com/ryu1kn/vscode-partial-diff`，commit `59dadff75dec4fad86e592871c19649347dbd32f`（2026-07-25，版本 1.4.6），本地副本位于 `.ai-ctx/cache/vscode-partial-diff/`（该目录被 `.gitignore:11` 忽略，属临时缓存，可随时删除）。以下均为读过源码后核实的事实，行号指该 commit：

| 事实 | 证据 |
| --- | --- |
| 用 `TextDocumentContentProvider` 提供虚拟文档，scheme 为 `partialdiff` | `src/lib/bootstrapper.ts:20`、`src/lib/content-provider.ts:8` |
| URI 形如 `partialdiff:text/reg1?_ts=<毫秒>`，`_ts` 注释写明用于绕开缓存 | `src/lib/utils/text-resource.ts:4-5` |
| `extractTextKey` 的正则为 `^text\/([a-z\d]+)` | `src/lib/utils/text-resource.ts:7-8` |
| `ContentProvider` 未实现 `onDidChange`，全文件无事件发射器 | `src/lib/content-provider.ts` 全文 23 行 |
| 剪贴板固定为左侧、当前选区固定为右侧 | `src/lib/commands/compare-selection-with-clipboard.ts:26` |
| `SelectionInfoRegistry` 是纯内存 `Object.create(null)`，无持久化 | `src/lib/selection-info-registry.ts:8` |
| 可见编辑器按 `viewColumn` 大小决定左右，数量不为 2 时只提示 | `src/lib/commands/compare-visible-editors.ts:15-30` |
| 标题格式 `文件名 (ll.3-7) ↔ 文件名 (l.5)`，归一化激活时 `↔` 换成 `~` | `src/lib/text-title-builder.ts:8-23`、`src/lib/diff-title-builder.ts:5-24` |
| 多光标选区排序后以 `\n` 连接；无非空选区时取全文 | `src/lib/adaptors/text-editor.ts:26-39` |
| 归一化规则的 QuickPick **已经**传了 `canPickMany: true` | `src/lib/adaptors/window.ts:12-15` |
| 运行时依赖三项：`lodash.isequal`、`lodash.omit`、`vscode-extension-telemetry` | `package.json:195-199` |
| 许可证为 MIT，Copyright (c) 2016 Ryuichi Inagaki | `LICENSE.txt:1-3` |

上游 issue 统计：共 78 个，13 个 open。open 中 `#91`（遥测）因本方案不引入遥测而天然消解，`#41`（marketplace 配图过期）不适用于本仓库。

### 本仓库事实

| 事实 | 证据路径 |
| --- | --- |
| feature 范式为 `src/features/<name>/{command.ts,core.ts,...}`，`core.ts` 明确要求不 import vscode 以便直接单测 | `src/shared/advanced.ts:1-8`、`src/features/plainText/` 目录结构 |
| `extension.ts` 只做注册，disposable 全部挂 `context.subscriptions` | `src/extension.ts:8-18` |
| 两级选择器契约：一级只列分类且 `description` 显示当前生效设置，二级首项固定 `← Back`，Esc 结束整个流程，一级本身不执行动作 | `src/features/menu/command.ts:10-16` |
| 状态栏范式：`createStatusBarItem(StatusBarAlignment.Right, 100)`，plainText 已占用优先级 100 | `src/features/plainText/command.ts:39-46` |
| basename 取法为 `uri.path.split('/').pop()`，不 import node 的 `path` | `src/features/plainText/command.ts:14-16` |
| `vscode.env.clipboard` 的 `Clipboard` 接口**只有** `readText(): Thenable<string>` 与 `writeText(value)`，共 14 行，无任何图片或 `DataTransfer` 访问能力 | `node_modules/@types/vscode/index.d.ts:10618-10631` |
| 文案一致性做**双向**断言：缺条目和无人使用的死条目都会让检查失败 | `scripts/lib/check-manifest.mjs:29-44`（nls）、`:74-92`（运行时字面量） |
| `test/advanced.test.ts` 把 `package.json` 的 advanced schema 与 `src/shared/advanced.ts` 锁死，并断言全部 `%key%` 在两份 nls 中都存在且无冗余 | `test/advanced.test.ts:137-202`、`:204-227` |
| `build.mjs` 从 `package.json` 推导入口与 platform，声明 `browser` 字段时会因 import node 内置模块而构建失败 | `build.mjs:21-38` |
| `scripts/changelog-section.mjs <version>` 从 CHANGELOG 抽取版本小节，找不到或正文为空时退出码 1 | `scripts/changelog-section.mjs:22-44` |
| `scripts/package.mjs` 用**允许清单**断言 VSIX 内容，清单从 `package.json` 推导 | `scripts/package.mjs:30-55` |
| `.ai-ctx` 被全局 gitignore 命中，本方案文件不进入任何提交 | `git check-ignore -v .ai-ctx` → `~/.gitignore:97` |

四条验证命令**已在本会话实测通过**：`npm run typecheck`（无输出即通过）、`npm test`（5 文件 137 测试全绿）、`npm run check`（4 项 ok）、`npm run compile`（`out/extension.js` 45.7kb）。方案编写时工作区 `git status` 干净。

## 范围内

- 新增 `src/features/diff/` 模块：纯逻辑内核、session registry、虚拟文档 provider、归一化规则运行时 store、命令与菜单。
- 新增 8 条命令（`textToolkit.diff.*`），其中 3 条出现在命令面板，5 条隐藏但可绑快捷键、可从二级菜单触达。
- 新增 3 项暴露层设置：`textToolkit.diff.normalizationRules`、`textToolkit.diff.contextMenu`、`textToolkit.diff.clipboardSide`。
- `editor/context` 右键菜单新增 2 项，可通过设置降级为 1 项或全部隐藏。
- 一级选择器新增第 5 个分类，配套二级菜单。
- 状态栏新增 1 项，合并显示当前标记与激活的归一化规则数。
- 文档：README 新增章节与迁移映射表、CHANGELOG 新增 `0.0.3` 段、NOTICE 追加上游 MIT 署名、版本号升到 `0.0.3`。

## 范围外（逐条写明理由）

| 项 | 来源 | 不做的理由 |
| --- | --- | --- |
| diff 内可编辑并写回原选区 | 上游 #30 open、#94 | 必须从 `TextDocumentContentProvider` 换成 `FileSystemProvider` 或 untitled 文档，与本方案的只读虚拟文档架构互斥；写回还需追踪源文档在此期间的位移 |
| 逐块合并（chunk 应用到另一侧） | 上游 #100 open | 依赖上一条；还需自研 chunk 解析与 CodeLens 交互 |
| 导出 / 应用 `.patch` | 上游 #9 open | 本仓库零运行时依赖，需自研 diff 算法与 unified 格式生成 |
| 归一化只用于比对、展示时还原原文并保留高亮 | 上游 #92 open | VS Code 不开放向 diff 编辑器注入外部高亮的 API，只能自研 diff 算法加自绘装饰器 |
| 词级 / 字符级 inline diff | 上游 #101 / #98 / #60 | VS Code diff 编辑器原生已具备字符级高亮 |
| 跳到下一处差异 / 折叠无差异区 | 上游 #83 | 原生 `F7` 与 `diffEditor.hideUnchangedRegions` |
| 上下 / 左右布局切换 | 上游 #32 open | 原生 `diffEditor.renderSideBySide` 与 diff 编辑器自带的 Toggle Inline View 按钮 |
| diff 配色自定义 | 上游 #71 / #40 / #20 | 属主题层，扩展无法覆盖 diff 编辑器内置着色 |
| 全宽打开后关闭时恢复原布局 | 上游 #28 open | VS Code 无布局快照与恢复 API，"恢复"无法可靠实现 |
| 资源管理器右键文件↔文件比较 | 上游 #62 | VS Code 原生已有 Select for Compare / Compare with Selected，且原生版本可编辑、有 Git 集成。**此项在需求阶段曾被列为建议做，方案阶段发现与原生重合后经用户确认移出** |
| 比较最近两次剪贴板内容（剪贴板历史） | 上游 #50 | 技术上不可实现为真正的"历史"：`Clipboard` 接口只有 `readText()`（`index.d.ts:10618-10631`），既读不到系统剪贴板历史，VS Code 也不提供剪贴板变更事件。只能在命令触发时采样，用户在两次复制之间未触发过命令则第一段必然丢失，是会误导人的半成品 |
| 终端与输出面板选中文本比较 | 上游 #77、#3 | 需求阶段 D7 已决定不做。终端选中文本的读取受限，且会一并继承上游 #3 的已知限制（命令面板路径在 Output 通道不可用） |
| 从 diff 视图按 chunk 复制 | 上游 #95 | 按选区复制是编辑器自带能力；"按 chunk"需自研 chunk 边界解析，与合并能力属同一技术栈，一并延后 |
| 与磁盘已保存版本比较 | 上游 #31 | VS Code 原生已有 `workbench.files.action.compareWithSaved` |
| 标记跨窗口重启持久化 | — | 需求阶段 D5 已决定不做。比较标记是瞬时意图，持久化会在下次启动时留下过期状态 |
| 遥测 | 上游 #91 open | 明确不引入 |
| 上游命令 ID 别名（`extension.partialDiff.*` 转发） | — | 别名会污染命令面板；改为在 README 提供迁移映射表 |
| `textToolkit.advanced` 新增任何键 | — | 会连带要求修改 `test/advanced.test.ts:137-202` 的锁定断言，收益不足 |

## 设计决策与理由

### D-1 URI 编码方案

选定：`text-toolkit-diff:/<sessionId>/<slot>/<rangeLabel>/<原文件basename>`，例如 `text-toolkit-diff:/lz9k1-3/left/ll.3-7/service.ts`。

理由：一次性解决三个 open issue 的共同根因。

- 带 `sessionId`：内容按 session 存储，旧 diff 标签页不会被后续比较的内容污染。上游改用 `?_ts=` 冻结缓存来回避同一问题，代价是虚拟文档永远无法刷新——这正是 #24 的根因。
- basename 保留原文件名与扩展名：满足 #66，外部扩展（如 swapdiff）可从 URI 读到来源。
- `rangeLabel` 独立成段：便于外部扩展解析，也避免把行号塞进 basename 破坏扩展名。

否决：沿用上游 `text/reg1` 编码。它同时导致虚拟文档降级为 plaintext（#38）与 URI 无信息（#66），是两个 issue 的共同根因。

### D-2 语言模式的确定方式

选定：以 `vscode.languages.setTextDocumentLanguage(doc, sourceLanguageId)` 为准。每侧用各自来源文档的 `languageId`；剪贴板侧没有来源，继承另一侧的 `languageId`；两侧都无来源时不调用，保持 VS Code 依 URI 扩展名的默认判定。

理由：比只依赖 URI 扩展名精确——覆盖 untitled 文档、以及扩展名不足以判定语言的场景。URI 中的扩展名只作兜底。

否决：只靠 URI 扩展名。对 untitled 与无扩展名来源无效。

### D-3 两槽模型替代上游五键

选定：registry 只维护 `marked`（待比较的标记）与每个 session 的 `left` / `right`。

理由：上游的 `reg1` / `reg2` / `clipboard` / `visible1` / `visible2` 五个键实际上只服务于"一对"这一种形态，导致交换两侧、复用比较结果都要引入新键。两槽模型让"交换"退化为"互换两侧后重开"，无需额外状态。

### D-4 剪贴板默认在左侧

选定：`textToolkit.diff.clipboardSide` 枚举 `left` | `right`，默认 `left`（与上游一致），配合 `swapSides` 命令做临时交换。

理由：保持从上游迁移过来的用户的肌肉记忆；#96 提出者那类"总想反过来"的用户改一次设置即可长期生效。

### D-5 归一化规则放暴露层，字段名与上游完全一致

选定：`textToolkit.diff.normalizationRules`，数组元素字段为 `name` / `match` / `replaceWith` / `enableOnStart`，schema 与上游 `package.json:71-115` 同形。

理由：这是用户高频手工编辑的核心配置，藏进 `textToolkit.advanced` 反而难用；字段名一致让迁移只需改配置键名。

否决：塞进 `textToolkit.advanced`。该对象的定位是"有内置默认值、极少改动"的内置层，规则数组两条都不符合。

### D-6 右键菜单用单个枚举而非一组布尔

选定：`textToolkit.diff.contextMenu`，枚举 `both`（默认）| `markOnly` | `none`。

理由：`when` 子句的 `config.x.y.z` 只能读取**嵌套**对象属性（上游 `package.json:155` 即此用法），而本仓库 `textToolkit.advanced` 用的是**扁平点号键**（`src/shared/advanced.ts:62-69`），无法在 `when` 中被引用。枚举方案只占 1 项设置就覆盖了上游 5 个布尔的全部实际用法。

否决 1：把 advanced 改成嵌套对象——破坏既有约定，且要重写 `test/advanced.test.ts` 的锁定断言。
否决 2：菜单写死不可配——丢失上游能力，且与本仓库"右键菜单克制"的既有取向冲突（当前 `editor/context` 只有 1 项）。

### D-7 状态栏合并为单项

选定：一个状态栏项，文本按状态组合为 `$(diff) service.ts (ll.3-7) · $(filter)2`；点击打开 Compare 二级菜单。

理由：上游 registry 无任何反馈，用户标记完常忘记（#76 的抱怨即源于此）。合并成一项避免与已占用优先级 100 的纯文本模式状态栏争抢空间。点击进二级菜单比点击"清除标记"有用得多，因此**不注册独立的 `clearMark` 命令**，清除标记只作为二级菜单项存在。

### D-8 标题符号是快照，靠状态栏补偿

选定：diff 标题中的 `~` / `↔` 沿用上游语义，即打开那一刻的归一化状态快照，切换规则后不更新；由常驻的状态栏规则计数提供始终准确的指示。

理由：`vscode.diff` 的 title 参数在调用时固定。若为同步标题而在切换规则后重新执行 `vscode.diff`，会丢失用户在 diff 中的滚动位置，代价大于收益。

### D-9 命令面板暴露 3 条

选定：`markSelection` / `compareWithMarked` / `compareWithClipboard` 进命令面板（面板命令数 5 → 8），其余 5 条设 `commandPalette` 的 `"when": "false"`。

理由：这三条是 partial-diff 的核心三连击，藏起来会让迁移用户找不到入口。其余命令使用频次低，二级菜单足够。命令面板中的这三条**不加** `hasMark` 之类的 `when` 过滤——面板里命令时隐时现比多一次提示更糟。

### D-10 版本号 0.0.3

选定：`0.0.2` → `0.0.3`（用户在方案阶段选定，我的推荐 0.1.0 未被采纳）。

### D-11 剪贴板非文本内容的处理

事实前提：VS Code 的 `Clipboard` 接口只暴露 `readText()` / `writeText()`（`node_modules/@types/vscode/index.d.ts:10618-10631`），没有图片或 `DataTransfer` 通道。因此：

- 剪贴板同时含图片与文字时，`readText()` 只返回 `text/plain` flavor，图片在系统层就被丢弃，**无需任何处理，行为已正确**。
- 剪贴板只有图片时，`readText()` 解析为 `''`（部分平台可能给出图片来源的文本 flavor，例如文件路径或 URL——那种情况下按普通文本处理即可）。扩展**无法区分**「剪贴板为空」与「剪贴板是图片」，因为二者在 API 层面是同一个空串。

选定：在 `compareWithClipboard` 中加空串守卫。`readText()` 返回 `''`、或调用本身 reject（远程与 Web 场景可能发生）时，一律 `showInformationMessage` 提示"剪贴板没有可比较的文本内容"并直接返回，**不打开 diff**。守卫只判断 `text === ''`，不做 `trim`——只含换行或空格的剪贴板是合法的比较输入，照常处理。

理由：一侧全空的 diff 无法自证原因，用户会误以为是选区问题而反复重试。上游 `src/lib/commands/compare-selection-with-clipboard.ts:14-26` 没有这个守卫，是本方案相对上游的一处改进。

否决 1：不加守卫，与上游一致——把可自证的失败变成了不可自证的困惑。
否决 2：弹确认框询问「剪贴板无文本内容，仍要以空内容比较吗？」——为一个罕见用例给所有误触加一步交互。

已知取舍：故意用**空剪贴板**与选区比较（以查看"全部删除"的效果）这一罕见用例会被守卫阻断。绕过方式是复制一个换行符再比较。

## 已确认决策与假设

用户在方案阶段明确确认的 4 项：命令面板暴露 3 条；资源管理器文件比较移出范围；暴露层设置增加 3 项；版本号走 `0.0.3`。

用户在需求阶段确认采纳的 9 项倾向（D1–D9）：规则配置放暴露层数组；右键菜单默认 2 项；剪贴板默认在左；提供"在新编辑器组打开"能力（**注**：该项在方案阶段并入 D-9 的取舍后未单列命令，实际以 VS Code 原生的编辑器组拖拽替代，已在 README「Left to VS Code」小节说明）；标记不跨窗口重启持久化；资源管理器比较（后被推翻）；不做终端文本比较；不提供上游命令 ID 别名；按能力重写而非移植代码但仍在 NOTICE 署名。

未经用户确认、由本方案自行设定的假设（实施时按此执行）：

1. 不对剪贴板内容与整文件文本设体积上限，与上游行为一致，文档不作性能承诺。
2. `sessionId` 由 `Date.now().toString(36)` 加单调计数器构成；registry 最多保留 8 个 session，超出按插入序淘汰最旧的。上限硬编码并附注释，不进 `textToolkit.advanced`。
3. `package.json` 的 `categories` 保持 `["Other", "Formatters"]` 不变；`keywords` 追加 `diff` 与 `compare`。

## 影响的接口与数据契约

### 对外新增（发布后即成为兼容承诺）

- **URI scheme `text-toolkit-diff`** 及其路径格式（见 D-1）。#66 的诉求正是让外部扩展解析这个 URI，因此格式一旦发布即被外部依赖，**U1 是唯一可以自由调整它的时机**。
- **8 个命令 ID**：`textToolkit.diff.markSelection`、`compareWithMarked`、`compareWithClipboard`、`compareVisibleEditors`、`compareTabs`、`swapSides`、`toggleNormalizationRules`、`showMenu`。
- **3 个设置键**：`textToolkit.diff.normalizationRules`、`textToolkit.diff.contextMenu`、`textToolkit.diff.clipboardSide`。
- **1 个上下文键**：`textToolkit.diff.hasMark`，供 `editor/context` 的 `when` 使用。

### 模块内部契约

- `src/features/diff/core.ts` 不 import `vscode`，也不 import 任何 node 模块（含 `node:` 前缀），以保证 `build.mjs:21` 的 browser 打包路径始终可用。
- `DiffContentProvider` 的构造参数含 `getActiveRules: () => NormalizationRule[]`。**这是 U1 与 U4 之间唯一的接缝**：U1 传 `() => []`（等价于"无规则"，行为正确，不是占位实现），U4 替换为 `() => store.activeRules`，签名不变。
- `src/shared/config.ts` 新增 `getDiffConfig()`，U2 建立并返回 `contextMenu` 与 `clipboardSide`，U4 追加 `normalizationRules` 字段。

### 不变更的契约

`textToolkit.advanced` 的键集、默认值与 schema 完全不变，因此 `test/advanced.test.ts:137-202` 的锁定断言无需改动。现有 5 条命令、7 项暴露层设置、`explorer/context` 菜单均不改动。

## 共享清单文件的隔离规则

`package.json`、`package.nls.json`、`package.nls.zh-cn.json`、`l10n/bundle.l10n.zh-cn.json` 是四个共享清单，多个工作单元都要动。它们不可能按单元切分：`scripts/lib/check-manifest.mjs` 做双向断言，本单元新增的 `l10n.t` 字面量若不同步登记会让 `npm run check` 当场失败，登记了却无人使用同样失败。

因此约定：**谁引入谁登记，每个单元只追加本单元引入的条目，绝不改动其他单元已登记的条目。** 下文「拆分自检」的路径互斥检查排除这四个文件，其余路径严格互斥。

## 实施步骤（按工作单元与依赖顺序）

### U1 · add-diff-core-and-provider

- **goal**：交付 diff 模块的纯逻辑内核与虚拟文档 provider。扩展激活后 `text-toolkit-diff:` scheme 已注册并能对未知 session 返回可读占位文案；新增单测全绿。尚无用户可见命令。
- **depends_on**：none
- **范围内**：归一化 / 标题 / URI / 选区聚合 / 语言解析的纯函数，session registry，`TextDocumentContentProvider` 与其事件发射器，provider 在 `extension.ts` 的注册。
- **范围外**：任何命令、菜单、设置项、状态栏；归一化规则的配置读取与运行时开关（属 U4）。

- [x] **建 `src/features/diff/core.ts`（纯函数，不 import vscode 与 node 模块）**
  - 输入：上游 `src/lib/text-process-rule-applier.ts`、`text-title-builder.ts`、`utils/text-resource.ts`、`adaptors/text-editor.ts` 的行为语义
  - 操作：实现并导出以下类型与函数。
    `NormalizationRule = { name?: string; match: string; replaceWith: string | { letterCase: 'upper' | 'lower' }; active: boolean }`；
    `SelectionInfo = { text: string; baseName: string; rangeLabel: string; languageId?: string }`；
    `DiffSlot = 'left' | 'right'`；
    `loadRules(raw: unknown): NormalizationRule[]` —— 非数组返回 `[]`；丢弃缺 `match` 或 `replaceWith` 的元素、以及 `new RegExp(match, 'g')` 抛异常的元素，每类丢弃 `console.log` 一次说明原因；`active` 取 `enableOnStart !== false`；
    `applyRules(text: string, rules: NormalizationRule[]): string` —— 无规则时原样返回；按数组顺序依次 `text.replace(new RegExp(rule.match, 'g'), ...)`，字符串替换保留 `$N` 语义，`letterCase` 走 replacer 做 `toUpperCase` / `toLowerCase`；
    `aggregateSelections(parts: { startLine: number; startChar: number; endLine: number; text: string }[]): { text: string; ranges: { start: number; end: number }[] } | null` —— **返回 `null` 表示无非空选区，由调用方决定取全文**（纯函数不读文档）；否则按 `startLine` 再 `startChar` 升序排序后以 `\n` 连接；
    `formatRangeLabel(ranges: { start: number; end: number }[] | null): string` —— `null` 或空数组返回 `full`；单行返回 `l.4`（行号从 1 起）；多行返回 `ll.4-8`；多片段以 `,` 连接；
    `buildDiffTitle(left: SelectionInfo | null, right: SelectionInfo | null, normalized: boolean): string` —— 每侧渲染为 `baseName (rangeLabel)`，`rangeLabel` 为 `full` 时省略括号部分，缺侧写 `N/A`；中缀 `normalized ? '~' : '↔'`；
    `encodeDiffPath(parts: { sessionId: string; slot: DiffSlot; rangeLabel: string; baseName: string }): string` —— 每段 `encodeURIComponent` 后以 `/` 连接并加前导 `/`；
    `decodeDiffPath(path: string): { sessionId: string; slot: DiffSlot; rangeLabel: string; baseName: string } | null` —— 以 `/` 分割后**丢弃首个空串**（`encodeDiffPath` 有前导 `/`），要求剩余**恰好 4 段**，否则返回 `null`；slot 不是 `left` / `right` 时同样返回 `null`；每段 `decodeURIComponent`；
    `resolveLanguages(leftLanguageId?: string, rightLanguageId?: string): { left?: string; right?: string }` —— 各用各的；一侧缺失时继承另一侧；都缺失时两侧均为 `undefined`
  - 输出：`src/features/diff/core.ts`
  - 涉及文件：新建 `src/features/diff/core.ts`
  - 前置任务：无
  - 验证命令：`npm run typecheck`
  - 验收标准：typecheck 通过；`rg -n "from 'vscode'|from 'node:|from 'path'|from 'os'" src/features/diff/core.ts` 无输出

- [x] **建 `src/features/diff/registry.ts`**
  - 输入：core 的 `SelectionInfo` 类型
  - 操作：`DiffRegistry` 类，字段 `marked: SelectionInfo | null`、`sessions: Map<string, { left: SelectionInfo; right: SelectionInfo; uris: string[] }>`、私有计数器。方法：
    `createSession(left, right, buildUris: (sessionId: string) => string[]): { sessionId: string; uris: string[] }` —— 内部先生成 `sessionId = Date.now().toString(36) + '-' + (++counter)`，再回调 `buildUris(sessionId)` 得到两侧 URI 字符串，最后一并写入 map 并返回。**签名必须是回调式而不是 `(left, right, uris)`**：URI 的构造需要 sessionId，而 sessionId 由本方法产出，直接传 `uris` 会形成循环。`sessions.size > 8` 时按插入序删除最旧的一个，**同时把它的 `uris` 从 `issuedUris` 中移除**（避免集合无限增长）；
    `getSlot(sessionId: string, slot: DiffSlot): SelectionInfo | undefined`；
    `lastSessionId: string | undefined`；
    `issuedUris: ReadonlySet<string>`
  - 输出：`src/features/diff/registry.ts`
  - 涉及文件：新建 `src/features/diff/registry.ts`
  - 前置任务：上一条
  - 验证命令：`npm run typecheck`
  - 验收标准：typecheck 通过；上限 `8` 处有注释说明为何硬编码而不进 `textToolkit.advanced`

- [x] **建 `src/features/diff/contentProvider.ts`**
  - 输入：registry 与 core
  - 操作：导出常量 `DIFF_SCHEME = 'text-toolkit-diff'`；`DiffContentProvider implements vscode.TextDocumentContentProvider`，构造参数 `(registry: DiffRegistry, getActiveRules: () => NormalizationRule[])`；
    `provideTextDocumentContent(uri)`：`decodeDiffPath(uri.path)` 为 `null`、或 `getSlot` 未命中时，返回 `vscode.l10n.t('This comparison is no longer available. Please run the compare command again.')`；否则 `applyRules(info.text, getActiveRules())`；
    暴露 `readonly onDidChange: vscode.Event<vscode.Uri>`（由私有 `EventEmitter<vscode.Uri>` 提供）与 `refreshAll(): void`（遍历 `registry.issuedUris` 逐一 `fire`）；
    实现 `dispose()` 释放 emitter
  - 输出：`src/features/diff/contentProvider.ts`
  - 涉及文件：新建 `src/features/diff/contentProvider.ts`
  - 前置任务：上两条
  - 验证命令：`npm run typecheck`
  - 验收标准：typecheck 通过

- [x] **在 `extension.ts` 注册 provider**
  - 输入：上一条的 provider
  - 操作：新建 `src/features/diff/command.ts`，导出 `registerDiffFeature(context: vscode.ExtensionContext): void`。本单元内它只做三件事：构造 `DiffRegistry`、构造 `DiffContentProvider(registry, () => [])`、`vscode.workspace.registerTextDocumentContentProvider(DIFF_SCHEME, provider)` 并连同 provider 自身推入 `context.subscriptions`。在 `src/extension.ts` 的 `registerMenuCommand(...)` 之后调用 `registerDiffFeature(context)`
  - 输出：可激活的扩展
  - 涉及文件：新建 `src/features/diff/command.ts`；改 `src/extension.ts`
  - 前置任务：上一条
  - 验证命令：`npm run compile`
  - 验收标准：`out/extension.js` 构建成功

- [x] **登记占位文案**
  - 输入：provider 中唯一的 `l10n.t` 字面量
  - 操作：在 `l10n/bundle.l10n.zh-cn.json` 追加一条：key 为 `This comparison is no longer available. Please run the compare command again.`，值为 `该比较结果已失效, 请重新执行比较命令.`
  - 输出：文案齐备
  - 涉及文件：`l10n/bundle.l10n.zh-cn.json`
  - 前置任务：上两条
  - 验证命令：`npm run check`
  - 验收标准：`内联运行时文案与中文 bundle 一致` 一项为 ok

- [x] **建 `test/diff.core.test.ts`**
  - 输入：core 的全部导出
  - 操作：用 vitest + `node:assert` 按 `test/advanced.test.ts` 的风格写。覆盖：
    `applyRules`（无规则原样返回、字符串替换、`$1` 捕获、`upper`、`lower`、多规则按序叠加）；
    `loadRules`（非数组输入、缺 `match` 被丢弃、缺 `replaceWith` 被丢弃、非法正则被丢弃、`enableOnStart: false` → `active: false`、缺省 → `active: true`）；
    `formatRangeLabel`（`null`、空数组、单行、多行、多片段）；
    `buildDiffTitle`（`↔`、`~`、缺侧 `N/A`、`full` 时省略括号）；
    `encodeDiffPath` / `decodeDiffPath` 往返（含空格、中文、`#`、`?`、无扩展名 basename；段数不足返回 `null`；非法 slot 返回 `null`）；
    `aggregateSelections`（乱序输入按位置排序、多光标 `\n` 连接、空数组返回 `null`）；
    `resolveLanguages`（两侧各有、左继承右、右继承左、都无）
  - 输出：`test/diff.core.test.ts`
  - 涉及文件：新建 `test/diff.core.test.ts`
  - 前置任务：第一条
  - 验证命令：`npm test`
  - 验收标准：全部通过；`npm test` 输出中 `test/diff.core.test.ts` 一行显示的用例数不少于 30，测试文件数由 5 变 6、总数由 137 上升

- **单元级验证**：`npm run typecheck && npm test && npm run check && npm run compile`
- **累计集成验证**：同上（本单元即基线）
- **人工验收**（本仓库只跑纯函数单测、无 VS Code 集成测试 harness，见 `vitest.config.ts` 注释，故功能面一律靠调试宿主人工验收）：F5 启动调试宿主，执行 `Developer: Reload Window`，确认无激活报错、Output 面板无异常堆栈
- **风险与回滚点**：URI 编码格式发布后即被外部扩展依赖（#66 的诉求），本单元是唯一可自由调整它的时机。回滚点为本单元 commit 之前——删除 `src/features/diff/` 与 `extension.ts` 中的一行调用即可完全还原
- **commit**
  - 暂存路径：`src/features/diff/core.ts`、`src/features/diff/registry.ts`、`src/features/diff/contentProvider.ts`、`src/features/diff/command.ts`、`src/extension.ts`、`test/diff.core.test.ts`、`l10n/bundle.l10n.zh-cn.json`
  - message：`feat: 新增 diff 虚拟文档内核与内容提供器`

### U2 · add-selection-compare-commands

- **goal**：交付 partial-diff 的核心三连击——标记选区、与标记比较、与剪贴板比较，带标记状态栏与右键菜单；一级选择器出现第 5 类 `Compare (Diff)` 并可进入二级菜单。这是本次改造第一个端到端可用的形态。
- **depends_on**：`add-diff-core-and-provider`
- **范围内**：3 条面板命令与 1 条隐藏命令、`openDiff()` 内部流程、标记状态栏与上下文键、`editor/context` 两项、`diff.contextMenu` 与 `diff.clipboardSide` 两项设置、一级与二级菜单挂载。
- **范围外**：可见编辑器与标签页比较、交换、归一化开关、README/CHANGELOG。

- [x] **实现 `openDiff()` 内部流程**
  - 输入：U1 的 registry、provider、core
  - 操作：在 `src/features/diff/command.ts` 内实现 `openDiff(left: SelectionInfo, right: SelectionInfo): Promise<void>`：调用 `registry.createSession(left, right, id => [左URI字符串, 右URI字符串])`，回调内用 `encodeDiffPath({ sessionId: id, slot, rangeLabel, baseName })` 造路径并以 `vscode.Uri.from({ scheme: DIFF_SCHEME, path }).toString()` 得到字符串；拿到返回的 `uris` 后还原成两个 `vscode.Uri`；对两侧 `await vscode.workspace.openTextDocument(uri)`；按 `resolveLanguages(left.languageId, right.languageId)` 的结果对每侧调用 `vscode.languages.setTextDocumentLanguage(doc, lang)`（结果为 `undefined` 时跳过）；最后 `await vscode.commands.executeCommand('vscode.diff', leftUri, rightUri, buildDiffTitle(left, right, false))`（`normalized` 实参在 U4 改为 `store.hasActiveRules`）
  - 输出：可复用的开图入口
  - 涉及文件：`src/features/diff/command.ts`
  - 前置任务：无
  - 验证命令：`npm run typecheck`
  - 验收标准：typecheck 通过

- [x] **实现选区读取与三条命令**
  - 输入：`vscode.window.activeTextEditor`
  - 操作：实现 `captureSelection(editor: vscode.TextEditor): SelectionInfo` —— 把 `editor.selections` 中非空者映射为 `aggregateSelections` 的入参，结果为 `null` 时取 `document.getText()` 且 `rangeLabel` 为 `formatRangeLabel(null)`，否则取聚合文本与 `formatRangeLabel(ranges)`；`baseName` 用 `document.uri.path.split('/').pop()`（与 `src/features/plainText/command.ts:14` 同法，不 import node 的 `path`）；`languageId` 取 `document.languageId`。
    注册三条命令：`textToolkit.diff.markSelection`（存入 `registry.marked`，刷新状态栏与上下文键）；`textToolkit.diff.compareWithMarked`（`registry.marked` 为空时 `showInformationMessage` 提示先执行标记命令，否则以 marked 为左、当前选区为右调用 `openDiff`）；`textToolkit.diff.compareWithClipboard`（`await vscode.env.clipboard.readText()` 包在 `try/catch` 中，**catch 与返回空串 `''` 两种情况合并处理**：`showInformationMessage(vscode.l10n.t('The clipboard has no text to compare. Images and other non-text content cannot be compared.'))` 后直接返回，不打开 diff——见 D-11；守卫只判断 `text === ''`，不做 `trim`。通过守卫后构造 `baseName` 为 `Clipboard`、`rangeLabel` 为 `full`、无 `languageId` 的 `SelectionInfo`，按 `getDiffConfig().clipboardSide` 决定它在左还是在右）。三条命令在 `vscode.window.activeTextEditor` 为空时统一走 `showInformationMessage` 分支
  - 输出：三条可执行命令
  - 涉及文件：`src/features/diff/command.ts`；`src/shared/config.ts`（新增 `getDiffConfig()` 返回 `{ contextMenu, clipboardSide }`，按现有 `getCopyPathConfig` 的写法）
  - 前置任务：上一条
  - 验证命令：`npm run typecheck`
  - 验收标准：typecheck 通过；无活动编辑器时三条命令均走提示分支而不抛异常；`readText()` 返回空串或抛异常时 `compareWithClipboard` 均不调用 `openDiff`

- [x] **标记状态栏与上下文键**
  - 输入：`registry.marked`
  - 操作：`vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 99)`（99 是因为 `src/features/plainText/command.ts:42` 已占用 100）；文本为 `$(diff) <baseName> (<rangeLabel>)`，`rangeLabel` 为 `full` 时省略括号；`tooltip` 说明点击可打开比较菜单；`command` 设为 `textToolkit.diff.showMenu`；实现 `updateStatusBar()`，有标记时 `show()` 否则 `hide()`，并同步 `vscode.commands.executeCommand('setContext', 'textToolkit.diff.hasMark', Boolean(registry.marked))`；在标记与清除标记后各调用一次
  - 输出：可见的标记指示与可用的上下文键
  - 涉及文件：`src/features/diff/command.ts`
  - 前置任务：上一条
  - 验证命令：`npm run typecheck`
  - 验收标准：typecheck 通过

- [x] **二级菜单与一级挂载**
  - 输入：`src/shared/quickPick.ts` 的 `showMenu` / `isBackItem` / `PickOutcome`
  - 操作：在 `src/features/diff/command.ts` 导出 `showDiffMenu(withBack: boolean): Promise<PickOutcome>`，本单元列四项——标记当前选区、与标记比较、与剪贴板比较、清除标记（清除标记不注册为命令，仅作菜单项，见 D-7）；首项 `← Back` 由 `showMenu(items, placeHolder, withBack)` 自动补上；Esc 返回 `'done'`，`isBackItem` 命中返回 `'back'`。注册隐藏命令 `textToolkit.diff.showMenu` 调用 `showDiffMenu(false)`。
    在 `src/features/menu/command.ts` 的 `categories()` 追加第 5 项 `{ id: 'diff', label: '$(diff) ' + t('Compare (Diff)'), description: 当前 clipboardSide 的可读文案, detail: 一句话说明 }`，并在 `runSecondLevel` 增加 `case 'diff': return showDiffMenu(true)`
  - 输出：两级选择器接入
  - 涉及文件：`src/features/diff/command.ts`、`src/features/menu/command.ts`
  - 前置任务：上一条
  - 验证命令：`npm run typecheck`
  - 验收标准：typecheck 通过；二级菜单遵守 `src/features/menu/command.ts:10-16` 的四条契约

- [x] **清单登记**
  - 输入：本单元引入的 4 条命令、2 项设置、全部运行时文案
  - 操作：`package.json` 的 `contributes.commands` 追加 4 条（`markSelection` / `compareWithMarked` / `compareWithClipboard` / `showMenu`，`category` 复用 `%category%`，`title` 用新增的 `%command.*%` 占位符）；
    `menus.commandPalette` 追加 `{ "command": "textToolkit.diff.showMenu", "when": "false" }`；
    `menus.editor/context` 追加两项，group 分别为 `compare@1` / `compare@2`（自定义 group 按名称字母序排列，`compare` 排在现有 `copy` 之前，因此右键菜单中比较项会出现在"复制路径与行号"上方——这是预期顺序，不是 bug），`when` 分别为
    `editorTextFocus && config.textToolkit.diff.contextMenu != none` 与
    `editorTextFocus && config.textToolkit.diff.contextMenu == both && textToolkit.diff.hasMark`；
    `configuration.properties` 追加 `textToolkit.diff.contextMenu`（`type: string`，enum `["both","markOnly","none"]`，default `both`，带 `enumDescriptions`）与 `textToolkit.diff.clipboardSide`（enum `["left","right"]`，default `left`，带 `enumDescriptions`）；
    两份 `package.nls*.json` 与 `l10n/bundle.l10n.zh-cn.json` 追加全部对应条目
  - 输出：清单与文案齐备
  - 涉及文件：`package.json`、`package.nls.json`、`package.nls.zh-cn.json`、`l10n/bundle.l10n.zh-cn.json`
  - 前置任务：上四条
  - 验证命令：`npm run check && npm test`
  - 验收标准：check 四项全 ok；`test/advanced.test.ts:205` 的 nls 双向断言通过；命令面板可见命令数为 8

- **单元级验证**：`npm run typecheck && npm test && npm run check && npm run compile`
- **累计集成验证**：同上
- **人工验收**（F5 调试宿主）：① 在一个 `.ts` 文件中选一段代码执行 `Select Text for Compare`，状态栏出现标记条目；② 在另一文件中选一段执行 `Compare Text with Marked Selection`，diff 打开，**两侧语法高亮为 TypeScript**（验收 #38），标签页标题含两侧文件名与行号（验收 #66）；③ 复制一段文本后执行 `Compare Text with Clipboard`，剪贴板出现在左侧；④ 把 `textToolkit.diff.contextMenu` 改为 `none`，右键菜单中两项消失；改为 `markOnly`，只剩第一项；⑤ 清除标记后右键菜单的第二项自动消失（验收上下文键生效）；⑥ **复制一张图片**（例如从截图工具或浏览器）后执行 `Compare Text with Clipboard`，得到"剪贴板没有可比较的文本"提示且**不打开 diff**（验收 D-11）；⑦ 复制一段**同时含图片与文字**的富文本后执行同一命令，正常打开 diff 且内容为其中的纯文字部分
- **风险与回滚点**：`config.textToolkit.diff.contextMenu != none` 这一 `when` 写法未在目标 VS Code 版本上实测。若不生效，菜单项会恒显；退路是改为两个独立布尔设置 `diff.showMarkOnContextMenu` / `diff.showCompareOnContextMenu`。回滚点为还原 `package.json` 的 `menus` 段与 `src/features/diff/command.ts`
- **commit**
  - 暂存路径：`src/features/diff/command.ts`、`src/features/menu/command.ts`、`src/shared/config.ts`、`package.json`、`package.nls.json`、`package.nls.zh-cn.json`、`l10n/bundle.l10n.zh-cn.json`
  - message：`feat: 新增选区标记, 与标记比较与剪贴板比较命令`

### U3 · add-editor-and-tab-compare

- **goal**：交付跨编辑器比较能力——两个可见编辑器一键比较、任意两个已打开标签页比较（#33）、以及交换最近一次比较的左右两侧（#96）。
- **depends_on**：`add-selection-compare-commands`
- **范围内**：3 条隐藏命令、标签页收集与两步选择、二级菜单追加三项、对应清单登记。
- **范围外**：归一化开关与刷新、文档。

- [x] **`compareVisibleEditors`**
  - 输入：`vscode.window.visibleTextEditors`
  - 操作：数量不等于 2 时 `showInformationMessage` 报出实际数量并提示分屏后重试（文案对齐上游 `compare-visible-editors.ts:17` 的语义），随即返回；否则按 `viewColumn` 升序确定左右，各自 `captureSelection` 后 `openDiff`
  - 输出：命令可用
  - 涉及文件：`src/features/diff/command.ts`
  - 前置任务：无
  - 验证命令：`npm run typecheck`
  - 验收标准：typecheck 通过

- [x] **`compareTabs`**
  - 输入：`vscode.window.tabGroups.all`
  - 操作：展平所有 tab，只保留 `tab.input instanceof vscode.TabInputText` 的项（`TabInputTextDiff` 等自然被排除），再剔除 `input.uri.scheme === DIFF_SCHEME` 的项；候选少于 2 个时提示并返回；否则两步单选——第一步选左侧，第二步的候选中排除已选项，任一步 Esc 则整体取消不做任何事；对选中的 uri `await vscode.workspace.openTextDocument(uri)` 取 `getText()` 全文构造 `SelectionInfo`（`rangeLabel` 为 `full`，`languageId` 取 `doc.languageId`）后 `openDiff`
  - 输出：命令可用
  - 涉及文件：`src/features/diff/command.ts`
  - 前置任务：无
  - 验证命令：`npm run typecheck`
  - 验收标准：typecheck 通过；候选过滤同时排除 diff 标签页与本扩展 scheme

- [x] **`swapSides`**
  - 输入：`registry.lastSessionId`
  - 操作：无最近 session 时提示先执行一次比较；否则取该 session 的两侧互换后调用 `openDiff`（生成新 session，旧标签页保留其自身内容不受影响）
  - 输出：命令可用
  - 涉及文件：`src/features/diff/command.ts`
  - 前置任务：无
  - 验证命令：`npm run typecheck`
  - 验收标准：typecheck 通过

- [x] **二级菜单追加与清单登记**
  - 输入：上三条命令
  - 操作：`showDiffMenu` 追加三项；`package.json` 的 `contributes.commands` 追加 3 条并在 `menus.commandPalette` 中各加一条 `"when": "false"`；两份 nls 与 l10n bundle 追加对应条目
  - 输出：可从菜单触达
  - 涉及文件：`src/features/diff/command.ts`、`package.json`、`package.nls.json`、`package.nls.zh-cn.json`、`l10n/bundle.l10n.zh-cn.json`
  - 前置任务：上三条
  - 验证命令：`npm run check && npm test`
  - 验收标准：check 四项全 ok；命令面板可见命令数仍为 8

- **单元级验证**：`npm run typecheck && npm test && npm run check && npm run compile`
- **累计集成验证**：同上，外加 U2 的七项人工验收复跑一遍（确认 `openDiff` 的改动未造成回归）
- **人工验收**：① 左右分屏打开两个文件，执行 `Compare Text in Visible Editors`，得到符合视觉顺序的 diff；② 打开 4 个标签页但只显示 1 个，执行 `Compare Two Open Tabs`，候选列表**不含**已打开的 diff 标签页，两步选完出图（验收 #33）；③ 对任一 diff 执行 `Swap Diff Sides`，左右互换且原 diff 标签页内容未被篡改（验收 #96 与 session 隔离）
- **风险与回滚点**：`swapSides` 每次生成新 session，会让 8 条上限更快淘汰旧内容，用户可能更早看到占位文案。若实测困扰明显，调高该常量即可（单点修改）。回滚点为还原 `src/features/diff/command.ts` 与 `package.json` 的本单元段落
- **commit**
  - 暂存路径：`src/features/diff/command.ts`、`package.json`、`package.nls.json`、`package.nls.zh-cn.json`、`l10n/bundle.l10n.zh-cn.json`
  - message：`feat: 新增可见编辑器比较, 标签页比较与左右交换`

### U4 · add-normalization-rules-and-refresh

- **goal**：交付比较前文本归一化规则的配置与运行时启停，以及**切换后已打开的 diff 立即刷新**（上游 #24 至今未解决）；状态栏常驻显示当前激活的规则数。
- **depends_on**：`add-selection-compare-commands`（状态栏与二级菜单），并使用 `add-diff-core-and-provider` 留下的 `getActiveRules` 接缝
- **范围内**：`diff.normalizationRules` 设置、规则运行时 store、`toggleNormalizationRules` 命令、provider 刷新接线、状态栏规则指示、补充单测。
- **范围外**：上游 #92（归一化后还原原文显示），明确不做；文档。

- [x] **`diff.normalizationRules` 设置与读取**
  - 输入：上游 `package.json:71-115` 的 schema
  - 操作：`package.json` 的 `configuration.properties` 追加 `textToolkit.diff.normalizationRules`，`type: array`，item 为对象含 `name`（string）/ `match`（string）/ `replaceWith`（`oneOf`：string 或 `{ letterCase: enum[upper,lower] }`，`required: ["letterCase"]`）/ `enableOnStart`（boolean，default true），`required: ["match", "replaceWith"]`，整体 default `[]`；附一个 `defaultSnippets` 示例（替换 tab 为两个空格、逗号后保留一个空格）。`src/shared/config.ts` 的 `getDiffConfig()` 追加 `normalizationRules: config.get<unknown>('normalizationRules', [])` 字段
  - 输出：设置可配
  - 涉及文件：`package.json`、`src/shared/config.ts`、`package.nls.json`、`package.nls.zh-cn.json`
  - 前置任务：无
  - 验证命令：`npm run check`
  - 验收标准：check 四项全 ok；设置界面能看到该项且中英文案一致

- [x] **建 `src/features/diff/rules.ts` 运行时 store**
  - 输入：U1 的 `loadRules`
  - 操作：`NormalizationRuleStore` 类，构造参数为 `readRaw: () => unknown`（注入以便单测，不直接依赖 vscode）。内部缓存上次读到的原始值的 `JSON.stringify` 结果；`getAll()` 每次读取并比较，字符串不同则用 `loadRules` 重建并**重置** active 状态（对齐上游 `normalisation-rule-store.ts:30-35` 的语义，替代其 `lodash.isequal`）；`activeRules` 返回 `getAll().filter(r => r.active)`；`hasActiveRules` 返回 `activeRules.length > 0`；`setActive(indices: number[])` 按下标重写 active 标志
  - 输出：store 可用
  - 涉及文件：新建 `src/features/diff/rules.ts`
  - 前置任务：上一条
  - 验证命令：`npm run typecheck`
  - 验收标准：typecheck 通过；`package.json` 仍无 `dependencies` 字段

- [x] **接线 provider 与开关命令**
  - 输入：store
  - 操作：把 U1 中构造 provider 时的 `() => []` 替换为 `() => store.activeRules`；把 `openDiff` 中 `buildDiffTitle` 的第三个实参由 `false` 改为 `store.hasActiveRules`；注册隐藏命令 `textToolkit.diff.toggleNormalizationRules`——`store.getAll()` 为空时提示先配置 `textToolkit.diff.normalizationRules` 并返回，否则 `vscode.window.showQuickPick(items, { canPickMany: true })`（每项 `label` 取 `rule.name` 或"未命名规则"文案，`picked` 反映当前 active；返回 `undefined` 视为取消、不改变任何状态，对齐上游 `normalisation-rule-picker.ts:16` 的语义），选完调用 `store.setActive(...)` 后调用 `provider.refreshAll()` 与状态栏刷新
  - 输出：#24 得到修复
  - 涉及文件：`src/features/diff/command.ts`、`src/features/diff/contentProvider.ts`
  - 前置任务：上一条
  - 验证命令：`npm run typecheck`
  - 验收标准：typecheck 通过

- [x] **状态栏规则指示与菜单项**
  - 输入：`store.activeRules.length` 与 `store.getAll().length`
  - 操作：扩展 `updateStatusBar()`——有标记时在原文本后追加 ` · $(filter)N`；无标记但 N 大于 0 时单独显示 `$(filter)N`；两者皆无则 `hide()`；`tooltip` 增加一句说明「标题中的 `~` 是打开那一刻的快照，此处的计数始终准确」。`showDiffMenu` 追加「切换归一化规则」项，`description` 显示 `N/M`。`src/features/menu/command.ts` 中第 5 类的 `description` 追加规则计数
  - 输出：常驻且准确的指示
  - 涉及文件：`src/features/diff/command.ts`、`src/features/menu/command.ts`
  - 前置任务：上一条
  - 验证命令：`npm run typecheck`
  - 验收标准：typecheck 通过

- [x] **补测与清单登记**
  - 输入：`rules.ts` 的漂移检测逻辑
  - 操作：**新建** `test/diff.rules.test.ts`（不并入 U1 的 `test/diff.core.test.ts`，保持"一个测试文件对应一个被测模块"且单元间文件互斥），用内存 `readRaw` 构造 `NormalizationRuleStore`，断言：初始 active 按 `enableOnStart` 确定；`setActive` 后再次 `getAll()`（原始值未变）保留用户的手动启停；把 `readRaw` 的返回值改成不同数组后 `getAll()` 重置为按 `enableOnStart` 的状态；`hasActiveRules` 随之变化。`package.json` 追加 1 条命令与 `commandPalette` 的 `"when": "false"`；三份文案文件追加条目
  - 输出：行为被测试锁定
  - 涉及文件：新建 `test/diff.rules.test.ts`；`package.json`、`package.nls.json`、`package.nls.zh-cn.json`、`l10n/bundle.l10n.zh-cn.json`
  - 前置任务：上四条
  - 验证命令：`npm test && npm run check`
  - 验收标准：全部测试通过；check 四项全 ok

- **单元级验证**：`npm run typecheck && npm test && npm run check && npm run compile`
- **累计集成验证**：同上，外加 U2 与 U3 的人工验收项各复跑一遍
- **人工验收**：在 `settings.json` 配置两条规则（一条把 tab 替换为两个空格，一条 `enableOnStart: false` 的大写化）→ ① 启动后状态栏显示 `$(filter)1`；② 打开一个 diff，标题中缀为 `~`；③ **不关闭该 diff**，执行 `Toggle Normalization Rules` 勾上第二条 —— 该 diff 内容当场变化（这是 #24 的核心验收），状态栏变为 `$(filter)2`，标题中缀保持 `~` 不变（已知限制，与 D-8 一致）；④ 修改 `settings.json` 中的规则数组后再次打开切换面板，勾选状态已按 `enableOnStart` 重置
- **风险与回滚点**：`refreshAll()` 会对全部已发放 URI 触发 `fire`，数量受 8 条 session 上限约束（最多 16 个 URI），实测应无感。回滚点为把 `getActiveRules` 改回 `() => []`、`buildDiffTitle` 第三参改回 `false`、并摘掉命令注册
- **commit**
  - 暂存路径：`src/features/diff/rules.ts`、`src/features/diff/command.ts`、`src/features/diff/contentProvider.ts`、`src/features/menu/command.ts`、`src/shared/config.ts`、`test/diff.rules.test.ts`、`package.json`、`package.nls.json`、`package.nls.zh-cn.json`、`l10n/bundle.l10n.zh-cn.json`
  - message：`feat: 归一化规则可运行时启停且已打开的 diff 立即刷新`

### U5 · document-diff-feature

- **goal**：交付与实现一致的对外文档与发布元数据——README 的 Compare 章节与三处过期数字、CHANGELOG 的 `0.0.3` 段、NOTICE 的上游署名、版本号。
- **depends_on**：`add-normalization-rules-and-refresh`
- **范围内**：`README.md`、`CHANGELOG.md`、`NOTICE.md`、`package.json` 的 `version` 与 `keywords`。
- **范围外**：任何行为改动。

- [x] **README 新增 Compare (Diff) 章节**
  - 输入：U2 至 U4 的最终命令、设置与行为
  - 操作：顶部功能列表加第 5 条；命令表加 8 条（按现有「Command ID / Title / Arguments」表格式，隐藏命令另起一张小表，参照现有 `textToolkit.plainText.open` 的写法）；「Two-level picker」表加一行；「Exposed layer」的 JSON 样例与表格加 3 项；新增「Migrating from Partial Diff」映射表，列出 5 条命令 ID 映射（`extension.partialDiff.markSection1` → `textToolkit.diff.markSelection`、`markSection2AndTakeDiff` → `compareWithMarked`、`diffSelectionWithClipboard` → `compareWithClipboard`、`diffVisibleEditors` → `compareVisibleEditors`、`togglePreComparisonTextNormalizationRules` → `toggleNormalizationRules`）与 1 条配置映射（`partialDiff.preComparisonTextNormalizationRules` → `textToolkit.diff.normalizationRules`，字段名不变），并写明本扩展不含遥测因而没有 `enableTelemetry` 的对应项；新增「Left to VS Code」小节，列出字符级高亮、`F7` 差异跳转、`diffEditor.hideUnchangedRegions`、Toggle Inline View、diff 配色主题、Explorer 的 Select for Compare、以及把 diff 拖到新编辑器组各自的原生用法
  - 输出：README 与实现一致
  - 涉及文件：`README.md`
  - 前置任务：无
  - 验证命令：无自动化命令（仓库无 markdown lint，`scripts/package.mjs` 只断言 README 存在而不检查内容），改用下述人工核对
  - 验收标准：`rg -n 'four categories|Five commands|seven settings' README.md` 无输出（三处旧数字已分别改为 five / Eight / ten）

- [x] **CHANGELOG 与版本号**
  - 输入：U1 至 U4 的 commit
  - 操作：`CHANGELOG.md` 顶部新增 `## 0.0.3`，沿用现有 `### Added` / `### Changed` 结构。Added 中明确点出相对上游的改进及其 issue 编号：切换归一化规则后已打开的 diff 立即刷新（#24）、diff 两侧继承来源文件语言（#38 / #28）、URI 与标题携带来源文件名与行号（#66）、可比较任意两个已打开标签页（#33）、可交换左右两侧且剪贴板侧可配（#96）、不含遥测（#91）、剪贴板无文本内容（例如只复制了图片）时给出明确提示而不是打开一侧全空的 diff。Changed 中记录命令面板条目由 5 条增至 8 条、暴露层设置由 7 项增至 10 项。`package.json` 的 `version` 改为 `0.0.3`，`keywords` 追加 `diff` 与 `compare`（`categories` 保持不变）
  - 输出：变更记录完整
  - 涉及文件：`CHANGELOG.md`、`package.json`
  - 前置任务：无
  - 验证命令：`node scripts/changelog-section.mjs 0.0.3 && npm run check && npm test`
  - 验收标准：`changelog-section.mjs` 退出码 0 并输出非空正文；check 与测试通过

- [x] **NOTICE 追加上游署名**
  - 输入：`.ai-ctx/cache/vscode-partial-diff/LICENSE.txt`
  - 操作：在 `NOTICE.md` 末尾按现有三段的格式追加 `## vscode-partial-diff (https://github.com/ryu1kn/vscode-partial-diff)`，下一行 `Source: commit 59dadff75dec4fad86e592871c19649347dbd32f`，再以 ```text 代码块逐字抄录其 MIT 全文（Copyright (c) 2016 Ryuichi Inagaki）
  - 输出：署名合规
  - 涉及文件：`NOTICE.md`
  - 前置任务：无
  - 验证命令：无自动化命令（仓库无 license 检查），改用下述人工核对
  - 验收标准：`diff <(sed -n '/## vscode-partial-diff/,$p' NOTICE.md | sed -n '/^```text$/,/^```$/p' | sed '1d;$d') .ai-ctx/cache/vscode-partial-diff/LICENSE.txt` 无差异输出
  - 备注：若本地缓存目录已被清理，重新执行 `git clone --depth 1 https://github.com/ryu1kn/vscode-partial-diff.git .ai-ctx/cache/vscode-partial-diff` 后再核对

- [x] **全量收尾验证**
  - 输入：完整仓库
  - 操作：依次执行验证命令并记录输出到本方案的执行记录
  - 输出：验证记录
  - 涉及文件：无
  - 前置任务：上三条
  - 验证命令：`npm run typecheck && npm test && npm run check && npm run build`
  - 验收标准：四条命令退出码均为 0；`npm run build`（production 模式）产物生成成功

- **单元级验证**：`npm run typecheck && npm test && npm run check && npm run build`
- **累计集成验证**：同上，并复跑 U2、U3、U4 的全部人工验收项作为跨单元闭环
- **风险与回滚点**：纯文档与元数据改动，无运行时风险。回滚点为单独 revert 本单元 commit，功能不受影响
- **commit**
  - 暂存路径：`README.md`、`CHANGELOG.md`、`NOTICE.md`、`package.json`
  - message：`docs: 补充 Compare (Diff) 文档, 上游署名与 0.0.3 变更记录`

## 路线图

| 顺序 | 单元 id | 范围 | 前置依赖 | 验收摘要 | 风险 / 回滚点 |
| --- | --- | --- | --- | --- | --- |
| 1 | `add-diff-core-and-provider` | 纯逻辑内核、registry、虚拟文档 provider 与注册、单测 | none | 四条命令全绿；测试数由 137 上升不少于 30；调试宿主激活无异常 | URI 编码格式发布后被外部依赖，此为唯一可自由调整窗口；回滚 = 删 `src/features/diff/` 与 `extension.ts` 一行 |
| 2 | `add-selection-compare-commands` | 标记 / 与标记比较 / 与剪贴板比较、状态栏、右键菜单、2 项设置、两级菜单挂载 | 1 | 三连击可用；diff 两侧继承 TS 高亮（#38）；标题含文件名行号（#66）；`contextMenu` 三档均生效 | `when` 的 `!= none` 写法未实测，失效则菜单恒显，退路是拆成两个布尔；回滚 = 还原 `menus` 段与 `command.ts` |
| 3 | `add-editor-and-tab-compare` | 可见编辑器比较、标签页比较（#33）、左右交换（#96） | 2 | 标签页候选不含 diff 自身；交换后原 diff 内容未被篡改 | 交换会加速 8 条 session 上限淘汰；回滚 = 还原 `command.ts` 与 `package.json` 本段 |
| 4 | `add-normalization-rules-and-refresh` | 规则配置、运行时 store、启停命令、**打开中的 diff 立即刷新（#24）**、状态栏规则指示 | 2（并用 1 的 `getActiveRules` 接缝） | 不关闭 diff 切换规则内容当场变化；配置数组变更后勾选状态按 `enableOnStart` 重置 | `refreshAll` 最多触发 16 次 fire，受上限约束；回滚 = `getActiveRules` 改回 `() => []` |
| 5 | `document-diff-feature` | README / CHANGELOG / NOTICE / 版本号 `0.0.3` | 4 | 三处旧数字已更正；NOTICE 与上游 LICENSE 逐字一致；`npm run build` 产物生成 | 纯文档，单独 revert 即可 |

U3 与 U4 之间无依赖，可互换顺序或并行 review。

## 拆分自检

| 检查项 | 结论 |
| --- | --- |
| 所有需求都被某个单元及其验收标准覆盖 | 通过。验收标准 1 分布于 U2（标记、与标记比较、与剪贴板比较）、U3（可见编辑器）、U4（规则切换）；标准 2 由 U1 的 `aggregateSelections` 与 U2 的 `captureSelection` 共同覆盖并有单测；标准 3 由 U1 的 `loadRules`/`applyRules` 与 U4 的 schema 覆盖；标准 4 → U2 人工验收②；标准 5 → U2 人工验收②；标准 6 → U4 人工验收③；标准 7 → U3 人工验收②；标准 8 → U3 人工验收③ 与 U2 人工验收③；标准 9 由五个单元均无 telemetry 代码隐式满足，并在 U5 的 README 迁移表中显式声明；标准 10 是每个单元的单元级验证 |
| 任意两单元无重复职责或重叠提交边界 | 通过，含一处已声明的例外。四个共享清单文件被多个单元追加，这是 `scripts/lib/check-manifest.mjs` 双向断言下的硬性要求，无法切分，隔离规则已在上文「共享清单文件的隔离规则」中定义。除此之外路径严格互斥：`core.ts` / `registry.ts` / `contentProvider.ts` / `test/diff.core.test.ts` 归 U1 创建且此后不再被其他单元改动，`rules.ts` 与 `test/diff.rules.test.ts` 归 U4 创建，三份文档归 U5；`src/features/diff/command.ts` 由 U1 建骨架、U2 至 U4 各自追加互不重叠的命令块；`src/features/menu/command.ts` 由 U2 建立第 5 类、U4 只改其 `description` 一行；`src/shared/config.ts` 由 U2 建 `getDiffConfig()`、U4 只加一个字段 |
| 依赖图无循环且每个依赖都是真实依赖 | 通过。依赖链为 1 → 2 → 3、1 + 2 → 4 → 5，无环。U2 依赖 U1 的 provider 与 core（`openDiff` 直接调用）；U3 依赖 U2 的 `openDiff` 与二级菜单；U4 依赖 U1 的 `getActiveRules` 注入点与 U2 的状态栏及菜单；U5 依赖 U4 完成后的最终形态才能写准文档 |
| 任一中间单元完成后仓库仍可构建、可测试、可 review | 通过。U1 后无用户可见变化但四条命令全绿；U2 后核心三连击可用，本身即一个可独立发布的形态；U3 后跨编辑器能力齐备；U4 后功能完整仅文档滞后。每个单元的最后一条 task 都要求 `npm run check` 通过，保证文案清单在每个 commit 上都自洽 |
| 数据、公共接口、兼容层与迁移步骤生命周期完整，无留待后补的能力空洞 | 通过。唯一的跨单元接缝 `getActiveRules: () => NormalizationRule[]` 在 U1 就以最终签名落地，且 `() => []` 是行为正确的合法实现（等价于"无规则"）而非占位；U4 只替换实参不改签名。URI 编码格式在 U1 一次定死，U2 至 U4 只消费。每个新增设置项由引入它的单元同时提供 schema、默认值与中英文案，不存在"先加键后补文案"的中间态。上游用户的迁移路径在 U5 一次性给全，且已决定不提供命令别名，故无兼容层需要生命周期管理 |

## 迁移、兼容与回滚点

- **对现有用户**：本方案只做增量，不改动现有 5 条命令、7 项暴露层设置、`textToolkit.advanced` 与 `explorer/context` 菜单。已有配置无需任何改动。
- **对 partial-diff 用户**：需要卸载或禁用原扩展（两者的右键菜单会同时出现），并按 README 的迁移映射表改写快捷键绑定与 `preComparisonTextNormalizationRules` 的配置键名。规则数组的元素字段名不变，可直接复制。本方案不提供命令 ID 别名（见范围外）。
- **回滚点**：五个单元各自独立成 commit，任一单元可单独 `git revert`。U5 revert 只影响文档；U4 revert 后归一化能力消失但其余功能完好；U3 revert 后跨编辑器命令消失；U2 revert 后回到"只注册了 scheme"的状态；U1 revert 后完全回到当前 `main`。
- **不可逆点**：无。本方案不做数据迁移、不写 `globalState` / `workspaceState`、不改动用户设置。唯一的对外承诺是发布后的 URI 格式与命令 ID，在未发布前均可自由调整。

## 验证命令

以下四条**已在编写方案时于本仓库实测通过**：

```sh
npm run typecheck   # tsc --noEmit
npm test            # vitest run，当前基线 5 文件 137 测试
npm run check       # node scripts/check.mjs，4 项一致性门禁
npm run compile     # node build.mjs，产出 out/extension.js
```

U5 额外使用（脚本契约已读源码确认，见 `scripts/changelog-section.mjs:22-44`，但本次尚未以 `0.0.3` 为参数实际执行，因为该版本小节尚不存在）：

```sh
node scripts/changelog-section.mjs 0.0.3   # 找不到小节或正文为空时退出码 1
npm run build                              # production 模式构建
```

发布前可选检查，**本次会话未执行**，因此不作为任何单元的验收条件：

```sh
npm run package    # node scripts/package.mjs，打 VSIX 到 artifacts/ 并按允许清单断言内容；依赖本机 unzip
```

功能面无自动化验证：`vitest.config.ts` 的注释明确说明本仓库只覆盖不依赖 vscode 运行时的纯逻辑，不引入 VS Code 集成测试 harness。因此每个单元都定义了具体的调试宿主人工验收步骤，见各单元的「人工验收」条目。

## 风险与未决项

| 级别 | 项 | 说明与应对 |
| --- | --- | --- |
| 中 | `when` 子句 `config.textToolkit.diff.contextMenu != none` 未实测 | 上游用的是 `config.x.y.z` 读嵌套对象属性（`package.json:155`），本方案用的是枚举值比较，语法不同。若在 VS Code 1.101 上不生效，菜单项会恒显。退路是拆成两个独立布尔设置，改动局限在 `package.json` 的 `menus` 段与一处配置声明。U2 人工验收④⑤ 会当场发现 |
| 中 | `languages.setTextDocumentLanguage` 作用于 `TextDocumentContentProvider` 提供的虚拟文档 | API 文档未排除虚拟文档，但未实测。若无效，退路是仅依赖 URI basename 的扩展名做语言判定（对有扩展名的来源仍然有效，只在 untitled 来源上退化）。U2 人工验收② 会当场发现 |
| 低 | 8 条 session 上限导致旧 diff 标签页显示占位文案 | 已有明确的占位文案而非空白。若实测困扰明显，调高单点常量即可 |
| 低 | 归一化后的文本与源文档行号不再一一对应 | 上游同样如此。标题中的行号描述的是**源选区**范围，不是 diff 内的行号。README 中说明 |
| 低 | 大体积剪贴板或整文件内容无上限保护 | 与上游一致，已在「已确认决策与假设」中记录为假设 1，文档不作性能承诺 |
| 低 | 空剪贴板与图片剪贴板在 API 层不可区分 | 二者的 `readText()` 都是 `''`，因此 D-11 的提示文案同时覆盖两种情形，措辞为"剪贴板没有可比较的文本内容"而不指认具体原因。部分平台复制图片时会给出图片来源的文本 flavor（文件路径或 URL），此时按普通文本比较，属预期行为 |

未决项：无。方案已达决策完备，不存在需要实施阶段拍板的取舍。

## 执行记录

### 基线（2026-08-06）

`git status --short` 为空，无暂存内容，HEAD 为 `349a791`。本次范围外的既有改动：无。

### U1 · add-diff-core-and-provider — 已完成

- commit `495753e` `feat: 新增 diff 虚拟文档内核与内容提供器`，7 files changed, 707 insertions(+), 1 deletion(-)。
- 验证：`npm run typecheck` 通过；`npm test` 6 files / 185 tests 全绿（`test/diff.core.test.ts` 48 用例，超过约定的 30）；`npm run check` 4 项 ok；`npm run compile` 产出 49.8kb。
- 纯净性核验：`rg -n "from 'vscode'|from 'node:|from 'path'|from 'os'" src/features/diff/core.ts` 无输出。
- 提交后 `git status --short` 为空，与基线一致，无夹带。

### U2 · add-selection-compare-commands — 偏差记录

**偏差（不改变实现逻辑、范围与验收，按方案第 4 条自行决策后继续）**：方案给 U2 列的暂存路径不含 `src/extension.ts`，但一级选择器需要拿到 diff 功能的句柄才能进入其二级菜单。沿用仓库既有范式（`registerPlainTextMode` 返回 `PlainTextFeature` 再传给 `registerMenuCommand`），`registerDiffFeature` 改为返回 `DiffFeature`，`registerMenuCommand(context, plainText, diff)` 增加一个入参，`src/extension.ts` 相应改 2 行。

否决的替代方案：让菜单用 `executeCommand('textToolkit.diff.showMenu')` 触发——那样拿不到 `PickOutcome`，二级菜单的「← 返回」会失效，违反 `src/features/menu/command.ts:10-16` 的契约。

因此 U2 的实际暂存路径在方案所列基础上增加 `src/extension.ts`。

### U2 · add-selection-compare-commands — 已完成

- commit `eaae941` `feat: 新增选区标记, 与标记比较与剪贴板比较命令`，8 files changed, 422 insertions(+), 10 deletions(-)。
- 验证：四条命令全部通过；命令面板可见命令数经 `package.json` 解析核实为 8（声明 10 条，2 条 `when: false`）；`dependencies` 字段仍不存在。
- 提交后 `git status --short` 为空，无夹带。

### U3 · add-editor-and-tab-compare — 偏差记录

**偏差（不改变实现逻辑、范围与验收，按方案第 4 条自行决策后继续）**：方案给 `compareVisibleEditors` 写的是"数量不等于 2 时提示"，未提及过滤。实现时发现 `vscode.window.visibleTextEditors` 会把已经打开的比较结果的两侧也算进去，只要屏幕上还留着一个 diff，可见编辑器数就永远凑不齐 2，命令等于不可用。因此按与同单元 `compareTabs` 一致的做法，先剔除 `scheme === DIFF_SCHEME` 的编辑器再判断数量。

该改动只让验收标准「左右分屏两个文件时得到符合视觉顺序的 diff」更容易成立，不改变任何既定语义。上游 `compare-visible-editors.ts:15` 没有这层过滤，同样存在此问题。

同时补了一个方案未写明的实现细节：`compareTabs` 的候选按 `uri.toString()` 去重，否则同一文件在多个编辑器组中打开时会重复出现在选择列表里。

### U3 · add-editor-and-tab-compare — 已完成

- commit `4311d73` `feat: 新增可见编辑器比较, 标签页比较与左右交换`，5 files changed, 176 insertions(+), 1 deletion(-)。
- 验证：四条命令全部通过；命令面板可见命令数仍为 8（声明 13 条，5 条 `when: false`）。
- 提交后 `git status --short` 为空，无夹带。

### U4 · add-normalization-rules-and-refresh — 偏差记录

**偏差（实际改动少于方案预期，不影响交付内容）**：方案给 U4 列的暂存路径含 `src/features/diff/contentProvider.ts` 与 `src/features/menu/command.ts`，实施时这两个文件**一行都不需要改**。

- `contentProvider.ts`：U1 已经按最终签名留好 `getActiveRules` 接缝，接线只发生在 `command.ts` 里构造 provider 的那一行。
- `menu/command.ts`：一级分类的 `description` 调的是 `diff.categoryDescription()`，规则计数在该方法内部追加即可，调用方无需变动。

因此 U4 的实际暂存路径是方案所列的真子集。规则计数用 `激活数/总数` 的纯文本形式（如 `2/3`），未引入新的本地化字符串。

### U4 · add-normalization-rules-and-refresh — 已完成

- commit `64de60d` `feat: 归一化规则可运行时启停且已打开的 diff 立即刷新`，8 files changed, 352 insertions(+), 14 deletions(-)。
- 验证：四条命令全部通过；`npm test` 7 files / 195 tests（新增 `test/diff.rules.test.ts` 10 用例）；`dependencies` 字段仍不存在。
- 提交后 `git status --short` 为空，无夹带。

### U5 · document-diff-feature — 已完成

- commit `2a58446` `docs: 补充 Compare (Diff) 文档, 上游署名与 0.0.3 变更记录`，4 files changed, 177 insertions(+), 8 deletions(-)。
- 验收核对：`rg -n 'four categories|Five commands|seven settings' README.md` 无输出（三处旧数字已改为 five / Eight / ten）；`diff` 比对 NOTICE.md 中的 MIT 正文与 `.ai-ctx/cache/vscode-partial-diff/LICENSE.txt` 无差异；`node scripts/changelog-section.mjs 0.0.3` 退出码 0 且正文非空。
- 验证：`npm run typecheck` / `npm test`（7 files / 195 tests）/ `npm run check`（4 项 ok）/ `npm run build`（production，34.4kb）全部通过。

### 跨单元闭环核验

- **命令 ID**：`package.json` 声明 14 条，源码 `registerCommand` 注册 14 条，两侧完全一致，无声明未注册或注册未声明。
- **设置键**：`textToolkit.diff.*` 三项全部被 `src/shared/config.ts` 的 `getDiffConfig()` 读取。
- **U1↔U4 接缝**：`DiffContentProvider` 的 `getActiveRules: () => NormalizationRule[]` 签名自 U1 起未变，U4 只替换了实参。
- **零运行时依赖**：`package.json` 无 `dependencies` 字段。
- **最终全量验证 @ HEAD**：`npm run typecheck` 通过；`npm test` 7 files / 195 tests 全绿；`npm run check` 4 项 ok；`npm run build` 产出 `out/extension.js` 34.4kb。
- **与基线对比**：`git status --short` 为空，工作区与暂存区干净，五个提交之外无任何夹带。

### 未执行项（如实记录）

- 各单元的**调试宿主人工验收**（F5 启动扩展宿主逐项操作）在本次自动化实施中**未执行**，需要交互式 VS Code 环境。方案中的两项中级风险——`when` 子句 `config.textToolkit.diff.contextMenu != none` 的枚举比较写法、以及 `setTextDocumentLanguage` 作用于虚拟文档——正是靠这些人工步骤验证的，因此**仍未实测**，两者的退路已写在各自的风险条目中。
- `npm run package`（打 VSIX 并按允许清单断言内容）按方案约定属发布前可选检查，本次未执行。
