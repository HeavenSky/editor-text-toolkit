import * as vscode from 'vscode';
import { applyRules, decodeDiffPath, type NormalizationRule } from './core';
import type { DiffRegistry } from './registry';

export const DIFF_SCHEME = 'text-toolkit-diff';

/**
 * 比较两侧的内容提供器.
 *
 * 归一化在这里应用而不是在写入 registry 时应用: registry 存原文, 显示时才套规则,
 * 于是切换规则只需要重新触发一次 provide, 已经打开的 diff 就能当场刷新 —— 这正是
 * 上游 issue #24 长期未解决的地方, 其根因是上游的提供器完全没有变更事件.
 */
export class DiffContentProvider implements vscode.TextDocumentContentProvider, vscode.Disposable {
  private readonly emitter = new vscode.EventEmitter<vscode.Uri>();
  readonly onDidChange = this.emitter.event;

  constructor(
    private readonly registry: DiffRegistry,
    private readonly getActiveRules: () => NormalizationRule[]
  ) {}

  provideTextDocumentContent(uri: vscode.Uri): string {
    const parts = decodeDiffPath(uri.path);
    const info = parts ? this.registry.getSlot(parts.sessionId, parts.slot) : undefined;
    if (!info) {
      // 窗口重启后被恢复的旧标签页, 或早已被淘汰的比较, 都会走到这里.
      return vscode.l10n.t(
        'This comparison is no longer available. Please run the compare command again.'
      );
    }
    return applyRules(info.text, this.getActiveRules());
  }

  /** 归一化规则变化后重新渲染全部仍然有效的比较. */
  refreshAll(): void {
    for (const uri of this.registry.issuedUris) {
      this.emitter.fire(vscode.Uri.parse(uri));
    }
  }

  dispose(): void {
    this.emitter.dispose();
  }
}
