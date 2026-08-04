# 三插件合并为 Editor Text Toolkit 实施方案

- 方案状态: 已完成

## 1. 目标与验收标准

### 目标

把三个独立 VS Code 扩展合并为**一个**扩展 `editor-text-toolkit`(显示名 `Editor Text Toolkit`, 命令与配置前缀 `textToolkit`), 落地目录 `editor-text-toolkit/`:

| 来源扩展 ID | 提供的能力 |
| --- | --- |
| `turweet.copy-path-line-numbers-flexible` | 复制"路径 + 行号"引用 |
| `wmaurer.change-case` | 选区或当前词的 16 种大小写风格转换 |
| `janjoerke.align-by-regex` | 按正则对齐多行文本, 支持模板 |

合并同时包含四项超出"等价迁移"的要求:

1. 修复 `janjoerke.align-by-regex` 在"各行匹配数不一致"时的列宽缺陷(§6.4)。
2. 不内置任何默认快捷键。
3. 界面支持英语与简体中文。
4. 配置分暴露层与内置层; 命令精简并提供二级 Quick Pick。
5. 新增"纯文本模式(大文件)"能力。

### 验收标准

- [x] `npm run typecheck` 无错误(strict TS)。
- [x] `npm test` 全部通过, 覆盖四块纯逻辑(行号与路径格式化, 大小写转换, 正则对齐, 内置层配置解析)。
- [x] `npm run package` 产出单个 `.vsix`, `out/extension.js` 为自包含 bundle(不含 `node_modules`, 不含 `src/`, 不含测试与脚本)。
- [x] `package.json` 无 `contributes.keybindings`; 命令面板只出现 5 条命令; 暴露层只有 7 个配置键。
- [x] 声明式与运行时文案的中英文条目双向无缺漏(校验脚本核对)。
- [x] alignByRegex 通过 §6.4 的用例矩阵: 匹配数少的行的行尾长度不再影响其他行的中间列; 只有一行拥有某列匹配时该列不填充; 匹配数一致时输出与上游逐字符相同。
- [x] **手工 GUI 验收(§8.2)**: 需在扩展宿主中人工执行, 当前环境无 GUI, 未完成。

## 2. 当前事实与证据

实施期间的输入与产物:

| 内容 | 来源形态 | 状态 |
| --- | --- | --- |
| 合并后的扩展(本方案的产物) | 本仓库 | 已实现 |
| `turweet.copy-path-line-numbers-flexible` | **已安装扩展的编译产物副本** | 只读参考 |
| `wmaurer.change-case` | 上游源码, commit `7e1f0e106e9935fb52162a2f54f8bc43e22a0484` | 只读参考 |
| `janjoerke.align-by-regex` | 上游源码, commit `8533201542334a15faeeb88a154ebd2826fd3185` | 只读参考 |

三份参考输入均在仓库之外, 不参与构建与打包。

### 2.1 关键事实(决定了实现方式)

- `turweet.copy-path-line-numbers-flexible` 的已安装副本**只有编译产物** `out/core.js` 与 `out/extension.js`, 没有 `src/`, 且 source map 不含 `sourcesContent` → 其 TS 源码是**依据编译产物逐函数反写**的, 行为规格以该副本的 `out/*.js` 与 `package.json` 为准(其自带的 `PRD.md` / `TECH_PLAN.md` 中配置键名与产物不一致)。
- `wmaurer.change-case` 依赖 `change-case@3`(CJS, 18 个传递依赖, 已废弃), 另有 `lodash.uniq` 与从未被使用的 `lodash.range`。
- 该扩展的 `package.json` 把 `configuration` 写在**顶层**而非 `contributes` 下, 因此 `changeCase.includeDotInCurrentWord` 从未真正注册; 其 QuickPick 还存在"取消即抛异常"与"构造了 options 却没传入"两处缺陷。
- `janjoerke.align-by-regex` 的 `Block` 直接读 `vscode.EndOfLine` 与 `editor.tabSize`, 需参数化才能单测; 其 `align()` 统计列宽时遍历**全部** part(含每行尾部文本), 这是 §6.4 要修复的缺陷根因(证据: 上游 `src/block.ts:76-99`)。
- `change-case@5.4.4` 是**纯 ESM, 零运行时依赖**, 导出 14 个函数, **不提供** `lower`/`upper`/`lowerFirst`/`upperFirst`/`swap`/`title`/`param` 以及 v3 语义的 `sentence`。纯 ESM 意味着 CJS 扩展宿主必须打包后才能加载。
- 开发环境: Node 26.x, npm 11.x(纯 ESM 依赖的打包前提)。

