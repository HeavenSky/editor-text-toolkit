import { describe, it } from "vitest";
import * as assert from "node:assert";
import {
	buildVariants,
	decideDirectoryAction,
	decideOpen,
	dedupeCandidates,
	fileUriToPath,
	findSelectionLinkRanges,
	formatPosSuffix,
	isOpenable,
	parseLsofCwd,
	parseProcStatTpgid,
	parsePsTpgid,
	parseSelection,
	prefillText,
	raceTimeout,
	resolveTargetPath,
	sortForPick,
	stripTrailingPunctuation,
	toUriPath,
	toZeroBasedPosition,
	unicodeAlternatives,
	type PathFlavor,
	type ResolvedCandidate,
	type TargetKind,
} from "../src/features/terminalOpen/core";

const HOME = "/Users/u";

function options(flavor: PathFlavor) {
	return { flavor, homeDir: flavor === "win32" ? "C:\\Users\\u" : HOME };
}

/** parseSelection 首个候选的首个变体经 resolveTargetPath 得到的 (路径, 行, 列). */
function first(text: string, flavor: PathFlavor = "posix", cwd: string | undefined = "/proj") {
	const [candidate] = parseSelection(text, options(flavor)).candidates;
	assert.ok(candidate, `没有候选: ${text}`);
	const [variant] = candidate.variants;
	return [resolveTargetPath(variant, cwd, flavor), variant.line, variant.column];
}

/** buildVariants 的 {path, line, column} 序列, 不比较 raw. */
function variants(text: string, flavor: PathFlavor = "posix") {
	return buildVariants(text, options(flavor)).map(({ raw: _raw, ...rest }) => rest);
}

function k(kind: TargetKind, tag?: number) {
	return { kind, tag };
}

function candidate(
	absPath: string | undefined,
	sourceText: string,
	line?: number
): ResolvedCandidate {
	return {
		index: 0,
		sourceText,
		target:
			line === undefined
				? { path: sourceText, raw: sourceText }
				: { path: sourceText, raw: sourceText, line },
		absPath,
		kind: "file",
	};
}

