// 注册通用格式化 Provider, 命令和菜单, 按文档隔离并取消格式化请求.
import * as os from "node:os";
import * as vscode from "vscode";
import { isBackItem, showMenu, type PickOutcome } from "../../shared/quickPick";
import {
	loadFormatterRules,
	readHostEnvironment,
	selectFormatter,
	type FormatterRule,
} from "./config";
import { changedRange, FormatterProcessError, runFormatter } from "./process";
import { resolveFormatter } from "./variables";

export interface CommonFormatterFeature {
	showMenu(withBack: boolean): Promise<PickOutcome>;
}

export function registerCommonFormatter(context: vscode.ExtensionContext): CommonFormatterFeature {
	let registration: vscode.Disposable | undefined;
	let registeredLanguages = "";
	let output: vscode.OutputChannel | undefined;
	const running = new Map<string, AbortController>();
	const notified = new Set<string>();
	const getOutput = (): vscode.OutputChannel => {
		if (!output) {
			output = vscode.window.createOutputChannel("Common Formatter");
			context.subscriptions.push(output);
		}
		return output;
	};
	const report = (name: string, error: unknown): void => {
		const message = error instanceof Error ? error.message : String(error);
		getOutput().appendLine(`[${name}] ${message}`);
		if (error instanceof FormatterProcessError && error.stderr)
			getOutput().appendLine(error.stderr);
		const key = `${name}:${message}`;
		if (notified.has(key)) return;
		notified.add(key);
		void vscode.window
			.showErrorMessage(
				vscode.l10n.t(
					'Formatter "{0}" failed. See Common Formatter output for details.',
					name
				),
				vscode.l10n.t("Show Formatter Output")
			)
			.then(action => {
				if (action) getOutput().show(true);
			});
	};
	const readRules = (resource?: vscode.Uri): FormatterRule[] =>
		loadFormatterRules(
			vscode.workspace.getConfiguration("commonFormatter", resource).get<unknown>("list", []),
			process.platform
		);
	const cancelAll = (): void => {
		for (const controller of running.values()) controller.abort();
		running.clear();
	};
	const provide = async (
		document: vscode.TextDocument,
		signal: AbortSignal
	): Promise<vscode.TextEdit[]> => {
		if (
			!vscode.workspace.isTrusted ||
			document.isUntitled ||
			document.uri.scheme !== "file" ||
			signal.aborted
		)
			return [];
		let name = "commonFormatter.list";
		let controller: AbortController | undefined;
		const key = document.uri.toString();
		const cancel = (): void => controller?.abort();
		try {
			const rule = selectFormatter(readRules(document.uri), document.languageId);
			if (!rule) return [];
			name = rule.name;
			running.get(key)?.abort();
			controller = new AbortController();
			running.set(key, controller);
			signal.addEventListener("abort", cancel, { once: true });
			const version = document.version;
			const languageId = document.languageId;
			const text = document.getText();
			const folder = vscode.workspace.getWorkspaceFolder(document.uri);
			const invocation = resolveFormatter(rule, {
				file: document.uri.fsPath,
				workspaceFolder: folder?.uri.fsPath,
				workspaceFolders: (vscode.workspace.workspaceFolders ?? []).map(f => ({
					name: f.name,
					path: f.uri.fsPath,
				})),
				userHome: os.homedir(),
				env: readHostEnvironment(),
				platform: process.platform,
				getConfiguration: name =>
					vscode.workspace.getConfiguration(undefined, document.uri).get(name),
			});
			const result = await runFormatter(invocation, text, controller.signal);
			if (
				controller.signal.aborted ||
				signal.aborted ||
				document.isClosed ||
				document.version !== version ||
				document.languageId !== languageId ||
				!vscode.workspace.isTrusted
			)
				return [];
			if (result.stderr) getOutput().appendLine(`[${name}] ${result.stderr}`);
			const change = changedRange(text, result.text);
			return change
				? [
						vscode.TextEdit.replace(
							new vscode.Range(
								document.positionAt(change.start),
								document.positionAt(change.end)
							),
							change.text
						),
					]
				: [];
		} catch (error) {
			if (!signal.aborted && !controller?.signal.aborted) report(name, error);
			return [];
		} finally {
			signal.removeEventListener("abort", cancel);
			if (running.get(key) === controller) running.delete(key);
		}
	};
	const refresh = (invalidateRequests = true): void => {
		if (invalidateRequests) {
			cancelAll();
			notified.clear();
		}
		if (!vscode.workspace.isTrusted) {
			registration?.dispose();
			registration = undefined;
			registeredLanguages = "";
			return;
		}
		const selectors: vscode.DocumentFilter[] = [];
		const resources = new Map<string, vscode.Uri | undefined>([["global", undefined]]);
		for (const folder of vscode.workspace.workspaceFolders ?? [])
			resources.set(folder.uri.toString(), folder.uri);
		for (const document of vscode.workspace.textDocuments) {
			if (document.uri.scheme === "file")
				resources.set(document.uri.toString(), document.uri);
		}
		const languages = new Set<string>();
		for (const resource of resources.values()) {
			try {
				for (const rule of readRules(resource)) {
					if (rule.enabled)
						for (const language of rule.languages) languages.add(language);
				}
			} catch (error) {
				report("commonFormatter.list", error);
			}
		}
		for (const language of languages) selectors.push({ language, scheme: "file" });
		const signature = [...languages].sort().join("\0");
		if (signature === registeredLanguages) return;
		registration?.dispose();
		registration = undefined;
		registeredLanguages = signature;
		if (selectors.length > 0) {
			registration = vscode.languages.registerDocumentFormattingEditProvider(selectors, {
				async provideDocumentFormattingEdits(document, _options, token) {
					const controller = new AbortController();
					const cancellation = token.onCancellationRequested(() => controller.abort());
					if (token.isCancellationRequested) controller.abort();
					try {
						return await provide(document, controller.signal);
					} finally {
						cancellation.dispose();
					}
				},
			});
		}
	};
	const formatActive = async (): Promise<void> => {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			void vscode.window.showInformationMessage(vscode.l10n.t("No active editor."));
			return;
		}
		if (!vscode.workspace.isTrusted) {
			void vscode.window.showInformationMessage(
				vscode.l10n.t("Trust the workspace to run formatter commands.")
			);
			return;
		}
		if (editor.document.isUntitled || editor.document.uri.scheme !== "file") {
			void vscode.window.showInformationMessage(
				vscode.l10n.t("Common Formatter needs a document with a file path.")
			);
			return;
		}
		try {
			if (!selectFormatter(readRules(editor.document.uri), editor.document.languageId)) {
				void vscode.window.showInformationMessage(
					vscode.l10n.t(
						"No formatter configured for this language. Edit commonFormatter.list."
					)
				);
				return;
			}
		} catch (error) {
			report("commonFormatter.list", error);
			return;
		}
		const version = editor.document.version;
		const edits = await provide(editor.document, new AbortController().signal);
		if (editor.document.version === version && !editor.document.isClosed && edits.length > 0) {
			await editor.edit(builder => {
				for (const edit of edits) builder.replace(edit.range, edit.newText);
			});
		}
	};
	context.subscriptions.push(
		{
			dispose: () => {
				registration?.dispose();
				cancelAll();
			},
		},
		vscode.workspace.onDidChangeConfiguration(event => {
			cancelAll();
			if (event.affectsConfiguration("commonFormatter")) refresh();
		}),
		vscode.workspace.onDidChangeWorkspaceFolders(() => refresh()),
		vscode.workspace.onDidGrantWorkspaceTrust(() => refresh()),
		vscode.workspace.onDidOpenTextDocument(document => {
			if (document.uri.scheme === "file") refresh(false);
		}),
		vscode.workspace.onDidChangeTextDocument(event => {
			if (event.contentChanges.length > 0)
				running.get(event.document.uri.toString())?.abort();
		}),
		vscode.workspace.onDidCloseTextDocument(document =>
			running.get(document.uri.toString())?.abort()
		),
		vscode.commands.registerCommand("textToolkit.commonFormatter.format", formatActive),
		vscode.commands.registerCommand("textToolkit.commonFormatter.showOutput", () =>
			getOutput().show(true)
		)
	);
	refresh();
	return {
		async showMenu(withBack) {
			const picked = await showMenu(
				[
					{ id: "format", label: vscode.l10n.t("Format Document with CLI") },
					{ id: "settings", label: vscode.l10n.t("Configure Common Formatter") },
					{ id: "output", label: vscode.l10n.t("Show Formatter Output") },
				],
				vscode.l10n.t("Common Formatter"),
				withBack
			);
			if (isBackItem(picked)) return "back";
			if (picked?.id === "format") await formatActive();
			else if (picked?.id === "settings")
				await vscode.commands.executeCommand(
					"workbench.action.openSettings",
					"@id:commonFormatter.list"
				);
			else if (picked?.id === "output") getOutput().show(true);
			return "done";
		},
	};
}