## 3. 范围与约束

**范围内**: 本仓库内完整可构建, 可测试, 可打包的扩展, 含命令, 配置, 菜单, 双语文案, 图标, 文档, 单元测试。

**范围外**:

- 不修改三份只读参考输入, 它们不参与打包。
- 不发布到 Marketplace; 不做旧设置键与旧命令 ID 的自动迁移(README 提供迁移表)。
- 不把对齐扩展到多选区(仅主选区, 与上游一致); 不新增 `change-case@5` 独有的 `pascalSnake`/`train` 风格。
- 大文件能力只做"纯文本模式"(方案 A); 虚拟滚动 + 流式读取 + Worker 搜索(方案 B)与流式替换(方案 C)未实现。

**约束**: `engines.vscode: ^1.80.0`; TypeScript strict; 运行时 `dependencies` 为空; 构建产物只写 `out/`, 中间产物写本地临时目录且不入库。

## 4. 已确认决策

| # | 决策 | 理由 |
| --- | --- | --- |
| D1 | 扩展标识 `editor-text-toolkit`, 前缀 `textToolkit`, publisher `HeavenSky`, 版本 `0.0.1` | 用户确认 |
| D2 | 不保留三个上游的原命令 ID 与配置键, 不做隐藏别名 | 用户确认; 迁移表写入 README |
| D3 | 大小写转换用 `change-case@5.4.4`, 缺失的 6 种风格本地实现 | 用户确认; 零运行时依赖 |
| D4 | esbuild 打包为 CJS 单文件 `out/extension.js` | D3 的必要条件(纯 ESM), 同时让 vsix 不含 `node_modules` |
| D5 | 移除 lodash 依赖, 用 `Set`/`Map` 替代 | 上游 `lodash.range` 本就未使用 |
| D6 | `tsconfig` 用 `module: ESNext` + `moduleResolution: Bundler`, TypeScript `^5.9.3` | `Node16`/`NodeNext` 下从 CJS 上下文 import 纯 ESM 会报 TS1479 |
| D7 | 纯逻辑与 vscode 胶水分离: `core.ts` / `transforms.ts` / `block.ts` / `advanced.ts` 不 import vscode | 用 mocha 直接测试, 不需要 `@vscode/test-electron` |
| D8 | 对齐核心通过参数接收 `eol` 与 `tabSize` | 去掉对 vscode 的依赖, 行为不变 |
| D9 | **重写 `Block.align()` 为分层列对齐**(§6.4) | 用户要求; 匹配数一致时结果与上游完全相同 |
| D10 | 跨行大小写转换按 `document.eol` 分行, 不用 `os.EOL` | 用户确认; 修复"平台 EOL 与文档 EOL 不一致时整块切不开" |
| D11 | **不声明 `contributes.keybindings`** | 用户要求; 改为三条命令接受参数, 由用户自行绑定 |
| D12 | 命令精简为 5 条 + 统一的二级 Quick Pick(§6.3) | 用户要求; 16 条大小写命令折叠为 `textToolkit.changeCase` + `style` 参数 |
| D13 | 配置分两层: 7 个暴露键 + `textToolkit.advanced` 单对象增量覆盖(§6.2) | 用户要求; 设置界面不出现几十个键 |
| D14 | `advanced` 内 `plainText.editorOverrides` 用 `null` 表示**移除**内置覆盖 | 让用户能把某个被关掉的编辑器功能放回去 |
| D15 | 界面双语: `package.nls*.json`(声明式) + `l10n/bundle.l10n.zh-cn.json`(运行时 `vscode.l10n.t`) | 用户要求 |
| D16 | 纯文本模式用"切 `plaintext` 语言 + `[plaintext]` 语言作用域设置覆盖"实现, 退出时还原 | 语言作用域保证不影响代码文件 |
| D17 | `activationEvents: ["onStartupFinished"]` | 大文件提示需在命令被调用之前生效 |
| D18 | 行引用语法: `a` / `a-b` / `a-b,c-d`, 可选 `a+n`(默认关闭, 放内置层) | 用户指定语法 |
| D19 | 默认值 `copyPath.pathStyle: absolute`, `plainText.promptSizeMB: 2` | 用户指定 |
| D20 | 图标自绘 SVG + 自写光栅化脚本(`npm run icon`)产出 256×256 PNG | `qlmanage` 会烧进投影与留白; 环境无其他 SVG 转换工具 |
| D21 | 许可 MIT, 附 `THIRD_PARTY_NOTICES.md` 收录三个上游与 `change-case` 的声明 | 三方许可要求 |

