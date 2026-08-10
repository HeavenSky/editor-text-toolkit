import * as vscode from 'vscode';
import type { EditableCopyStore } from './editableStore';

/**
 * 可编辑副本的 scheme. 路径格式与只读的 `text-toolkit-diff` 完全一致,
 * 因此解析只读 URI 的外部代码可以直接复用(上游 issue #66 的诉求).
 */
export const DIFF_EDIT_SCHEME = 'text-toolkit-diff-edit';

/**
 * 可编辑副本的内存文件系统.
 *
 * 只读那一侧用的 `TextDocumentContentProvider` 在 API 层就规定文档是只读的
 * (`@types/vscode` 的 "create a readonly document"), 所以可编辑副本只能换成文件系统提供器.
 * 一个 scheme 只能注册一个文件系统提供器, 于是这里另起一个 scheme —— 已发布的只读路径
 * 因此一行都不用改.
 *
 * 两侧都由这个可写提供器供给时, diff 编辑器左右两侧都能直接编辑: 工作台的 diff 编辑器
 * 用两侧模型的 readonly 状态覆盖 `diffEditor.originalEditable`, 不看用户设置.
 *
 * 保存只写内存, 不落磁盘. 未知 URI 返回占位文案而不抛 `FileNotFound`, 与
 * contentProvider.ts:27-31 的取向一致, 并顺带兜住窗口重载后被恢复的旧副本标签页。
 */
export class EditableCopyFileSystem implements vscode.FileSystemProvider, vscode.Disposable {
  // 本提供器从不在编辑器背后改内容, 事件只为满足接口.
  private readonly emitter = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
  readonly onDidChangeFile = this.emitter.event;

  constructor(private readonly store: EditableCopyStore) {}

  watch(): vscode.Disposable {
    return new vscode.Disposable(() => {});
  }

  stat(uri: vscode.Uri): vscode.FileStat {
    return {
      type: vscode.FileType.File,
      ctime: 0,
      // 写入版本号充当 mtime, 保证每次保存后都变新.
      mtime: this.store.versionOf(uri.toString()),
      size: new TextEncoder().encode(this.textOf(uri)).length
    };
  }

  readFile(uri: vscode.Uri): Uint8Array {
    return new TextEncoder().encode(this.textOf(uri));
  }

  writeFile(uri: vscode.Uri, content: Uint8Array): void {
    this.store.write(uri.toString(), new TextDecoder().decode(content));
  }

  // 副本是一对扁平的文档, 没有目录, 也不支持重命名与删除.
  readDirectory(uri: vscode.Uri): never {
    throw vscode.FileSystemError.NoPermissions(uri);
  }

  createDirectory(uri: vscode.Uri): never {
    throw vscode.FileSystemError.NoPermissions(uri);
  }

  delete(uri: vscode.Uri): never {
    throw vscode.FileSystemError.NoPermissions(uri);
  }

  rename(oldUri: vscode.Uri): never {
    throw vscode.FileSystemError.NoPermissions(oldUri);
  }

  dispose(): void {
    this.emitter.dispose();
  }

  private textOf(uri: vscode.Uri): string {
    return (
      this.store.read(uri.toString()) ??
      vscode.l10n.t('This comparison is no longer available. Please run the compare command again.')
    );
  }
}
