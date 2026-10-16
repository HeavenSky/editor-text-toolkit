# 复制路径与行号

[English](../../docs/copy-path.md) · **简体中文**

本页说明怎样控制 `复制路径与行号` 写进剪贴板的引用格式；文件必须已保存到磁盘。

在编辑器右键菜单、选择器或命令面板里执行 `文本工具箱: 复制路径与行号`：

```text
src/features/diff/core.ts:112-118
```

## 选择路径的写法

`textToolkit.copyPath.pathStyle` 决定路径部分。选择器还把每种写法都列成一次性选项，选用时不改设置；快捷键传入 `{ "pathStyle": "relative" }` 效果相同。

| 写法 | 结果 |
| --- | --- |
| `absolute`（默认） | `/Users/you/project/src/app.ts` |
| `relative` | `src/app.ts`；没有工作区文件夹包含该文件时回退为绝对路径 |
| `tilde` | `~/project/src/app.ts`；只有文件位于 home 目录下时才替换前缀 |
| `fileName` | `app.ts` |

## 选择行号的写法

行号取自每个光标和选区，去重、排序后，连续的行合并成一个片段。`textToolkit.copyPath.multiLineFormat` 决定输出形状。以选中第 3、4、8、12、13、14 行为例：

| 格式 | 输出 |
| --- | --- |
| `range`（默认） | `path:3-4,8,12-14` |
| `list` | `path:3,4,8,12,13,14` |
| `perLine` | `path:3`、`path:4`……每行一条 |

想把片段写成「起始行 + 行数」，打开 `a+n` 写法。同样的选区会复制成 `path:3+2,8,12+3`；单行仍写作 `a`，`list` 与 `perLine` 不受影响，因为它们不产生片段。

```json
{ "textToolkit.advanced": { "copyPath.useLineCountSyntax": true } }
```

## 修改分隔符

`textToolkit.copyPath.separator` 可以把路径与行号之间的 `:` 换成任意字符串；设为 `#L` 时引用写作 `app.ts#L3-4`。

未命名文档和没有对应文件的文档（例如输出面板）无法复制，见[故障排查](troubleshooting.md#当前文档尚未保存为文件)。
