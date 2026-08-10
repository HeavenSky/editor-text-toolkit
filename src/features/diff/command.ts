import * as vscode from 'vscode';
import { getDiffConfig } from '../../shared/config';
import { isBackItem, showMenu, type MenuItem, type PickOutcome } from '../../shared/quickPick';
import { DIFF_SCHEME, DiffContentProvider } from './contentProvider';
import {
  aggregateSelections,
  applyRules,
  bothSidesEditableInPlace,
  buildDiffTitle,
  decodeDiffPath,
  encodeDiffPath,
  formatRangeLabel,
  FULL_RANGE_LABEL,
  resolveLanguages,
  type DiffSlot,
  type SelectionInfo
} from './core';
import { DIFF_EDIT_SCHEME, EditableCopyFileSystem } from './editableFileSystem';
import { EditableCopyStore } from './editableStore';
import { DiffRegistry } from './registry';
import { NormalizationRuleStore } from './rules';

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

/** 本扩展打开的比较结果自身不能再成为比较对象, 两个 scheme 都要排除. */
function isDiffScheme(scheme: string): boolean {
  return scheme === DIFF_SCHEME || scheme === DIFF_EDIT_SCHEME;
}

/**
 * 活动标签页若是本扩展打开的一次比较, 返回它的两侧 URI 与所属 scheme.
 *
 * 不依赖 `editor/title` 菜单传给命令的参数 —— 那个参数在 diff 编辑器里指向哪一侧
 * 没有明确承诺, 而标签页的输入是确定的.
 */
function activeDiffTab():
  | { tab: vscode.Tab; original: vscode.Uri; modified: vscode.Uri; scheme: string }
  | undefined {
  const tab = vscode.window.tabGroups.activeTabGroup.activeTab;
  if (!tab || !(tab.input instanceof vscode.TabInputTextDiff)) {
    return undefined;
  }
  const { original, modified } = tab.input;
  if (original.scheme !== modified.scheme || !isDiffScheme(original.scheme)) {
    return undefined;
  }
  return { tab, original, modified, scheme: original.scheme };
}

/**
 * 该 scheme 的文件系统是否可写. `untitled` 不是注册过的文件系统提供器,
 * 但 untitled 编辑器本来就能改, 因此显式当作可写.
 */
function isWritableScheme(scheme: string): boolean {
  return scheme === 'untitled' ? true : vscode.workspace.fs.isWritableFileSystem(scheme) === true;
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
    languageId: document.languageId,
    sourceScheme: document.uri.scheme
  };
}

class CompareFeature {
  private readonly registry = new DiffRegistry();
  private readonly rules = new NormalizationRuleStore(
    () => getDiffConfig().normalizationRules
  );
  private readonly provider: DiffContentProvider;
  private readonly editable = new EditableCopyStore();
  private readonly statusBarItem: vscode.StatusBarItem;

  constructor(context: vscode.ExtensionContext) {
    // 规则在渲染时才套用, 因此切换启停只需重新触发一次 provide 就能刷新已打开的比较.
    this.provider = new DiffContentProvider(this.registry, () => this.rules.activeRules);
    const editableFileSystem = new EditableCopyFileSystem(this.editable);
    // 优先级 99: 纯文本模式的状态栏项已经占用了 100.
    this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 99);
    this.statusBarItem.command = 'textToolkit.diff.showMenu';

