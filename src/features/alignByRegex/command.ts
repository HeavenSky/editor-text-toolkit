import * as vscode from 'vscode';
import { getAdvanced, getAlignTemplates, getEditorTabSize } from '../../shared/config';
import { isBackItem, showMenu, type MenuItem, type PickOutcome } from '../../shared/quickPick';
import { Block, type Eol } from './block';

let lastInput: string | undefined;

/** 用已确定的正则对主选区做对齐; 选区为空或正则非法时不做任何编辑. */
async function alignSelection(textEditor: vscode.TextEditor, regexInput: string): Promise<void> {
  const selection = textEditor.selection;
  if (selection.isEmpty) {
    return;
  }

  const document = textEditor.document;
  // 选区停在下一行行首时, 该行没有内容被选中, 不参与对齐.
  const endLine = selection.end.character === 0 ? selection.end.line - 1 : selection.end.line;
  if (endLine < selection.start.line) {
    return;
  }

  const range = new vscode.Range(
    new vscode.Position(selection.start.line, 0),
    new vscode.Position(endLine, document.lineAt(endLine).range.end.character)
  );
  const eol: Eol = document.eol === vscode.EndOfLine.CRLF ? '\r\n' : '\n';
  const block = new Block(document.getText(range), regexInput, selection.start.line, eol)
    .trim()
    .align(getEditorTabSize());

  await textEditor.edit((editBuilder) => {
    for (const line of block.lines) {
      const lineRange = new vscode.Range(
        new vscode.Position(line.number, 0),
        new vscode.Position(line.number, document.lineAt(line.number).range.end.character)
      );
      editBuilder.replace(lineRange, line.parts.map((part) => part.value).join(''));
    }
  });
}

async function promptForRegex(): Promise<string | undefined> {
  const input = await vscode.window.showInputBox({
    prompt: vscode.l10n.t('Enter regular expression or template name.'),
    value: getAdvanced().alignByRegex.rememberLastInput ? lastInput : undefined
  });
  if (input === undefined || input.length === 0) {
    return undefined;
  }
  lastInput = input;
  // 命中模板名时用模板里的正则; 否则把输入本身当正则.
  return getAlignTemplates()[input] ?? input;
}

export async function alignByRegex(regexInput?: string): Promise<void> {
  const textEditor = vscode.window.activeTextEditor;
  if (!textEditor) {
    void vscode.window.showInformationMessage(vscode.l10n.t('No active editor.'));
    return;
  }
  const resolved = regexInput ?? (await promptForRegex());
  if (resolved === undefined) {
    return;
  }
  await alignSelection(textEditor, resolved);
}

/** 二级菜单: 直接列出已保存的模板, 省去回忆模板名. */
export async function showAlignMenu(withBack = false): Promise<PickOutcome> {
  const templates = getAlignTemplates();
  const items: MenuItem[] = [
    {
      id: 'prompt',
      label: `$(regex) ${vscode.l10n.t('Enter a regular expression...')}`,
      alwaysShow: true
    },
    ...Object.entries(templates).map(([name, regex]) => ({
      id: `template:${name}`,
      label: `$(bookmark) ${name}`,
      description: regex
    }))
  ];

  const picked = await showMenu(items, vscode.l10n.t('Align selected lines by'), withBack);
  if (!picked) {
    return 'done';
  }
  if (isBackItem(picked)) {
    return 'back';
  }
  if (picked.id === 'prompt') {
    await alignByRegex();
    return 'done';
  }
  const name = picked.id.slice('template:'.length);
  await alignByRegex(templates[name]);
  return 'done';
}

interface AlignArgs {
  regex?: string;
  template?: string;
}

export function registerAlignByRegexCommand(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('textToolkit.alignByRegex', async (args?: AlignArgs) => {
      if (args?.regex) {
        await alignByRegex(args.regex);
        return;
      }
      if (args?.template) {
        const regex = getAlignTemplates()[args.template];
        if (!regex) {
          void vscode.window.showWarningMessage(
            vscode.l10n.t('No align template named "{0}".', args.template)
          );
          return;
        }
        await alignByRegex(regex);
        return;
      }
      await alignByRegex();
    })
  );
}
