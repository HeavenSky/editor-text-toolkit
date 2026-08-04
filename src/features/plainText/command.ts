import * as vscode from 'vscode';
import { getAdvanced, getPlainTextPromptConfig } from '../../shared/config';
import { isBackItem, showMenu, type MenuItem, type PickOutcome } from '../../shared/quickPick';
import {
  formatFileSize,
  matchesAutoApplyExtension,
  PLAIN_TEXT_LANGUAGE_ID,
  shouldPromptForSize
} from './core';
import { applyOverrides, isApplied, restoreOverrides } from './settings';

const NEVER_PROMPT_KEY = 'textToolkit.plainText.neverPromptForLargeFiles';

/**
 * 纯文本模式: 把文档语言切成 plaintext(停掉分词, 语义高亮与语言服务),
 * 并可选地按 `[plaintext]` 语言作用域关掉渲染开销较大的编辑器功能.
 *
 * 语言原值按 uri 记忆, 退出时还原; 设置原值由 settings.ts 持久化记忆.
 */
class PlainTextModeManager {
  /** uri.toString() -> 进入模式前的 languageId. */
  private readonly previousLanguages = new Map<string, string>();
  /** uri.toString() -> 进入模式前的行号显示方式(仅在我们改过时才有值). */
  private readonly previousLineNumbers = new Map<string, vscode.TextEditorLineNumbersStyle>();
  private readonly promptedUris = new Set<string>();
  private readonly statusBarItem: vscode.StatusBarItem;

  constructor(private readonly context: vscode.ExtensionContext) {
    this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.statusBarItem.text = `$(text-size) ${vscode.l10n.t('Plain Text')}`;
    this.statusBarItem.tooltip = vscode.l10n.t('Plain text mode is active - click to exit');
    this.statusBarItem.command = 'textToolkit.plainText.toggle';
    context.subscriptions.push(this.statusBarItem);
  }

  isActive(document: vscode.TextDocument): boolean {
    return this.previousLanguages.has(document.uri.toString());
  }

  isActiveForActiveEditor(): boolean {
    const document = vscode.window.activeTextEditor?.document;
    return document ? this.isActive(document) : false;
  }

  updateStatusBar(): void {
    if (this.isActiveForActiveEditor()) {
      this.statusBarItem.show();
    } else {
      this.statusBarItem.hide();
    }
  }

  async enter(editor: vscode.TextEditor): Promise<void> {
    const document = editor.document;
    const key = document.uri.toString();

    if (!this.previousLanguages.has(key)) {
      this.previousLanguages.set(key, document.languageId);
    }
    if (document.languageId !== PLAIN_TEXT_LANGUAGE_ID) {
      await vscode.languages.setTextDocumentLanguage(document, PLAIN_TEXT_LANGUAGE_ID);
    }

    const advanced = getAdvanced().plainText;
    if (advanced.disableLineNumbers && editor.options.lineNumbers !== undefined) {
      this.previousLineNumbers.set(key, editor.options.lineNumbers);
      editor.options = { lineNumbers: vscode.TextEditorLineNumbersStyle.Off };
    }
    if (advanced.applyEditorSettings) {
      const { applied, failed } = await applyOverrides(this.context, advanced.editorOverrides);
      if (failed.length > 0) {
        console.log(
          `[Text Toolkit] plain text mode: applied ${applied} settings, skipped ${failed.length}: ${failed.join(', ')}`
        );
      }
    }

    this.updateStatusBar();
    vscode.window.setStatusBarMessage(vscode.l10n.t('Plain text mode enabled.'), 2000);
  }

  async exit(editor: vscode.TextEditor | undefined): Promise<void> {
    const document = editor?.document;
    if (document) {
      const key = document.uri.toString();
      const previousLanguage = this.previousLanguages.get(key);
      if (previousLanguage && previousLanguage !== document.languageId) {
        await vscode.languages.setTextDocumentLanguage(document, previousLanguage);
      }
      this.previousLanguages.delete(key);
      const previousLineNumbers = this.previousLineNumbers.get(key);
      if (editor && previousLineNumbers !== undefined) {
        editor.options = { lineNumbers: previousLineNumbers };
        this.previousLineNumbers.delete(key);
      }
    }

    // 设置是全局/工作区级的, 只要没有别的文档还处于纯文本模式就还原.
    if (this.previousLanguages.size === 0 && isApplied(this.context)) {
      await restoreOverrides(this.context);
    }

    this.updateStatusBar();
    vscode.window.setStatusBarMessage(vscode.l10n.t('Plain text mode disabled.'), 2000);
  }

