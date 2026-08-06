import * as vscode from 'vscode';
import { DIFF_SCHEME, DiffContentProvider } from './contentProvider';
import { DiffRegistry } from './registry';

/**
 * Compare (Diff): 在文件内, 跨文件或与剪贴板之间比较文本片段.
 *
 * 两侧内容存在内存 registry 中, 通过一个只读的虚拟文档 scheme 交给 VS Code 自带的
 * diff 编辑器渲染, 因此字符级高亮, 差异跳转与折叠等能力全部由编辑器原生提供.
 */
export function registerDiffFeature(context: vscode.ExtensionContext): void {
  const registry = new DiffRegistry();
  // 归一化规则的运行时开关尚未接入, 此处等价于"没有任何规则".
  const provider = new DiffContentProvider(registry, () => []);

  context.subscriptions.push(
    provider,
    vscode.workspace.registerTextDocumentContentProvider(DIFF_SCHEME, provider)
  );
}
