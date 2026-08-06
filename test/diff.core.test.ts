import { describe, it } from 'vitest';
import * as assert from 'node:assert';
import {
  aggregateSelections,
  applyRules,
  buildDiffTitle,
  decodeDiffPath,
  encodeDiffPath,
  formatRangeLabel,
  loadRules,
  resolveLanguages,
  type NormalizationRule,
  type SelectionInfo
} from '../src/features/diff/core';

const rule = (overrides: Partial<NormalizationRule>): NormalizationRule => ({
  match: 'x',
  replaceWith: 'y',
  active: true,
  ...overrides
});

const side = (overrides: Partial<SelectionInfo>): SelectionInfo => ({
  text: '',
  baseName: 'a.ts',
  rangeLabel: 'full',
  ...overrides
});

describe('diff core (比较模块纯逻辑)', () => {
  describe('applyRules', () => {
    it('没有规则时原样返回', () => {
      assert.strictEqual(applyRules('a\tb', []), 'a\tb');
    });

    it('字符串替换是全局的', () => {
      const rules = [rule({ match: '\t', replaceWith: '  ' })];
      assert.strictEqual(applyRules('a\tb\tc', rules), 'a  b  c');
    });

    it('字符串替换保留 $N 捕获组语义', () => {
      const rules = [rule({ match: ',\\s*([^,\n]+)', replaceWith: ', $1' })];
      assert.strictEqual(applyRules('a,b,   c', rules), 'a, b, c');
    });

    it('letterCase upper 把匹配段转成大写', () => {
      const rules = [rule({ match: '[a-z]+', replaceWith: { letterCase: 'upper' } })];
      assert.strictEqual(applyRules('ab CD ef', rules), 'AB CD EF');
    });

    it('letterCase lower 把匹配段转成小写', () => {
      const rules = [rule({ match: '[A-Z]+', replaceWith: { letterCase: 'lower' } })];
      assert.strictEqual(applyRules('AB cd EF', rules), 'ab cd ef');
    });

    it('多条规则按数组顺序叠加', () => {
      const rules = [
        rule({ match: 'a', replaceWith: 'b' }),
        rule({ match: 'b', replaceWith: 'c' })
      ];
      assert.strictEqual(applyRules('a', rules), 'c');
    });

    it('顺序相反时结果不同, 证明不是并行替换', () => {
      const rules = [
        rule({ match: 'b', replaceWith: 'c' }),
        rule({ match: 'a', replaceWith: 'b' })
      ];
      assert.strictEqual(applyRules('a', rules), 'b');
    });
  });

  describe('loadRules', () => {
    it('非数组输入按无规则处理', () => {
      assert.deepStrictEqual(loadRules(undefined), []);
      assert.deepStrictEqual(loadRules(null), []);
      assert.deepStrictEqual(loadRules({ match: 'a', replaceWith: 'b' }), []);
      assert.deepStrictEqual(loadRules('nope'), []);
    });

    it('缺 match 的条目被丢弃', () => {
      assert.deepStrictEqual(loadRules([{ replaceWith: 'b' }]), []);
    });

    it('缺 replaceWith 的条目被丢弃', () => {
      assert.deepStrictEqual(loadRules([{ match: 'a' }]), []);
    });

    it('letterCase 取值非法的条目被丢弃', () => {
      assert.deepStrictEqual(loadRules([{ match: 'a', replaceWith: { letterCase: 'title' } }]), []);
    });

    it('match 不是合法正则的条目被丢弃', () => {
      assert.deepStrictEqual(loadRules([{ match: '([', replaceWith: 'b' }]), []);
    });

    it('合法条目在非法条目之间仍被保留', () => {
      const rules = loadRules([{ match: '([' }, { match: 'a', replaceWith: 'b' }, { match: 'c' }]);
      assert.strictEqual(rules.length, 1);
      assert.strictEqual(rules[0].match, 'a');
    });

    it('enableOnStart 缺省时规则启用', () => {
      assert.strictEqual(loadRules([{ match: 'a', replaceWith: 'b' }])[0].active, true);
    });

    it('enableOnStart 为 false 时规则不启用', () => {
      const rules = loadRules([{ match: 'a', replaceWith: 'b', enableOnStart: false }]);
      assert.strictEqual(rules[0].active, false);
    });

    it('enableOnStart 为 true 之外的真值仍按启用处理', () => {
      const rules = loadRules([{ match: 'a', replaceWith: 'b', enableOnStart: true }]);
      assert.strictEqual(rules[0].active, true);
    });

    it('保留 name, 缺失时不产生该字段', () => {
      const named = loadRules([{ name: 'tabs', match: 'a', replaceWith: 'b' }]);
      assert.strictEqual(named[0].name, 'tabs');
      assert.ok(!('name' in loadRules([{ match: 'a', replaceWith: 'b' }])[0]));
    });

    it('letterCase 对象被规范化为只含 letterCase 的形状', () => {
      const rules = loadRules([
        { match: 'a', replaceWith: { letterCase: 'upper', extra: 1 } }
      ]);
      assert.deepStrictEqual(rules[0].replaceWith, { letterCase: 'upper' });
    });
  });

  describe('formatRangeLabel', () => {
    it('null 与空数组都是 full', () => {
      assert.strictEqual(formatRangeLabel(null), 'full');
      assert.strictEqual(formatRangeLabel([]), 'full');
    });

    it('单行写成 l.N 且行号从 1 起', () => {
      assert.strictEqual(formatRangeLabel([{ start: 3, end: 3 }]), 'l.4');
    });

    it('多行写成 ll.N-M', () => {
      assert.strictEqual(formatRangeLabel([{ start: 3, end: 7 }]), 'll.4-8');
    });

    it('多个片段以逗号连接', () => {
      const label = formatRangeLabel([
        { start: 0, end: 0 },
        { start: 4, end: 6 }
      ]);
      assert.strictEqual(label, 'l.1,ll.5-7');
    });
  });

  describe('buildDiffTitle', () => {
    it('原样比较用 ↔ 作中缀', () => {
      const title = buildDiffTitle(
        side({ baseName: 'a.ts', rangeLabel: 'll.4-8' }),
        side({ baseName: 'b.ts', rangeLabel: 'l.2' }),
        false
      );
      assert.strictEqual(title, 'a.ts (ll.4-8) ↔ b.ts (l.2)');
    });

    it('归一化后用 ~ 作中缀', () => {
      const title = buildDiffTitle(side({ baseName: 'a.ts' }), side({ baseName: 'b.ts' }), true);
      assert.strictEqual(title, 'a.ts ~ b.ts');
    });

    it('rangeLabel 为 full 时省略括号', () => {
      const title = buildDiffTitle(side({ baseName: 'a.ts', rangeLabel: 'full' }), null, false);
      assert.strictEqual(title, 'a.ts ↔ N/A');
    });

    it('两侧缺失都写成 N/A', () => {
      assert.strictEqual(buildDiffTitle(null, null, false), 'N/A ↔ N/A');
    });
  });

  describe('encodeDiffPath / decodeDiffPath', () => {
    const roundTrip = (baseName: string, rangeLabel = 'l.1') => {
      const parts = { sessionId: 'abc-1', slot: 'left' as const, rangeLabel, baseName };
      const decoded = decodeDiffPath(encodeDiffPath(parts));
      assert.deepStrictEqual(decoded, parts);
    };

    it('普通文件名往返一致', () => {
      roundTrip('service.ts');
    });

    it('含空格的文件名往返一致', () => {
      roundTrip('my file.ts');
    });

    it('中文文件名往返一致', () => {
      roundTrip('中文档案.md');
    });

    it('含 # 与 ? 的文件名往返一致', () => {
      roundTrip('a#b?c.ts');
    });

    it('含斜杠的文件名不会被拆成额外的段', () => {
      roundTrip('a/b.ts');
    });

    it('无扩展名的文件名往返一致', () => {
      roundTrip('Makefile');
    });

    it('rangeLabel 为 full 时往返一致', () => {
      roundTrip('a.ts', 'full');
    });

    it('编码结果以斜杠开头且恰好四段', () => {
      const path = encodeDiffPath({
        sessionId: 's',
        slot: 'right',
        rangeLabel: 'full',
        baseName: 'a.ts'
      });
      assert.strictEqual(path, '/s/right/full/a.ts');
    });

    it('段数不足返回 null', () => {
      assert.strictEqual(decodeDiffPath('/s/left/full'), null);
    });

    it('段数过多返回 null', () => {
      assert.strictEqual(decodeDiffPath('/s/left/full/a.ts/extra'), null);
    });

    it('slot 非法返回 null', () => {
      assert.strictEqual(decodeDiffPath('/s/middle/full/a.ts'), null);
    });

    it('百分号编码非法返回 null 而不抛异常', () => {
      assert.strictEqual(decodeDiffPath('/s/left/full/%E0%A4%A'), null);
    });

    it('无前导斜杠时也能解析', () => {
      assert.deepStrictEqual(decodeDiffPath('s/left/full/a.ts'), {
        sessionId: 's',
        slot: 'left',
        rangeLabel: 'full',
        baseName: 'a.ts'
      });
    });
  });

  describe('aggregateSelections', () => {
    it('空数组返回 null, 由调用方改取全文', () => {
      assert.strictEqual(aggregateSelections([]), null);
    });

    it('乱序输入按行号排序后拼接', () => {
      const result = aggregateSelections([
        { startLine: 5, startChar: 0, endLine: 5, text: 'second' },
        { startLine: 1, startChar: 0, endLine: 2, text: 'first' }
      ]);
      assert.strictEqual(result?.text, 'first\nsecond');
      assert.deepStrictEqual(result?.ranges, [
        { start: 1, end: 2 },
        { start: 5, end: 5 }
      ]);
    });

    it('同一行内按起始列排序', () => {
      const result = aggregateSelections([
        { startLine: 0, startChar: 9, endLine: 0, text: 'b' },
        { startLine: 0, startChar: 1, endLine: 0, text: 'a' }
      ]);
      assert.strictEqual(result?.text, 'a\nb');
    });

    it('单个选区不引入额外换行', () => {
      const result = aggregateSelections([
        { startLine: 0, startChar: 0, endLine: 1, text: 'a\nb' }
      ]);
      assert.strictEqual(result?.text, 'a\nb');
    });

    it('不改动传入的数组', () => {
      const parts = [
        { startLine: 5, startChar: 0, endLine: 5, text: 'b' },
        { startLine: 1, startChar: 0, endLine: 1, text: 'a' }
      ];
      aggregateSelections(parts);
      assert.strictEqual(parts[0].text, 'b');
    });
  });

  describe('resolveLanguages', () => {
    it('两侧都有来源时各用各的', () => {
      assert.deepStrictEqual(resolveLanguages('typescript', 'python'), {
        left: 'typescript',
        right: 'python'
      });
    });

    it('只有左侧有来源时右侧继承', () => {
      assert.deepStrictEqual(resolveLanguages('typescript', undefined), {
        left: 'typescript',
        right: 'typescript'
      });
    });

    it('只有右侧有来源时左侧继承', () => {
      assert.deepStrictEqual(resolveLanguages(undefined, 'go'), { left: 'go', right: 'go' });
    });

    it('两侧都没有来源时不指定语言', () => {
      assert.deepStrictEqual(resolveLanguages(undefined, undefined), {});
    });
  });
});
