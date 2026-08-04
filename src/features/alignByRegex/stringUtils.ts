export function trimStart(value: string): string {
  return value.replace(/^\s+([^\s].*)/, '$1');
}

export function trimStartButOne(value: string): string {
  return value.replace(/^\s+([^\s].*)/, ' $1');
}

export function trimEnd(value: string): string {
  return value.replace(/(.*[^\s])\s+$/, '$1');
}

export function trimEndButOne(value: string): string {
  return value.replace(/(.*[^\s])\s+$/, '$1 ');
}

export function trimButOne(value: string): string {
  return trimEndButOne(trimStartButOne(value));
}

export function extendToLength(value: string, length: number, tabSize: number): string {
  return value + ' '.repeat(Math.max(0, length - tabAwareLength(value, tabSize)));
}

/**
 * tab 在编辑器里占 tabSize 列, 按列宽而非字符数计算才能对齐含 tab 的行.
 * 按 UTF-16 code unit 计数(与编辑器列号一致), 不按 code point.
 */
export function tabAwareLength(value: string, tabSize: number): number {
  let length = 0;
  for (let index = 0; index < value.length; index += 1) {
    length += value.charAt(index) === '\t' ? tabSize : 1;
  }
  return length;
}

export function checkedRegex(input: string): RegExp | undefined {
  try {
    return new RegExp(input, 'g');
  } catch {
    return undefined;
  }
}
