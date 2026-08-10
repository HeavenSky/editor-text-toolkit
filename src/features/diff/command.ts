import * as vscode from 'vscode';
import { getDiffConfig } from '../../shared/config';
import { isBackItem, showMenu, type MenuItem, type PickOutcome } from '../../shared/quickPick';
import { DIFF_SCHEME, DiffContentProvider } from './contentProvider';
import {
  aggregateSelections,
  applyRules,
  bothSidesEditableInPlace,
  buildDiffTitle,
  copyFileName,
  decodeDiffPath,
  encodeDiffPath,
  extensionOf,
  formatRangeLabel,
  FULL_RANGE_LABEL,
  resolveLanguages,
  type DiffSlot,
  type SelectionInfo
} from './core';
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

/** 副本目录名里的这个记号既保证同一次比较可以做多份副本, 也让菜单的 when 子句能认出副本. */
const COPY_MARK = '.copy';

/** 活动标签页若是一个 diff, 返回它的两侧 URI; 不是则 undefined. */
function activeDiffTab():
  | { tab: vscode.Tab; original: vscode.Uri; modified: vscode.Uri }
  | undefined {
  const tab = vscode.window.tabGroups.activeTabGroup.activeTab;
  if (!tab || !(tab.input instanceof vscode.TabInputTextDiff)) {
    return undefined;
  }
  const { original, modified } = tab.input;
  return { tab, original, modified };
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
    sourceScheme: document.uri.scheme,
    sourceUri: document.uri.toString(),
    ...(aggregated ? { sourceRange: aggregated.ranges[0] } : {})
  };
}

class CompareFeature {
  private readonly registry = new DiffRegistry();
  private readonly rules = new NormalizationRuleStore(
    () => getDiffConfig().normalizationRules
  );
  private readonly provider: DiffContentProvider;
  private readonly statusBarItem: vscode.StatusBarItem;
  /**
   * 可编辑副本的存放位置. 副本是真实文件, 因此可编辑, 可保存, 可另存, 名字与路径都能看懂,
   * 全部由 VS Code 原生处理; 扩展只负责把内容写进去.
   *
   * 放在扩展自己的全局存储目录下, 不碰用户的工作区. 扩展不自动删除任何副本 ——
   * 用户随时可以执行「清理比较副本」命令, 见 cleanUpCopies().
   */
  private readonly copyRoot: vscode.Uri;
  private copyCounter = 0;