  async toggle(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      void vscode.window.showInformationMessage(vscode.l10n.t('No active editor.'));
      return;
    }
    if (this.isActive(editor.document)) {
      await this.exit(editor);
    } else {
      await this.enter(editor);
    }
  }

  async resetPrompt(): Promise<void> {
    await this.context.globalState.update(NEVER_PROMPT_KEY, undefined);
    this.promptedUris.clear();
    void vscode.window.showInformationMessage(vscode.l10n.t('Large file prompt re-enabled.'));
  }

  /** 打开文件时按扩展名自动进入, 或按体积询问一次. */
  async maybeOffer(editor: vscode.TextEditor): Promise<void> {
    const document = editor.document;
    if (document.uri.scheme !== 'file' || this.isActive(document)) {
      return;
    }

    const { promptSizeMB, autoApplyExtensions } = getPlainTextPromptConfig();
    if (matchesAutoApplyExtension(document.uri.fsPath, autoApplyExtensions)) {
      await this.enter(editor);
      return;
    }

    const key = document.uri.toString();
    if (this.promptedUris.has(key) || this.context.globalState.get<boolean>(NEVER_PROMPT_KEY)) {
      return;
    }

    let sizeBytes: number;
    try {
      sizeBytes = (await vscode.workspace.fs.stat(document.uri)).size;
    } catch {
      return;
    }
    if (!shouldPromptForSize(sizeBytes, promptSizeMB)) {
      return;
    }

    this.promptedUris.add(key);
    const enable = vscode.l10n.t('Enable');
    const notNow = vscode.l10n.t('Not now');
    const never = vscode.l10n.t("Don't ask again");
    const choice = await vscode.window.showInformationMessage(
      vscode.l10n.t(
        'This file is {0}. Switch to plain text mode for faster editing?',
        formatFileSize(sizeBytes)
      ),
      enable,
      notNow,
      never
    );
    if (choice === enable) {
      await this.enter(editor);
    } else if (choice === never) {
      await this.context.globalState.update(NEVER_PROMPT_KEY, true);
    }
  }
}

export interface PlainTextFeature {
  toggle(): Promise<void>;
  resetPrompt(): Promise<void>;
  isActiveForActiveEditor(): boolean;
  showMenu(withBack?: boolean): Promise<PickOutcome>;
}

export function registerPlainTextMode(context: vscode.ExtensionContext): PlainTextFeature {
  const manager = new PlainTextModeManager(context);

  context.subscriptions.push(
    vscode.commands.registerCommand('textToolkit.plainText.toggle', () => manager.toggle()),
    vscode.window.onDidChangeActiveTextEditor(async (editor) => {
      manager.updateStatusBar();
      if (editor) {
        await manager.maybeOffer(editor);
      }
    })
  );

  if (vscode.window.activeTextEditor) {
    void manager.maybeOffer(vscode.window.activeTextEditor);
  }

  /** 二级菜单: 开关随当前状态变化, 外加重新启用大文件提示. */
  const showPlainTextMenu = async (withBack = false): Promise<PickOutcome> => {
    const active = manager.isActiveForActiveEditor();
    const items: MenuItem[] = [
      {
        id: 'toggle',
        label: active
          ? `$(circle-slash) ${vscode.l10n.t('Disable plain text mode')}`
          : `$(text-size) ${vscode.l10n.t('Enable plain text mode')}`,
        description: active ? vscode.l10n.t('Restores language and settings') : undefined
      },
      {
        id: 'resetPrompt',
        label: `$(bell) ${vscode.l10n.t('Re-enable large file prompt')}`
      }
    ];

    const picked = await showMenu(items, vscode.l10n.t('Plain text mode'), withBack);
    if (!picked) {
      return 'done';
    }
    if (isBackItem(picked)) {
      return 'back';
    }
    if (picked.id === 'toggle') {
      await manager.toggle();
    } else {
      await manager.resetPrompt();
    }
    return 'done';
  };

  return {
    toggle: () => manager.toggle(),
    resetPrompt: () => manager.resetPrompt(),
    isActiveForActiveEditor: () => manager.isActiveForActiveEditor(),
    showMenu: showPlainTextMenu
  };
}
