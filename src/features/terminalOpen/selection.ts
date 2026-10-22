// 读取终端选区: 运行时探测未定稿的 terminal.selection 属性.
import * as vscode from "vscode";

/** 同步且无副作用; 属性缺失, 类型不符或 getter 抛错时返回 undefined. */
export function peekTerminalSelection(terminal: vscode.Terminal): string | undefined {
	try {
		const value: unknown = Reflect.get(terminal, "selection");
		return typeof value === "string" && value.trim().length > 0 ? value : undefined;
	} catch {
		return undefined;
	}
}
