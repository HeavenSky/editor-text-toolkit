/**
 * 配置分两层:
 * - 暴露层: 其余选项各自声明为独立顶层配置键, 默认值以 package.json 的 schema 为单一来源
 *   (经 config-defaults.generated.ts 引用), 设置界面直接可见.
 * - 兼容层: 旧版把上述键藏在本插件的一个 `textToolkit.advanced` 对象里做增量覆盖;
 *   该对象已弃用, 仍按旧语义读取 —— 新键显式设置时优先, 否则回退旧对象, 两者都没有时用默认值.
 *
 * 本文件不 import vscode 以便直接单测.
 */

import { CONFIG_DEFAULTS } from "./config-defaults.generated";

/** 纯文本模式下按 `[plaintext]` 语言作用域写入的编辑器覆盖项(内置默认表, 来自 schema default). */
export const DEFAULT_EDITOR_OVERRIDES = CONFIG_DEFAULTS[
	"textToolkit.plainText.editorOverrides"
] as Readonly<Record<string, unknown>>;

export interface AdvancedSettings {
	copyPath: {
		/** true 时连续片段写成 `a+n`(n 为行数), false 时写成闭区间 `a-b`. */
		useLineCountSyntax: boolean;
	};
	changeCase: { includeDotInCurrentWord: boolean };
	alignByRegex: { rememberLastInput: boolean };
	plainText: {
		applyEditorSettings: boolean;
		disableLineNumbers: boolean;
		/** 以纯文本模式打开文件时, 先用临时 files.associations 挡住语言扩展的激活. */
		suppressLanguageActivation: boolean;
		editorOverrides: Record<string, unknown>;
	};
	terminalOpen: {
		/** false 时不注册终端选区链接 provider. */
		selectionLink: boolean;
	};
}

/** 独立顶层新配置键, 与旧 `textToolkit.advanced` 内的扁平点号键一一对应. */
export const ADVANCED_KEYS = {
	useLineCountSyntax: {
		setting: "textToolkit.copyPath.useLineCountSyntax",
		legacy: "copyPath.useLineCountSyntax",
	},
	includeDotInCurrentWord: {
		setting: "textToolkit.changeCase.includeDotInCurrentWord",
		legacy: "changeCase.includeDotInCurrentWord",
	},
	rememberLastInput: {
		setting: "textToolkit.alignByRegex.rememberLastInput",
		legacy: "alignByRegex.rememberLastInput",
	},
	applyEditorSettings: {
		setting: "textToolkit.plainText.applyEditorSettings",
		legacy: "plainText.applyEditorSettings",
	},
	disableLineNumbers: {
		setting: "textToolkit.plainText.disableLineNumbers",
		legacy: "plainText.disableLineNumbers",
	},
	suppressLanguageActivation: {
		setting: "textToolkit.plainText.suppressLanguageActivation",
		legacy: "plainText.suppressLanguageActivation",
	},
	editorOverrides: {
		setting: "textToolkit.plainText.editorOverrides",
		legacy: "plainText.editorOverrides",
	},
	selectionLink: {
		setting: "textToolkit.terminalOpen.selectionLink",
		legacy: "terminalOpen.selectionLink",
	},
} as const;

/** 顶层配置键的 schema 默认值; 类型不符时忽略并回退到它. */
function schemaDefault(key: string): boolean {
	const value = CONFIG_DEFAULTS[key];
	return typeof value === "boolean" ? value : false;
}