  constructor(context: vscode.ExtensionContext) {
    // 规则在渲染时才套用, 因此切换启停只需重新触发一次 provide 就能刷新已打开的比较.
    this.provider = new DiffContentProvider(this.registry, () => this.rules.activeRules);
    this.copyRoot = vscode.Uri.joinPath(context.globalStorageUri, 'compare');
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

  /** 该 URI 是不是本扩展写出来的副本文件. */
  private isCopy(uri: vscode.Uri): boolean {
    return uri.path.startsWith(`${this.copyRoot.path}/`);
  }

  /** 把一侧内容写成一个真实文件, 返回它的 URI. */
  private async writeCopy(
    directory: string,
    slot: DiffSlot,
    info: SelectionInfo,
    fallbackExtension: string,
    text: string
  ): Promise<vscode.Uri> {
    // 两侧各占一个子目录: 同一文件同一范围自比较时, 两侧文件名相同也不会互相覆盖.
    const uri = vscode.Uri.joinPath(
      this.copyRoot,
      directory,
      slot,
      copyFileName(info.baseName, info.rangeLabel, fallbackExtension)
    );
    await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(this.copyRoot, directory, slot));
    await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(text));
    return uri;
  }

  /**
   * 把当前这次比较换成两侧都可编辑的形态.
   *
   * 两侧本来就是完整的可写文件时, 直接用真实文件打开一个原生可编辑 diff —— 那样改动能
   * 直接存回源文件, 还带 Git 集成. 否则(至少一侧是选区片段或剪贴板)写出两个副本文件,
   * 副本里的编辑不会回写任何源文件.
   *
   * 从 diff 编辑器触发时原地替换: 新 diff 开在同一编辑器组, 随后关掉原来的只读标签页.
   * 从选择器在别处触发时, 退回到最近一次比较, 不动任何已有标签页.
   */
  async openEditableCopy(): Promise<void> {
    const source = activeDiffTab();
    if (source && this.isCopy(source.original)) {
      void vscode.window.showInformationMessage(
        vscode.l10n.t('This comparison is already an editable copy.')
      );
      return;
    }

    const uris = source?.original.scheme === DIFF_SCHEME
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

    const [left, right] = uris.map((uri) => this.slotOf(uri));
    if (!left || !right) {
      void vscode.window.showInformationMessage(
        vscode.l10n.t(
          'This comparison is no longer available. Please run the compare command again.'
        )
      );
      return;
    }

    const replaces = source?.original.scheme === DIFF_SCHEME ? source : undefined;
    const viewColumn = replaces?.tab.group.viewColumn;
    const title = buildDiffTitle(left, right, this.rules.hasActiveRules, true);
    const options = viewColumn === undefined ? undefined : { viewColumn, preview: false };

    const nativelyEditable =
      bothSidesEditableInPlace(left, right, isWritableScheme) &&
      left.sourceUri !== undefined &&
      right.sourceUri !== undefined;

    if (nativelyEditable) {
      // 两侧都是完整的可写文件: 交给 VS Code 原生比较真实文件, 改动可以直接存盘.
      await vscode.commands.executeCommand(
        'vscode.diff',
        vscode.Uri.parse(left.sourceUri as string),
        vscode.Uri.parse(right.sourceUri as string),
        title,
        options
      );
    } else {
      this.copyCounter += 1;
      const sessionId = decodeDiffPath(uris[0].path)?.sessionId ?? 'unknown';
      const directory = `${sessionId}${COPY_MARK}${this.copyCounter}`;
      const [leftUri, rightUri] = await Promise.all([
        this.writeCopy(directory, 'left', left, extensionOf(right.baseName), this.renderedText(uris[0], left)),
        this.writeCopy(directory, 'right', right, extensionOf(left.baseName), this.renderedText(uris[1], right))
      ]);
      await vscode.commands.executeCommand('vscode.diff', leftUri, rightUri, title, options);
    }

    if (replaces) {
      // 先开新的再关旧的. 只读文档没有未保存内容, 因此关闭不会有任何询问.
      await vscode.window.tabGroups.close(replaces.tab);
    }
  }

  /** 只读 URI 与副本 URI 都能定位到它那一侧的会话数据. */
  private slotOf(uri: vscode.Uri): SelectionInfo | undefined {
    if (uri.scheme === DIFF_SCHEME) {
      const parts = decodeDiffPath(uri.path);
      return parts ? this.registry.getSlot(parts.sessionId, parts.slot) : undefined;
    }
    if (!this.isCopy(uri)) {
      return undefined;
    }
    // 副本路径形如 `<copyRoot>/<sessionId>.copy<n>/<slot>/<文件名>`.
    const segments = uri.path.slice(this.copyRoot.path.length + 1).split('/');
    const sessionId = segments[0]?.split(COPY_MARK)[0];
    const slot = segments[1];
    return sessionId && (slot === 'left' || slot === 'right')
      ? this.registry.getSlot(sessionId, slot)
      : undefined;
  }

  /** 打开一侧的来源文件, 并选中当初参与比较的那几行. */
  async openSource(): Promise<void> {
    const diff = activeDiffTab();
    const sides = diff ? [this.slotOf(diff.original), this.slotOf(diff.modified)] : [];
    const candidates = sides.filter(
      (info): info is SelectionInfo => info?.sourceUri !== undefined
    );
    if (candidates.length === 0) {
      void vscode.window.showInformationMessage(
        vscode.l10n.t('Neither side of this comparison came from a file.')
      );
      return;
    }

    // 同一文件的两段选区也要给选择, 因此比较的是"文件加起始行"而不只是文件.
    const sameSide =
      candidates.length > 1 &&
      candidates[0].sourceUri === candidates[1].sourceUri &&
      candidates[0].sourceRange?.start === candidates[1].sourceRange?.start;

    let picked = candidates[0];
    if (candidates.length > 1 && !sameSide) {
      const choice = await vscode.window.showQuickPick(
        candidates.map((info) => ({ label: sideLabel(info), info })),
        { placeHolder: vscode.l10n.t('Pick the source file to open') }
      );
      if (!choice) {
        return;
      }
      picked = choice.info;
    }

    const range = picked.sourceRange;
    await vscode.window.showTextDocument(vscode.Uri.parse(picked.sourceUri as string), {
      ...(range ? { selection: new vscode.Range(range.start, 0, range.end, 0) } : {})
    });
  }

  /**
   * 删掉全部副本文件. 扩展不自动清理, 因为用户可能刚在副本里按过保存;
   * 什么时候不再需要它们只有用户知道.
   */
  async cleanUpCopies(): Promise<void> {
    try {
      await vscode.workspace.fs.delete(this.copyRoot, { recursive: true, useTrash: false });
    } catch {
      // 目录不存在(从没做过副本, 或已经清理过)也算清理完成.
    }
    vscode.window.setStatusBarMessage(vscode.l10n.t('Comparison copies cleaned up.'), 2000);
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
      sourceScheme: uri.scheme,
      sourceUri: uri.toString()
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
    const copy = activeDiffTab();
    if (copy && this.isCopy(copy.original)) {
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
   * 反序重开同两个文件而不是再写一份副本, 因此用户尚未保存的编辑不会丢. 标题直接用副本的
   * 文件名 —— 副本名里已经带着来源与行号范围.
   */
  private async reopenSwapped(copy: {
    tab: vscode.Tab;
    original: vscode.Uri;
    modified: vscode.Uri;
  }): Promise<void> {
    const labelOf = (uri: vscode.Uri): SelectionInfo => ({
      text: '',
      baseName: basename(uri),
      rangeLabel: FULL_RANGE_LABEL
    });

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
        id: 'openSource',
        label: `$(go-to-file) ${vscode.l10n.t('Open the Source File')}`
      },
      {
        id: 'toggleNormalizationRules',
        label: `$(filter) ${vscode.l10n.t('Toggle Normalization Rules')}`,
        description: this.ruleSummary()
      },
      {
        id: 'cleanUpCopies',
        label: `$(trash) ${vscode.l10n.t('Clean Up Comparison Copies')}`
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
      case 'openSource':
        await this.openSource();
        break;
      case 'cleanUpCopies':
        await this.cleanUpCopies();
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
    vscode.commands.registerCommand('textToolkit.diff.openSource', () => feature.openSource()),
    vscode.commands.registerCommand('textToolkit.diff.cleanUpCopies', () =>
      feature.cleanUpCopies()
    ),
    vscode.commands.registerCommand('textToolkit.diff.toggleNormalizationRules', () =>
      feature.toggleNormalizationRules()
    ),
    vscode.commands.registerCommand('textToolkit.diff.showMenu', () => feature.showMenu(false))
  );

  return feature;
}
