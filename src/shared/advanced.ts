/**
 * 配置分两层:
 * - 暴露层: 常用项在 package.json 里各自声明为独立配置键(pathStyle, separator 等).
 * - 内置层: 其余全部选项只有内置默认值, 不单独声明配置键, 只能通过
 *   `textToolkit.advanced` 这一个对象做**增量**覆盖.
 *
 * 本文件是内置层的唯一权威来源, 不 import vscode 以便直接单测.
 */

/** 纯文本模式下按 `[plaintext]` 语言作用域写入的编辑器覆盖项(内置默认表). */
export const DEFAULT_EDITOR_OVERRIDES: Readonly<Record<string, unknown>> = {
  'editor.minimap.enabled': false,
  'editor.wordWrap': 'off',
  'editor.folding': false,
  'editor.stickyScroll.enabled': false,
  'editor.bracketPairColorization.enabled': false,
  'editor.guides.indentation': false,
  'editor.guides.bracketPairs': false,
  'editor.matchBrackets': 'never',
  'editor.occurrencesHighlight': 'off',
  'editor.selectionHighlight': false,
  'editor.renderWhitespace': 'none',
  'editor.renderControlCharacters': false,
  'editor.codeLens': false,
  'editor.colorDecorators': false,
  'editor.links': false,
  'editor.hover.enabled': false,
  'editor.parameterHints.enabled': false,
  'editor.suggestOnTriggerCharacters': false,
  'editor.wordBasedSuggestions': 'off',
  'editor.quickSuggestions': { other: false, comments: false, strings: false },
  'editor.formatOnType': false,
  'editor.formatOnPaste': false,
  'editor.autoClosingBrackets': 'never',
  'editor.autoClosingQuotes': 'never',
  'editor.trimAutoWhitespace': false,
  'editor.semanticHighlighting.enabled': false,
  'editor.unicodeHighlight.nonBasicASCII': false,
  'editor.unicodeHighlight.invisibleCharacters': false,
  'editor.unicodeHighlight.ambiguousCharacters': false
};

export interface AdvancedSettings {
  copyPath: {
    /** true 时连续片段写成 `a+n`(n 为行数), false 时写成闭区间 `a-b`. */
    useLineCountSyntax: boolean;
  };
  changeCase: {
    includeDotInCurrentWord: boolean;
  };
  alignByRegex: {
    rememberLastInput: boolean;
  };
  plainText: {
    applyEditorSettings: boolean;
    disableLineNumbers: boolean;
    editorOverrides: Record<string, unknown>;
  };
}

/** `textToolkit.advanced` 里可用的扁平点号键, 与 package.json 的 schema 一致. */
export const ADVANCED_KEYS = {
  useLineCountSyntax: 'copyPath.useLineCountSyntax',
  includeDotInCurrentWord: 'changeCase.includeDotInCurrentWord',
  rememberLastInput: 'alignByRegex.rememberLastInput',
  applyEditorSettings: 'plainText.applyEditorSettings',
  disableLineNumbers: 'plainText.disableLineNumbers',
  editorOverrides: 'plainText.editorOverrides'
} as const;

export function advancedDefaults(): AdvancedSettings {
  return {
    copyPath: { useLineCountSyntax: false },
    changeCase: { includeDotInCurrentWord: false },
    alignByRegex: { rememberLastInput: true },
    plainText: {
      applyEditorSettings: true,
      disableLineNumbers: false,
      editorOverrides: { ...DEFAULT_EDITOR_OVERRIDES }
    }
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * 把内置默认覆盖表与用户的增量修改合并.
 * `null` 表示移除该内置覆盖项(而不是把它写成 null), 这样用户可以放回某个被关掉的功能.
 */
export function mergeEditorOverrides(
  defaults: Readonly<Record<string, unknown>>,
  overrides: unknown
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...defaults };
  if (!isPlainObject(overrides)) {
    return merged;
  }
  for (const [key, value] of Object.entries(overrides)) {
    if (value === null) {
      delete merged[key];
    } else {
      merged[key] = value;
    }
  }
  return merged;
}

/** 类型不符或未知的键一律忽略, 保留内置默认值; 不抛异常. */
export function resolveAdvanced(raw: unknown): AdvancedSettings {
  const resolved = advancedDefaults();
  if (!isPlainObject(raw)) {
    return resolved;
  }

  const readBoolean = (key: string, fallback: boolean): boolean =>
    typeof raw[key] === 'boolean' ? (raw[key] as boolean) : fallback;

  resolved.copyPath.useLineCountSyntax = readBoolean(
    ADVANCED_KEYS.useLineCountSyntax,
    resolved.copyPath.useLineCountSyntax
  );
  resolved.changeCase.includeDotInCurrentWord = readBoolean(
    ADVANCED_KEYS.includeDotInCurrentWord,
    resolved.changeCase.includeDotInCurrentWord
  );
  resolved.alignByRegex.rememberLastInput = readBoolean(
    ADVANCED_KEYS.rememberLastInput,
    resolved.alignByRegex.rememberLastInput
  );
  resolved.plainText.applyEditorSettings = readBoolean(
    ADVANCED_KEYS.applyEditorSettings,
    resolved.plainText.applyEditorSettings
  );
  resolved.plainText.disableLineNumbers = readBoolean(
    ADVANCED_KEYS.disableLineNumbers,
    resolved.plainText.disableLineNumbers
  );
  resolved.plainText.editorOverrides = mergeEditorOverrides(
    DEFAULT_EDITOR_OVERRIDES,
    raw[ADVANCED_KEYS.editorOverrides]
  );

  return resolved;
}