## 5. 目标结构

```
editor-text-toolkit/
├── package.json / package.nls.json / package.nls.zh-cn.json
├── l10n/bundle.l10n.zh-cn.json          # 运行时文案
├── build.mjs                            # esbuild: 扩展 bundle + 测试 bundle
├── scripts/render-icon.mjs              # npm run icon, 不打包进 vsix
├── media/icon.png · icon.svg
├── README.md / CHANGELOG.md / LICENSE.txt / THIRD_PARTY_NOTICES.md
└── src/
    ├── extension.ts                     # activate: 注册四块 feature + 菜单
    ├── shared/  advanced.ts(纯) · config.ts · quickPick.ts
    ├── features/copyPath/     core.ts(纯) · command.ts
    ├── features/changeCase/   transforms.ts(纯) · wordRange.ts · command.ts
    ├── features/alignByRegex/ block.ts · stringUtils.ts · line.ts · part.ts(纯) · command.ts
    ├── features/plainText/    core.ts(纯) · settings.ts · command.ts
    ├── features/menu/         command.ts  # 一级分类 → 二级动作
    └── test/  copyPath.core · changeCase.transforms · alignByRegex.block · plainText.core · advanced
```

## 6. 接口与数据契约

### 6.1 命令(5 条, category `Text Toolkit`)

| 命令 ID | 参数(供用户自建快捷键) |
| --- | --- |
| `textToolkit.commands` | — (二级 Quick Pick 入口) |
| `textToolkit.copyPathWithLines` | `{ pathStyle: absolute \| relative \| tilde \| fileName }` |
| `textToolkit.changeCase` | `{ style: <16 种风格之一> }`; 无参时弹风格选择器 |
| `textToolkit.alignByRegex` | `{ regex }` 或 `{ template }`; 无参时弹输入框 |
| `textToolkit.plainText.toggle` | — |

菜单: `editor/context` 仅 `textToolkit.copyPathWithLines`(`when: editorTextFocus`, group `copy`)。快捷键: 无。

### 6.2 配置两层

**暴露层(7 个键)**: `copyPath.pathStyle`(默认 `absolute`), `copyPath.separator`(`:`), `copyPath.multiLineFormat`(`range`), `alignByRegex.templates`(`{}`), `plainText.promptSizeMB`(`2`), `plainText.autoApplyExtensions`(`[]`), `advanced`(`{}`)。

**内置层(只通过 `textToolkit.advanced` 增量覆盖)**:

| 键 | 内置默认 |
| --- | --- |
| `copyPath.useLineCountSyntax` | `false` |
| `changeCase.includeDotInCurrentWord` | `false` |
| `alignByRegex.rememberLastInput` | `true` |
| `plainText.applyEditorSettings` | `true` |
| `plainText.disableLineNumbers` | `false` |
| `plainText.editorOverrides` | 29 项 `editor.*` 覆盖表(见 `src/shared/advanced.ts`) |

解析规则(`resolveAdvanced`): 只有显式设置的键被改变; 类型不符或未知的键**忽略并保留内置默认值**, 不抛异常; `editorOverrides` 与内置表做浅合并, 值为 `null` 时**删除**该项。

