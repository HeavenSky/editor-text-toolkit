import * as vscode from 'vscode';
import { getDiffConfig } from '../../shared/config';
import { isBackItem, showMenu, type MenuItem, type PickOutcome } from '../../shared/quickPick';
import { DIFF_SCHEME, DiffContentProvider } from './contentProvider';
import {
  aggregateSelections,
  buildDiffTitle,
  encodeDiffPath,
  formatRangeLabel,
  FULL_RANGE_LABEL,
  resolveLanguages,
  type DiffSlot,
  type SelectionInfo
} from './core';
import { DiffRegistry } from './registry';

/**
 * Compare (Diff): 在文件内, 跨文件或与剪贴板之间比较文本片段.
 *
 * 两侧内容存在内存 registry 中, 通过一个只读的虚拟文档 scheme 交给 VS Code 自带的
 * diff 编辑器渲染, 因此字符级高亮, 差异跳转与折叠等能力全部由编辑器原生提供.
 */

/** 剪贴板一侧的显示名. 它同时会成为 URI 的一段, 因此保持 ASCII 且不本地化. */
const CLIPBOARD_NAME = 'Clipboard';

function basename(uri: vscode.Uri): string {
  return uri.path.split('/').pop() || uri.toString();
}

function sideLabel(info: SelectionInfo): string {
  return info.rangeLabel === FULL_RANGE_LABEL
    ? info.baseName
    : `${info.baseName} (${info.rangeLabel})`;
}

/** 多光标的各段选区按位置拼成一段; 完全没有选区时退回整个文档, 与上游行为一致. */
function captureSelection(editor: vscode.TextEditor): SelectionInfo {
  const document = editor.document;
  const aggregated = aggregateSelections(
    editor.selections
      .filter((selection) => !selection.isEmpty)
      .map((selection) => ({
        startLine: selection.start.line,
        startChar: selection.start.character,
        endLine: selection.end.line,
        text: document.getText(selection)
      }))
  );

  return {
    text: aggregated ? aggregated.text : document.getText(),
    baseName: basename(document.uri),
    rangeLabel: formatRangeLabel(aggregated?.ranges ?? null),
    languageId: document.languageId
  };
}

class CompareFeature {
  private readonly registry = new DiffRegistry();
  private readonly provider: DiffContentProvider;
  private readonly statusBarItem: vscode.StatusBarItem;

  constructor(context: vscode.ExtensionContext) {
    // 归一化规则的运行时开关尚未接入, 此处等价于"没有任何规则".
    this.provider = new DiffContentProvider(this.registry, () => []);
    // 优先级 99: 纯文本模式的状态栏项已经占用了 100.
    this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 99);
    this.statusBarItem.command = 'textToolkit.diff.showMenu';

