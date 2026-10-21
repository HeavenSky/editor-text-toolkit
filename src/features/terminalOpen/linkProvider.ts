// 终端选区链接: 有选区时把当前行里的选区片段变成链接, 按内置层开关实时注册或注销.
import * as vscode from "vscode";
import { getAdvanced } from "../../shared/config";
import { findSelectionLinkRanges } from "./core";
import { peekTerminalSelection } from "./selection";

export type OpenTerminalText = (terminal: vscode.Terminal, text: string) => Promise<void>;

class SelectionLink extends vscode.TerminalLink {
	constructor(
		startIndex: number,
		length: number,
		tooltip: string,
		/** 点击时 xterm 已先清空选区, 只能用生成链接时的快照. */
		readonly text: string,
		readonly terminal: vscode.Terminal
	) {
		super(startIndex, length, tooltip);
	}
}

function selectionLinkTooltip(terminal: vscode.Terminal): string {
	const cwd = terminal.shellIntegration?.cwd;
	return cwd?.scheme === "file"
		? vscode.l10n.t("Open selection as path (relative to {0})", cwd.fsPath)
		: vscode.l10n.t("Open selection as path");
}

/** 每次悬停都会调用, 只允许同步字符串匹配: 不做 cwd 探测, 文件系统调用或剪贴板读写. */
class SelectionLinkProvider implements vscode.TerminalLinkProvider<SelectionLink> {
	constructor(private readonly open: OpenTerminalText) {}

	provideTerminalLinks(
		context: vscode.TerminalLinkContext,
		token: vscode.CancellationToken
	): SelectionLink[] {
		const selection = peekTerminalSelection(context.terminal);
		if (!selection || token.isCancellationRequested) {
			return [];
		}
		const tooltip = selectionLinkTooltip(context.terminal);
		return findSelectionLinkRanges(context.line, selection).map(
			range =>
				new SelectionLink(range.start, range.length, tooltip, range.text, context.terminal)
		);
	}

	handleTerminalLink(link: SelectionLink): Promise<void> {
		return this.open(link.terminal, link.text);
	}
}

export function registerSelectionLinkProvider(
	context: vscode.ExtensionContext,
	open: OpenTerminalText
): void {
	let registration: vscode.Disposable | undefined;
	const apply = (): void => {
		const enabled = getAdvanced().terminalOpen.selectionLink;
		if (enabled && !registration) {
			registration = vscode.window.registerTerminalLinkProvider(
				new SelectionLinkProvider(open)
			);
		} else if (!enabled && registration) {
			registration.dispose();
			registration = undefined;
		}
	};
	apply();
	context.subscriptions.push(
		vscode.workspace.onDidChangeConfiguration(event => {
			if (event.affectsConfiguration("textToolkit.advanced")) {
				apply();
			}
		}),
		{
			dispose: () => {
				registration?.dispose();
				registration = undefined;
			},
		}
	);
}
