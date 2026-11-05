// 验证 Provider 注册, 文档隔离, 工作区信任及异步结果失效.
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
	rules: [] as unknown[],
	trusted: true,
	providers: [] as {
		selectors: unknown;
		provider: { provideDocumentFormattingEdits: (...args: any[]) => Promise<any[]> };
		dispose: ReturnType<typeof vi.fn>;
	}[],
	events: new Map<string, (...args: any[]) => void>(),
	errors: vi.fn(async () => undefined),
	log: vi.fn(),
	run: vi.fn(),
	resourceRules: new Map<string, unknown[]>(),
	commands: new Map<string, (...args: any[]) => unknown>(),
}));

vi.mock("vscode", () => {
	const event = (name: string) => (callback: (...args: any[]) => void) => {
		state.events.set(name, callback);
		return { dispose: vi.fn() };
	};
	return {
		workspace: {
			get isTrusted() {
				return state.trusted;
			},
			workspaceFolders: [],
			textDocuments: [],
			getConfiguration: (_section: unknown, resource?: { fsPath: string }) => ({
				get: () => state.resourceRules.get(resource?.fsPath ?? "") ?? state.rules,
			}),
			getWorkspaceFolder: () => undefined,
			onDidChangeConfiguration: event("configuration"),
			onDidChangeWorkspaceFolders: event("folders"),
			onDidGrantWorkspaceTrust: event("trust"),
			onDidOpenTextDocument: event("open"),
			onDidChangeTextDocument: event("change"),
			onDidCloseTextDocument: event("close"),
		},
		window: {
			activeTextEditor: undefined,
			createOutputChannel: () => ({ appendLine: state.log, show: vi.fn(), dispose: vi.fn() }),
			showErrorMessage: state.errors,
		},
		languages: {
			registerDocumentFormattingEditProvider: (selectors: unknown, provider: any) => {
				const registration = { selectors, provider, dispose: vi.fn() };
				state.providers.push(registration);
				return registration;
			},
		},
		commands: {
			registerCommand: (name: string, handler: (...args: any[]) => unknown) => {
				state.commands.set(name, handler);
				return { dispose: vi.fn() };
			},
		},
		l10n: { t: (text: string) => text },
		Range: class {
			constructor(
				public start: number,
				public end: number
			) {}
		},
		TextEdit: { replace: (range: unknown, newText: string) => ({ range, newText }) },
	};
});

vi.mock("../src/features/commonFormatter/process", async importOriginal => ({
	...(await importOriginal<typeof import("../src/features/commonFormatter/process")>()),
	runFormatter: state.run,
}));

import { registerCommonFormatter } from "../src/features/commonFormatter/provider";

const rule = { name: "CLI", languages: ["typescript"], command: "formatter" };
const token = () => ({
	isCancellationRequested: false,
	onCancellationRequested: vi.fn(() => ({ dispose: vi.fn() })),
});
const document = (file = "/project/a.ts", scheme = "file") => ({
	uri: { scheme, fsPath: file, toString: () => `${scheme}:${file}` },
	isUntitled: false,
	isClosed: false,
	version: 1,
	languageId: "typescript",
	getText: () => "const a=1;",
	positionAt: (offset: number) => offset,
});
const start = () => {
	const context = { subscriptions: [] as { dispose(): void }[] };
	registerCommonFormatter(context as any);
	return {
		context,
		provide: (...args: unknown[]) =>
			state.providers.at(-1)!.provider.provideDocumentFormattingEdits(...args),
	};
};

beforeEach(() => {
	state.rules = [rule];
	state.trusted = true;
	state.providers = [];
	state.events.clear();
	state.commands.clear();
	state.resourceRules.clear();
	state.errors.mockClear();
	state.log.mockClear();
	state.run.mockReset();
	state.run.mockResolvedValue({ text: "const a = 1;", stderr: "" });
});