    context.subscriptions.push(
      this.provider,
      this.statusBarItem,
      vscode.workspace.registerTextDocumentContentProvider(DIFF_SCHEME, this.provider)
    );
    this.updateStatusBar();
  }

  /** 有标记时常驻显示来源与行号; 上游没有任何反馈, 标记完就无从确认. */
  private updateStatusBar(): void {
    const marked = this.registry.marked;
    void vscode.commands.executeCommand(
      'setContext',
      'textToolkit.diff.hasMark',
      Boolean(marked)
    );

    if (!marked) {
      this.statusBarItem.hide();
      return;
    }
    this.statusBarItem.text = `$(diff) ${sideLabel(marked)}`;
    this.statusBarItem.tooltip = vscode.l10n.t(
      'Marked for comparison - click to open the compare menu'
    );
    this.statusBarItem.show();
  }

  private activeEditor(): vscode.TextEditor | undefined {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      void vscode.window.showInformationMessage(vscode.l10n.t('No active editor.'));
    }
    return editor;
  }

  /**
   * 打开一次比较. URI 需要 sessionId, 而 sessionId 由 registry 产出, 因此两侧 URI
   * 只能在 createSession 的回调里构造.
   */
  private async openDiff(left: SelectionInfo, right: SelectionInfo): Promise<void> {
    const uriOf = (sessionId: string, slot: DiffSlot, info: SelectionInfo): string =>
      vscode.Uri.from({
        scheme: DIFF_SCHEME,
        path: encodeDiffPath({
          sessionId,
          slot,
          rangeLabel: info.rangeLabel,
          baseName: info.baseName
        })
      }).toString();

    const { uris } = this.registry.createSession(left, right, (sessionId) => [
      uriOf(sessionId, 'left', left),
      uriOf(sessionId, 'right', right)
    ]);
    const [leftUri, rightUri] = uris.map((uri) => vscode.Uri.parse(uri));

    const languages = resolveLanguages(left.languageId, right.languageId);
    await this.applyLanguage(leftUri, languages.left);
    await this.applyLanguage(rightUri, languages.right);

    await vscode.commands.executeCommand(
      'vscode.diff',
      leftUri,
      rightUri,
      buildDiffTitle(left, right, false)
    );
  }

  /**
   * 让虚拟文档继承来源文件的语言(上游 issue #38). URI 末段的扩展名只是兜底,
   * 显式设置才能覆盖 untitled 与扩展名不足以判定语言的来源.
   */
  private async applyLanguage(uri: vscode.Uri, languageId?: string): Promise<void> {
    if (!languageId) {
      return;
    }
    try {
      const document = await vscode.workspace.openTextDocument(uri);
      if (document.languageId !== languageId) {
        await vscode.languages.setTextDocumentLanguage(document, languageId);
      }
    } catch {
      // 语言设置失败不该阻断比较本身, diff 仍会按 VS Code 的默认判定打开.
    }
  }

  markSelection(): void {
    const editor = this.activeEditor();
    if (!editor) {
      return;
    }
    this.registry.marked = captureSelection(editor);
    this.updateStatusBar();
    vscode.window.setStatusBarMessage(vscode.l10n.t('Marked for comparison.'), 2000);
  }

  clearMark(): void {
    this.registry.marked = null;
    this.updateStatusBar();
    vscode.window.setStatusBarMessage(vscode.l10n.t('Comparison mark cleared.'), 2000);
  }

  async compareWithMarked(): Promise<void> {
    const editor = this.activeEditor();
    if (!editor) {
      return;
    }
    const marked = this.registry.marked;
    if (!marked) {
      void vscode.window.showInformationMessage(
        vscode.l10n.t('Select text for compare first.')
      );
      return;
    }
    await this.openDiff(marked, captureSelection(editor));
  }

  async compareWithClipboard(): Promise<void> {
    const editor = this.activeEditor();
    if (!editor) {
      return;
    }

    // 剪贴板 API 只有 readText: 图片等非文本内容读出来就是空串, 与"剪贴板为空"不可区分.
    // 照常打开一侧全空的 diff 无法自证原因, 所以在这里就拦下来.
    let text: string;
    try {
      text = await vscode.env.clipboard.readText();
    } catch {
      text = '';
    }
    if (text === '') {
      void vscode.window.showInformationMessage(
        vscode.l10n.t(
          'The clipboard has no text to compare. Images and other non-text content cannot be compared.'
        )
      );
      return;
    }

    const clipboard: SelectionInfo = {
      text,
      baseName: CLIPBOARD_NAME,
      rangeLabel: FULL_RANGE_LABEL
    };
    const selection = captureSelection(editor);

    await (getDiffConfig().clipboardSide === 'right'
      ? this.openDiff(selection, clipboard)
      : this.openDiff(clipboard, selection));
  }

  private async infoFromUri(uri: vscode.Uri): Promise<SelectionInfo> {
    const document = await vscode.workspace.openTextDocument(uri);
    return {
      text: document.getText(),
      baseName: basename(uri),
      rangeLabel: FULL_RANGE_LABEL,
      languageId: document.languageId
    };
  }

  /** 左右顺序按 viewColumn, 与用户看到的排布一致. */
  async compareVisibleEditors(): Promise<void> {
    // 已经打开的比较结果本身也是"可见编辑器", 不排除掉的话数量永远凑不齐 2 个.
    const editors = vscode.window.visibleTextEditors.filter(
      (editor) => editor.document.uri.scheme !== DIFF_SCHEME
    );
    if (editors.length !== 2) {
      void vscode.window.showInformationMessage(
        vscode.l10n.t(
          'This command needs exactly 2 visible editors, but {0} are visible. Split the editor to show 2 files and try again.',
          editors.length
        )
      );
      return;
    }

    const [first, second] = [...editors].sort(
      (a, b) => (a.viewColumn ?? 0) - (b.viewColumn ?? 0)
    );
    await this.openDiff(captureSelection(first), captureSelection(second));
  }

  /**
   * 比较任意两个已打开的标签页, 不要求它们同时可见(上游 issue #33).
   * 上游只能比较可见编辑器, 是因为它写于 Tab API 出现之前.
   */
  async compareTabs(): Promise<void> {
    const seen = new Set<string>();
    const candidates: vscode.Uri[] = [];
    for (const group of vscode.window.tabGroups.all) {
      for (const tab of group.tabs) {
        // TabInputTextDiff 等非纯文本输入天然不满足这个判断, 无需单独排除.
        if (!(tab.input instanceof vscode.TabInputText)) {
          continue;
        }
        const { uri } = tab.input;
        const key = uri.toString();
        // 比较结果自身不能再作为比较对象; 同一文件在多个编辑器组里只列一次.
        if (uri.scheme === DIFF_SCHEME || seen.has(key)) {
          continue;
        }
        seen.add(key);
        candidates.push(uri);
      }
    }

    if (candidates.length < 2) {
      void vscode.window.showInformationMessage(
        vscode.l10n.t('Open at least 2 text tabs to compare.')
      );
      return;
    }

    const left = await this.pickTab(candidates, vscode.l10n.t('Pick the left side'));
    if (!left) {
      return;
    }
    const right = await this.pickTab(
      candidates.filter((uri) => uri.toString() !== left.toString()),
      vscode.l10n.t('Pick the right side')
    );
    if (!right) {
      return;
    }

    await this.openDiff(await this.infoFromUri(left), await this.infoFromUri(right));
  }

  private async pickTab(
    candidates: vscode.Uri[],
    placeHolder: string
  ): Promise<vscode.Uri | undefined> {
    const items = candidates.map((uri) => {
      const label = basename(uri);
      const relative = vscode.workspace.asRelativePath(uri, false);
      return { label, description: relative === label ? undefined : relative, uri };
    });
    const picked = await vscode.window.showQuickPick(items, {
      placeHolder,
      matchOnDescription: true
    });
    return picked?.uri;
  }

  /** 交换最近一次比较的两侧(上游 issue #96). 生成新 session, 原标签页内容不受影响. */
  async swapSides(): Promise<void> {
    const sessionId = this.registry.lastSessionId;
    const left = sessionId ? this.registry.getSlot(sessionId, 'left') : undefined;
    const right = sessionId ? this.registry.getSlot(sessionId, 'right') : undefined;
    if (!left || !right) {
      void vscode.window.showInformationMessage(
        vscode.l10n.t('No comparison to swap. Run a compare command first.')
      );
      return;
    }
    await this.openDiff(right, left);
  }

  /** 一级菜单里这一类的 description, 显示当前生效的关键设置. */
  categoryDescription(): string {
    return getDiffConfig().clipboardSide === 'right'
      ? vscode.l10n.t('clipboard on the right')
      : vscode.l10n.t('clipboard on the left');
  }

  async showMenu(withBack = false): Promise<PickOutcome> {
    const marked = this.registry.marked;
    const items: MenuItem[] = [
      {
        id: 'markSelection',
        label: `$(bookmark) ${vscode.l10n.t('Select Text for Compare')}`
      },
      {
        id: 'compareWithMarked',
        label: `$(diff) ${vscode.l10n.t('Compare Text with Marked Selection')}`,
        description: marked ? sideLabel(marked) : vscode.l10n.t('nothing marked yet')
      },
      {
        id: 'compareWithClipboard',
        label: `$(clippy) ${vscode.l10n.t('Compare Text with Clipboard')}`,
        description: this.categoryDescription()
      },
      {
        id: 'compareVisibleEditors',
        label: `$(split-horizontal) ${vscode.l10n.t('Compare Text in Visible Editors')}`
      },
      {
        id: 'compareTabs',
        label: `$(files) ${vscode.l10n.t('Compare Text in Two Open Tabs')}`
      },
      {
        id: 'swapSides',
        label: `$(arrow-swap) ${vscode.l10n.t('Swap Diff Sides')}`
      }
    ];
    if (marked) {
      items.push({
        id: 'clearMark',
        label: `$(clear-all) ${vscode.l10n.t('Clear the comparison mark')}`
      });
    }

    const picked = await showMenu(items, vscode.l10n.t('Compare (Diff)'), withBack);
    if (!picked) {
      return 'done';
    }
    if (isBackItem(picked)) {
      return 'back';
    }
    switch (picked.id) {
      case 'markSelection':
        this.markSelection();
        break;
      case 'compareWithMarked':
        await this.compareWithMarked();
        break;
      case 'compareWithClipboard':
        await this.compareWithClipboard();
        break;
      case 'compareVisibleEditors':
        await this.compareVisibleEditors();
        break;
      case 'compareTabs':
        await this.compareTabs();
        break;
      case 'swapSides':
        await this.swapSides();
        break;
      case 'clearMark':
        this.clearMark();
        break;
    }
    return 'done';
  }
}

export interface DiffFeature {
  categoryDescription(): string;
  showMenu(withBack?: boolean): Promise<PickOutcome>;
}

export function registerDiffFeature(context: vscode.ExtensionContext): DiffFeature {
  const feature = new CompareFeature(context);

  context.subscriptions.push(
    vscode.commands.registerCommand('textToolkit.diff.markSelection', () =>
      feature.markSelection()
    ),
    vscode.commands.registerCommand('textToolkit.diff.compareWithMarked', () =>
      feature.compareWithMarked()
    ),
    vscode.commands.registerCommand('textToolkit.diff.compareWithClipboard', () =>
      feature.compareWithClipboard()
    ),
    vscode.commands.registerCommand('textToolkit.diff.compareVisibleEditors', () =>
      feature.compareVisibleEditors()
    ),
    vscode.commands.registerCommand('textToolkit.diff.compareTabs', () => feature.compareTabs()),
    vscode.commands.registerCommand('textToolkit.diff.swapSides', () => feature.swapSides()),
    vscode.commands.registerCommand('textToolkit.diff.showMenu', () => feature.showMenu(false))
  );

  return feature;
}
