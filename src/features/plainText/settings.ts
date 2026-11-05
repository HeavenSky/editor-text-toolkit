import * as vscode from "vscode";
import { PLAIN_TEXT_LANGUAGE_ID } from "./core";

const STORAGE_KEY = "textToolkit.plainText.previousOverrides";
/** 无工作区窗口的备份作用域: 用户级设置被同一配置的全部窗口共享. */
const USER_SCOPE = "";

interface StoredEntry {
	target: vscode.ConfigurationTarget;
	/**
	 * 覆盖前的 `[plaintext]` 语言作用域值.
	 * `null` 表示"当时未设置", 还原时写回 undefined 以移除该覆盖 ——
	 * globalState 按 JSON 持久化, 直接存 undefined 会让整个键消失.
	 */
	values: Record<string, unknown>;
}

/** 作用域 -> 备份. 各工作区窗口(含无工作区窗口)各占一格, 互不覆盖. */
type StoredOverrides = Record<string, StoredEntry>;

export interface ApplyResult {
	applied: number;
	failed: string[];
}

function plainTextConfiguration(): vscode.WorkspaceConfiguration {
	return vscode.workspace.getConfiguration(undefined, { languageId: PLAIN_TEXT_LANGUAGE_ID });
}

function readPreviousValue(
	configuration: vscode.WorkspaceConfiguration,
	key: string,
	target: vscode.ConfigurationTarget
): unknown {
	const inspected = configuration.inspect(key);
	if (!inspected) {
		return undefined;
	}
	return target === vscode.ConfigurationTarget.Workspace
		? inspected.workspaceLanguageValue
		: inspected.globalLanguageValue;
}

/**
 * 备份所属作用域: .code-workspace 文件或多根工作区的首个文件夹; 无工作区窗口共用 USER_SCOPE.
 * 与写入目标一致 —— 有工作区时覆盖写进 Workspace(工作区文件/文件夹设置), 否则写进用户设置.
 */
function workspaceScopeId(): string {
	if (vscode.workspace.workspaceFile) {
		return vscode.workspace.workspaceFile.toString();
	}
	const folder = vscode.workspace.workspaceFolders?.[0];
	return folder ? folder.uri.toString() : USER_SCOPE;
}

function readStored(context: vscode.ExtensionContext): StoredOverrides {
	const stored = context.globalState.get<StoredOverrides>(STORAGE_KEY);
	// v0.0.9 及更早版本只存单个 { target, values }, 没有作用域信息, 无法安全归属, 直接丢弃.
	if (!stored || typeof stored !== "object" || Array.isArray(stored) || "target" in stored) {
		return {};
	}
	return stored;
}

/** 当前作用域是否留有未还原的备份. */
export function isApplied(context: vscode.ExtensionContext): boolean {
	return readStored(context)[workspaceScopeId()] !== undefined;
}

/**
 * 把生效后的覆盖表以 `[plaintext]` 语言作用域写入设置, 并记录原值以便还原.
 * 逐键 try/catch: 不同 VS Code 版本对"哪些设置可按语言覆盖"的判定不同,
 * 单个键不被接受时不应让整个操作失败.
 */
export async function applyOverrides(
	context: vscode.ExtensionContext,
	overrides: Readonly<Record<string, unknown>>
): Promise<ApplyResult> {
	const target =
		vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0
			? vscode.ConfigurationTarget.Workspace
			: vscode.ConfigurationTarget.Global;

	const scope = workspaceScopeId();
	const stored = readStored(context);
	const existing = stored[scope];
	const configuration = plainTextConfiguration();
	const previous: Record<string, unknown> = {};
	const failed: string[] = [];
	let applied = 0;

	for (const [key, value] of Object.entries(overrides)) {
		try {
			previous[key] = readPreviousValue(configuration, key, target) ?? null;
			await configuration.update(key, value, target, true);
			applied += 1;
		} catch {
			delete previous[key];
			failed.push(key);
		}
	}

	if (applied > 0) {
		// 已有备份时(同窗口重复进入, 或模式期间覆盖表新增了键)只合并尚未记录的键:
		// 已记录键保留最早原值, 避免用"已被我们改过的值"覆盖真正的原值.
		const values = { ...existing?.values };
		for (const [key, value] of Object.entries(previous)) {
			if (!(key in values)) {
				values[key] = value;
			}
		}
		await context.globalState.update(STORAGE_KEY, { ...stored, [scope]: { target, values } });
	}

	return { applied, failed };
}

/** 还原当前作用域的备份; 原值为 null(当时未设置)时移除该覆盖. 其他作用域的备份不受影响. */
export async function restoreOverrides(context: vscode.ExtensionContext): Promise<number> {
	const scope = workspaceScopeId();
	const stored = readStored(context);
	const entry = stored[scope];
	if (!entry) {
		return 0;
	}

	const configuration = plainTextConfiguration();
	let restored = 0;
	for (const [key, value] of Object.entries(entry.values)) {
		try {
			await configuration.update(key, value === null ? undefined : value, entry.target, true);
			restored += 1;
		} catch {
			/* 该键已不再可写(例如设置被重命名), 跳过 */
		}
	}

	const remaining = { ...stored };
	delete remaining[scope];
	// 空表直接清键, 不留空对象.
	await context.globalState.update(
		STORAGE_KEY,
		Object.keys(remaining).length > 0 ? remaining : undefined
	);
	return restored;
}