describe("通用格式化 Provider", () => {
	it("空配置不注册 Provider, 配置变化后注册", () => {
		state.rules = [];
		start();
		expect(state.providers).toHaveLength(0);
		state.rules = [rule];
		state.events.get("configuration")!({ affectsConfiguration: () => true });
		expect(state.providers.at(-1)!.selectors).toEqual([
			{ language: "typescript", scheme: "file" },
		]);
	});
	it("未信任时不注册, 授予信任后注册", () => {
		state.trusted = false;
		start();
		expect(state.providers).toHaveLength(0);
		state.trusted = true;
		state.events.get("trust")!();
		expect(state.providers).toHaveLength(1);
	});
	it("使用请求文档文本和路径, 只返回变动范围", async () => {
		state.rules = [{ ...rule, args: ["--stdin-filepath", "${file}"] }];
		const { provide } = start();
		const edits = await provide(document(), {}, token());
		expect(state.run.mock.calls[0][0]).toMatchObject({
			command: "formatter",
			args: ["--stdin-filepath", "/project/a.ts"],
			cwd: "/project",
		});
		expect(state.run.mock.calls[0][1]).toBe("const a=1;");
		expect(edits).toEqual([{ range: { start: 7, end: 8 }, newText: " = " }]);
	});
	it("使用文档作用域配置, 不回退全局规则", async () => {
		state.resourceRules.set("/project/a.ts", [{ ...rule, command: "project-formatter" }]);
		state.resourceRules.set("/project/b.ts", []);
		const { provide } = start();
		await provide(document(), {}, token());
		expect(state.run.mock.calls[0][0].command).toBe("project-formatter");
		expect(await provide(document("/project/b.ts"), {}, token())).toEqual([]);
		expect(state.run).toHaveBeenCalledTimes(1);
	});
	it("忽略未保存路径文档, 虚拟文档和已取消请求", async () => {
		const { provide } = start();
		await provide(document("/virtual/a.ts", "text-toolkit-diff"), {}, token());
		await provide({ ...document(), isUntitled: true }, {}, token());
		await provide(document(), {}, { ...token(), isCancellationRequested: true });
		expect(state.run).not.toHaveBeenCalled();
	});
	it.each(["version", "closed", "language"])("文档上下文 %s 变化后丢弃结果", async change => {
		let finish!: (value: unknown) => void;
		state.run.mockImplementation(
			() =>
				new Promise(resolve => {
					finish = resolve;
				})
		);
		const { provide } = start();
		const doc = document();
		const result = provide(doc, {}, token());
		if (change === "version") doc.version++;
		else if (change === "closed") doc.isClosed = true;
		else doc.languageId = "plaintext";
		finish({ text: "stale", stderr: "" });
		expect(await result).toEqual([]);
	});
	it("空格式化结果生成删除文本的编辑", async () => {
		state.run.mockResolvedValue({ text: "", stderr: "" });
		const { provide } = start();
		expect(await provide(document(), {}, token())).toEqual([
			{ range: { start: 0, end: 10 }, newText: "" },
		]);
	});
	it("文档内容变化会取消进程", async () => {
		let finish!: (value: unknown) => void;
		state.run.mockImplementation(
			() =>
				new Promise(resolve => {
					finish = resolve;
				})
		);
		const { provide } = start();
		const doc = document();
		const result = provide(doc, {}, token());
		state.events.get("change")!({ document: doc, contentChanges: [{}] });
		expect(state.run.mock.calls[0][2].aborted).toBe(true);
		finish({ text: "stale", stderr: "" });
		expect(await result).toEqual([]);
	});
	it("新请求取消同一文档的旧请求, 不影响其他文档", async () => {
		const finishes: ((value: unknown) => void)[] = [];
		state.run.mockImplementation(() => new Promise(resolve => finishes.push(resolve)));
		const { provide } = start();
		const first = provide(document(), {}, token());
		const other = provide(document("/project/b.ts"), {}, token());
		const latest = provide(document(), {}, token());
		expect(state.run.mock.calls.map(call => call[2].aborted)).toEqual([true, false, false]);
		for (const finish of finishes) finish({ text: "const a = 1;", stderr: "" });
		expect(await first).toEqual([]);
		expect(await other).toHaveLength(1);
		expect(await latest).toHaveLength(1);
	});
	it("VS Code 取消令牌会取消子进程", async () => {
		let finish!: (value: unknown) => void;
		state.run.mockImplementation(
			() =>
				new Promise(resolve => {
					finish = resolve;
				})
		);
		const { provide } = start();
		const cancellation = token();
		const result = provide(document(), {}, cancellation);
		(cancellation.onCancellationRequested.mock.calls[0] as unknown as [() => void])[0]();
		expect(state.run.mock.calls[0][2].aborted).toBe(true);
		finish({ text: "ignored", stderr: "" });
		expect(await result).toEqual([]);
	});
	it("打开另一个文件不取消当前格式化, 相同语言不重复注册", async () => {
		let finish!: (value: unknown) => void;
		state.run.mockImplementation(
			() =>
				new Promise(resolve => {
					finish = resolve;
				})
		);
		const { provide } = start();
		const result = provide(document(), {}, token());
		state.events.get("open")!(document("/project/b.ts"));
		expect(state.providers).toHaveLength(1);
		expect(state.run.mock.calls[0][2].aborted).toBe(false);
		finish({ text: "const a = 1;", stderr: "" });
		expect(await result).toHaveLength(1);
	});
	it("命令失败不尝试后续规则, 相同错误不重复弹窗", async () => {
		state.rules = [rule, { ...rule, name: "后备", command: "fallback" }];
		state.run.mockRejectedValue(new Error("CLI missing"));
		const { provide } = start();
		await provide(document(), {}, token());
		await provide(document(), {}, token());
		expect(state.run).toHaveBeenCalledTimes(2);
		expect(state.run.mock.calls.every(call => call[0].command === "formatter")).toBe(true);
		expect(state.errors).toHaveBeenCalledTimes(1);
	});
	it("停用扩展会释放 Provider 并取消进程", async () => {
		let finish!: (value: unknown) => void;
		state.run.mockImplementation(
			() =>
				new Promise(resolve => {
					finish = resolve;
				})
		);
		const { context, provide } = start();
		const result = provide(document(), {}, token());
		for (const disposable of context.subscriptions) disposable.dispose();
		expect(state.providers[0].dispose).toHaveBeenCalled();
		expect(state.run.mock.calls[0][2].aborted).toBe(true);
		finish({ text: "ignored", stderr: "" });
		expect(await result).toEqual([]);
	});
});
