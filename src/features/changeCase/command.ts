import * as vscode from "vscode";
import { isBackItem, showMenu, type MenuItem, type PickOutcome } from "../../shared/quickPick";
import { CASE_COMMANDS, getCaseCommand } from "./transforms";
import { getChangeCaseWordRangeAtPosition, isRangeSimplyCursorPosition } from "./wordRange";

interface ReplacementAction {
	text: string;
	range: vscode.Range;
	replacement: string;
	/** 替换文本与原文本在最后一行的长度差; 行号不变时只有它会移动末行内的后续位置. */
	offset: number;
}

/** 光标(空选区)作用于所在的词, 非空选区作用于选区本身. */
function resolveTargetRange(
	selection: vscode.Selection,
	document: vscode.TextDocument
): vscode.Range | undefined {
	if (isRangeSimplyCursorPosition(selection)) {
		return getChangeCaseWordRangeAtPosition(document, selection.end);
	}
	return new vscode.Range(selection.start, selection.end);
}

function getSelectedTextIfOnlyOneSelection(): string | undefined {
	const editor = vscode.window.activeTextEditor;
	if (!editor) {
		return undefined;
	}
	const { document, selection, selections } = editor;
	if (selections.length > 1 || selection.start.line !== selection.end.line) {
		return undefined;
	}
	const range = resolveTargetRange(selections[0], document);
	return range ? document.getText(range) : undefined;
}

function compareByEndPosition(a: vscode.Range, b: vscode.Range): number {
	if (a.end.line !== b.end.line) {
		return a.end.line - b.end.line;
	}
	return a.end.character - b.end.character;
}

function buildAction(
	range: vscode.Range,
	document: vscode.TextDocument,
	transform: (input: string) => string
): ReplacementAction {
	const text = document.getText(range);

	let replacement: string;
	let offset: number;
	if (range.isSingleLine) {
		replacement = transform(text);
		offset = replacement.length - text.length;
	} else {
		// 按文档自身的行尾符切分, 而不是 os.EOL: 平台 EOL 与文档 EOL 不一致时
		// (例如 Windows 上编辑 LF 文档)用 os.EOL 会整块切不开.
		const eol = document.eol === vscode.EndOfLine.CRLF ? "\r\n" : "\n";
		const lines = text.split(eol);
		const replacementLines = lines.map(line => transform(line));
		replacement = replacementLines.join(eol);
		offset =
			replacementLines[replacementLines.length - 1].length - lines[lines.length - 1].length;
	}

	return { text, range, replacement, offset };
}

export async function runCaseCommand(commandLabel: string): Promise<void> {
	const command = getCaseCommand(commandLabel);
	if (!command) {
		return;
	}

	const editor = vscode.window.activeTextEditor;
	if (!editor) {
		return;
	}

	const document = editor.document;
	const actions: ReplacementAction[] = [];

	await editor.edit(editBuilder => {
		for (const selection of editor.selections) {
			const range = resolveTargetRange(selection, document);
			if (!range) {
				continue;
			}
			const action = buildAction(range, document, command.transform);
			actions.push(action);
			if (action.replacement !== action.text) {
				editBuilder.replace(action.range, action.replacement);
			}
		}
	});

	if (actions.length === 0) {
		return;
	}

	// 替换按原始坐标重建选区. 转换不增删行, 行号不变: 某位置的移位只来自同一行内
	// 结束位置不晚于它的编辑的末行长度差, 起点与终点分行取值, 混合单行与多行选区时
	// (起点行 != 终点行)才能把起始行里更早的单行编辑算进去, 也不会把前行编辑的偏移
	// 错算到后行位置上.
	const sorted = [...actions].sort((a, b) => compareByEndPosition(a.range, b.range));
	const offsetBefore = (line: number, character: number): number => {
		let shift = 0;
		for (const action of sorted) {
			const end = action.range.end;
			if (end.line === line && end.character <= character) {
				shift += action.offset;
			}
		}
		return shift;
	};

	editor.selections = actions.map(action => {
		const startShift = offsetBefore(action.range.start.line, action.range.start.character);
		const endShift = offsetBefore(action.range.end.line, action.range.end.character);
		return new vscode.Selection(
			action.range.start.line,
			action.range.start.character + startShift,
			action.range.end.line,
			action.range.end.character + endShift
		);
	});
}

/** 二级菜单: 16 种大小写风格, 单选区单行时用转换结果做预览. */
export async function showCaseStylePicker(withBack = false): Promise<PickOutcome> {
	const previewSource = getSelectedTextIfOnlyOneSelection();
	const items: MenuItem[] = CASE_COMMANDS.map(command => ({
		id: command.label,
		label: command.label,
		description: previewSource
			? vscode.l10n.t("Convert to {0}", command.transform(previewSource))
			: command.description,
	}));

	const picked = await showMenu(
		items,
		vscode.l10n.t("What do you want to do to the current word / selection(s)?"),
		withBack
	);
	if (!picked) {
		return "done";
	}
	if (isBackItem(picked)) {
		return "back";
	}
	await runCaseCommand(picked.id);
	return "done";
}

interface ChangeCaseArgs {
	style?: string;
}

export function registerChangeCaseCommands(context: vscode.ExtensionContext): void {
	context.subscriptions.push(
		vscode.commands.registerCommand("textToolkit.changeCase", async (args?: ChangeCaseArgs) => {
			if (args?.style) {
				await runCaseCommand(args.style);
				return;
			}
			await showCaseStylePicker();
		})
	);
}
