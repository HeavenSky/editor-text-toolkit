import * as path from 'path';

export type MultiLineFormat = 'range' | 'list' | 'perLine';

/**
 * 行片段的写法. 统一语法:
 * - `path:a`        单行
 * - `path:a-b`      闭区间(spanSyntax = 'range')
 * - `path:a+n`      从 a 开始的 n 行(spanSyntax = 'count')
 * - `path:a-b,c-d`  多个片段一律用 `,` 连接, 两种写法都适用
 */
export type SpanSyntax = 'range' | 'count';

/** 一个连续行片段, 闭区间 [start, end], 均为 1 基行号. */
export interface LineRange {
  start: number;
  end: number;
}

/** 结构上兼容 vscode.Selection, 让核心逻辑不依赖 vscode 即可被测试. */
export interface LineSpan {
  start: { line: number };
  end: { line: number; character: number };
  isEmpty: boolean;
}

/** 汇总所有选区覆盖的 1 基行号, 去重并升序. */
export function collectLineNumbers(selections: readonly LineSpan[]): number[] {
  const lines = new Set<number>();
  for (const selection of selections) {
    const startLine = selection.start.line + 1;
    let endLine = selection.end.line + 1;
    if (selection.isEmpty) {
      lines.add(startLine);
      continue;
    }
    // 选区停在下一行行首时, 该行没有内容被选中, 不计入.
    if (selection.end.character === 0 && endLine > startLine) {
      endLine -= 1;
    }
    for (let line = startLine; line <= endLine; line += 1) {
      lines.add(line);
    }
  }
  return Array.from(lines).sort((a, b) => a - b);
}

/** 把升序行号切成连续片段; 多个不相邻的选区因此得到多个片段. */
export function toLineRanges(lines: readonly number[]): LineRange[] {
  const ranges: LineRange[] = [];
  for (const line of lines) {
    const last = ranges[ranges.length - 1];
    if (last && line === last.end + 1) {
      last.end = line;
    } else if (!last || line !== last.end) {
      ranges.push({ start: line, end: line });
    }
  }
  return ranges;
}

export function formatLineRange(range: LineRange, spanSyntax: SpanSyntax): string {
  if (range.start === range.end) {
    return String(range.start);
  }
  return spanSyntax === 'count'
    ? `${range.start}+${range.end - range.start + 1}`
    : `${range.start}-${range.end}`;
}

/** spanSyntax 只影响 `range` 格式; list 与 perLine 本来就逐行罗列, 没有片段可言. */
export function formatLines(
  lines: readonly number[],
  style: MultiLineFormat,
  spanSyntax: SpanSyntax = 'range'
): string {
  if (lines.length === 0) {
    return '';
  }
  if (style === 'list' || style === 'perLine') {
    return lines.join(',');
  }
  return toLineRanges(lines)
    .map((range) => formatLineRange(range, spanSyntax))
    .join(',');
}

export function formatResult(
  filePath: string,
  lines: readonly number[],
  separator: string,
  style: MultiLineFormat,
  spanSyntax: SpanSyntax = 'range'
): string {
  if (style === 'perLine') {
    return lines.map((line) => `${filePath}${separator}${line}`).join('\n');
  }
  return `${filePath}${separator}${formatLines(lines, style, spanSyntax)}`;
}

/** 仅当路径位于 home 目录下时替换前缀为 `~`; sep 可注入以便跨平台测试. */
export function applyTilde(absolutePath: string, homeDir: string, sep: string = path.sep): string {
  const normalizedHome = homeDir.endsWith(sep) ? homeDir.slice(0, -1) : homeDir;
  if (absolutePath === normalizedHome) {
    return '~';
  }
  if (absolutePath.startsWith(`${normalizedHome}${sep}`)) {
    return `~${absolutePath.slice(normalizedHome.length)}`;
  }
  return absolutePath;
}
