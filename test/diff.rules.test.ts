import { describe, it } from 'vitest';
import * as assert from 'node:assert';
import { NormalizationRuleStore } from '../src/features/diff/rules';

/** 用一个可写的容器模拟 settings.json, 免去对 vscode 配置 API 的依赖. */
function storeOver(initial: unknown): {
  store: NormalizationRuleStore;
  set: (value: unknown) => void;
} {
  let raw = initial;
  return {
    store: new NormalizationRuleStore(() => raw),
    set: (value: unknown) => {
      raw = value;
    }
  };
}

const TWO_RULES = [
  { name: 'tabs', match: '\t', replaceWith: '  ' },
  { name: 'upper', match: '.*', replaceWith: { letterCase: 'upper' }, enableOnStart: false }
];

describe('NormalizationRuleStore (归一化规则运行时状态)', () => {
  it('未配置任何规则时为空', () => {
    const { store } = storeOver([]);
    assert.deepStrictEqual(store.getAll(), []);
    assert.strictEqual(store.hasActiveRules, false);
  });

  it('初始启停状态取自 enableOnStart', () => {
    const { store } = storeOver(TWO_RULES);
    assert.deepStrictEqual(
      store.getAll().map((rule) => rule.active),
      [true, false]
    );
    assert.strictEqual(store.activeRules.length, 1);
    assert.strictEqual(store.hasActiveRules, true);
  });

  it('setActive 按下标重写启停状态', () => {
    const { store } = storeOver(TWO_RULES);
    store.setActive([1]);
    assert.deepStrictEqual(
      store.getAll().map((rule) => rule.active),
      [false, true]
    );
  });

  it('setActive 传空数组等于全部停用', () => {
    const { store } = storeOver(TWO_RULES);
    store.setActive([]);
    assert.strictEqual(store.hasActiveRules, false);
  });

  it('配置未变时保留用户的手动启停', () => {
    const { store } = storeOver(TWO_RULES);
    store.setActive([1]);
    // 多读几次, 确认不会被重新加载冲掉.
    store.getAll();
    assert.deepStrictEqual(
      store.getAll().map((rule) => rule.active),
      [false, true]
    );
  });

  it('配置变化后启停状态重置回 enableOnStart', () => {
    const { store, set } = storeOver(TWO_RULES);
    store.setActive([1]);
    set([
      { name: 'tabs', match: '\t', replaceWith: '    ' },
      { name: 'upper', match: '.*', replaceWith: { letterCase: 'upper' }, enableOnStart: false }
    ]);
    assert.deepStrictEqual(
      store.getAll().map((rule) => rule.active),
      [true, false]
    );
  });

  it('配置变化后 hasActiveRules 随之变化', () => {
    const { store, set } = storeOver(TWO_RULES);
    store.setActive([]);
    assert.strictEqual(store.hasActiveRules, false);
    set([{ match: 'a', replaceWith: 'b' }]);
    assert.strictEqual(store.hasActiveRules, true);
  });

  it('配置被清空后规则列表也清空', () => {
    const { store, set } = storeOver(TWO_RULES);
    assert.strictEqual(store.getAll().length, 2);
    set([]);
    assert.deepStrictEqual(store.getAll(), []);
  });

  it('配置里的非法条目被丢弃, 不影响其余规则', () => {
    const { store } = storeOver([{ match: '([' }, { match: 'a', replaceWith: 'b' }]);
    assert.strictEqual(store.getAll().length, 1);
    assert.strictEqual(store.getAll()[0].match, 'a');
  });

  it('配置不是数组时按无规则处理', () => {
    const { store } = storeOver(undefined);
    assert.deepStrictEqual(store.getAll(), []);
  });
});
