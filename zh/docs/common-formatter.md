# 使用已安装的 CLI 格式化文档

[English](../../docs/common-formatter.md) · **简体中文**

系统中已经装好格式化工具时，阅读本页将它接入 VS Code 的文档格式化和保存时格式化流程。

## 接入格式化工具

命令必须从 stdin 读取文档，并且只把格式化后的文本写入 stdout。
例如，Prettier 已安装且扩展宿主可以找到它时，在 `settings.json` 中添加：

```json
{
	"commonFormatter.list": [
		{
			"name": "Prettier",
			"languages": ["javascript", "typescript", "json"],
			"command": "prettier",
			"args": ["--stdin-filepath", "${file}"]
		}
	],
	"[typescript]": {
		"editor.defaultFormatter": "HeavenSky.editor-text-toolkit",
		"editor.formatOnSave": true
	}
}
```

打开 TypeScript 文件后保存，或执行 `文本工具箱: 使用 CLI 格式化文档`。
CLI 收到的是编辑器当前文本，包括尚未保存的修改。
扩展通过 VS Code 应用返回的文本，因此可以撤销格式化。
扩展不会为格式化工具附加原地写入参数。

工具箱选择器中的 **通用格式化** 菜单提供格式化文档、打开设置和显示格式化输出三个动作。
空列表会关闭格式化 Provider。
完整的字段定义和默认值可在设置编辑器的 `commonFormatter.list` 中直接查看；在 `settings.json` 里输入时每个字段都有补全。

## 确定执行哪个命令

执行第一条启用且 `languages` 包含文档当前 VS Code language ID 的配置。
列表表示优先级，不是命令流水线：命令不存在或执行失败时，不会尝试下一项。
名称必须在有效列表内唯一。

用户、工作区和工作区文件夹设置遵循 VS Code 的优先级；高优先级数组整体替换低优先级列表。
扩展按待格式化文档读取设置。
因此，多根工作区的每个文件夹可以使用不同列表。

`command` 是可执行文件名或路径；`args` 的每个元素都是一个完整参数，即使其中包含空格。
不必为保护空格给 `${file}` 再套引号，也不要在 `command` 中填写 shell 管道。
扩展不展开 alias、shell function、`~` 或 `$NAME`；请分别使用可执行文件、`${userHome}` 和 `${env:NAME}`。

默认工作目录是文件所在目录。
相对 `cwd` 以文档所属工作区文件夹为基准；文档不属于工作区时，以文件目录为基准。
包含路径分隔符的相对命令路径，以解析后的 `cwd` 为基准。
只有可执行文件名时，使用最终子进程环境的 `PATH` 查找。
扩展不会安装命令，也不会使用 `--version` 探测命令。

## 使用变量和平台覆盖

变量名沿用 [VS Code 变量规范](https://code.visualstudio.com/docs/reference/variables-reference)。
文件变量始终绑定待格式化文档，即使此时焦点已移到其他编辑器。

- 文件路径：`${file}`、`${fileBasename}`、`${fileBasenameNoExtension}`、`${fileExtname}`、`${fileDirname}`、`${fileDirnameBasename}`。
- 工作区路径：`${workspaceFolder}`、`${workspaceFolderBasename}`、`${fileWorkspaceFolder}`、`${relativeFile}`、`${relativeFileDirname}`、`${workspaceFolder:Name}`。
- 宿主值：`${userHome}`、`${pathSeparator}`、`${/}`、`${env:NAME}`。
- VS Code 设置：`${config:setting.name}`，接受字符串、数字和布尔值。

变量可以用于 `command`、`args` 的元素、`cwd` 和 `env` 的字符串值。
字段名、名称和 language ID 不做替换。
同一变量每次请求只求值一次，替换后的值不会再次展开。
未知变量、缺失值、嵌套表达式或所需工作区上下文不可用时，会报告配置名称和出错字段。
不支持 `${input:...}`、`${command:...}` 等交互变量，也不支持依赖光标的变量。

环境覆盖继承扩展宿主环境，`null` 表示移除变量。
`${env:NAME}` 始终读取继承环境，不读取同一项中其他覆盖后的值。
例如：

```json
{
	"commonFormatter.list": [
		{
			"name": "My formatter",
			"languages": ["typescript"],
			"command": "${userHome}/tools/my-formatter",
			"args": ["--stdin-filepath", "${file}"],
			"cwd": "${workspaceFolder}",
			"env": {
				"FORMATTER_CONFIG": "${workspaceFolder}/config/formatter.json",
				"UNUSED_VARIABLE": null
			},
			"windows": { "command": "my-formatter.cmd" }
		}
	]
}
```

`windows`、`linux` 和 `osx` 按扩展宿主操作系统覆盖执行字段。
覆盖 `args` 时整体替换数组；`env` 按键合并。
使用 Remote SSH、WSL 或容器时，请在对应环境内安装 CLI，并使用该环境可见的路径。
扩展需要 Node 扩展宿主，纯浏览器工作区无法用它启动本地进程。

## 排查格式化失败

执行 `文本工具箱: 显示格式化输出`，查看配置名称、无效字段或进程错误，以及 stderr 诊断。
日志不记录文档文本、stdout 或环境变量值。
请避免让 CLI 将凭据打印到诊断中。

找不到命令时，检查扩展宿主环境是否能找到它，或配置其绝对路径。
集成终端的 shell 启动文件可能修改 `PATH`，因此终端环境不一定与扩展宿主相同。
格式化超时时，可以调整该项以毫秒计的 `timeout`，或处理工具启动和配置查找耗时。
相同错误在设置刷新前只弹窗一次，诊断仍会持续写入日志。

退出码 `0` 表示成功；仅有 stderr 不代表失败。
空 stdout 是合法的空文档。
stdout 超过 32 MiB 会终止进程；stderr 持续排空，但只保留前 64 KiB。
取消请求、关闭或修改文档，以及同一文档的新请求，都会丢弃旧结果。

CLI 执行需要受信任的工作区；受限模式下仍可使用其他工具箱功能。
仅支持具有文件路径的文档，不支持 Untitled 文档、虚拟比较文档和选区格式化。
纯文本模式按文档当前的 `plaintext` 语言匹配，不使用进入模式前的语言。
