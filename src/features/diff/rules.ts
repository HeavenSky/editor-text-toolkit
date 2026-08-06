import { loadRules, type NormalizationRule } from './core';

/**
 * 归一化规则的运行时状态.
 *
 * 用户配置是规则的定义, 启停则只活在内存里: 在切换面板里临时关掉一条规则不应该改写
 * 用户的 settings.json. 配置本身被改动时启停状态整体重置回各自的 enableOnStart,
 * 与上游 normalisation-rule-store.ts:30-35 的语义一致.
 *
 * 配置读取通过构造参数注入, 因此本文件不依赖 vscode, 可以直接单测.
 */
export class NormalizationRuleStore {
  private rules: NormalizationRule[] = [];
  /** 上次读到的配置原始值的序列化形式, 用来判断用户是否改过配置. */
  private signature: string | undefined;

  constructor(private readonly readRaw: () => unknown) {}

  getAll(): NormalizationRule[] {
    const raw = this.readRaw();
    // 配置值都是 JSON 可序列化的, 字符串比较足以替代一个深比较依赖.
    const signature = JSON.stringify(raw ?? null);
    if (signature !== this.signature) {
      this.signature = signature;
      this.rules = loadRules(raw);
    }
    return this.rules;
  }

  get activeRules(): NormalizationRule[] {
    return this.getAll().filter((rule) => rule.active);
  }

  get hasActiveRules(): boolean {
    return this.activeRules.length > 0;
  }

  /** 按下标重写启停状态; 未列出的下标一律置为停用. */
  setActive(indices: number[]): void {
    const wanted = new Set(indices);
    this.rules = this.getAll().map((rule, index) => ({ ...rule, active: wanted.has(index) }));
  }
}
