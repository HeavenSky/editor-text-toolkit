import type { DiffSlot, SelectionInfo } from './core';

/**
 * 保留多少次比较的内容.
 *
 * 上游把时间戳塞进 URI 让每次比较各占一个永不失效的文档, 代价是内容再也无法刷新
 * (上游 issue #24). 这里改成按 session 存储并允许刷新, 于是需要一个上限来兜住内存.
 * 8 次足以覆盖"来回对比几个片段"的实际用法, 且刻意不做成配置项: 它不改变任何行为,
 * 只影响多久之前的标签页会退化成占位文案, 没有让用户去理解和调节的价值.
 */
const MAX_SESSIONS = 8;

interface DiffSession {
  left: SelectionInfo;
  right: SelectionInfo;
  uris: string[];
}

/**
 * 比较状态的唯一持有者: 一个待比较的标记, 加上最近若干次比较的两侧内容.
 * 全部只在内存中, 不写 globalState —— 比较标记是瞬时意图, 持久化只会留下过期状态.
 */
export class DiffRegistry {
  /** 「标记待比较文本」命令存下的那一段, 供下一次「与标记比较」使用. */
  marked: SelectionInfo | null = null;

  private readonly sessions = new Map<string, DiffSession>();
  private readonly issued = new Set<string>();
  private counter = 0;
  private last: string | undefined;

  /**
   * 建立一次比较. URI 的构造需要 sessionId, 而 sessionId 由本方法产出, 因此 uris 只能
   * 以回调形式回填 —— 直接接收 uris 参数会形成循环依赖.
   */
  createSession(
    left: SelectionInfo,
    right: SelectionInfo,
    buildUris: (sessionId: string) => string[]
  ): { sessionId: string; uris: string[] } {
    this.counter += 1;
    const sessionId = `${Date.now().toString(36)}-${this.counter}`;
    const uris = buildUris(sessionId);

    this.sessions.set(sessionId, { left, right, uris });
    for (const uri of uris) {
      this.issued.add(uri);
    }
    this.last = sessionId;
    this.evictOldest();

    return { sessionId, uris };
  }

  /** Map 保持插入顺序, 因此第一个键就是最旧的 session. */
  private evictOldest(): void {
    while (this.sessions.size > MAX_SESSIONS) {
      const oldest = this.sessions.keys().next();
      if (oldest.done) {
        return;
      }
      const evicted = this.sessions.get(oldest.value);
      this.sessions.delete(oldest.value);
      // 同步清理已发放集合, 否则它只增不减, 刷新时会对早已失效的 URI 反复触发事件.
      for (const uri of evicted?.uris ?? []) {
        this.issued.delete(uri);
      }
      if (this.last === oldest.value) {
        this.last = undefined;
      }
    }
  }

  getSlot(sessionId: string, slot: DiffSlot): SelectionInfo | undefined {
    return this.sessions.get(sessionId)?.[slot];
  }

  /** 最近一次比较, 供「交换两侧」使用; 已被淘汰时为 undefined. */
  get lastSessionId(): string | undefined {
    return this.last;
  }

  /** 当前仍然有效的全部虚拟文档 URI, 供内容提供器刷新用. */
  get issuedUris(): ReadonlySet<string> {
    return this.issued;
  }
}
