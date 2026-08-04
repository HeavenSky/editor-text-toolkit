import * as vscode from 'vscode';
import { registerAlignByRegexCommand } from './features/alignByRegex/command';
import { registerChangeCaseCommands } from './features/changeCase/command';
import { registerCopyPathCommand } from './features/copyPath/command';
import { registerMenuCommand } from './features/menu/command';
import { registerPlainTextMode } from './features/plainText/command';

export function activate(context: vscode.ExtensionContext): void {
  registerCopyPathCommand(context);
  registerChangeCaseCommands(context);
  registerAlignByRegexCommand(context);
  const plainText = registerPlainTextMode(context);
  registerMenuCommand(context, plainText);
}

export function deactivate(): void {
  /* 所有 disposable 都挂在 context.subscriptions 上, 无需额外清理 */
}
