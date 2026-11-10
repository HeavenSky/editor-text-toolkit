import * as vscode from "vscode";
import type { MultiLineFormat } from "../features/copyPath/core";
import { DEFAULT_LARGE_FILE_LIMIT_MB } from "../features/plainText/core";
import {
	ADVANCED_KEYS,
	resolveAdvanced,
	type AdvancedSettings,
	type ResolvedKeys,
} from "./advanced";

export type PathStyle = "absolute" | "relative" | "tilde" | "fileName";

export interface CopyPathConfig {
	pathStyle: PathStyle;
	separator: string;
	multiLineFormat: MultiLineFormat;
}

/** 暴露层: 在 package.json 中各自声明的常用配置键. */
export function getCopyPathConfig(): CopyPathConfig {
	const config = vscode.workspace.getConfiguration("textToolkit.copyPath");
	return {
		pathStyle: config.get<PathStyle>("pathStyle", "absolute"),
		separator: config.get<string>("separator", ":"),
		multiLineFormat: config.get<MultiLineFormat>("multiLineFormat", "range"),
	};
}

export function getAlignTemplates(): Record<string, string> {
	return vscode.workspace
		.getConfiguration("textToolkit.alignByRegex")
		.get<Record<string, string>>("templates", {});
}

export interface PlainTextPromptConfig {
	promptSizeMB: number;
	autoApplyExtensions: string[];
}

export function getPlainTextPromptConfig(): PlainTextPromptConfig {
	const config = vscode.workspace.getConfiguration("textToolkit.plainText");
	return {
		promptSizeMB: config.get<number>("promptSizeMB", 2),
		autoApplyExtensions: config.get<string[]>("autoApplyExtensions", []),
	};
}

/**
 * 文件超过它就不再显示在编辑器里, 而是换成"文件过大"占位页.
 * VS Code 自己的设置, 我们只读: 用它判断某个标签页是不是打不开的大文件.
 */
export function getLargeFileLimitMB(resource: vscode.Uri): number {
	const value = vscode.workspace
		.getConfiguration("workbench", resource)
		.get<number>("editorLargeFileConfirmation");
	return typeof value === "number" && value > 0 ? value : DEFAULT_LARGE_FILE_LIMIT_MB;
}

export type ClipboardSide = "left" | "right";

export interface DiffConfig {
	clipboardSide: ClipboardSide;
	/** 原始值; 校验与丢弃非法条目由 features/diff/core.ts 的 loadRules 负责. */
	normalizationRules: unknown;
}

/**
 * 不含 `textToolkit.diff.contextMenu`: 它只被 package.json 里 editor/context 的 `when`
 * 子句消费, 运行时无需读取. 它保持单个枚举而不是拆成每条命令一个布尔顶层键, 是因为
 * `when` 子句按 `config.textToolkit.diff.contextMenu` 读取嵌套属性, 拆开后要同时改
 * 3 处菜单声明; 这里运行时只读同组的 clipboardSide.
 */
export function getDiffConfig(): DiffConfig {
	const config = vscode.workspace.getConfiguration("textToolkit.diff");
	return {
		clipboardSide: config.get<ClipboardSide>("clipboardSide", "left"),
		normalizationRules: config.get<unknown>("normalizationRules", []),
	};
}

/**
 * 各功能的高级设置. 读取顺序: 新顶层键的显式值优先, 没有显式值时回退已弃用的
 * `textToolkit.advanced` 旧对象, 两者都没有时用 schema 默认值(见 shared/advanced.ts).
 */
export function getAdvanced(): AdvancedSettings {
	const config = vscode.workspace.getConfiguration();
	const keys: ResolvedKeys = {};
	for (const [name, descriptor] of Object.entries(ADVANCED_KEYS)) {
		// get() 对未设置的键返回 schema default, 无法与"用户显式设成默认值"区分;
		// inspect() 的各作用域值都为 undefined 才视为未设置, 不参与覆盖.
		const inspected = config.inspect<unknown>(descriptor.setting);
		const explicit =
			inspected?.workspaceFolderValue ??
			inspected?.workspaceValue ??
			inspected?.globalValue ??
			inspected?.workspaceFolderLanguageValue ??
			inspected?.workspaceLanguageValue ??
			inspected?.globalLanguageValue;
		if (explicit !== undefined) keys[name as keyof ResolvedKeys] = explicit;
	}
	return resolveAdvanced(keys, config.get<unknown>("textToolkit.advanced"));
}

/**
 * 对齐所用的制表符宽度. 与上游 align-by-regex 一致: 配置缺失或 < 1 时回退为 1,
 * 因为 tabAwareLength 用它换算列宽, 取 0 会让含 tab 的行宽度计算失真.
 * 编辑器实例上的 tabSize 覆盖(含"自动检测缩进")优先; 否则按目标文档解析
 * 语言作用域与工作区作用域的 `editor.tabSize`, 而不是全局默认值.
 */
export function getEditorTabSize(resource?: vscode.Uri): number {
	const editor = resource
		? vscode.window.visibleTextEditors.find(
				candidate => candidate.document.uri.toString() === resource.toString()
			)
		: vscode.window.activeTextEditor;
	const tabSize =
		editor?.options.tabSize ??
		vscode.workspace.getConfiguration("editor", resource ?? null).get<number>("tabSize");
	if (typeof tabSize !== "number" || tabSize < 1) {
		console.log(
			'Error [Align by Regex]: Invalid tab size setting "editor.tabSize" for alignment.'
		);
		return 1;
	}
	return tabSize;
}