describe("terminalOpen core", () => {
	describe("parseSelection + resolveTargetPath (posix, cwd /proj)", () => {
		const rows: [number, string, unknown[], string?][] = [
			[1, "src/a.ts", ["/proj/src/a.ts", undefined, undefined]],
			[2, "  src/a.ts \t", ["/proj/src/a.ts", undefined, undefined]],
			[4, "src/a.ts:12:5", ["/proj/src/a.ts", 12, 5]],
			[5, "src/a.ts(12,5)", ["/proj/src/a.ts", 12, 5]],
			[6, "src/a.ts(12, 5)", ["/proj/src/a.ts", 12, 5]],
			[7, "src/a.ts(12)", ["/proj/src/a.ts", 12, undefined]],
			[8, "src/a.ts#L12", ["/proj/src/a.ts", 12, undefined]],
			[9, "src/a.ts#L12-L20", ["/proj/src/a.ts", 12, undefined]],
			[10, "src/a.ts#L12C3", ["/proj/src/a.ts", 12, 3]],
			[11, "src/a.ts:12-20", ["/proj/src/a.ts", 12, undefined]],
			[12, "src/a.ts:12:5-14:2", ["/proj/src/a.ts", 12, 5]],
			[13, '"src/my file.ts"', ["/proj/src/my file.ts", undefined, undefined]],
			[14, "'src/a.ts'", ["/proj/src/a.ts", undefined, undefined]],
			[15, "`src/a.ts`", ["/proj/src/a.ts", undefined, undefined]],
			[16, "“src/a.ts”", ["/proj/src/a.ts", undefined, undefined]],
			[17, "(src/a.ts:12)", ["/proj/src/a.ts", 12, undefined]],
			[18, "src/a.ts),", ["/proj/src/a.ts", undefined, undefined]],
			[19, "src/a.ts:12,", ["/proj/src/a.ts", 12, undefined]],
			[20, "src/a.ts:12:", ["/proj/src/a.ts", 12, undefined]],
			[23, "..", ["/proj", undefined, undefined], "/proj/app"],
			[24, "../lib/b.js", ["/proj/lib/b.js", undefined, undefined], "/proj/app"],
			[25, "./x/../y.md", ["/proj/y.md", undefined, undefined]],
			[26, "/etc/hosts", ["/etc/hosts", undefined, undefined]],
			[29, "~/notes.md", ["/Users/u/notes.md", undefined, undefined]],
			[30, "~", ["/Users/u", undefined, undefined]],
			[31, "~bob/x", ["/proj/~bob/x", undefined, undefined]],
			[32, "file:///Users/u/a%20b.ts", ["/Users/u/a b.ts", undefined, undefined]],
			[33, "file:///Users/u/a.ts#L7", ["/Users/u/a.ts", 7, undefined]],
			[44, 'File "app/main.py", line 42, in <module>', ["/proj/app/main.py", 42, undefined]],
			[50, "src/a.ts:0", ["/proj/src/a.ts", undefined, undefined]],
			[51, "src/a.ts:12:0", ["/proj/src/a.ts", 12, undefined]],
			[52, "src/a b/c.ts", ["/proj/src/a b/c.ts", undefined, undefined]],
			[65, "\u200Bsrc/a.ts\uFEFF", ["/proj/src/a.ts", undefined, undefined]],
		];
		for (const [no, input, expected, cwd] of rows) {
			it(`#${no} ${JSON.stringify(input)}`, () => {
				assert.deepStrictEqual(first(input, "posix", cwd ?? "/proj"), expected);
			});
		}
	});

	describe("parseSelection + resolveTargetPath (win32)", () => {
		it("#35 盘符绝对路径带行号", () => {
			assert.deepStrictEqual(first("C:\\work\\a.ts:12", "win32", "D:\\proj"), [
				"C:\\work\\a.ts",
				12,
				undefined,
			]);
		});

		it("#37 反斜杠相对路径带 (行,列)", () => {
			assert.deepStrictEqual(first("src\\a.ts(3,4)", "win32", "C:\\proj"), [
				"C:\\proj\\src\\a.ts",
				3,
				4,
			]);
		});

		it("#38 file URI 转盘符路径", () => {
			assert.deepStrictEqual(first("file:///C:/work/a.ts", "win32", "C:\\proj"), [
				"C:\\work\\a.ts",
				undefined,
				undefined,
			]);
		});

		it("#62 盘符路径带行列", () => {
			assert.deepStrictEqual(first("C:\\a\\b.ts:3:4", "win32", "D:\\proj"), [
				"C:\\a\\b.ts",
				3,
				4,
			]);
		});
	});

	describe("buildVariants", () => {
		const rows: [number, string, PathFlavor, unknown[]][] = [
			[3, "src/a.ts:12", "posix", [{ path: "src/a.ts", line: 12 }, { path: "src/a.ts:12" }]],
			[21, "src/a.ts.", "posix", [{ path: "src/a.ts" }, { path: "src/a.ts." }]],
			[36, "C:\\work\\a.ts", "win32", [{ path: "C:\\work\\a.ts" }]],
			[40, "C:12", "posix", [{ path: "C:12" }]],
			[42, "a/src/x.ts", "posix", [{ path: "a/src/x.ts" }, { path: "src/x.ts" }]],
			[
				43,
				"b/src/x.ts:3",
				"posix",
				[
					{ path: "b/src/x.ts", line: 3 },
					{ path: "b/src/x.ts:3" },
					{ path: "src/x.ts", line: 3 },
					{ path: "src/x.ts:3" },
				],
			],
			[53, "docs/a(1).md", "posix", [{ path: "docs/a(1).md" }]],
			[54, "src/a.ts:1234567890", "posix", [{ path: "src/a.ts:1234567890" }]],
			[59, "C#notes.md", "posix", [{ path: "C#notes.md" }]],
			[60, "name (1).png", "posix", [{ path: "name (1).png" }]],
			[61, "foo(1)", "posix", [{ path: "foo", line: 1 }, { path: "foo(1)" }]],
			[63, "my\\ file.txt", "posix", [{ path: "my\\ file.txt" }, { path: "my file.txt" }]],
		];
		for (const [no, input, flavor, expected] of rows) {
			it(`#${no} ${JSON.stringify(input)} (${flavor})`, () => {
				assert.deepStrictEqual(variants(input, flavor), expected);
			});
		}

		it("#64 win32 下不生成 shell 反转义变体", () => {
			assert.ok(variants("my\\ file.txt", "win32").every(v => v.path !== "my file.txt"));
		});

		it("#69 raw 保留 ~ 展开前的文本", () => {
			const [variant] = buildVariants("~/notes.md", options("posix"));
			assert.strictEqual(variant.raw, "~/notes.md");
			assert.strictEqual(variant.path, "/Users/u/notes.md");
		});
	});

	describe("stripTrailingPunctuation", () => {
		it("#22 全是点时不剥", () => {
			assert.strictEqual(stripTrailingPunctuation("..", "posix"), "..");
		});

		it("#41 win32 下的盘符冒号不剥", () => {
			assert.strictEqual(stripTrailingPunctuation("C:", "win32"), "C:");
		});
	});

	describe("resolveTargetPath", () => {
		it("#27 绝对路径不需要 cwd", () => {
			assert.strictEqual(
				resolveTargetPath({ path: "/etc/hosts" }, undefined, "posix"),
				"/etc/hosts"
			);
		});

		it("#28 相对路径没有 cwd 时无法解析", () => {
			assert.strictEqual(
				resolveTargetPath({ path: "src/a.ts" }, undefined, "posix"),
				undefined
			);
		});

		it("#66 win32 当前盘根路径取 cwd 的盘符", () => {
			assert.strictEqual(
				resolveTargetPath({ path: "\\x\\a.ts" }, "D:\\proj", "win32"),
				"D:\\x\\a.ts"
			);
		});

		it("#67 win32 当前盘根路径没有 cwd 时无法解析", () => {
			assert.strictEqual(
				resolveTargetPath({ path: "\\x\\a.ts" }, undefined, "win32"),
				undefined
			);
		});
	});

	describe("fileUriToPath", () => {
		it("#34 posix 下带主机名的 URI 不解析", () => {
			assert.strictEqual(fileUriToPath("file://host/share/a.ts", "posix"), undefined);
		});

		it("#39 win32 下带主机名的 URI 转 UNC 路径", () => {
			assert.deepStrictEqual(fileUriToPath("file://srv/share/a.ts", "win32"), {
				path: "\\\\srv\\share\\a.ts",
			});
		});
	});

	describe("parseSelection", () => {
		it("#45 http 链接不产生候选", () => {
			assert.deepStrictEqual(
				parseSelection("https://example.com/a", options("posix")).candidates,
				[]
			);
		});

		it("#46 去掉空行与重复行, 按保留顺序编号", () => {
			const { candidates } = parseSelection(
				"src/a.ts\nsrc/b.ts\n\nsrc/a.ts",
				options("posix")
			);
			assert.deepStrictEqual(
				candidates.map(c => [c.index, c.sourceText]),
				[
					[0, "src/a.ts"],
					[1, "src/b.ts"],
				]
			);
		});

		it("#47 \\r\\n 换行同样切分", () => {
			assert.strictEqual(
				parseSelection("src/a.ts\r\nsrc/b.ts", options("posix")).candidates.length,
				2
			);
		});

		it("#48 超过 20 行时截断并标记", () => {
			const text = Array.from({ length: 25 }, (_, i) => `f${i + 1}.ts`).join("\n");
			const parsed = parseSelection(text, options("posix"));
			assert.strictEqual(parsed.candidates.length, 20);
			assert.strictEqual(parsed.candidates[19].sourceText, "f20.ts");
			assert.strictEqual(parsed.truncated, true);
		});

		it("#49 空选区与纯空白选区", () => {
			for (const text of ["", "  \n "]) {
				assert.deepStrictEqual(parseSelection(text, options("posix")), {
					candidates: [],
					truncated: false,
				});
			}
		});
	});

	describe("小工具函数", () => {
		it("#55 toZeroBasedPosition", () => {
			assert.deepStrictEqual(toZeroBasedPosition(12, 5), { line: 11, character: 4 });
			assert.deepStrictEqual(toZeroBasedPosition(12, undefined), { line: 11, character: 0 });
			assert.strictEqual(toZeroBasedPosition(undefined, undefined), undefined);
		});

		it("#56 parseLsofCwd 取 n 行, 空格原样保留", () => {
			assert.strictEqual(parseLsofCwd("p123\nfcwd\nn/Users/u/p q\n"), "/Users/u/p q");
		});

		it("#57 parseLsofCwd 空输出", () => {
			assert.strictEqual(parseLsofCwd(""), undefined);
		});

		it("#82 parsePsTpgid 取前台进程组号, 无控制终端时为 undefined", () => {
			assert.strictEqual(parsePsTpgid(" 70973\n"), 70973);
			assert.strictEqual(parsePsTpgid("   -1\n"), undefined);
			assert.strictEqual(parsePsTpgid(""), undefined);
		});

		it("#83 parseProcStatTpgid 进程名含空格与括号", () => {
			assert.strictEqual(
				parseProcStatTpgid("4242 (my (odd) name) S 1 4242 4242 34816 5150 4194304 0"),
				5150
			);
			assert.strictEqual(parseProcStatTpgid("1 (init) S 0 1 1 0 -1 4194560"), undefined);
		});

		it("#58 toUriPath win32", () => {
			assert.strictEqual(toUriPath("C:\\work\\a.ts", "win32"), "/C:/work/a.ts");
		});

		it("#68 unicodeAlternatives", () => {
			assert.deepStrictEqual(unicodeAlternatives("e\u0301.txt"), ["\u00e9.txt"]);
			assert.deepStrictEqual(unicodeAlternatives("a.txt"), []);
		});
	});

	describe("findSelectionLinkRanges", () => {
		const ranges = (line: string, selection: string) =>
			findSelectionLinkRanges(line, selection).map(({ start, length, text }) => ({
				start,
				length,
				text,
			}));

		it("#70 含空格的选区整段成为链接", () => {
			assert.deepStrictEqual(ranges("error in My Docs/a.txt:3", "My Docs/a.txt:3"), [
				{ start: 9, length: 15, text: "My Docs/a.txt:3" },
			]);
		});

		it("#71 选区首尾空白被去掉", () => {
			assert.deepStrictEqual(ranges("  src/foo.ts  ", "  src/foo.ts \n"), [
				{ start: 2, length: 10, text: "src/foo.ts" },
			]);
		});

		it("#72 词中间的同名文本不算命中", () => {
			assert.deepStrictEqual(ranges("cat concat", "cat"), [
				{ start: 0, length: 3, text: "cat" },
			]);
		});

		it("#73 同一行多处出现都返回", () => {
			assert.deepStrictEqual(
				ranges("a/b a/b", "a/b").map(r => r.start),
				[0, 4]
			);
		});

		it("#74 空选区与纯空白选区", () => {
			assert.deepStrictEqual(ranges("x", ""), []);
			assert.deepStrictEqual(ranges("x", "   "), []);
		});

		it("#75 多行选区每段各自成为链接", () => {
			assert.deepStrictEqual(
				ranges("foo.ts bar.ts", "foo.ts\nbar.ts").map(r => r.text),
				["foo.ts", "bar.ts"]
			);
		});

		it("#76 选区不在本行", () => {
			assert.deepStrictEqual(ranges("zzz", "foo.ts\nbar.ts"), []);
		});

		it("#77 首字符不是词字符时不检查前边界", () => {
			assert.deepStrictEqual(ranges("/tmp/x(1).log", "(1).log"), [
				{ start: 6, length: 7, text: "(1).log" },
			]);
		});

		it("#78 选区过长", () => {
			assert.deepStrictEqual(ranges("abc", "a".repeat(4097)), []);
		});

		it("#79 片段超过 20 个", () => {
			const selection = Array.from({ length: 21 }, (_, i) => `s${i}`).join("\n");
			assert.deepStrictEqual(ranges("s0 s1", selection), []);
		});

		it("#80 单行最多 20 条", () => {
			assert.strictEqual(ranges(Array(30).fill("ab").join(" "), "ab").length, 20);
		});

		it("#81 选区从单词中间开始时不出链接", () => {
			assert.deepStrictEqual(ranges("copyPath/core.ts", "opyPath/core.ts"), []);
		});
	});

	describe("decideOpen", () => {
		it("B-1 没有候选时进入 InputBox", () => {
			assert.deepStrictEqual(decideOpen([]), { type: "prompt", item: undefined });
		});

		it("B-2 唯一候选可打开", () => {
			const items = [k("file")];
			assert.deepStrictEqual(decideOpen(items), { type: "open", item: items[0] });
		});

		it("B-3 只有一个可打开, 其余不存在", () => {
			const items = [k("missing"), k("directory"), k("missing")];
			assert.deepStrictEqual(decideOpen(items), { type: "open", item: items[1] });
		});

		it("B-4 两个以上可打开时弹 Quick Pick, 可打开的排前", () => {
			const decision = decideOpen([k("missing"), k("file"), k("directory")]);
			assert.strictEqual(decision.type, "pick");
			assert.deepStrictEqual(
				decision.type === "pick" ? decision.items.map(item => item.kind) : [],
				["file", "directory", "missing"]
			);
		});

		it("B-5 没有可打开但有无法访问", () => {
			const items = [k("missing"), k("unknown")];
			assert.deepStrictEqual(decideOpen(items), { type: "inaccessible", item: items[1] });
		});

		it("B-6 全部不存在时预填第一个", () => {
			const items = [k("missing", 0), k("missing", 1)];
			assert.deepStrictEqual(decideOpen(items), { type: "prompt", item: items[0] });
		});

		it("B-7 可打开的优先于无法访问", () => {
			const items = [k("unknown"), k("file")];
			assert.deepStrictEqual(decideOpen(items), { type: "open", item: items[1] });
		});
	});

	describe("其余决策纯函数", () => {
		it("B-8 sortForPick 分组且组内保序", () => {
			const items = [
				k("missing", 0),
				k("unknown", 1),
				k("file", 2),
				k("missing", 3),
				k("directory", 4),
			];
			assert.deepStrictEqual(
				sortForPick(items).map(item => item.tag),
				[2, 4, 1, 0, 3]
			);
		});

		it("B-9 formatPosSuffix", () => {
			assert.strictEqual(formatPosSuffix(12, 3), ":12:3");
			assert.strictEqual(formatPosSuffix(12), ":12");
			assert.strictEqual(formatPosSuffix(), "");
			assert.strictEqual(formatPosSuffix(undefined, 3), "");
		});

		it("B-10 prefillText 有候选时取原始行", () => {
			assert.strictEqual(prefillText({ sourceText: '"a b.ts":3' }, "x"), '"a b.ts":3');
		});

		it("B-11 prefillText 没有候选时取选区首行", () => {
			assert.strictEqual(
				prefillText(undefined, "  https://e.com/a \nnext"),
				"https://e.com/a"
			);
		});

		it("B-12 prefillText 空白选区", () => {
			assert.strictEqual(prefillText(undefined, "   "), "");
		});

		it("B-13 isOpenable", () => {
			assert.deepStrictEqual(
				(["file", "directory", "missing", "unknown"] as const).map(isOpenable),
				[true, true, false, false]
			);
		});

		it("B-14 工作区内的目录在资源管理器中定位", () => {
			assert.strictEqual(decideDirectoryAction(true, "ssh-remote"), "explorer");
		});

		it("B-15 本地工作区外的目录交给系统文件管理器", () => {
			assert.strictEqual(decideDirectoryAction(false, undefined), "os");
		});

		it("B-16 WSL 工作区外的目录交给系统文件管理器", () => {
			assert.strictEqual(decideDirectoryAction(false, "wsl"), "os");
		});

		it("B-17 其他远程下工作区外的目录弹提示", () => {
			assert.strictEqual(decideDirectoryAction(false, "ssh-remote"), "prompt");
			assert.strictEqual(decideDirectoryAction(false, "dev-container"), "prompt");
		});

		it("dedupeCandidates 按目标去重, 行号不同不合并", () => {
			const items = [
				candidate("/proj/a.ts", "./a.ts"),
				candidate("/proj/a.ts", "a.ts"),
				candidate("/proj/a.ts", "a.ts:9", 9),
				candidate(undefined, "x.ts"),
				candidate(undefined, "x.ts"),
			];
			assert.deepStrictEqual(
				dedupeCandidates(items).map(item => item.sourceText),
				["./a.ts", "a.ts:9", "x.ts"]
			);
		});
	});

	describe("raceTimeout", () => {
		it("B-18 先完成时返回值", async () => {
			assert.deepStrictEqual(await raceTimeout(Promise.resolve(1), 50), {
				timedOut: false,
				value: 1,
			});
		});

		it("B-19 超时", async () => {
			assert.deepStrictEqual(await raceTimeout(new Promise<never>(() => {}), 10), {
				timedOut: true,
			});
		});

		it("B-20 原 Promise 失败时透传错误", async () => {
			await assert.rejects(raceTimeout(Promise.reject(new Error("x")), 50), { message: "x" });
		});
	});
});
