import * as assert from 'assert';
import {
  ADVANCED_KEYS,
  advancedDefaults,
  DEFAULT_EDITOR_OVERRIDES,
  mergeEditorOverrides,
  resolveAdvanced
} from '../shared/advanced';

describe('advanced (内置层增量覆盖)', () => {
  describe('advancedDefaults', () => {
    it('内置默认值', () => {
      const defaults = advancedDefaults();
      assert.strictEqual(defaults.copyPath.useLineCountSyntax, false);
      assert.strictEqual(defaults.changeCase.includeDotInCurrentWord, false);
      assert.strictEqual(defaults.alignByRegex.rememberLastInput, true);
      assert.strictEqual(defaults.plainText.applyEditorSettings, true);
      assert.strictEqual(defaults.plainText.disableLineNumbers, false);
      assert.deepStrictEqual(
        defaults.plainText.editorOverrides,
        { ...DEFAULT_EDITOR_OVERRIDES }
      );
    });

    it('返回的覆盖表是副本, 改动不影响内置表', () => {
      const defaults = advancedDefaults();
      defaults.plainText.editorOverrides['editor.folding'] = true;
      assert.strictEqual(DEFAULT_EDITOR_OVERRIDES['editor.folding'], false);
    });

    it('全部覆盖键都是 editor.* 且包含关键项', () => {
      for (const key of Object.keys(DEFAULT_EDITOR_OVERRIDES)) {
        assert.ok(key.startsWith('editor.'), `unexpected setting scope: ${key}`);
      }
      assert.strictEqual(DEFAULT_EDITOR_OVERRIDES['editor.wordWrap'], 'off');
      assert.strictEqual(DEFAULT_EDITOR_OVERRIDES['editor.minimap.enabled'], false);
    });
  });

  describe('mergeEditorOverrides', () => {
    it('增量修改已有项', () => {
      const merged = mergeEditorOverrides(DEFAULT_EDITOR_OVERRIDES, {
        'editor.minimap.enabled': true
      });
      assert.strictEqual(merged['editor.minimap.enabled'], true);
      assert.strictEqual(merged['editor.folding'], false);
    });

    it('null 表示移除内置覆盖', () => {
      const merged = mergeEditorOverrides(DEFAULT_EDITOR_OVERRIDES, { 'editor.wordWrap': null });
      assert.ok(!('editor.wordWrap' in merged));
      assert.strictEqual(Object.keys(merged).length, Object.keys(DEFAULT_EDITOR_OVERRIDES).length - 1);
    });

    it('可以追加内置表以外的键', () => {
      const merged = mergeEditorOverrides(DEFAULT_EDITOR_OVERRIDES, { 'editor.rulers': [] });
      assert.deepStrictEqual(merged['editor.rulers'], []);
    });

    it('非对象输入按无覆盖处理', () => {
      for (const raw of [undefined, null, 42, 'x', ['a']]) {
        assert.deepStrictEqual(mergeEditorOverrides(DEFAULT_EDITOR_OVERRIDES, raw), {
          ...DEFAULT_EDITOR_OVERRIDES
        });
      }
    });
  });

  describe('resolveAdvanced', () => {
    it('空配置返回内置默认值', () => {
      assert.deepStrictEqual(resolveAdvanced(undefined), advancedDefaults());
      assert.deepStrictEqual(resolveAdvanced({}), advancedDefaults());
    });

    it('只改设置过的键', () => {
      const resolved = resolveAdvanced({
        [ADVANCED_KEYS.includeDotInCurrentWord]: true,
        [ADVANCED_KEYS.disableLineNumbers]: true
      });
      assert.strictEqual(resolved.changeCase.includeDotInCurrentWord, true);
      assert.strictEqual(resolved.plainText.disableLineNumbers, true);
      // 未设置的键保持内置值
      assert.strictEqual(resolved.alignByRegex.rememberLastInput, true);
      assert.strictEqual(resolved.plainText.applyEditorSettings, true);
    });

    it('a+n 语法开关默认关闭, 可单独打开', () => {
      assert.strictEqual(resolveAdvanced({}).copyPath.useLineCountSyntax, false);
      const resolved = resolveAdvanced({ [ADVANCED_KEYS.useLineCountSyntax]: true });
      assert.strictEqual(resolved.copyPath.useLineCountSyntax, true);
      assert.strictEqual(resolved.changeCase.includeDotInCurrentWord, false);
    });

    it('类型不符的值被忽略', () => {
      const resolved = resolveAdvanced({
        [ADVANCED_KEYS.includeDotInCurrentWord]: 'yes',
        [ADVANCED_KEYS.applyEditorSettings]: 0,
        [ADVANCED_KEYS.rememberLastInput]: null
      });
      assert.strictEqual(resolved.changeCase.includeDotInCurrentWord, false);
      assert.strictEqual(resolved.plainText.applyEditorSettings, true);
      assert.strictEqual(resolved.alignByRegex.rememberLastInput, true);
    });

    it('未知键被忽略', () => {
      const resolved = resolveAdvanced({ 'nope.whatever': true });
      assert.deepStrictEqual(resolved, advancedDefaults());
    });

    it('editorOverrides 走增量合并', () => {
      const resolved = resolveAdvanced({
        [ADVANCED_KEYS.editorOverrides]: {
          'editor.minimap.enabled': true,
          'editor.hover.enabled': null
        }
      });
      assert.strictEqual(resolved.plainText.editorOverrides['editor.minimap.enabled'], true);
      assert.ok(!('editor.hover.enabled' in resolved.plainText.editorOverrides));
      assert.strictEqual(resolved.plainText.editorOverrides['editor.folding'], false);
    });
  });
});
