import * as vscode from 'vscode';
import { isBackItem, showMenu, type MenuItem, type PickOutcome } from '../../shared/quickPick';
import { CASE_COMMANDS, getCaseCommand } from './transforms';
import { getChangeCaseWordRangeAtPosition, isRangeSimplyCursorPosition } from './wordRange';

interface ReplacementAction {
  text: string;
  range: vscode.Range;
  replacement: string;
  /** 替换文本与原文本在最后一行的长度差, 用于重算同一行后续选区的位置. */
  offset: number;
  newRange: vscode.Range;
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
    const eol = document.eol === vscode.EndOfLine.CRLF ? '\r\n' : '\n';
    const lines = text.split(eol);
    const replacementLines = lines.map((line) => transform(line));
    replacement = replacementLines.join(eol);
    offset =
      replacementLines[replacementLines.length - 1].length - lines[lines.length - 1].length;
  }

  return {
    text,
    range,
    replacement,
    offset,
    newRange: isRangeSimplyCursorPosition(range)
      ? range
      : new vscode.Range(
          range.start.line,
          range.start.character,
          range.end.line,
          range.end.character + offset
        )
  };
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

  await editor.edit((editBuilder) => {
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

  // 替换会改变文本长度, 因此按结束位置从前到后累加同一行的偏移量, 重建选区.
  const runningOffsets = new Map<number, number>();
  const adjustedRanges = [...actions]
    .sort((a, b) => compareByEndPosition(a.newRange, b.newRange))
    .map((action) => {
      const line = action.range.end.line;
      const runningOffset = runningOffsets.get(line) ?? 0;
      runningOffsets.set(line, runningOffset + action.offset);
      return new vscode.Range(
        action.newRange.start.line,
        action.newRange.start.character + runningOffset,
        action.newRange.end.line,
        action.newRange.end.character + runningOffset
      );
    });

  editor.selections = adjustedRanges.map(
    (range) =>
      new vscode.Selection(range.start.line, range.start.character, range.end.line, range.end.character)
  );
}

/** 二级菜单: 16 种大小写风格, 单选区单行时用转换结果做预览. */
export async function showCaseStylePicker(withBack = false): Promise<PickOutcome> {
  const previewSource = getSelectedTextIfOnlyOneSelection();
  const items: MenuItem[] = CASE_COMMANDS.map((command) => ({
    id: command.label,
    label: command.label,
    description: previewSource
      ? vscode.l10n.t('Convert to {0}', command.transform(previewSource))
      : command.description
  }));

  const picked = await showMenu(
    items,
    vscode.l10n.t('What do you want to do to the current word / selection(s)?'),
    withBack
  );
  if (!picked) {
    return 'done';
  }
  if (isBackItem(picked)) {
    return 'back';
  }
  await runCaseCommand(picked.id);
  return 'done';
}

interface ChangeCaseArgs {
  style?: string;
}

export function registerChangeCaseCommands(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('textToolkit.changeCase', async (args?: ChangeCaseArgs) => {
      if (args?.style) {
        await runCaseCommand(args.style);
        return;
      }
      await showCaseStylePicker();
    })
  );
}