### 6.3 行引用语法与二级 Quick Pick 规则

行号从所有选区收集 → 去重 → 升序 → 连续行合并为片段:

| 写法 | 含义 | 何时出现 |
| --- | --- | --- |
| `path:a` | 单行 | 两种片段写法下都相同 |
| `path:a-b` | 闭区间 | `useLineCountSyntax = false`(默认) |
| `path:a+n` | 从 `a` 起 `n` 行 | `useLineCountSyntax = true` |
| `path:a-b,c-d` | 多片段 | 多光标或多选区; 两种写法都用 `,` 连接 |

`multiLineFormat` 决定整体形态: `range` 输出片段, `list` 逐个行号, `perLine` 每行一条完整引用。片段写法只影响 `range`。

二级 Quick Pick 规则(四个分类共用 `shared/quickPick.ts`):

- 一级只列分类, 每项 description 显示该分类当前生效的关键设置, 一级本身不执行动作;
- 二级首项固定为 `← Back`, 选中后回到一级并重新渲染(设置可能已变);
- 任意层 `Esc` 结束整个流程, 不做任何修改;
- 二级内容: Copy Path 列四种路径风格(一次性使用, 不写回配置) / Change Case 列 16 种风格(单行单选区时带转换预览) / Align 列"输入正则"与全部已保存模板 / Plain Text 列开关(随当前状态变化)与"重新启用大文件提示"。

### 6.4 对齐算法(核心修复, 唯一权威规格)

一行 `m` 个匹配 → `2m+1` 个 part: 偶数下标是文本, 奇数下标是匹配到的分隔符, 下标 `2m` 是行尾文本(**永不填充**)。

```
align(tabSize):
  for j = 0 .. maxMatches-1:
      active = 匹配数 >= j+1 的行        # 该列之后仍有匹配的行
      if active.length < 2: continue    # 无对齐对象, 该列原样保留
      把 active 的 text[j] 与 sep[j] 分别补齐到 active 内的最大列宽
```

与需求的对应: 设 `N = min(各行匹配数)`, 则 `j < N` 时 active 是全部行(先按最小匹配数整体对齐); `j >= N` 起匹配用尽的行自动离开 active, 其内容不再被修改(前 N 个匹配保持不动); 后续列只在仍有匹配的行之间对齐, 直到覆盖所有匹配。

正确性依据: `active(j) ⊆ active(j-1) ⊆ … ⊆ active(0)`, 每步对当前 active **全体**施加同一目标宽度, 故 active 内各行前缀宽度恒等, 逐 part 取最大宽度等价于真正的列对齐。

相对上游的差异: 列宽只在"其后仍有匹配"的行之间统计, 行尾文本不参与; 某列只有一行匹配时不填充; **匹配数一致的输入输出与上游逐字符相同**。

基准用例(正则 `=`, tabSize 4, 已实测):

| 输入 | 上游 | 本实现 |
| --- | --- | --- |
| `x = 111111111;` / `yy = 2; zzz = 3;` / `w = 4; vvvvv = 5;` | 第 2, 3 行第二列各多 1 空格 | `x  = 111111111;` / `yy = 2; zzz   = 3;` / `w  = 4; vvvvv = 5;` |
| `x = 111111111;` / `yy = 2; zzz = 3;` | `yy = 2; zzz    = 3;` | `yy = 2; zzz = 3;` |
| `a = 9999999999;` / `b = 1, c = 2, d = 3;` / `e = 11, f = 22, g = 33;` | `b = 1, c       = 2, d  = 3;` | `b = 1, c  = 2, d  = 3;` |
| 匹配数一致 / 含无匹配行 / 多列一致 | — | 与上游相同(等价性回归) |

### 6.5 大小写风格映射(16 种)

`change-case@5` 直接支撑 10 种: camel, constant, dot, kebab, no, param(= kebab), pascal, path, sentence, snake, title(= `capitalCase`)。本地实现 6 种: lower, upper, lowerFirst, upperFirst, swap, 以及 param 复用 kebab。

