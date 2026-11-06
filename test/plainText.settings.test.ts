// 验证跨窗口共享备份, 并发隔离和旧格式备份恢复.
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => {
	const settings = {
		workspaceLanguage: {} as Record<string, unknown>,
		globalLanguage: {} as Record<string, unknown>,
	};
	const storage = new Map<string, unknown>();
	const bundle = {
		settings,
		storage,
		workspaceFile: undefined as { toString(): string } | undefined,
		folders: [] as { uri: { toString(): string } }[],
	};
	return {
		...bundle,
		reset() {
			settings.workspaceLanguage = {};
			settings.globalLanguage = {};
			storage.clear();
			bundle.workspaceFile = undefined;
			bundle.folders = [];
		},
	};
});

vi.mock("vscode", () => ({
	window: { showWarningMessage: vi.fn(async () => undefined), showErrorMessage: vi.fn() },
	l10n: { t: (text: string) => text },
	workspace: {
		get workspaceFile() {
			return state.workspaceFile;
		},
		get workspaceFolders() {
			return state.folders;
		},
		getConfiguration: () => ({
			get: () => undefined,
			inspect: (key: string) => ({
				workspaceLanguageValue: state.settings.workspaceLanguage[key],
				globalLanguageValue: state.settings.globalLanguage[key],
			}),
			update: async (key: string, value: unknown, target: number) => {
				const store =
					target === 2 ? state.settings.workspaceLanguage : state.settings.globalLanguage;
				if (value === undefined) {
					delete store[key];
				} else {
					store[key] = value;
				}
			},
		}),
	},
	ConfigurationTarget: { Global: 1, Workspace: 2 },
}));

import { applyOverrides, isApplied, restoreOverrides } from "../src/features/plainText/settings";
import { overrideStorage } from "../src/features/plainText/settingsStorage";
import * as vscode from "vscode";

const STORAGE_KEY = "textToolkit.plainText.previousOverrides";

let root: string;
let currentContext: vscode.ExtensionContext | undefined;
const context = (newWindow = false): vscode.ExtensionContext => {
	if (currentContext && !newWindow) return currentContext;
	const result = {
		globalStorageUri: { fsPath: root },
		globalState: {
			get: (key: string) => state.storage.get(key),
			update: async (key: string, value: unknown) => {
				if (value === undefined) {
					state.storage.delete(key);
				} else {
					state.storage.set(key, value);
				}
			},
		},
	} as unknown as vscode.ExtensionContext;
	if (!newWindow) currentContext = result;
	return result;
};

/** 进入指定工作区(无 .code-workspace 的单文件夹窗口). */
const enterWorkspace = (id: string) => {
	state.workspaceFile = undefined;
	state.folders = [{ uri: { toString: () => id } }];
};

const storedScopes = (): string[] =>
	["file:///wA", "file:///wB", ""].filter(scope => overrideStorage(root, scope).read());

