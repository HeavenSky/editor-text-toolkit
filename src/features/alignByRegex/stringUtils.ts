export function trimStart(value: string): string {
	return value.replace(/^\s+([^\s].*)/, "$1");
}

export function trimStartButOne(value: string): string {
	return value.replace(/^\s+([^\s].*)/, " $1");
}

export function trimEnd(value: string): string {
	return value.replace(/(.*[^\s])\s+$/, "$1");
}

export function trimEndButOne(value: string): string {
	return value.replace(/(.*[^\s])\s+$/, "$1 ");
}

export function trimButOne(value: string): string {
	return trimEndButOne(trimStartButOne(value));
}

export function extendToLength(
	value: string,
	length: number,
	tabSize: number,
	startColumn = 0
): string {
	return value + " ".repeat(Math.max(0, length - tabAwareLength(value, tabSize, startColumn)));
}

/**
 * tab 从当前可视列推进到下一个制表位, 宽度取决于所在位置而非固定 tabSize 列;
 * 按列宽而非字符数计算才能对齐含 tab 的行. part 不从行首起时(多列对齐的后续 part),
 * 实际起始列经 startColumn 传入. 按 UTF-16 code unit 计数(与编辑器列号一致), 不按 code point.
 */
export function tabAwareLength(value: string, tabSize: number, startColumn = 0): number {
	let column = startColumn;
	for (let index = 0; index < value.length; index += 1) {
		column += value.charAt(index) === "\t" ? tabSize - (column % tabSize) : 1;
	}
	return column - startColumn;
}

export function checkedRegex(input: string): RegExp | undefined {
	try {
		return new RegExp(input, "g");
	} catch {
		return undefined;
	}
}
