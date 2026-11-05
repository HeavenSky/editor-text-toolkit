// 将 VS Code 风格变量按待格式化文档上下文替换为进程参数.
import * as path from "node:path";
import { mergeEnvironment, type FormatterInvocation, type FormatterRule } from "./config";

export interface VariableContext {
	file: string;
	workspaceFolder?: string;
	workspaceFolders: readonly { name: string; path: string }[];
	userHome: string;
	env: NodeJS.ProcessEnv;
	platform: NodeJS.Platform;
	getConfiguration(name: string): unknown;
}

export function resolveFormatter(
	rule: FormatterRule,
	context: VariableContext
): FormatterInvocation {
	const paths = context.platform === "win32" ? path.win32 : path.posix;
	const cache = new Map<string, string>();
	const requireWorkspace = (): string => {
		if (!context.workspaceFolder) throw new Error("当前文件不属于工作区文件夹");
		return context.workspaceFolder;
	};
	const evaluate = (name: string): string => {
		const cached = cache.get(name);
		if (cached !== undefined) return cached;
		let value: unknown;
		switch (name) {
			case "file":
				value = context.file;
				break;
			case "fileBasename":
				value = paths.basename(context.file);
				break;
			case "fileBasenameNoExtension":
				value = paths.basename(context.file, paths.extname(context.file));
				break;
			case "fileExtname":
				value = paths.extname(context.file);
				break;
			case "fileDirname":
				value = paths.dirname(context.file);
				break;
			case "fileDirnameBasename":
				value = paths.basename(paths.dirname(context.file));
				break;
			case "workspaceFolder":
			case "fileWorkspaceFolder":
				value = requireWorkspace();
				break;
			case "workspaceFolderBasename":
				value = paths.basename(requireWorkspace());
				break;
			case "relativeFile":
				value = paths.relative(requireWorkspace(), context.file);
				break;
			case "relativeFileDirname":
				value = paths.dirname(paths.relative(requireWorkspace(), context.file));
				break;
			case "userHome":
				value = context.userHome;
				break;
			case "pathSeparator":
			case "/":
				value = paths.sep;
				break;
			default:
				if (name.startsWith("workspaceFolder:")) {
					const matches = context.workspaceFolders.filter(
						folder => folder.name === name.slice(16)
					);
					if (matches.length !== 1)
						throw new Error(`工作区文件夹不存在或名称不唯一: ${name.slice(16)}`);
					value = matches[0].path;
				} else if (name.startsWith("env:")) {
					const key = Object.keys(context.env).find(key =>
						context.platform === "win32"
							? key.toLowerCase() === name.slice(4).toLowerCase()
							: key === name.slice(4)
					);
					value = key === undefined ? undefined : context.env[key];
				} else if (name.startsWith("config:") && name.length > 7) {
					value = context.getConfiguration(name.slice(7));
				} else {
					throw new Error(`不支持的变量: \${${name}}`);
				}
		}
		if (!["string", "number", "boolean"].includes(typeof value))
			throw new Error(`变量无法解析为标量: \${${name}}`);
		const result = String(value);
		if (result.includes("\0")) throw new Error(`变量包含 NUL: \${${name}}`);
		cache.set(name, result);
		return result;
	};
	const replace = (input: string, field: string): string => {
		try {
			const variables = input.matchAll(/\$\{([^{}]*)\}/g);
			const remaining = input.replace(/\$\{[^{}]*\}/g, "");
			if (remaining.includes("${")) throw new Error("变量语法错误或包含嵌套变量");
			for (const match of variables) evaluate(match[1]);
			return input.replace(/\$\{([^{}]*)\}/g, (_match, name: string) => evaluate(name));
		} catch (error) {
			throw new Error(
				`${rule.name}.${field}: ${error instanceof Error ? error.message : String(error)}`,
				{ cause: error }
			);
		}
	};
	const base = context.workspaceFolder ?? paths.dirname(context.file);
	const cwd = paths.resolve(base, replace(rule.cwd, "cwd"));
	const command = replace(rule.command, "command");
	if (!command.trim()) throw new Error(`${rule.name}.command: 解析结果不能为空`);
	const env = Object.fromEntries(
		Object.entries(rule.env).map(([key, value]) => [
			key,
			value === null ? null : replace(value, `env.${key}`),
		])
	);
	return {
		command: /[/\\]/.test(command) ? paths.resolve(cwd, command) : command,
		args: rule.args.map((arg, index) => replace(arg, `args[${index}]`)),
		cwd,
		env: mergeEnvironment(context.env, env, context.platform),
		timeout: rule.timeout,
	};
}
