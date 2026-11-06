import * as vscode from "vscode";
import { randomUUID } from "node:crypto";
import { PLAIN_TEXT_LANGUAGE_ID } from "./core";
import { overrideStorage, processIsAlive, type StoredEntry } from "./settingsStorage";

const STORAGE_KEY = "textToolkit.plainText.previousOverrides";
/** 无工作区窗口的备份作用域: 用户级设置被同一配置的全部窗口共享. */
const USER_SCOPE = "";

interface LegacyEntry {
	target: vscode.ConfigurationTarget;
	values: Record<string, unknown>;
}

const owners = new WeakMap<vscode.ExtensionContext, string>();
const warned = new WeakSet<vscode.ExtensionContext>();

function ownerId(context: vscode.ExtensionContext): string {
	let owner = owners.get(context);
	if (!owner) {
		owner = randomUUID();
		owners.set(context, owner);
	}
	return owner;
}

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
	if (!vscode.workspace.workspaceFolders?.length) return USER_SCOPE;
	if (vscode.workspace.workspaceFile) {
		return vscode.workspace.workspaceFile.toString();
	}
	const folder = vscode.workspace.workspaceFolders?.[0];
	return folder ? folder.uri.toString() : USER_SCOPE;
}

function storageFor(context: vscode.ExtensionContext, scope = workspaceScopeId()) {
	return overrideStorage(context.globalStorageUri.fsPath, scope);
}

function legacyEntry(context: vscode.ExtensionContext, scope: string): LegacyEntry | undefined {
	const stored = context.globalState.get<LegacyEntry | Record<string, LegacyEntry>>(STORAGE_KEY);
	if (!stored) return undefined;
	if (typeof stored.target === "number") {
		return scope === USER_SCOPE && stored.target === vscode.ConfigurationTarget.Global
			? (stored as LegacyEntry)
			: undefined;
	}
	return (stored as Record<string, LegacyEntry>)[scope];
}

function readEntry(context: vscode.ExtensionContext, scope: string): StoredEntry | undefined {
	const entry = storageFor(context, scope).read();
	if (entry !== undefined) return entry ?? undefined;
	const legacy = legacyEntry(context, scope);
	return legacy ? { ...legacy, values: { ...legacy.values }, owners: {} } : undefined;
}

async function resolveLegacyWorkspace(context: vscode.ExtensionContext): Promise<boolean> {
	const old = context.globalState.get<LegacyEntry>(STORAGE_KEY);
	if (old?.target !== vscode.ConfigurationTarget.Workspace) return true;
	// 无身份的工作区备份不能自动归属, 也不能覆盖. 用户选择恢复或删除后才消费旧记录.
	if (!vscode.workspace.workspaceFolders?.length || warned.has(context)) return false;
	warned.add(context);
	const restore = vscode.l10n.t("Restore Backup to This Workspace");
	const remove = vscode.l10n.t("Delete Backup");
	const choice = await vscode.window.showWarningMessage(
		vscode.l10n.t(
			"An older plain text settings backup has no workspace identity. Restore it here only if this is the original workspace. Editor setting overrides are paused until the backup is restored or deleted."
		),
		restore,
		remove
	);
	warned.delete(context);
	// 删除等同放弃备份: 原值不再还原, 需要时用户自行重设.
	if (choice === remove) {
		await context.globalState.update(STORAGE_KEY, undefined);
		return true;
	}
	if (choice !== restore) return false;
	const configuration = plainTextConfiguration();
	for (const [key, value] of Object.entries(old.values)) {
		await configuration.update(key, value === null ? undefined : value, old.target, true);
	}
	await context.globalState.update(STORAGE_KEY, undefined);
	return true;
}

function reportError(error: unknown): void {
	console.error("[Text Toolkit] plain text settings:", error);
	void vscode.window.showErrorMessage(
		vscode.l10n.t("Plain text settings could not be updated. The backup has been retained.")
	);
}

/** 当前作用域是否留有未还原的备份. */
export function isApplied(context: vscode.ExtensionContext): boolean {
	try {
		return readEntry(context, workspaceScopeId()) !== undefined;
	} catch (error) {
		reportError(error);
		return false;
	}
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
	const configuration = plainTextConfiguration();
	const storage = storageFor(context, scope);
	try {
		if (!(await resolveLegacyWorkspace(context)))
			return { applied: 0, failed: Object.keys(overrides) };
		return await storage.exclusive(async () => {
			const entry = readEntry(context, scope) ?? { target, values: {}, owners: {} };
			entry.owners[ownerId(context)] = process.pid;
			const failed: string[] = [];
			let applied = 0;
			for (const [key, value] of Object.entries(overrides)) {
				try {
					if (!Object.hasOwn(entry.values, key))
						entry.values[key] = readPreviousValue(configuration, key, target) ?? null;
					// 先持久化原值, 崩溃时也不会只留下设置覆盖而丢失备份.
					storage.save(entry);
					await configuration.update(key, value, target, true);
					applied++;
				} catch {
					failed.push(key);
				}
			}
			return { applied, failed };
		});
	} catch (error) {
		reportError(error);
		return { applied: 0, failed: Object.keys(overrides) };
	}
}

/** 还原当前作用域的备份; 原值为 null(当时未设置)时移除该覆盖. 其他作用域的备份不受影响. */
export async function restoreOverrides(
	context: vscode.ExtensionContext,
	releaseOwner = true
): Promise<number> {
	const scope = workspaceScopeId();
	const configuration = plainTextConfiguration();
	const storage = storageFor(context, scope);
	try {
		if (!(await resolveLegacyWorkspace(context))) return 0;
		return await storage.exclusive(async () => {
			const entry = readEntry(context, scope);
			if (!entry) return 0;
			if (releaseOwner) delete entry.owners[ownerId(context)];
			for (const [owner, pid] of Object.entries(entry.owners)) {
				if (!processIsAlive(pid)) delete entry.owners[owner];
			}
			if (Object.keys(entry.owners).length > 0) {
				storage.save(entry);
				return 0;
			}
			let restored = 0;
			for (const [key, value] of Object.entries(entry.values)) {
				try {
					await configuration.update(
						key,
						value === null ? undefined : value,
						entry.target,
						true
					);
					delete entry.values[key];
					restored++;
				} catch {
					// 保留失败键供下次恢复, 不把暂时写入失败当成已恢复.
				}
			}
			storage.save(Object.keys(entry.values).length ? entry : null);
			return restored;
		});
	} catch (error) {
		reportError(error);
		return 0;
	}
}
