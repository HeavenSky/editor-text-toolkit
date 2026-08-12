import * as vscode from 'vscode';
import type { MultiLineFormat } from '../features/copyPath/core';
import { DEFAULT_LARGE_FILE_LIMIT_MB } from '../features/plainText/core';
import { resolveAdvanced, type AdvancedSettings } from './advanced';

export type PathStyle = 'absolute' | 'relative' | 'tilde' | 'fileName';

export interface CopyPathConfig {
  pathStyle: PathStyle;
  separator: string;
  multiLineFormat: MultiLineFormat;
}

/** 暴露层: 在 package.json 中各自声明的常用配置键. */
export function getCopyPathConfig(): CopyPathConfig {
  const config = vscode.workspace.getConfiguration('textToolkit.copyPath');
  return {
    pathStyle: config.get<PathStyle>('pathStyle', 'absolute'),
    separator: config.get<string>('separator', ':'),
    multiLineFormat: config.get<MultiLineFormat>('multiLineFormat', 'range')
  };
}

export function getAlignTemplates(): Record<string, string> {
  return vscode.workspace
    .getConfiguration('textToolkit.alignByRegex')
    .get<Record<string, string>>('templates', {});
}

export interface PlainTextPromptConfig {
  promptSizeMB: number;
  autoApplyExtensions: string[];
}

export function getPlainTextPromptConfig(): PlainTextPromptConfig {
  const config = vscode.workspace.getConfiguration('textToolkit.plainText');
  return {
    promptSizeMB: config.get<number>('promptSizeMB', 2),
    autoApplyExtensions: config.get<string[]>('autoApplyExtensions', [])
  };
}

/**
 * 文件超过它就不再显示在编辑器里, 而是换成"文件过大"占位页.
 * VS Code 自己的设置, 我们只读: 用它判断某个标签页是不是打不开的大文件.
 */
export function getLargeFileLimitMB(resource: vscode.Uri): number {
  const value = vscode.workspace
    .getConfiguration('workbench', resource)
    .get<number>('editorLargeFileConfirmation');
  return typeof value === 'number' && value > 0 ? value : DEFAULT_LARGE_FILE_LIMIT_MB;
}

export type ClipboardSide = 'left' | 'right';

export interface DiffConfig {
  clipboardSide: ClipboardSide;
  /** 原始值; 校验与丢弃非法条目由 features/diff/core.ts 的 loadRules 负责. */
  normalizationRules: unknown;
}

/**
 * 不含 `textToolkit.diff.contextMenu`: 它只被 package.json 里 editor/context 的 `when`
 * 子句消费, 运行时无需读取. 它用单个枚举而不是每条命令一个布尔, 是因为 `when` 只能读取
 * 嵌套对象属性, 而本扩展的内置层 `textToolkit.advanced` 用的是扁平点号键.
 */
export function getDiffConfig(): DiffConfig {
  const config = vscode.workspace.getConfiguration('textToolkit.diff');
  return {
    clipboardSide: config.get<ClipboardSide>('clipboardSide', 'left'),
    normalizationRules: config.get<unknown>('normalizationRules', [])
  };
}

/** 内置层: 只通过 `textToolkit.advanced` 这一个对象做增量覆盖. */
export function getAdvanced(): AdvancedSettings {
  return resolveAdvanced(vscode.workspace.getConfiguration().get<unknown>('textToolkit.advanced'));
}

/**
 * 对齐所用的制表符宽度. 与上游 align-by-regex 一致: 配置缺失或 < 1 时回退为 1,
 * 因为 tabAwareLength 用它换算列宽, 取 0 会让含 tab 的行宽度计算失真.
 */
export function getEditorTabSize(): number {
  const tabSize = vscode.workspace.getConfiguration('editor', null).get<number>('tabSize');
  if (tabSize === undefined || tabSize < 1) {
    console.log('Error [Align by Regex]: Invalid tab size setting "editor.tabSize" for alignment.');
    return 1;
  }
  return tabSize;
}
