// 验证设置备份按配置目标与工作区身份隔离, 模式期间新增覆盖项的备份合并, 以及旧格式备份的丢弃.
import { beforeEach, describe, expect, it, vi } from "vitest";

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

const STORAGE_KEY = "textToolkit.plainText.previousOverrides";

const context = () =>
	({
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
	}) as never;

/** 进入指定工作区(无 .code-workspace 的单文件夹窗口). */
const enterWorkspace = (id: string) => {
	state.workspaceFile = undefined;
	state.folders = [{ uri: { toString: () => id } }];
};

const storedScopes = (): string[] =>
	Object.keys((state.storage.get(STORAGE_KEY) as Record<string, unknown>) ?? {});

beforeEach(() => state.reset());

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
		// 模拟窗口重开: 全新 context, 同一份 globalState.
		await restoreOverrides(context());
		expect(state.settings.workspaceLanguage["editor.wordWrap"]).toBeUndefined();
		expect(storedScopes()).toEqual([]);
	});

	it("旧格式(无作用域)备份被丢弃, 不再阻止新备份", async () => {
		state.storage.set(STORAGE_KEY, { target: 2, values: { "editor.wordWrap": "off" } });
		enterWorkspace("file:///wA");
		expect(isApplied(context())).toBe(false);
		await applyOverrides(context(), { "editor.wordWrap": "on" });
		expect(storedScopes()).toEqual(["file:///wA"]);
	});
});

describe("模式期间扩展覆盖表", () => {
	it("重复应用时合并尚未记录的键, 已记录键保留最早原值", async () => {
		enterWorkspace("file:///wA");
		state.settings.workspaceLanguage["editor.fontSize"] = 14;

		await applyOverrides(context(), { "editor.wordWrap": "on" });
		// 模式期间覆盖表追加了 editor.fontSize.
		await applyOverrides(context(), { "editor.wordWrap": "on", "editor.fontSize": 20 });

		const entry = (state.storage.get(STORAGE_KEY) as Record<string, never>)["file:///wA"] as {
			values: Record<string, unknown>;
		};
		expect(entry.values).toEqual({ "editor.wordWrap": null, "editor.fontSize": 14 });
		expect(state.settings.workspaceLanguage["editor.fontSize"]).toBe(20);

		await restoreOverrides(context());
		expect(state.settings.workspaceLanguage["editor.wordWrap"]).toBeUndefined();
		expect(state.settings.workspaceLanguage["editor.fontSize"]).toBe(14);
	});
});
