import * as vscode from 'vscode';
import { getAdvanced, getLargeFileLimitMB, getPlainTextPromptConfig } from '../../shared/config';
import { isBackItem, showMenu, type MenuItem, type PickOutcome } from '../../shared/quickPick';
import {
  exceedsEditorSizeLimit,
  formatFileSize,
  matchesAutoApplyExtension,
  PLAIN_TEXT_LANGUAGE_ID,
  shouldPromptForSize
} from './core';
import { cleanUpPendingAssociations, openDocumentsAsPlainText } from './openFile';
import { applyOverrides, isApplied, restoreOverrides } from './settings';

const NEVER_PROMPT_KEY = 'textToolkit.plainText.neverPromptForLargeFiles';

function basename(uri: vscode.Uri): string {
  return uri.path.split('/').pop() || uri.toString();
}

async function isDirectory(uri: vscode.Uri): Promise<boolean> {
  try {
    const { type } = await vscode.workspace.fs.stat(uri);
    return (type & vscode.FileType.Directory) !== 0;
  } catch {
    return false;
  }
}

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

  /**
   * `originalLanguageId`: 文件是以"打开时就压成 plaintext"的方式进来的, 此时 document.languageId
   * 已经是 plaintext, 退出时要还原的是调用方推断出来的原语言.
   */
  async enter(editor: vscode.TextEditor, originalLanguageId?: string): Promise<void> {
    const document = editor.document;
    const key = document.uri.toString();

    if (!this.previousLanguages.has(key)) {
      this.previousLanguages.set(key, originalLanguageId ?? document.languageId);
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

  /**
   * 资源管理器右键"以纯文本模式打开": 支持单个文件与多选, 目录被跳过.
   * 打开前先把 uri 标记为已询问, 否则 onDidChangeActiveTextEditor 会先弹一次大文件提示.
   *
   * 打开这一步交给 openFile.ts: 它负责让文本模型从一开始就是 plaintext, 免得 TypeScript 之类的
   * 语言扩展被激活并加载整个项目 —— 那正是大文件卡在 "Activating Extensions..." 的原因.
   */
  async openInPlainText(uri: vscode.Uri | undefined, uris: vscode.Uri[] | undefined): Promise<void> {
    const targets = uris && uris.length > 0 ? uris : uri ? [uri] : [];
    if (targets.length === 0) {
      void vscode.window.showInformationMessage(vscode.l10n.t('No file selected.'));
      return;
    }

    const files: vscode.Uri[] = [];
    for (const target of targets) {
      if (await isDirectory(target)) {
        continue;
      }
      this.promptedUris.add(target.toString());
      files.push(target);
    }
    if (files.length === 0) {
      return;
    }

    const { suppressLanguageActivation } = getAdvanced().plainText;
    const opened = await openDocumentsAsPlainText(this.context, files, suppressLanguageActivation);

    const failed: string[] = [];
    for (const result of opened) {
      if (!result.document) {
        failed.push(basename(result.uri));
        continue;
      }
      const editor = await vscode.window.showTextDocument(result.document, { preview: false });
      if (!this.isActive(result.document)) {
        await this.enter(editor, result.originalLanguageId);
      }
    }

    if (failed.length > 0) {
      void vscode.window.showWarningMessage(
        vscode.l10n.t('Could not open in plain text mode: {0}', failed.join(', '))
      );
    }
  }

  async resetPrompt(): Promise<void> {
    await this.context.globalState.update(NEVER_PROMPT_KEY, undefined);
    this.promptedUris.clear();
    void vscode.window.showInformationMessage(vscode.l10n.t('Large file prompt re-enabled.'));
  }

  /**
   * 文件超过 `workbench.editorLargeFileConfirmation` 时, VS Code 根本不加载它, 编辑器换成
   * "The file is not displayed in the text editor because it is very large" 占位页.
   *
   * 那个占位页不是文本编辑器(没有 TextDocument, 也不会触发 onDidChangeActiveTextEditor),
   * 上面的按钮由 VS Code 写死, 唯一能往里加按钮的 `editor/content` 菜单又还是 proposed API,
   * 正式发布的扩展用不了. 所以改从标签页事件认出这种文件, 用通知给出等价入口 ——
   * 本扩展经扩展宿主打开文档, 不受该上限约束, 点一下就能真正看到内容.
   */
  async maybeOfferForTooLargeTab(uri: vscode.Uri): Promise<void> {
    const key = uri.toString();
    if (uri.scheme !== 'file' || this.promptedUris.has(key)) {
      return;
    }
    if (this.context.globalState.get<boolean>(NEVER_PROMPT_KEY)) {
      return;
    }
    // promptSizeMB <= 0 表示用户关掉了大文件提示, 这里一并尊重.
    if (getPlainTextPromptConfig().promptSizeMB <= 0) {
      return;
    }
    // 已经有对应文档说明文件其实加载成功了(例如用户点过 Open Anyway), 不是占位页.
    if (vscode.workspace.textDocuments.some((document) => document.uri.toString() === key)) {
      return;
    }

    let sizeBytes: number;
    try {
      sizeBytes = (await vscode.workspace.fs.stat(uri)).size;
    } catch {
      return;
    }
    if (!exceedsEditorSizeLimit(sizeBytes, getLargeFileLimitMB(uri))) {
      return;
    }

    this.promptedUris.add(key);
    const open = vscode.l10n.t('Open in plain text mode');
    const notNow = vscode.l10n.t('Not now');
    const never = vscode.l10n.t("Don't ask again");
    const choice = await vscode.window.showWarningMessage(
      vscode.l10n.t(
        'This file is {0}, too large for the text editor. Open it in plain text mode?',
        formatFileSize(sizeBytes)
      ),
      open,
      notNow,
      never
    );
    if (choice === open) {
      await this.openInPlainText(uri, undefined);
    } else if (choice === never) {
      await this.context.globalState.update(NEVER_PROMPT_KEY, true);
    }
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
    vscode.commands.registerCommand(
      'textToolkit.plainText.open',
      (uri?: vscode.Uri, uris?: vscode.Uri[]) => manager.openInPlainText(uri, uris)
    ),
    vscode.window.onDidChangeActiveTextEditor(async (editor) => {
      manager.updateStatusBar();
      if (editor) {
        await manager.maybeOffer(editor);
      }
    }),
    vscode.window.tabGroups.onDidChangeTabs((event) => {
      for (const tab of event.opened) {
        if (tab.input instanceof vscode.TabInputText) {
          void manager.maybeOfferForTooLargeTab(tab.input.uri);
        }
      }
    })
  );

  void cleanUpPendingAssociations(context);

  if (vscode.window.activeTextEditor) {
    void manager.maybeOffer(vscode.window.activeTextEditor);
  }

  // 上次会话遗留的"文件过大"标签页在启动时不会产生 opened 事件, 单独看一眼当前这个.
  const activeTab = vscode.window.tabGroups.activeTabGroup.activeTab;
  if (activeTab?.input instanceof vscode.TabInputText) {
    void manager.maybeOfferForTooLargeTab(activeTab.input.uri);
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