命令行为: 空选区作用于"change-case 专用词范围"(允许 `_ - / $`, 是否含 `.` 由内置层开关决定); 单行选区整段转换; 跨行选区按 `document.eol` 逐行转换; 编辑后按结束位置累加同行偏移量重建多光标选区。

### 6.6 纯文本模式契约

- 进入: `setTextDocumentLanguage(doc, 'plaintext')` + (可选)按 `[plaintext]` 语言作用域写入生效后的覆盖表; 逐键 try/catch, 记录原值(含"原本未设置", 以 `null` 哨兵持久化到 `globalState`)。
- 退出: 还原语言, 行号显示与全部设置原值; 仅当没有任何文档仍处于该模式时才还原设置。
- 触发: 手动命令 / 打开文件体积 ≥ `promptSizeMB` 时询问一次(可"不再询问") / 命中 `autoApplyExtensions` 直接进入。
- 写入目标: 有工作区写 Workspace 设置, 否则写 User 设置。
- **能力边界**: 只降低渲染与语言服务开销; 不改变 `TextModel` 加载与文件内查找实现, 因此 5–50 MB 区间体感明显, 数百 MB 无量级变化; 不修改 `files.maxMemoryForLargeFilesMB`。

### 6.7 构建与本地化契约

- `build.mjs`: 扩展入口 `src/extension.ts` → `out/extension.js`(`bundle`, `platform: node`, `format: cjs`, `target: node18`, `external: ['vscode']`, `--production` 时 minify 且不产 sourcemap); `--test` 时把 5 个测试入口打包到 `out/test/`; `--watch` 走 esbuild context watch。
- 脚本: `compile` / `watch` / `typecheck` / `build:test` / `test` / `icon` / `package` / `vscode:prepublish`(`vsce package` 自动触发生产构建, `package` 不重复构建)。
- 本地化: 声明式文案走 `%key%` + `package.nls.json` / `package.nls.zh-cn.json`; 运行时文案以英文原串为 key 走 `vscode.l10n.t` + `l10n/bundle.l10n.zh-cn.json`。新增语言只需按 locale 后缀增文件。
- `.vscodeignore` 排除 `src/`, `scripts/`, `out/test/`, sourcemap, `node_modules/`, `build.mjs`, `tsconfig.json`, `.vscode/`。

## 7. 实施步骤

> 依赖顺序: S1 → S2 →(S3, S4, S5, S6 可并行)→ S7 → S8 → S9 → S10。

- [x] **S1 脚手架与构建链**: 目录骨架, `package.json`, `tsconfig.json`, `build.mjs`, `.vscodeignore`, `.gitignore`, `.vscode/*`, 图标与许可。判据: `npm i` 成功, `npm run compile` 产出 `out/extension.js`, `typecheck` 通过。
- [x] **S2 共享层**: `shared/advanced.ts`(内置层默认值与 `resolveAdvanced` / `mergeEditorOverrides`), `shared/config.ts`(暴露层读取 + advanced 访问 + tabSize 回退), `shared/quickPick.ts`(统一 `← Back` 与菜单展示)。判据: 纯模块不 import vscode; 类型检查通过。
- [x] **S3 copyPath**: `core.ts` 按 §6.3 实现行号收集, 片段切分与两种片段写法; `command.ts` 实现路径解析与命令(支持 `pathStyle` 参数)。判据: 与上游编译产物逐分支对照一致; 片段与 `a+n` 用例通过。
- [x] **S4 changeCase**: `transforms.ts` 建立 16 项映射(§6.5); `wordRange.ts` 移植专用词范围; `command.ts` 实现转换, 选区重建, 风格选择器与 `style` 参数, 并修正上游三处缺陷。判据: 16 项 label 与顺序固定; 转换结果与实测基线一致。
- [x] **S5 alignByRegex**: 移植 `part/line/stringUtils/block` 的构造与 `trim`(算法不变, 参数化 `eol`/`tabSize`), **按 §6.4 重写 `align()`**; `command.ts` 实现输入, 模板解析, 行范围计算与逐行替换, 支持 `regex`/`template` 参数。判据: §6.4 用例矩阵与上游测试移植全部通过; 纯模块无 vscode 依赖。
- [x] **S6 plainText**: `core.ts`(扩展名匹配, 体积阈值, 体积格式化), `settings.ts`(语言作用域覆盖的写入与还原), `command.ts`(管理器, 状态栏, 询问一次, 开关命令与二级菜单)。判据: 覆盖表来自内置层合并结果; 原值可还原。
- [x] **S7 装配与菜单**: `features/menu/command.ts` 实现一级分类与二级派发(§6.3); `extension.ts` 注册 5 条命令并把纯文本模式的能力对象交给菜单。判据: 命令面板 5 条, 无重复 ID。
- [x] **S8 双语与文档**: `package.nls*.json`, `l10n/bundle.l10n.zh-cn.json`, README(命令表, 两层配置, 行引用语法, 对齐修复对比, 纯文本模式边界, 迁移表, 行为变更), CHANGELOG, `THIRD_PARTY_NOTICES.md`。判据: 校验脚本核对占位符与运行时字符串双向无缺漏。
- [x] **S9 测试与打包**: 5 个测试文件接入 `build.mjs --test`; `npm run package` 全链路通过。判据: 见 §8.1。
- [x] **S10 收尾**: 清理构建中间产物; 三份参考输入未被改动。
- [ ] **S11 手工 GUI 验收**: 按 §8.2 在扩展宿主中逐项验证。判据: 清单全部通过。**未执行(需 GUI)**。

