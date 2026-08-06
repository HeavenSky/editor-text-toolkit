import { describe, it } from 'vitest';
import * as assert from 'node:assert';
import {
  formatFileSize,
  matchesAutoApplyExtension,
  normalizeExtension,
  shouldPromptForSize
} from '../src/features/plainText/core';

const MB = 1024 * 1024;

describe('plainText core', () => {
  describe('normalizeExtension', () => {
    it('补上前导点并转小写', () => {
      assert.strictEqual(normalizeExtension('log'), '.log');
      assert.strictEqual(normalizeExtension('.LOG'), '.log');
      assert.strictEqual(normalizeExtension('  .Csv '), '.csv');
    });

    it('空串返回空串', () => {
      assert.strictEqual(normalizeExtension(''), '');
      assert.strictEqual(normalizeExtension('   '), '');
    });
  });

  describe('matchesAutoApplyExtension', () => {
    it('大小写与前导点无关', () => {
      assert.ok(matchesAutoApplyExtension('/tmp/a.LOG', ['log']));
      assert.ok(matchesAutoApplyExtension('/tmp/a.log', ['.LOG']));
      assert.ok(matchesAutoApplyExtension('C:\\logs\\a.csv', ['.log', '.csv']));
    });

    it('不匹配时返回 false', () => {
      assert.strictEqual(matchesAutoApplyExtension('/tmp/a.ts', ['.log']), false);
      assert.strictEqual(matchesAutoApplyExtension('/tmp/a.log', []), false);
      assert.strictEqual(matchesAutoApplyExtension('/tmp/a.log', ['', '  ']), false);
    });

    it('只匹配结尾, 不匹配路径中间', () => {
      assert.strictEqual(matchesAutoApplyExtension('/var/log.d/a.ts', ['.log']), false);
    });
  });

  describe('shouldPromptForSize', () => {
    it('达到阈值即提示', () => {
      assert.ok(shouldPromptForSize(5 * MB, 5));
      assert.ok(shouldPromptForSize(50 * MB, 5));
    });

    it('未达阈值不提示', () => {
      assert.strictEqual(shouldPromptForSize(4 * MB, 5), false);
    });

    it('阈值 <= 0 表示关闭', () => {
      assert.strictEqual(shouldPromptForSize(500 * MB, 0), false);
      assert.strictEqual(shouldPromptForSize(500 * MB, -1), false);
    });
  });

  describe('formatFileSize', () => {
    it('按量级选择单位', () => {
      assert.strictEqual(formatFileSize(512), '512 B');
      assert.strictEqual(formatFileSize(2048), '2.0 KB');
      assert.strictEqual(formatFileSize(12 * MB), '12.0 MB');
      assert.strictEqual(formatFileSize(1536 * MB), '1.5 GB');
    });

    it('三位数省略小数', () => {
      assert.strictEqual(formatFileSize(150 * MB), '150 MB');
    });
  });

});
