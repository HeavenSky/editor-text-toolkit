// 验证模式文档真正关闭时清理状态并还原覆盖, 语言切换的 close 事件不清理, 以及启动时恢复遗留备份.
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
		textDocuments: [] as { uri: { toString(): string }; languageId: string }[],
		activeEditor: undefined as unknown,
		commands: new Map<string, (...args: unknown[]) => unknown>(),
		events: new Map<string, (...args: any[]) => void>(),
	};
	return {
		...bundle,
		reset() {
			settings.workspaceLanguage = {};
			settings.globalLanguage = {};
			storage.clear();
			bundle.textDocuments = [];
			bundle.activeEditor = undefined;
			bundle.commands.clear();
			bundle.events.clear();
		},
	};
});

vi.mock("vscode", () => ({
	workspace: {
		get workspaceFolders() {
			return [];
		},
		get textDocuments() {
			return state.textDocuments;
		},
		getConfiguration: () => ({
			get: () => undefined,
			inspect: (key: string) => ({
				workspaceLanguageValue: state.settings.workspaceLanguage[key],
				globalLanguageValue: state.settings.globalLanguage[key],
			}),
			update: async (key: string, value: unknown, _target: number) => {
				if (value === undefined) {
					delete state.settings.globalLanguage[key];
				} else {
					state.settings.globalLanguage[key] = value;
				}
			},
		}),
		onDidCloseTextDocument: (callback: (...args: any[]) => void) => {
			state.events.set("close", callback);
			return { dispose: () => {} };
		},
	},
	window: {
		get activeTextEditor() {
			return state.activeEditor;
		},
		createStatusBarItem: () => ({
			text: "",
			tooltip: "",
			command: "",
			show: () => {},
			hide: () => {},
		}),
		setStatusBarMessage: () => ({ dispose: () => {} }),
		showInformationMessage: vi.fn(),
		showWarningMessage: vi.fn(),
		showErrorMessage: vi.fn(),
		onDidChangeActiveTextEditor: (callback: (...args: any[]) => void) => {
			state.events.set("active", callback);
			return { dispose: () => {} };
		},
		tabGroups: {
			onDidChangeTabs: () => ({ dispose: () => {} }),
			activeTabGroup: { activeTab: undefined },
		},
	},
	languages: {
		setTextDocumentLanguage: async (document: { languageId: string }, languageId: string) => {
			document.languageId = languageId;
		},
	},
	commands: {
		registerCommand: (name: string, handler: (...args: unknown[]) => unknown) => {
			state.commands.set(name, handler);
			return { dispose: () => {} };
		},
	},
	l10n: { t: (text: string) => text },
	StatusBarAlignment: { Left: 1, Right: 2 },
	TabInputText: class {},
	ConfigurationTarget: { Global: 1, Workspace: 2 },
}));

vi.mock("../src/features/plainText/openFile", () => ({
	cleanUpPendingAssociations: vi.fn(async () => {}),
	openDocumentsAsPlainText: vi.fn(async () => []),
}));

import { registerPlainTextMode } from "../src/features/plainText/command";
import { applyOverrides, isApplied } from "../src/features/plainText/settings";

const STORAGE_KEY = "textToolkit.plainText.previousOverrides";

let root: string;
let currentContext: ReturnType<typeof makeContext> | undefined;
const makeContext = () =>
	({
		globalStorageUri: { fsPath: root },
		subscriptions: [],
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
const context = () => (currentContext ??= makeContext());

const document = (uri: string, languageId: string) => ({
	uri: { toString: () => uri },
	languageId,
});

const editor = (document: { uri: { toString(): string }; languageId: string }) => ({
	document,
	options: {} as Record<string, unknown>,
});

/** close 处理器把清理延后了两个事件循环, 连续两轮 setTimeout 确保落定. */
const flush = async () => {
	for (let i = 0; i < 3; i++) {
		await new Promise(resolve => setTimeout(resolve, 0));
	}
};

const hasBackup = () => isApplied(context());

beforeEach(() => {
	state.reset();
	state.textDocuments = [];
	state.activeEditor = undefined;
	currentContext = undefined;
	const cache = path.resolve(".ai-ctx/cache/plain-text-tests");
	mkdirSync(cache, { recursive: true });
	root = mkdtempSync(path.join(cache, "command-"));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("纯文本模式文档关闭与启动恢复", () => {
	it("启动时恢复上次会话遗留的备份", async () => {
		state.storage.set(STORAGE_KEY, { "": { target: 1, values: { "editor.wordWrap": null } } });
		state.settings.globalLanguage["editor.wordWrap"] = "on";
		expect(state.settings.globalLanguage["editor.wordWrap"]).toBe("on");

		registerPlainTextMode(context());
		await flush();

		expect(hasBackup()).toBe(false);
		expect(state.settings.globalLanguage["editor.wordWrap"]).toBeUndefined();
	});

	it("新窗口启动不会恢复另一活跃窗口的覆盖", async () => {
		const first = makeContext();
		await applyOverrides(first, { "editor.wordWrap": "on" });
		registerPlainTextMode(context());
		await flush();
		expect(state.settings.globalLanguage["editor.wordWrap"]).toBe("on");
		expect(hasBackup()).toBe(true);
	});

	it("最后一个模式文档真正关闭后清理状态并还原覆盖", async () => {
		registerPlainTextMode(context());
		const doc = document("file:///a.log", "log");
		state.activeEditor = editor(doc);
		state.textDocuments = [doc];

		await state.commands.get("textToolkit.plainText.toggle")!();
		expect(doc.languageId).toBe("plaintext");
		expect(hasBackup()).toBe(true);

		// 真正关闭: 文档从 workspace 消失.
		state.textDocuments = [];
		state.events.get("close")!(doc);
		await flush();

		expect(hasBackup()).toBe(false);
		expect(state.settings.globalLanguage["editor.wordWrap"]).toBeUndefined();
	});

	it("setTextDocumentLanguage 引发的 close 事件不清理(同 uri 文档随后重新打开)", async () => {
		registerPlainTextMode(context());
		const doc = document("file:///a.log", "log");
		state.activeEditor = editor(doc);
		state.textDocuments = [doc];
		await state.commands.get("textToolkit.plainText.toggle")!();

		state.events.get("close")!(doc);
		await flush();

		expect(hasBackup()).toBe(true);
		expect(state.settings.globalLanguage["editor.wordWrap"]).toBe("on");
	});

	it("还有一个模式文档在时关闭另一个不还原, 显式退出仍还原", async () => {
		registerPlainTextMode(context());
		const first = document("file:///a.log", "log");
		const second = document("file:///b.log", "log");
		state.activeEditor = editor(first);
		state.textDocuments = [first, second];
		await state.commands.get("textToolkit.plainText.toggle")!();

		state.activeEditor = editor(second);
		await state.commands.get("textToolkit.plainText.toggle")!();

		// 关闭 first(它已不在 textDocuments), second 仍在模式, 覆盖应保留.
		state.textDocuments = [second];
		state.events.get("close")!(first);
		await flush();
		expect(hasBackup()).toBe(true);
		expect(state.settings.globalLanguage["editor.wordWrap"]).toBe("on");

		state.activeEditor = editor(second);
		await state.commands.get("textToolkit.plainText.toggle")!();
		expect(hasBackup()).toBe(false);
		expect(state.settings.globalLanguage["editor.wordWrap"]).toBeUndefined();
	});
});
