import * as assert from 'assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  ADVANCED_KEYS,
  advancedDefaults,
  DEFAULT_EDITOR_OVERRIDES,
  mergeEditorOverrides,
  resolveAdvanced
} from '../shared/advanced';

/** 测试产物在 out/test/ 下, 上溯两级即仓库根. */
const REPO_ROOT = path.resolve(__dirname, '../..');

function readJson(relativePath: string): Record<string, any> {
  return JSON.parse(fs.readFileSync(path.join(REPO_ROOT, relativePath), 'utf8'));
}

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

  /**
   * 内置层的默认值必须同时出现在设置界面里, 否则用户无从知道能配什么.
   * 这几条断言把 package.json 的 schema 与 advanced.ts 锁在一起, 防止两边漂移.
   */
  describe('package.json schema 与内置层一致', () => {
    const schema = readJson('package.json').contributes.configuration.properties[
      'textToolkit.advanced'
    ];

    it('schema 声明的键与 ADVANCED_KEYS 完全一致', () => {
      assert.deepStrictEqual(
        Object.keys(schema.properties).sort(),
        Object.values(ADVANCED_KEYS).slice().sort()
      );
    });

    it('每个键的 schema default 等于内置默认值', () => {
      const defaults = advancedDefaults();
      assert.strictEqual(
        schema.properties[ADVANCED_KEYS.useLineCountSyntax].default,
        defaults.copyPath.useLineCountSyntax
      );
      assert.strictEqual(
        schema.properties[ADVANCED_KEYS.includeDotInCurrentWord].default,
        defaults.changeCase.includeDotInCurrentWord
      );
      assert.strictEqual(
        schema.properties[ADVANCED_KEYS.rememberLastInput].default,
        defaults.alignByRegex.rememberLastInput
      );
      assert.strictEqual(
        schema.properties[ADVANCED_KEYS.applyEditorSettings].default,
        defaults.plainText.applyEditorSettings
      );
      assert.strictEqual(
        schema.properties[ADVANCED_KEYS.disableLineNumbers].default,
        defaults.plainText.disableLineNumbers
      );
      // editorOverrides 是增量对象, 用户侧默认必须是空对象.
      assert.deepStrictEqual(schema.properties[ADVANCED_KEYS.editorOverrides].default, {});
    });

    it('每个键都有 markdownDescription 占位符', () => {
      for (const [key, property] of Object.entries<any>(schema.properties)) {
        assert.ok(
          /^%.+%$/.test(property.markdownDescription),
          `${key} 缺少 markdownDescription 占位符`
        );
      }
      assert.ok(/^%.+%$/.test(schema.markdownDescription));
    });

    it('editorOverrides 代码片段逐项等于内置覆盖表', () => {
      const snippets = schema.properties[ADVANCED_KEYS.editorOverrides].defaultSnippets;
      const builtin = snippets.find((snippet: any) =>
        Object.keys(snippet.body).length === Object.keys(DEFAULT_EDITOR_OVERRIDES).length
      );
      assert.ok(builtin, '缺少写出完整内置覆盖表的代码片段');
      assert.deepStrictEqual(builtin.body, { ...DEFAULT_EDITOR_OVERRIDES });
    });

    it('advanced 代码片段覆盖全部键', () => {
      const [snippet] = schema.defaultSnippets;
      assert.deepStrictEqual(
        Object.keys(snippet.body).sort(),
        Object.values(ADVANCED_KEYS).slice().sort()
      );
    });
  });

  /** 新增文案时最容易漏翻译, 这里做双向集合比对. */
  describe('声明式文案中英双向无缺漏', () => {
    it('package.json 的 %key% 在两侧都有条目, 且没有冗余条目', () => {
      const raw = fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8');
      const used = new Set(
        [...raw.matchAll(/"%([^"%]+)%"/g)].map((match) => match[1])
      );
      const en = readJson('package.nls.json');
      const zh = readJson('package.nls.zh-cn.json');

      assert.ok(used.size > 0, '未从 package.json 中解析到任何占位符');
      for (const key of used) {
        assert.ok(key in en, `package.nls.json 缺少 ${key}`);
        assert.ok(key in zh, `package.nls.zh-cn.json 缺少 ${key}`);
      }
      assert.deepStrictEqual(
        Object.keys(en).filter((key) => !used.has(key)),
        [],
        'package.nls.json 存在未被引用的条目'
      );
      assert.deepStrictEqual(
        Object.keys(zh).filter((key) => !used.has(key)),
        [],
        'package.nls.zh-cn.json 存在未被引用的条目'
      );
    });
  });
});
