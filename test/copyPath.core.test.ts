import { describe, it } from 'vitest';
import * as assert from 'node:assert';
import {
  applyTilde,
  collectLineNumbers,
  formatLineRange,
  formatLines,
  formatResult,
  toLineRanges,
  type LineSpan
} from '../src/features/copyPath/core';

function span(startLine: number, endLine: number, endCharacter: number): LineSpan {
  return {
    start: { line: startLine },
    end: { line: endLine, character: endCharacter },
    isEmpty: startLine === endLine && endCharacter === 0
  };
}

function cursor(line: number): LineSpan {
  return { start: { line }, end: { line, character: 0 }, isEmpty: true };
}

describe('copyPath core', () => {
  describe('collectLineNumbers', () => {
    it('单光标返回所在行(1 基)', () => {
      assert.deepStrictEqual(collectLineNumbers([cursor(0)]), [1]);
      assert.deepStrictEqual(collectLineNumbers([cursor(7)]), [8]);
    });

    it('单行选区返回该行', () => {
      assert.deepStrictEqual(collectLineNumbers([span(2, 2, 5)]), [3]);
    });

    it('跨行选区返回连续行', () => {
      assert.deepStrictEqual(collectLineNumbers([span(2, 4, 3)]), [3, 4, 5]);
    });

    it('选区停在下一行行首时不计入该行', () => {
      assert.deepStrictEqual(collectLineNumbers([span(2, 4, 0)]), [3, 4]);
    });

    it('单行选区结束于 character 0 时仍计入该行', () => {
      assert.deepStrictEqual(collectLineNumbers([{ ...span(2, 2, 0), isEmpty: false }]), [3]);
    });

    it('多选区去重并升序', () => {
      assert.deepStrictEqual(
        collectLineNumbers([span(7, 7, 2), cursor(2), span(2, 3, 4), cursor(0)]),
        [1, 3, 4, 8]
      );
    });

    it('无选区返回空数组', () => {
      assert.deepStrictEqual(collectLineNumbers([]), []);
    });
  });

  describe('formatLines', () => {
    it('range 合并连续行', () => {
      assert.strictEqual(formatLines([3, 4, 8], 'range'), '3-4,8');
      assert.strictEqual(formatLines([1, 2, 3], 'range'), '1-3');
      assert.strictEqual(formatLines([1, 3, 5], 'range'), '1,3,5');
      assert.strictEqual(formatLines([9], 'range'), '9');
    });

    it('list 与 perLine 逐行罗列', () => {
      assert.strictEqual(formatLines([3, 4, 8], 'list'), '3,4,8');
      assert.strictEqual(formatLines([3, 4, 8], 'perLine'), '3,4,8');
    });

    it('空数组返回空串', () => {
      assert.strictEqual(formatLines([], 'range'), '');
      assert.strictEqual(formatLines([], 'list'), '');
    });
  });

  describe('toLineRanges (多行片段)', () => {
    it('连续行合并为一个片段', () => {
      assert.deepStrictEqual(toLineRanges([3, 4, 5]), [{ start: 3, end: 5 }]);
    });

    it('不相邻的选区得到多个片段', () => {
      assert.deepStrictEqual(toLineRanges([3, 4, 8, 12, 13, 14]), [
        { start: 3, end: 4 },
        { start: 8, end: 8 },
        { start: 12, end: 14 }
      ]);
    });

    it('单行与空输入', () => {
      assert.deepStrictEqual(toLineRanges([7]), [{ start: 7, end: 7 }]);
      assert.deepStrictEqual(toLineRanges([]), []);
    });
  });

  describe('formatLineRange (a-b / a+n)', () => {
    it('单行两种写法都是 a', () => {
      assert.strictEqual(formatLineRange({ start: 5, end: 5 }, 'range'), '5');
      assert.strictEqual(formatLineRange({ start: 5, end: 5 }, 'count'), '5');
    });

    it('range 写闭区间, count 写行数', () => {
      assert.strictEqual(formatLineRange({ start: 3, end: 4 }, 'range'), '3-4');
      assert.strictEqual(formatLineRange({ start: 3, end: 4 }, 'count'), '3+2');
      assert.strictEqual(formatLineRange({ start: 10, end: 20 }, 'count'), '10+11');
    });
  });

  describe('formatLines 的 count 语法', () => {
    it('多片段用逗号连接', () => {
      assert.strictEqual(formatLines([3, 4, 8, 12, 13, 14], 'range', 'range'), '3-4,8,12-14');
      assert.strictEqual(formatLines([3, 4, 8, 12, 13, 14], 'range', 'count'), '3+2,8,12+3');
    });

    it('默认仍是闭区间写法', () => {
      assert.strictEqual(formatLines([3, 4], 'range'), '3-4');
    });

    it('list 与 perLine 不受 spanSyntax 影响', () => {
      assert.strictEqual(formatLines([3, 4, 8], 'list', 'count'), '3,4,8');
      assert.strictEqual(formatLines([3, 4, 8], 'perLine', 'count'), '3,4,8');
    });
  });

  describe('formatResult', () => {
    it('range 与 list 拼成单行', () => {
      assert.strictEqual(formatResult('src/a.ts', [3, 4, 8], ':', 'range'), 'src/a.ts:3-4,8');
      assert.strictEqual(formatResult('src/a.ts', [3, 4, 8], '#L', 'list'), 'src/a.ts#L3,4,8');
    });

    it('perLine 每行一条并用换行拼接', () => {
      assert.strictEqual(
        formatResult('src/a.ts', [3, 4, 8], ':', 'perLine'),
        'src/a.ts:3\nsrc/a.ts:4\nsrc/a.ts:8'
      );
    });

    it('多片段 + count 语法', () => {
      assert.strictEqual(
        formatResult('/tmp/a.log', [3, 4, 8, 12, 13, 14], ':', 'range', 'count'),
        '/tmp/a.log:3+2,8,12+3'
      );
    });

    it('多片段 + 闭区间语法(默认)', () => {
      assert.strictEqual(
        formatResult('/tmp/a.log', [3, 4, 8, 12, 13, 14], ':', 'range'),
        '/tmp/a.log:3-4,8,12-14'
      );
    });
  });

  describe('applyTilde', () => {
    it('路径等于 home 返回 ~', () => {
      assert.strictEqual(applyTilde('/Users/username', '/Users/username', '/'), '~');
    });

    it('home 之下替换前缀', () => {
      assert.strictEqual(applyTilde('/Users/username/code/a.ts', '/Users/username', '/'), '~/code/a.ts');
    });

    it('home 末尾带分隔符时结果一致', () => {
      assert.strictEqual(applyTilde('/Users/username/code/a.ts', '/Users/username/', '/'), '~/code/a.ts');
    });

    it('不在 home 之下保持原样', () => {
      assert.strictEqual(applyTilde('/opt/tool/a.ts', '/Users/username', '/'), '/opt/tool/a.ts');
    });

    it('同前缀但非子目录不替换', () => {
      assert.strictEqual(applyTilde('/Users/username2/a.ts', '/Users/username', '/'), '/Users/username2/a.ts');
    });

    it('Windows 分隔符', () => {
      assert.strictEqual(applyTilde('C:\\Users\\username\\a.ts', 'C:\\Users\\username', '\\'), '~\\a.ts');
      assert.strictEqual(applyTilde('D:\\tmp\\a.ts', 'C:\\Users\\username', '\\'), 'D:\\tmp\\a.ts');
    });
  });
});