### 7.1 有意的行为变更(已写入 README 与 CHANGELOG)

1. `sentence` 会大写首字母(上游 `sentence-case@2` 为全小写)。
2. `title` 映射到 `capitalCase`, 每个词首字母都大写(上游对 `a`/`of`/`the` 等小词保持小写)。
3. 字母与数字边界不再切分: `fooBarBaz42Quux` → `foo bar baz42 quux`。
4. 对齐在"各行匹配数不一致"时的列宽变化(§6.4); 匹配数一致时不变。
5. 跨行大小写转换按 `document.eol` 分行(上游用 `os.EOL`)。

非行为变更的修正: 命令 ID 与配置键全部更名; `includeDotInCurrentWord` 首次真正生效(移入内置层); QuickPick 取消, 无编辑器与 options 未传入三处缺陷修复; 对齐选区跨到下一行行首时不再构造非法范围; 不再占用任何快捷键。

## 8. 验证方式

### 8.1 自动化与静态检查(已执行)

| 检查 | 结果 |
| --- | --- |
| `npm run typecheck` | 通过 |
| `npm test` | **131 passing** |
| `npm run package` | `editor-text-toolkit-0.0.1.vsix`, 13 文件 / 31.54 KB, `out/extension.js` 22.1 KB |
| `rg -n "from 'vscode'"` 于全部纯模块 | 无命中(D7) |
| `rg -n "lodash\|maxNrParts" src/` | 无命中(D5, D9) |
| `rg -c 'require\("change-case"\)' out/extension.js` | 无命中; unicode 属性正则命中 → ESM 已内联(不可用符号名 grep, 生产构建会 minify) |
| 清单校验脚本 | 无 keybindings; 5 命令; 7 暴露键; 6 内置键; `dependencies` 为空 |
| 本地化校验脚本 | 26 个 `%key%` 与 43 条运行时字符串在中英文两侧均无缺漏, 无冗余条目 |
| 参考输入是否被改动 | 未改动 |

### 8.2 手工验收清单(需扩展宿主, **未执行**)

- [ ] 命令面板 `Text Toolkit` 下只出现 5 条命令; 未出现任何旧 ID。
- [ ] 二级 Quick Pick: 一级四个分类的 description 显示当前设置; 二级 `← Back` 回到一级; `Esc` 全程取消不改动任何内容。
- [ ] 复制引用: 单行, 连续多行, 多光标离散行三种情况; 四种路径风格; 打开 `copyPath.useLineCountSyntax` 后输出 `a+n`; 未保存文档给出提示。
- [ ] 大小写: 单词预览; 光标在 `foo_bar.baz` 中间时点号开关的差异; 多光标转换后选区仍准确; 跨行选区行数不变。
- [ ] 对齐: `=` 对齐; 模板名对齐; §6.4 基准用例逐字符一致; 非法正则无变化; CRLF 文件行尾未被破坏。
- [ ] 纯文本模式: 开关生效, 状态栏可点击退出; ≥2 MB 文件弹出询问且"不再询问"生效; **进入再退出后 `settings.json` 的 `[plaintext]` 段落回到原样(原本没有该段落时应消失)**。
- [ ] 显示语言切换为简体中文后, 命令标题, 设置说明, 提示与选择器文案均为中文。

