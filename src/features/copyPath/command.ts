import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { getAdvanced, getCopyPathConfig, type PathStyle } from '../../shared/config';
import { applyTilde, collectLineNumbers, formatResult } from './core';

export const PATH_STYLES: readonly PathStyle[] = ['relative', 'absolute', 'tilde', 'fileName'];

function resolvePath(document: vscode.TextDocument, pathStyle: PathStyle): string {
  const absolutePath = document.uri.fsPath;
  switch (pathStyle) {
    case 'fileName':
      return path.basename(absolutePath);
    case 'absolute':
      return absolutePath;
    case 'relative':
      return vscode.workspace.getWorkspaceFolder(document.uri)
        ? vscode.workspace.asRelativePath(document.uri, false)
        : absolutePath;
    case 'tilde':
      return applyTilde(absolutePath, os.homedir());
    default:
      throw new Error(`Invalid pathStyle: ${pathStyle}`);
  }
}

/** pathStyleOverride 用于二级 Quick Pick 与带参快捷键, 不写回配置. */
export async function copyPathWithLines(pathStyleOverride?: PathStyle): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    void vscode.window.showInformationMessage(vscode.l10n.t('No active editor to copy from.'));
    return;
  }

  const document = editor.document;
  if (document.isUntitled || document.uri.scheme !== 'file') {
    void vscode.window.showInformationMessage(
      vscode.l10n.t('Current document is not saved as a file.')
    );
    return;
  }

  const { pathStyle, separator, multiLineFormat } = getCopyPathConfig();
  const filePath = resolvePath(document, pathStyleOverride ?? pathStyle);
  const lines = collectLineNumbers(editor.selections);
  if (lines.length === 0) {
    void vscode.window.showInformationMessage(vscode.l10n.t('No selected lines to copy.'));
    return;
  }

  const spanSyntax = getAdvanced().copyPath.useLineCountSyntax ? 'count' : 'range';
  const result = formatResult(filePath, lines, separator, multiLineFormat, spanSyntax);
  await vscode.env.clipboard.writeText(result);
  vscode.window.setStatusBarMessage(vscode.l10n.t('Copied path with line numbers.'), 2000);
}

interface CopyPathArgs {
  pathStyle?: PathStyle;
}

export function registerCopyPathCommand(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('textToolkit.copyPathWithLines', (args?: CopyPathArgs) =>
      copyPathWithLines(
        args?.pathStyle && PATH_STYLES.includes(args.pathStyle) ? args.pathStyle : undefined
      )
    )
  );
}
