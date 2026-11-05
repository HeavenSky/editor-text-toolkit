// 用最小文本模型执行真实命令, 验证混合单行/多行选区在编辑后的选区位置重建.
import { beforeEach, describe, expect, it, vi } from "vitest";

interface Position {
	line: number;
	character: number;
}

/** 类经解构导入后只剩值绑定, 类型标注用同形的接口. */
interface RangeLike {
	start: Position;
	end: Position;
}

/** vscode mock 与断言共用同一对类; 经 vi.hoisted 提升以供 mock 工厂引用. */
const { MockRange, MockSelection } = vi.hoisted(() => {
	class MockRange {
		start: Position;
		end: Position;
		constructor(
			start: Position | number,
			end?: Position | number,
			endLine?: number,
			endCharacter?: number
		) {
			if (typeof start === "number") {
				this.start = { line: start, character: end as number };
				this.end = { line: endLine as number, character: endCharacter as number };
			} else {
				this.start = start;
				this.end = end as Position;
			}
		}
		get isSingleLine(): boolean {
			return this.start.line === this.end.line;
		}
	}
	class MockSelection extends MockRange {}
	return { MockRange, MockSelection };
});

const state = vi.hoisted(() => {
	const bundle = { lines: [] as string[], selections: [] as unknown[] };
	const model = {
		eol: 1,
		getText(range: { start: Position; end: Position }): string {
			const { lines } = bundle;
			if (range.start.line === range.end.line) {
				return lines[range.start.line].slice(range.start.character, range.end.character);
			}
			const parts = [lines[range.start.line].slice(range.start.character)];
			for (let line = range.start.line + 1; line < range.end.line; line++) {
				parts.push(lines[line]);
			}
			parts.push(lines[range.end.line].slice(0, range.end.character));
			return parts.join("\n");
		},
	};
	return {
		model,
		get lines() {
			return bundle.lines;
		},
		set lines(value: string[]) {
			bundle.lines = value;
		},
		get selections() {
			return bundle.selections;
		},
		set selections(value: unknown[]) {
			bundle.selections = value;
		},
		reset(text: string) {
			bundle.lines = text.split("\n");
			bundle.selections = [];
		},
	};
});

const position = (line: number, character: number): Position => ({ line, character });
/** 选区端点简写: s(行, 列) 到 e(行, 列). */
const range = (sl: number, sc: number, el: number, ec: number): RangeLike =>
	new MockRange(position(sl, sc), position(el, ec));

vi.mock("vscode", () => ({
	Range: MockRange,
	Selection: MockSelection,
	EndOfLine: { LF: 1, CRLF: 2 },
	window: {
		get activeTextEditor() {
			return editor;
		},
	},
	l10n: { t: (text: string) => text },
}));

const editor = {
	document: state.model,
	get selections() {
		return state.selections;
	},
	set selections(value: unknown[]) {
		state.selections = value;
	},
	/** 与 VS Code 语义一致: 所有 range 都基于编辑前的快照, 统一按从后往前的顺序应用. */
	edit(callback: (builder: { replace: (range: RangeLike, text: string) => void }) => unknown) {
		const pending: { range: RangeLike; text: string }[] = [];
		callback({ replace: (range: RangeLike, text: string) => pending.push({ range, text }) });
		for (const { range: editRange, text } of [...pending].sort(
			(a, b) =>
				b.range.start.line - a.range.start.line ||
				b.range.start.character - a.range.start.character
		)) {
			applyReplace(editRange, text);
		}
		return Promise.resolve();
	},
};

function applyReplace(range: RangeLike, text: string): void {
	const { lines } = state;
	const replacementLines = text.split("\n");
	const before = lines.slice(0, range.start.line);
	const after = lines.slice(range.end.line + 1);
	const head = lines[range.start.line].slice(0, range.start.character);
	const tail = lines[range.end.line].slice(range.end.character);
	state.lines =
		replacementLines.length === 1
			? [...before, head + replacementLines[0] + tail, ...after]
			: [
					...before,
					head + replacementLines[0],
					...replacementLines.slice(1, -1),
					replacementLines[replacementLines.length - 1] + tail,
					...after,
				];
}

import { runCaseCommand } from "../src/features/changeCase/command";

beforeEach(() => state.reset(""));

describe("大小写转换的选区重建", () => {
	it("同一行的前序单行选区会平移后续选区", async () => {
		state.reset("aa-bb cc-dd");
		editor.selections = [range(0, 0, 0, 5), range(0, 6, 0, 11)];
		await runCaseCommand("camel");
		expect(state.lines).toEqual(["aaBb ccDd"]);
		// 第二段整体左移 1(第一段 -1), 终点再叠加自己的 -1.
		expect(state.selections).toEqual([
			new MockSelection(0, 0, 0, 4),
			new MockSelection(0, 5, 0, 9),
		]);
	});

	it("混合单行与多行选区: 起点按起点行前序编辑平移, 终点按终点行累计", async () => {
		state.reset("foo-bar x\nbaz-qux");
		editor.selections = [range(0, 0, 0, 7), range(0, 8, 1, 7)];
		await runCaseCommand("camel");
		expect(state.lines).toEqual(["fooBar x", "bazQux"]);
		// 第二段起点 (0,8) -> (0,7): 第一段在它之前缩短了 1; 终点 (1,7) -> (1,6).
		expect(state.selections).toEqual([
			new MockSelection(0, 0, 0, 6),
			new MockSelection(0, 7, 1, 6),
		]);
	});

	it("多行选区末行的缩短会平移同一行内的后续选区", async () => {
		// 多行段把 "aa " 压成 "aa"(末行 -1), 同一行更靠后的 "bb-cc" 段整体左移 1.
		state.reset("x-y\nmiddle\naa bb-cc");
		editor.selections = [range(0, 2, 2, 3), range(2, 3, 2, 8)];
		await runCaseCommand("camel");
		expect(state.lines).toEqual(["x-y", "middle", "aabbCc"]);
		expect(state.selections).toEqual([
			new MockSelection(0, 2, 2, 2),
			new MockSelection(2, 2, 2, 6),
		]);
	});
});