## 9. 风险与未决项

| 风险 | 缓解 |
| --- | --- |
| copyPath 源码是从编译产物反写的, 可能行为漂移 | §2.1 记录了逐函数分支; 单测覆盖全部分支 |
| `change-case@5` 纯 ESM, 直接 require 会在宿主崩溃 | 强制 esbuild 打包; 用 `require("change-case")` 0 命中 + 测试实际调用双重验证 |
| 对齐算法重写引入回归 | 等价性回归用例锁定"匹配数一致时与上游逐字符相同" |
| 纯文本模式会写入用户设置 | 只写 `[plaintext]` 语言作用域; 原值(含"未设置")记录并在退出时还原; 边界写入 README |
| 语言作用域可覆盖的设置随版本变化 | 逐键 try/catch, 失败键只记日志, 不影响其他键 |
| 命令 ID 与配置键全部更名 | README 迁移表 + CHANGELOG 明示 breaking |
| 新增语言时漏翻译 | 保留校验思路: 比对 `%key%` 与 `l10n.t` 源串两侧集合 |

**未决项(非阻塞)**: 是否发布 Marketplace; 是否实现行引用的**反向解析**(粘贴 `path:12+3` 跳转并选中对应行, 需要新增解析器与命令); 大文件方案 B/C 是否推进(取决于目标文件量级与是否需要就地编辑)。

**阻塞项: 无。**

## 10. 执行记录

### 2026-08-04 首轮实施(S1–S10)

- 首轮完成三块功能合并 + 对齐算法重写, `npm test` 98 passing, 打包成功。
- 实施中修正: `tabAwareLength` 改回按 UTF-16 code unit 计数(初版 `for...of` 按 code point 会让代理对字符列宽偏差); 修正测试对"非法正则"的期望(应为 `Block.lines` 为空); `THIRD_PARTY_NOTICES.md` 的 `change-case` 段落按包元数据(MIT, Blake Embrey)撰写, 因发布包不含 LICENSE 文件, 未编造版权年份; 对齐命令补 `endLine < start.line` 提前返回。

### 2026-08-04 追加(用户确认的变更)

1. `changeCase` 跨行分行从 `os.EOL` 改为 `document.eol`(D10), §6.5 与 §7.1 同步。
2. 新增"纯文本模式(大文件)"方案 A(D16, D17), 含 29 项语言作用域覆盖与还原机制; 方案 B/C 未实施。
3. 图标重做(D20): 自绘 SVG(左侧长度不一的正文 + 中间对齐列 + 右侧同列起始 + 行号槽), 自写光栅化脚本产出 256×256 PNG; 版本改为 `0.0.1`; vsix 体积从 222 KB 降到 24 KB(旧图标 PNG 占 92%)。
4. 去掉全部默认快捷键(D11), 命令精简为 5 条并新增二级 Quick Pick(D12), 配置改为两层(D13, D14), 界面支持英语与简体中文(D15)。`npm test` 120 passing。
5. 默认值改为 `pathStyle: absolute` 与 `promptSizeMB: 2`(D19); 行引用支持多片段与可选 `a+n` 语法(D18, 默认关闭, 放内置层)。`npm test` 131 passing, 重新打包为 31.54 KB。
6. 打包清单修正: 首次打包误将 `scripts/render-icon.mjs` 打入 vsix, 已加入 `.vscodeignore`。

### 未验证范围

纯逻辑, 类型检查, 打包链与文案一致性均已自动化验证; **命令层(vscode API 胶水)与双语界面从未在扩展宿主中运行过**, §8.2 清单需用户在 GUI 中执行。
