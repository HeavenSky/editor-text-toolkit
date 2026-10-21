# 转换大小写风格

[English](../../docs/change-case.md) · **简体中文**

本页列出 `转换大小写风格...` 提供的 16 种风格，并说明它怎样决定转换哪段文本；有选区或光标停在词上即可使用。

## 预览后再选风格

`文本工具箱: 转换大小写风格...` 打开风格选择器，一次转换全部选区。选区只有一行时，每一项都会预览转换结果，确认前就能看到效果。

![转换大小写风格时预览每种风格的结果](../../media/screenshots/change-case.png)

想跳过选择器，就绑定一个带风格参数的快捷键，例如 `{ "style": "kebab" }`，见[查找命令与绑定快捷键](commands-and-keybindings.md#带参数绑定快捷键)。

## 16 种风格

以输入 `fooBar baz-qux` 为例：

| 风格         | 结果              | 说明                   |
| ------------ | ----------------- | ---------------------- |
| `camel`      | `fooBarBazQux`    |                        |
| `pascal`     | `FooBarBazQux`    |                        |
| `snake`      | `foo_bar_baz_qux` |                        |
| `constant`   | `FOO_BAR_BAZ_QUX` |                        |
| `kebab`      | `foo-bar-baz-qux` |                        |
| `param`      | `foo-bar-baz-qux` | `kebab` 的别名         |
| `dot`        | `foo.bar.baz.qux` |                        |
| `path`       | `foo/bar/baz/qux` |                        |
| `no`         | `foo bar baz qux` | 小写，空格分隔         |
| `sentence`   | `Foo bar baz qux` | 首字符大写             |
| `title`      | `Foo Bar Baz Qux` | 每个词首字母大写       |
| `lower`      | `foobar baz-qux`  | 整串转小写，分隔符不动 |
| `upper`      | `FOOBAR BAZ-QUX`  | 整串转大写，分隔符不动 |
| `lowerFirst` | `fooBar baz-qux`  | 只改首字符             |
| `upperFirst` | `FooBar baz-qux`  | 只改首字符             |
| `swap`       | `FOObAR BAZ-QUX`  | 每个字符大小写互换     |

## 怎样算光标所在的词

没有选区时转换光标所在的词，而且这个词比编辑器自己的定义更宽：`_`、`-`、`/` 和 `$` 始终算作词字符，所以 `foo_bar-baz` 会整体转换。`.` 默认不算；打开下面这项后，光标停在 `foo_bar.baz` 里会转换整串，而不只是 `baz`：

```json
{ "textToolkit.advanced": { "changeCase.includeDotInCurrentWord": true } }
```

多行选区按文档自身的换行符切分，所以 Windows 上的 LF 文件也不会被并成一行。
