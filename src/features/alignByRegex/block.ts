import type { Line } from './line';
import { PartType, type Part } from './part';
import {
  checkedRegex,
  extendToLength,
  tabAwareLength,
  trimButOne,
  trimEnd,
  trimEndButOne,
  trimStartButOne
} from './stringUtils';

export type Eol = '\n' | '\r\n';

/**
 * 一行被切成 `Text, Regex, Text, Regex, ..., Text` 交替的 parts:
 * m 个匹配 => 2m+1 个 part; 文本 part 下标为偶数, 正则 part 下标为奇数,
 * 最后一个(下标 2m)是行尾文本, 永不参与对齐填充.
 */
export class Block {
  lines: Line[] = [];

  constructor(text: string, input: string, startLine: number, eol: Eol) {
    const textLines = text.split(eol);
    const regex = checkedRegex(input);

    /* basic protection from bad regexes */
    if (regex === undefined) {
      return;
    }

    for (let i = 0; i < textLines.length; i++) {
      const lineText = textLines[i];
      const lineObject: Line = { number: startLine + i, parts: [] as Part[] };

      let textStartPosition = 0;
      let result: RegExpExecArray | null;
      while ((result = regex.exec(lineText))) {
        const matchedSep = result[0];
        if (matchedSep === '') {
          /* 0 长度匹配(例如 '|' 操作符)会导致无限增长, 直接停止本行切分 */
          break;
        }
        const regexStartPosition = regex.lastIndex - matchedSep.length;
        lineObject.parts.push({
          type: PartType.Text,
          value: lineText.substring(textStartPosition, regexStartPosition)
        });
        lineObject.parts.push({ type: PartType.Regex, value: matchedSep });
        textStartPosition = regex.lastIndex;
      }
      lineObject.parts.push({
        type: PartType.Text,
        value: lineText.substring(textStartPosition, lineText.length)
      });
      this.lines.push(lineObject);
    }
  }

  /** 该行的匹配数. */
  static matchCount(line: Line): number {
    return (line.parts.length - 1) / 2;
  }

  trim(): Block {
    for (const line of this.lines) {
      for (let i = 0; i < line.parts.length; i++) {
        const part = line.parts[i];
        if (i === 0) {
          part.value = trimEndButOne(part.value);
        } else if (i < line.parts.length - 1) {
          part.value = trimButOne(part.value);
        } else {
          part.value = trimEnd(trimStartButOne(part.value));
        }
      }
    }
    return this;
  }

  /**
   * 分层列对齐: 第 j 列只在"仍拥有第 j+1 个匹配"的行之间求列宽并填充.
   *
   * 匹配数用尽的行会离开 active 集合, 其行尾文本不再影响任何列宽 —— 这是相对
   * align-by-regex 上游的关键修复: 上游对全部 part 下标统计最大宽度(含行尾文本),
   * 会让匹配数少的行的行尾长度撑开其他行的中间列.
   *
   * 不变量: active(j) ⊆ active(j-1) ⊆ ... ⊆ active(0), 且每一步对当前 active 全体
   * 施加同一目标宽度, 因此 active(j) 内各行在前 2j 个 part 上的累计宽度恒等,
   * 逐 part 取最大宽度即等价于真正的列对齐.
   */
  align(tabSize: number): Block {
    const maxMatches = this.lines.reduce(
      (max, line) => Math.max(max, Block.matchCount(line)),
      0
    );

    for (let matchIndex = 0; matchIndex < maxMatches; matchIndex++) {
      const active = this.lines.filter((line) => Block.matchCount(line) >= matchIndex + 1);
      if (active.length < 2) {
        /* 只有一行拥有该列匹配时无对齐对象, 保持原样 */
        continue;
      }

      for (const partIndex of [2 * matchIndex, 2 * matchIndex + 1]) {
        const columnWidth = active.reduce(
          (max, line) => Math.max(max, tabAwareLength(line.parts[partIndex].value, tabSize)),
          0
        );
        for (const line of active) {
          line.parts[partIndex].value = extendToLength(
            line.parts[partIndex].value,
            columnWidth,
            tabSize
          );
        }
      }
    }
    return this;
  }
}