beforeEach(() => {
	state.reset();
	state.workspaceFile = undefined;
	state.folders = [];
	currentContext = undefined;
	const cache = path.resolve(".ai-ctx/cache/plain-text-tests");
	mkdirSync(cache, { recursive: true });
	root = mkdtempSync(path.join(cache, "settings-"));
	vi.mocked(vscode.window.showWarningMessage).mockReset();
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("纯文本设置备份的作用域隔离", () => {
	it("不同工作区的备份互不串用, 恢复只写回所属工作区", async () => {
		enterWorkspace("file:///wA");
		await applyOverrides(context(), { "editor.wordWrap": "on" });
		expect(state.settings.workspaceLanguage["editor.wordWrap"]).toBe("on");
		expect(storedScopes()).toEqual(["file:///wA"]);

		// 另一个工作区进入模式: 没有属于自己的备份, 也不复用 A 的原值.
		enterWorkspace("file:///wB");
		expect(isApplied(context())).toBe(false);
		state.settings.workspaceLanguage["editor.wordWrap"] = "bounded";
		await applyOverrides(context(), { "editor.wordWrap": "on" });
		await restoreOverrides(context());
		expect(state.settings.workspaceLanguage["editor.wordWrap"]).toBe("bounded");
		expect(storedScopes()).toEqual(["file:///wA"]);

		// 回到 A: 备份仍在, 还原成 A 进入前的原值(当时未设置).
		enterWorkspace("file:///wA");
		expect(isApplied(context())).toBe(true);
		await restoreOverrides(context());
		expect(state.settings.workspaceLanguage["editor.wordWrap"]).toBeUndefined();
		expect(storedScopes()).toEqual([]);
	});

	it("无工作区窗口备份到用户级, 与工作区互不影响", async () => {
		state.workspaceFile = undefined;
		state.folders = [];
		await applyOverrides(context(), { "editor.wordWrap": "on" });
		expect(state.settings.globalLanguage["editor.wordWrap"]).toBe("on");
		expect(storedScopes()).toEqual([""]);

		enterWorkspace("file:///wA");
		expect(isApplied(context())).toBe(false);
		await restoreOverrides(context());
		expect(state.settings.globalLanguage["editor.wordWrap"]).toBe("on");
	});

	it("重启后遗留的当前作用域备份可以恢复", async () => {
		enterWorkspace("file:///wA");
		await applyOverrides(context(), { "editor.wordWrap": "on" });
		// 模拟原窗口已崩溃, 而不是仍持有覆盖的另一个活跃窗口.
		const storage = overrideStorage(root, "file:///wA");
		const entry = storage.read()!;
		entry.owners = { crashed: 2147483647 };
		storage.save(entry);
		await restoreOverrides(context(true), false);
		expect(state.settings.workspaceLanguage["editor.wordWrap"]).toBeUndefined();
		expect(storedScopes()).toEqual([]);
	});

	it("旧工作区备份未确认归属时保留, 暂停覆盖", async () => {
		state.storage.set(STORAGE_KEY, { target: 2, values: { "editor.wordWrap": "off" } });
		enterWorkspace("file:///wA");
		expect(isApplied(context())).toBe(false);
		const result = await applyOverrides(context(), { "editor.wordWrap": "on" });
		expect(result.applied).toBe(0);
		expect(state.storage.get(STORAGE_KEY)).toEqual({
			target: 2,
			values: { "editor.wordWrap": "off" },
		});
		expect(storedScopes()).toEqual([]);
	});

	it("用户确认旧备份所属工作区后恢复原值, 后续开关仍可恢复", async () => {
		enterWorkspace("file:///wA");
		state.settings.workspaceLanguage["editor.wordWrap"] = "on";
		state.storage.set(STORAGE_KEY, { target: 2, values: { "editor.wordWrap": "off" } });
		vi.mocked(vscode.window.showWarningMessage).mockResolvedValue(
			"Restore Backup to This Workspace" as never
		);
		await restoreOverrides(context(), false);
		expect(state.settings.workspaceLanguage["editor.wordWrap"]).toBe("off");
		await applyOverrides(context(), { "editor.wordWrap": "on" });
		await restoreOverrides(context());
		expect(state.settings.workspaceLanguage["editor.wordWrap"]).toBe("off");
	});

	it("选择删除备份后清掉旧记录, 覆盖与恢复照常工作", async () => {
		enterWorkspace("file:///wA");
		state.settings.workspaceLanguage["editor.wordWrap"] = "bounded";
		state.storage.set(STORAGE_KEY, { target: 2, values: { "editor.wordWrap": "off" } });
		vi.mocked(vscode.window.showWarningMessage).mockResolvedValue("Delete Backup" as never);
		const result = await applyOverrides(context(), { "editor.wordWrap": "on" });
		expect(result.applied).toBe(1);
		expect(state.storage.get(STORAGE_KEY)).toBeUndefined();
		expect(state.settings.workspaceLanguage["editor.wordWrap"]).toBe("on");
		await restoreOverrides(context());
		expect(state.settings.workspaceLanguage["editor.wordWrap"]).toBe("bounded");
	});

	it("旧版用户级备份可自动恢复, 墓碑阻止旧缓存再次导入", async () => {
		state.storage.set(STORAGE_KEY, { target: 1, values: { "editor.wordWrap": "off" } });
		state.settings.globalLanguage["editor.wordWrap"] = "on";
		await restoreOverrides(context(), false);
		expect(state.settings.globalLanguage["editor.wordWrap"]).toBe("off");
		state.settings.globalLanguage["editor.wordWrap"] = "bounded";
		await restoreOverrides(context(true), false);
		expect(state.settings.globalLanguage["editor.wordWrap"]).toBe("bounded");
	});

	it("不同作用域同时应用和恢复不会覆盖对方备份", async () => {
		enterWorkspace("file:///wA");
		const a = applyOverrides(context(), { "editor.wordWrap": "on" });
		enterWorkspace("file:///wB");
		const b = applyOverrides(context(), { "editor.minimap.enabled": false });
		await Promise.all([a, b]);
		expect(storedScopes()).toEqual(["file:///wA", "file:///wB"]);
		enterWorkspace("file:///wA");
		const restoreA = restoreOverrides(context());
		enterWorkspace("file:///wB");
		const restoreB = restoreOverrides(context());
		await Promise.all([restoreA, restoreB]);
		expect(storedScopes()).toEqual([]);
	});

	it("另一空窗口启动和退出不撤销仍有窗口持有的覆盖", async () => {
		const first = context();
		const second = context(true);
		await applyOverrides(first, { "editor.wordWrap": "on" });
		await restoreOverrides(second, false);
		expect(state.settings.globalLanguage["editor.wordWrap"]).toBe("on");
		await applyOverrides(second, { "editor.wordWrap": "on" });
		await restoreOverrides(first);
		expect(state.settings.globalLanguage["editor.wordWrap"]).toBe("on");
		await restoreOverrides(second);
		expect(state.settings.globalLanguage["editor.wordWrap"]).toBeUndefined();
	});

	it("同一作用域并发应用保留第一次写入前的原值", async () => {
		state.settings.globalLanguage["editor.wordWrap"] = "off";
		const first = context();
		const second = context(true);
		await Promise.all([
			applyOverrides(first, { "editor.wordWrap": "on" }),
			applyOverrides(second, { "editor.wordWrap": "bounded" }),
		]);
		await restoreOverrides(first);
		await restoreOverrides(second);
		expect(state.settings.globalLanguage["editor.wordWrap"]).toBe("off");
	});
});

describe("模式期间扩展覆盖表", () => {
	it("重复应用时合并尚未记录的键, 已记录键保留最早原值", async () => {
		enterWorkspace("file:///wA");
		state.settings.workspaceLanguage["editor.fontSize"] = 14;

		await applyOverrides(context(), { "editor.wordWrap": "on" });
		// 模式期间覆盖表追加了 editor.fontSize.
		await applyOverrides(context(), { "editor.wordWrap": "on", "editor.fontSize": 20 });

		const entry = overrideStorage(root, "file:///wA").read()!;
		expect(entry.values).toEqual({ "editor.wordWrap": null, "editor.fontSize": 14 });
		expect(state.settings.workspaceLanguage["editor.fontSize"]).toBe(20);

		await restoreOverrides(context());
		expect(state.settings.workspaceLanguage["editor.wordWrap"]).toBeUndefined();
		expect(state.settings.workspaceLanguage["editor.fontSize"]).toBe(14);
	});
});
