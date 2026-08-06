import * as vscode from 'vscode';
import type { MultiLineFormat } from '../features/copyPath/core';
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

export type DiffContextMenu = 'both' | 'markOnly' | 'none';
export type ClipboardSide = 'left' | 'right';

export interface DiffConfig {
  contextMenu: DiffContextMenu;
  clipboardSide: ClipboardSide;
  /** 原始值; 校验与丢弃非法条目由 features/diff/core.ts 的 loadRules 负责. */
  normalizationRules: unknown;
}

/**
 * `contextMenu` 用单个枚举而不是每条命令一个布尔: `when` 子句只能读取嵌套对象属性,
 * 而本扩展的内置层 `textToolkit.advanced` 用的是扁平点号键, 无法在 `when` 中引用.
 */
export function getDiffConfig(): DiffConfig {
  const config = vscode.workspace.getConfiguration('textToolkit.diff');
  return {
    contextMenu: config.get<DiffContextMenu>('contextMenu', 'both'),
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