    context.subscriptions.push(
      this.provider,
      this.statusBarItem,
      vscode.workspace.registerTextDocumentContentProvider(DIFF_SCHEME, this.provider),
      editableFileSystem,
      vscode.workspace.registerFileSystemProvider(DIFF_EDIT_SCHEME, editableFileSystem, {
        isCaseSensitive: true
      }),
      // 副本内容跟着标签页走: 文档关掉就释放, 内存不会随比较次数增长.
      //
      // 推迟一个微任务再释放, 并复查文档是否真的不在了: 切换语言时 VS Code 会把同一个
      // 文档先关闭再重开(ext host 的 $acceptModelLanguageChanged 连续 fire 移除与新增),
      // 立即释放会让紧接着的重新读取只剩占位文案. 交换两侧时旧标签页也是这样被关掉的.
      vscode.workspace.onDidCloseTextDocument((document) => {
        if (document.uri.scheme !== DIFF_EDIT_SCHEME) {
          return;
        }
        const key = document.uri.toString();
        void Promise.resolve().then(() => {
          const stillOpen = vscode.workspace.textDocuments.some(
            (open) => open.uri.toString() === key
          );
          if (!stillOpen) {
            this.editable.release(key);
          }
        });
      })
    );
    this.updateStatusBar();
  }

  /**
   * 常驻显示当前标记与激活的规则数.
   *
   * 上游没有任何反馈, 标记完就无从确认; 而 diff 标题里的 `~` 只是打开那一刻的快照,
   * 之后切换规则也不会变, 所以需要一个始终准确的指示器.
   */
  private updateStatusBar(): void {
    const marked = this.registry.marked;
    void vscode.commands.executeCommand(
      'setContext',
      'textToolkit.diff.hasMark',
      Boolean(marked)
    );

    const activeRules = this.rules.activeRules.length;
    const segments: string[] = [];
    const tips: string[] = [];
    if (marked) {
      segments.push(`$(diff) ${sideLabel(marked)}`);
      tips.push(vscode.l10n.t('Marked for comparison - click to open the compare menu'));
    }
    if (activeRules > 0) {
      segments.push(`$(filter)${activeRules}`);
      tips.push(
        vscode.l10n.t(
          'Normalization is on. The ~ in a diff title is a snapshot from when it opened; this count is always current.'
        )
      );
    }

    if (segments.length === 0) {
      this.statusBarItem.hide();
      return;
    }
    this.statusBarItem.text = segments.join(' · ');
    this.statusBarItem.tooltip = tips.join('\n');
    this.statusBarItem.show();
  }

  /** `激活数/总数`, 没有配置任何规则时返回 undefined. */
  private ruleSummary(): string | undefined {
    const all = this.rules.getAll();
    return all.length === 0
      ? undefined
      : `${all.filter((rule) => rule.active).length}/${all.length}`;
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
      buildDiffTitle(left, right, this.rules.hasActiveRules)
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

  /**
   * 副本的初始内容取"屏幕上正在显示的文本": 已打开的只读文档优先, 读不到时按当前规则重算.
   * 用户手改过 settings.json 时前者才准确 —— 那种情况下已打开的 diff 并没有收到刷新事件.
   */
  private renderedText(uri: vscode.Uri, info: SelectionInfo): string {
    const opened = vscode.workspace.textDocuments.find(
      (document) => document.uri.toString() === uri.toString()
    );
    return opened?.getText() ?? applyRules(info.text, this.rules.activeRules);
  }

  /**
   * 打开一份可编辑副本. 内容只存在内存里, 保存也只写内存, 不回写任何源文件.
   * 归一化规则在这里就被烘焙进内容, 之后切换规则不会再改动它 —— 否则会覆盖用户的编辑.
   */
  private async openEditableDiff(
    left: SelectionInfo,
    right: SelectionInfo,
    texts: readonly [string, string],
    viewColumn?: vscode.ViewColumn
  ): Promise<void> {
    const sessionId = this.editable.nextSessionId(Date.now());
    const uriOf = (slot: DiffSlot, info: SelectionInfo): vscode.Uri =>
      vscode.Uri.from({
        scheme: DIFF_EDIT_SCHEME,
        path: encodeDiffPath({
          sessionId,
          slot,
          rangeLabel: info.rangeLabel,
          baseName: info.baseName
        })
      });

    const leftUri = uriOf('left', left);
    const rightUri = uriOf('right', right);
    // 先登记内容: 设置语言会打开文档, 那时文件系统提供器就已经要能读到内容.
    this.editable.register([leftUri.toString(), rightUri.toString()], texts);

    const languages = resolveLanguages(left.languageId, right.languageId);
    await this.applyLanguage(leftUri, languages.left);
    await this.applyLanguage(rightUri, languages.right);

    await vscode.commands.executeCommand(
      'vscode.diff',
      leftUri,
      rightUri,
      buildDiffTitle(left, right, this.rules.hasActiveRules, true),
      viewColumn === undefined ? undefined : { viewColumn, preview: false }
    );
  }

  /**
   * 把当前这次比较换成一份两侧都可编辑的副本.
   *
   * 从 diff 编辑器触发时原地替换: 副本开在同一编辑器组, 随后关掉原来的只读标签页.
   * 从选择器在别处触发时, 退回到最近一次比较另开一份副本, 不动任何已有标签页.
   */
  async openEditableCopy(): Promise<void> {
    const source = activeDiffTab();
    if (source?.scheme === DIFF_EDIT_SCHEME) {
      void vscode.window.showInformationMessage(
        vscode.l10n.t('This comparison is already an editable copy.')
      );
      return;
    }

    const uris = source
      ? [source.original, source.modified]
      : (this.registry.getUris(this.registry.lastSessionId ?? '') ?? []).map((uri) =>
          vscode.Uri.parse(uri)
        );
    if (uris.length !== 2) {
      void vscode.window.showInformationMessage(
        vscode.l10n.t(
          'No comparison to edit. Run a compare command first, then use this from its diff editor.'
        )
      );
      return;
    }

    const [left, right] = uris.map((uri) => {
      const parts = decodeDiffPath(uri.path);
      return parts ? this.registry.getSlot(parts.sessionId, parts.slot) : undefined;
    });
    if (!left || !right) {
      void vscode.window.showInformationMessage(
        vscode.l10n.t(
          'This comparison is no longer available. Please run the compare command again.'
        )
      );
      return;
    }

    // 两侧本来就是完整的可写文件时, 原生的 Select for Compare 更好: 它可编辑且带 Git 集成.
    if (bothSidesEditableInPlace(left, right, isWritableScheme)) {
      void vscode.window.showInformationMessage(
        vscode.l10n.t(
          'Both sides are whole files you can already edit. Use the built-in Select for Compare / Compare with Selected instead.'
        )
      );
      return;
    }

    await this.openEditableDiff(
      left,
      right,
      [this.renderedText(uris[0], left), this.renderedText(uris[1], right)],
      source?.tab.group.viewColumn
    );
    if (source) {
      // 先开新的再关旧的. 只读文档没有未保存内容, 因此关闭不会有任何询问.
      await vscode.window.tabGroups.close(source.tab);
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
      languageId: document.languageId,
      sourceScheme: uri.scheme
    };
  }

  /** 左右顺序按 viewColumn, 与用户看到的排布一致. */
  async compareVisibleEditors(): Promise<void> {
    // 已经打开的比较结果本身也是"可见编辑器", 不排除掉的话数量永远凑不齐 2 个.
    const editors = vscode.window.visibleTextEditors.filter(
      (editor) => !isDiffScheme(editor.document.uri.scheme)
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
        if (isDiffScheme(uri.scheme) || seen.has(key)) {
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
    const copy = activeDiffTab();
    if (copy?.scheme === DIFF_EDIT_SCHEME) {
      await this.reopenSwapped(copy);
      return;
    }

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

  /**
   * 把一份已打开的可编辑副本左右互换.
   *
   * 反序重开同两个文档而不是复制一份新副本, 因此用户尚未保存的编辑不会丢. 标题从 URI 还原,
   * 不查 registry —— 可编辑副本刻意不登记在那里(内容按 URI 存, 见 editableStore.ts).
   */
  private async reopenSwapped(copy: {
    tab: vscode.Tab;
    original: vscode.Uri;
    modified: vscode.Uri;
  }): Promise<void> {
    const labelOf = (uri: vscode.Uri): SelectionInfo | null => {
      const parts = decodeDiffPath(uri.path);
      return parts ? { text: '', baseName: parts.baseName, rangeLabel: parts.rangeLabel } : null;
    };

    await vscode.commands.executeCommand(
      'vscode.diff',
      copy.modified,
      copy.original,
      buildDiffTitle(
        labelOf(copy.modified),
        labelOf(copy.original),
        this.rules.hasActiveRules,
        true
      ),
      { viewColumn: copy.tab.group.viewColumn, preview: false }
    );
    // 两个文档已经被新标签页持有, 因此关掉旧标签页不会触发保存询问.
    await vscode.window.tabGroups.close(copy.tab);
  }

  /**
   * 切换归一化规则的启停(上游 issue #24 的落点).
   *
   * 启停只改内存状态, 不写回 settings.json; 改完立刻刷新所有仍然有效的比较,
   * 因此不需要关掉 diff 再重新比较一次.
   */
  async toggleNormalizationRules(): Promise<void> {
    const all = this.rules.getAll();
    if (all.length === 0) {
      void vscode.window.showInformationMessage(
        vscode.l10n.t(
          'No normalization rules configured. Add them in textToolkit.diff.normalizationRules.'
        )
      );
      return;
    }

    const items = all.map((rule, index) => ({
      label: rule.name ?? vscode.l10n.t('(rule without a name)'),
      description: rule.match,
      picked: rule.active,
      index
    }));
    const picked = await vscode.window.showQuickPick(items, {
      canPickMany: true,
      placeHolder: vscode.l10n.t('Pick the normalization rules to apply')
    });
    if (!picked) {
      // 取消不改变任何状态, 与上游 normalisation-rule-picker.ts:16 的语义一致.
      return;
    }

    this.rules.setActive(picked.map((item) => item.index));
    this.provider.refreshAll();
    this.updateStatusBar();
  }

  /** 一级菜单里这一类的 description, 显示当前生效的关键设置. */
  categoryDescription(): string {
    const side =
      getDiffConfig().clipboardSide === 'right'
        ? vscode.l10n.t('clipboard on the right')
        : vscode.l10n.t('clipboard on the left');
    const rules = this.ruleSummary();
    return rules ? `${side} · $(filter) ${rules}` : side;
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
      },
      {
        id: 'editableCopy',
        label: `$(edit) ${vscode.l10n.t('Edit This Comparison as a Copy')}`
      },
      {
        id: 'toggleNormalizationRules',
        label: `$(filter) ${vscode.l10n.t('Toggle Normalization Rules')}`,
        description: this.ruleSummary()
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
      case 'editableCopy':
        await this.openEditableCopy();
        break;
      case 'toggleNormalizationRules':
        await this.toggleNormalizationRules();
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
    vscode.commands.registerCommand('textToolkit.diff.editableCopy', () =>
      feature.openEditableCopy()
    ),
    vscode.commands.registerCommand('textToolkit.diff.toggleNormalizationRules', () =>
      feature.toggleNormalizationRules()
    ),
    vscode.commands.registerCommand('textToolkit.diff.showMenu', () => feature.showMenu(false))
  );

  return feature;
}
