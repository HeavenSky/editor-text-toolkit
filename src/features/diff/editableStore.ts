/**
 * 可编辑副本的内容存储.
 *
 * 副本内容按 URI 存, 而不是挂在 `DiffRegistry` 的 session 上: registry 只保留最近 8 次
 * 比较(registry.ts:11), 被淘汰之后的一次保存就会写进一个已经删除的会话而丢失内容.
 * 按 URI 存 + 文档关闭时释放, 生命周期与用户看得见的标签页完全对齐, 内存也自然有界.
 *
 * `version` 单调增长并被当作 `FileStat.mtime` 使用: 每次写入后时间戳都变新, 避免 VS Code
 * 的保存冲突检测把"内容没变的旧时间戳"误判成文件在别处被改过.
 *
 * 与 shared/advanced.ts 同理, 本文件不 import vscode 也不 import 任何 node 模块, 以便直接单测.
 */

interface CopyEntry {
  text: string;
  version: number;
}

export class EditableCopyStore {
  private readonly entries = new Map<string, CopyEntry>();
  private counter = 0;

  /** 副本会话 id. `now` 由调用方注入以保持本类为纯逻辑; `e` 用于与只读会话 id 目视区分. */
  nextSessionId(now: number): string {
    this.counter += 1;
    return `${now.toString(36)}-e${this.counter}`;
  }

  /** 建立一份副本的两侧. 两侧一并写入, 因为它们总是同生同灭. */
  register(uris: readonly [string, string], texts: readonly [string, string]): void {
    this.entries.set(uris[0], { text: texts[0], version: 1 });
    this.entries.set(uris[1], { text: texts[1], version: 1 });
  }

  read(uri: string): string | undefined {
    return this.entries.get(uri)?.text;
  }

  /**
   * 保存副本. 未登记的 URI 也接受: 窗口重载后被恢复的旧副本标签页在这里保存时,
   * 内存中已经没有对应条目, 让它成为一个新条目比丢弃用户的输入合理.
   */
  write(uri: string, text: string): void {
    const version = (this.entries.get(uri)?.version ?? 0) + 1;
    this.entries.set(uri, { text, version });
  }

  /** 未登记的 URI 返回 0, 与"从未写入过"一致. */
  versionOf(uri: string): number {
    return this.entries.get(uri)?.version ?? 0;
  }

  release(uri: string): void {
    this.entries.delete(uri);
  }

  get size(): number {
    return this.entries.size;
  }
}