export function advancedDefaults(): AdvancedSettings {
	return {
		copyPath: { useLineCountSyntax: schemaDefault(ADVANCED_KEYS.useLineCountSyntax.setting) },
		changeCase: {
			includeDotInCurrentWord: schemaDefault(ADVANCED_KEYS.includeDotInCurrentWord.setting),
		},
		alignByRegex: { rememberLastInput: schemaDefault(ADVANCED_KEYS.rememberLastInput.setting) },
		plainText: {
			applyEditorSettings: schemaDefault(ADVANCED_KEYS.applyEditorSettings.setting),
			disableLineNumbers: schemaDefault(ADVANCED_KEYS.disableLineNumbers.setting),
			suppressLanguageActivation: schemaDefault(
				ADVANCED_KEYS.suppressLanguageActivation.setting
			),
			editorOverrides: { ...DEFAULT_EDITOR_OVERRIDES },
		},
		terminalOpen: { selectionLink: schemaDefault(ADVANCED_KEYS.selectionLink.setting) },
	};
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * 把内置默认覆盖表与用户的增量修改合并.
 * `null` 表示移除该内置覆盖项(而不是把它写成 null), 这样用户可以放回某个被关掉的功能.
 */
export function mergeEditorOverrides(
	defaults: Readonly<Record<string, unknown>>,
	overrides: unknown
): Record<string, unknown> {
	const merged: Record<string, unknown> = { ...defaults };
	if (!isPlainObject(overrides)) {
		return merged;
	}
	for (const [key, value] of Object.entries(overrides)) {
		if (value === null) {
			delete merged[key];
		} else {
			merged[key] = value;
		}
	}
	return merged;
}

/** 每个新键的取值: 显式设置的新键值(仅布尔键做类型校验), 没有则回退旧对象的同名键. */
export interface ResolvedKeys {
	useLineCountSyntax?: unknown;
	includeDotInCurrentWord?: unknown;
	rememberLastInput?: unknown;
	applyEditorSettings?: unknown;
	disableLineNumbers?: unknown;
	suppressLanguageActivation?: unknown;
	editorOverrides?: unknown;
	selectionLink?: unknown;
}

/**
 * 类型不符或未知的键一律忽略, 保留内置默认值; 不抛异常.
 * `keys` 是新顶层键的解析结果(由 config.ts 用 inspect 判断显式设置后传入),
 * `legacy` 是旧 `textToolkit.advanced` 对象; 新键显式值优先于旧对象.
 */
export function resolveAdvanced(keys: ResolvedKeys, legacy?: unknown): AdvancedSettings {
	const resolved = advancedDefaults();
	const raw = isPlainObject(legacy) ? legacy : {};

	const readBoolean = (key: keyof ResolvedKeys, fallback: boolean): boolean => {
		// 布尔键: 新键显式值合法则优先, 否则回退旧对象, 仍非法则用内置默认值.
		if (keys[key] !== undefined) {
			if (typeof keys[key] === "boolean") return keys[key] as boolean;
		}
		const legacyValue = raw[ADVANCED_KEYS[key].legacy];
		return typeof legacyValue === "boolean" ? legacyValue : fallback;
	};

	resolved.copyPath.useLineCountSyntax = readBoolean(
		"useLineCountSyntax",
		resolved.copyPath.useLineCountSyntax
	);
	resolved.changeCase.includeDotInCurrentWord = readBoolean(
		"includeDotInCurrentWord",
		resolved.changeCase.includeDotInCurrentWord
	);
	resolved.alignByRegex.rememberLastInput = readBoolean(
		"rememberLastInput",
		resolved.alignByRegex.rememberLastInput
	);
	resolved.plainText.applyEditorSettings = readBoolean(
		"applyEditorSettings",
		resolved.plainText.applyEditorSettings
	);
	resolved.plainText.disableLineNumbers = readBoolean(
		"disableLineNumbers",
		resolved.plainText.disableLineNumbers
	);
	resolved.plainText.suppressLanguageActivation = readBoolean(
		"suppressLanguageActivation",
		resolved.plainText.suppressLanguageActivation
	);
	resolved.terminalOpen.selectionLink = readBoolean(
		"selectionLink",
		resolved.terminalOpen.selectionLink
	);

	// 对象键: 新键有显式对象则作为增量, 否则旧对象的同名键作为增量; null 语义在合并时处理.
	const overrideSource = isPlainObject(keys.editorOverrides)
		? keys.editorOverrides
		: raw[ADVANCED_KEYS.editorOverrides.legacy];
	resolved.plainText.editorOverrides = mergeEditorOverrides(
		DEFAULT_EDITOR_OVERRIDES,
		overrideSource
	);

	return resolved;
}
