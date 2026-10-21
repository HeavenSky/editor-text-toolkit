// 读取终端选区: 运行时探测未定稿的 terminal.selection 属性, 属性不可用时借剪贴板复制一次再恢复.
import * as vscode from "vscode";
import {
	COPY_SELECTION_TIMEOUT_MS,
	createSerialQueue,
	errorMessage,
	interpretProbe,
	makeSentinel,
	raceTimeout,
} from "./core";

export type SelectionResult =
	| { readonly kind: "text"; readonly text: string; readonly source: "api" | "clipboard" }
	/** notified: VS Code 已弹过自带的无选区提示, 调用方不要再提示一次. */
	| { readonly kind: "none"; readonly notified: boolean }
	| { readonly kind: "error"; readonly message: string };

export type ClipboardReadResult =
	| { readonly kind: "text"; readonly text: string }
	| { readonly kind: "none" }
	| { readonly kind: "error"; readonly message: string };

const COPY_SELECTION_COMMAND = "workbench.action.terminal.copySelection";

/** 同步且无副作用; 属性缺失, 类型不符或 getter 抛错时返回 undefined. */
export function peekTerminalSelection(terminal: vscode.Terminal): string | undefined {
	try {
		const value: unknown = Reflect.get(terminal, "selection");
		return typeof value === "string" && value.trim().length > 0 ? value : undefined;
	} catch {
		return undefined;
	}
}

type SelectionProbe =
	| { readonly kind: "unsupported" }
	| { readonly kind: "empty" }
	| { readonly kind: "text"; readonly text: string };

/** 属性存在但为空说明运行时支持该属性, 只是没有选区, 不能走剪贴板降级. */
function probeSelectionProperty(terminal: vscode.Terminal): SelectionProbe {
	try {
		if (!Reflect.has(terminal, "selection")) {
			return { kind: "unsupported" };
		}
		const value: unknown = Reflect.get(terminal, "selection");
		return typeof value === "string" && value.trim().length > 0
			? { kind: "text", text: value }
			: { kind: "empty" };
	} catch {
		return { kind: "unsupported" };
	}
}

/** 连按快捷键时第二次必须等第一次恢复完剪贴板, 否则会把哨兵当成原内容保存. */
const runExclusive = createSerialQueue();

/**
 * 只作用于 window.activeTerminal: 复制命令不接受终端参数.
 * 原剪贴板为空时不写哨兵, 因此"原本是图片且没有选区"时剪贴板完全不被改动.
 */
export function readSelectionViaClipboard(): Promise<ClipboardReadResult> {
	return runExclusive(async (): Promise<ClipboardReadResult> => {
		const clipboard = vscode.env.clipboard;
		let original: string;
		try {
			original = await clipboard.readText();
		} catch (error) {
			return { kind: "error", message: errorMessage(error) };
		}

		const probe =
			original === "" ? "" : makeSentinel(Date.now(), Math.random().toString(36).slice(2));
		let wrote = false;
		let after: string | undefined;
		let failure: string | undefined;
		try {
			if (probe !== "") {
				await clipboard.writeText(probe);
				wrote = true;
			}
			// 该命令的 Promise 在剪贴板写入完成后才 resolve, 不需要轮询.
			const copied = await raceTimeout(
				vscode.commands.executeCommand(COPY_SELECTION_COMMAND),
				COPY_SELECTION_TIMEOUT_MS
			);
			if (copied.timedOut) {
				failure = vscode.l10n.t("timed out");
			}
			after = await clipboard.readText();
		} catch (error) {
			failure = errorMessage(error);
		}

		if (wrote || after === undefined || interpretProbe(original, probe, after).restore) {
			try {
				await clipboard.writeText(original);
			} catch {
				void vscode.window.showWarningMessage(
					vscode.l10n.t("Failed to restore the clipboard.")
				);
			}
		}

		if (after === undefined) {
			return { kind: "error", message: failure ?? "" };
		}
		const selection = interpretProbe(original, probe, after).selection;
		if (selection !== undefined) {
			return { kind: "text", text: selection };
		}
		return failure === undefined ? { kind: "none" } : { kind: "error", message: failure };
	});
}

export async function readTerminalSelection(terminal: vscode.Terminal): Promise<SelectionResult> {
	const probe = probeSelectionProperty(terminal);
	if (probe.kind === "text") {
		return { kind: "text", text: probe.text, source: "api" };
	}
	// 非活动终端不降级: 复制命令会读到活动终端的选区, 切换终端又会抢焦点.
	if (probe.kind === "empty" || terminal !== vscode.window.activeTerminal) {
		return { kind: "none", notified: false };
	}
	const result = await readSelectionViaClipboard();
	switch (result.kind) {
		case "text":
			return { kind: "text", text: result.text, source: "clipboard" };
		case "none":
			return { kind: "none", notified: true };
		case "error":
			return { kind: "error", message: result.message };
	}
}
