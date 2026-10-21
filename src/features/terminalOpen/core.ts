// 终端选区转路径的纯逻辑: 拆行, 归一, 行列解析, 变体生成, 路径拼接, 打开决策与剪贴板探测判定.
import * as path from "path";

export type PathFlavor = "posix" | "win32";

/** 1 基行列; path 已做 ~ 展开与 file:// 解码, 可能是相对路径. */
export interface PathTarget {
	readonly path: string;
	/** 展开 ~ 之前的路径文本. */
	readonly raw: string;
	readonly line?: number;
	readonly column?: number;
}

/** 选区中按硬换行切出的一行; variants 按优先级排序, 打开时取第一个存在的. */
export interface Candidate {
	readonly index: number;
	readonly sourceText: string;
	readonly variants: readonly PathTarget[];
}

export interface ParsedSelection {
	readonly candidates: readonly Candidate[];
	readonly truncated: boolean;
}

export interface ParseOptions {
	readonly flavor: PathFlavor;
	readonly homeDir: string;
}

export interface LinkRange {
	readonly start: number;
	readonly length: number;
	readonly text: string;
}

export const MAX_CANDIDATES = 20;
export const MAX_SELECTION_LENGTH = 4096;
export const MAX_LINKS_PER_LINE = 20;
export const STAT_TIMEOUT_MS = 1500;
export const COPY_SELECTION_TIMEOUT_MS = 2000;

interface Location {
	readonly path: string;
	readonly line?: number;
	readonly column?: number;
}

/** 省略值为 undefined 的行列键, 让结果能直接做结构比较. */
function location(p: string, line?: number, column?: number): Location {
	if (line === undefined) {
		return { path: p };
	}
	return column === undefined ? { path: p, line } : { path: p, line, column };
}

export function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

export function trimPathText(text: string): string {
	return text.replace(/^[\s\u200B\uFEFF]+|[\s\u200B\uFEFF]+$/g, "");
}

export function splitSelectionLines(text: string): string[] {
	const seen = new Set<string>();
	const lines: string[] = [];
	for (const raw of text.split(/\r?\n/)) {
		const line = trimPathText(raw);
		if (line !== "" && !seen.has(line)) {
			seen.add(line);
			lines.push(line);
		}
	}
	return lines;
}

const WRAPPER_PAIRS: Readonly<Record<string, string>> = {
	'"': '"',
	"'": "'",
	"`": "`",
	"(": ")",
	"[": "]",
	"{": "}",
	"<": ">",
	"“": "”",
	"‘": "’",
	"「": "」",
	"『": "』",
};

const LONE_OPENERS: Readonly<Record<string, string>> = {
	"(": ")",
	"[": "]",
	"{": "}",
	"<": ">",
	'"': '"',
	"'": "'",
	"`": "`",
};

const LONE_CLOSERS: Readonly<Record<string, string>> = {
	")": "(",
	"]": "[",
	"}": "{",
	">": "<",
	'"': '"',
	"'": "'",
	"`": "`",
};

function countChar(text: string, char: string): number {
	return text.split(char).length - 1;
}

/** 首字符的配对闭合符恰好是末字符, 例如 `(a)(b)` 的首个 `(` 闭合在中间, 不算整体包裹. */
function wrapsWhole(text: string, open: string, close: string): boolean {
	if (open === close) {
		return !text.slice(1, -1).includes(open);
	}
	let depth = 0;
	for (let i = 0; i < text.length; i += 1) {
		if (text[i] === open) {
			depth += 1;
		} else if (text[i] === close) {
			depth -= 1;
			if (depth === 0) {
				return i === text.length - 1;
			}
		}
	}
	return false;
}

function stripWrappersOnce(text: string): string {
	if (text.length >= 2) {
		const close = WRAPPER_PAIRS[text[0]];
		if (close !== undefined && text.endsWith(close) && wrapsWhole(text, text[0], close)) {
			const inner = text.slice(1, -1);
			if (inner !== "") {
				return inner;
			}
		}
	}
	const firstClose = LONE_OPENERS[text[0]];
	if (firstClose !== undefined && text.length > 1) {
		const open = text[0];
		const unbalanced =
			open === firstClose
				? countChar(text, open) % 2 === 1
				: countChar(text, open) > countChar(text, firstClose);
		if (unbalanced) {
			return text.slice(1);
		}
	}
	const last = text[text.length - 1];
	const lastOpen = LONE_CLOSERS[last];
	if (lastOpen !== undefined && text.length > 1) {
		const unbalanced =
			lastOpen === last
				? countChar(text, last) % 2 === 1
				: countChar(text, last) > countChar(text, lastOpen);
		if (unbalanced) {
			return text.slice(0, -1);
		}
	}
	return text;
}

export function stripWrappers(text: string): string {
	let current = text;
	for (;;) {
		const next = stripWrappersOnce(current);
		if (next === current) {
			return current;
		}
		current = next;
	}
}

const TRAILING_PUNCTUATION = new Set([
	".",
	",",
	";",
	":",
	"!",
	"?",
	"。",
	"，",
	"；",
	"：",
	"！",
	"？",
	"、",
]);

function keepsTrailingChar(text: string, flavor: PathFlavor): boolean {
	const last = text[text.length - 1];
	if (last === ".") {
		return text.length === 1 || /^\.+$/.test(text) || /[\\/]\.{1,2}$/.test(text);
	}
	if (last === ":") {
		return flavor === "win32" && /^[A-Za-z]:$/.test(text);
	}
	return text.length === 1;
}

export function stripTrailingPunctuation(text: string, flavor: PathFlavor): string {
	let current = text;
	while (current !== "" && TRAILING_PUNCTUATION.has(current[current.length - 1])) {
		if (keepsTrailingChar(current, flavor)) {
			break;
		}
		current = current.slice(0, -1);
	}
	return current;
}

export function normalizeCandidateText(text: string, flavor: PathFlavor): string {
	let current = text;
	for (let round = 0; round < 5; round += 1) {
		const next = stripTrailingPunctuation(stripWrappers(current), flavor);
		if (next === current) {
			break;
		}
		current = next;
	}
	return current;
}

const LOCATION_SUFFIXES: readonly RegExp[] = [
	/#L(\d{1,9})(?:C(\d{1,9}))?(?:-L?\d{1,9}(?:C\d{1,9})?)?$/,
	/\((\d{1,9})(?:\s*,\s*(\d{1,9}))?\)$/,
	/:(\d{1,9})(?::(\d{1,9}))?(?:-\d{1,9}(?::\d{1,9})?)?$/,
];

/** 行号 0 视为没有行号(连同列一并丢弃), 列 0 视为没有列. */
function positionFrom(lineText: string | undefined, columnText: string | undefined) {
	const line = lineText === undefined ? 0 : Number(lineText);
	const column = columnText === undefined ? 0 : Number(columnText);
	if (line === 0) {
		return { line: undefined, column: undefined };
	}
	return { line, column: column === 0 ? undefined : column };
}

export function parseLocationSuffix(text: string): Location | undefined {
	for (const pattern of LOCATION_SUFFIXES) {
		const match = pattern.exec(text);
		if (!match) {
			continue;
		}
		const p = text.slice(0, match.index);
		// 只剩盘符字母时冒号属于盘符, 不是行号分隔符; 以分隔符结尾的是目录加孤立数字.
		if (p === "" || /^[A-Za-z]$/.test(p) || /[\\/]$/.test(p)) {
			continue;
		}
		const { line, column } = positionFrom(match[1], match[2]);
		return location(p, line, column);
	}
	return undefined;
}

export function parsePythonTraceback(text: string): Location | undefined {
	const match = /^File "(.+?)", line (\d{1,9})/.exec(text);
	if (!match) {
		return undefined;
	}
	return location(match[1], positionFrom(match[2], undefined).line);
}

export function fileUriToPath(uriText: string, flavor: PathFlavor): Location | undefined {
	if (!/^file:\/\//i.test(uriText)) {
		return undefined;
	}
	const rest = uriText.slice("file://".length);
	const hashIndex = rest.indexOf("#");
	const body = hashIndex === -1 ? rest : rest.slice(0, hashIndex);
	const fragment = hashIndex === -1 ? "" : rest.slice(hashIndex + 1);

	let line: number | undefined;
	let column: number | undefined;
	const lineMatch = /^L(\d{1,9})(?:C(\d{1,9}))?/.exec(fragment) ?? /^(\d{1,9})$/.exec(fragment);
	if (lineMatch) {
		({ line, column } = positionFrom(lineMatch[1], lineMatch[2]));
	}

	const slash = body.indexOf("/");
	if (slash === -1) {
		return undefined;
	}
	const authority = body.slice(0, slash);
	let decoded: string;
	try {
		decoded = decodeURIComponent(body.slice(slash));
	} catch {
		return undefined;
	}

	if (authority !== "" && authority.toLowerCase() !== "localhost") {
		if (flavor === "posix") {
			return undefined;
		}
		return location(`\\\\${authority}${decoded.replace(/\//g, "\\")}`, line, column);
	}
	if (flavor === "win32") {
		const withoutRoot = /^\/[A-Za-z]:/.test(decoded) ? decoded.slice(1) : decoded;
		return location(withoutRoot.replace(/\//g, "\\"), line, column);
	}
	return location(decoded, line, column);
}

export function isNonFileUrl(text: string): boolean {
	const match = /^([a-z][a-z0-9+.-]*):\/\//i.exec(text);
	return match !== null && match[1].toLowerCase() !== "file";
}

export function unescapeShell(text: string): string {
	return text.replace(/\\([ '"()[\]{}&;!$`#*?<>|])/g, "$1");
}

export function expandTilde(p: string, homeDir: string, flavor: PathFlavor): string {
	if (p === "~") {
		return homeDir;
	}
	if (p.startsWith("~/") || (flavor === "win32" && p.startsWith("~\\"))) {
		return path[flavor].join(homeDir, p.slice(2));
	}
	return p;
}

export function isAbsolutePath(p: string, flavor: PathFlavor): boolean {
	return path[flavor].isAbsolute(p);
}

export function joinCwd(cwdPath: string, p: string, flavor: PathFlavor): string {
	return path[flavor].join(cwdPath, p);
}

function variantKey(v: Location): string {
	return `${v.path}\0${v.line ?? ""}\0${v.column ?? ""}`;
}

export function buildVariants(line: string, options: ParseOptions): PathTarget[] {
	const { flavor, homeDir } = options;
	const s0 = trimPathText(line);
	if (s0 === "") {
		return [];
	}

	let variants: Location[];
	const traceback = parsePythonTraceback(s0);
	const s1 = stripWrappers(s0);
	if (traceback) {
		variants = [traceback];
	} else if (/^file:\/\//i.test(s1)) {
		const fromUri = fileUriToPath(s1, flavor);
		variants = fromUri ? [fromUri] : [];
	} else if (isNonFileUrl(s1)) {
		return [];
	} else {
		const s2 = normalizeCandidateText(s0, flavor);
		variants = [];
		for (const base of new Set([s2, s1])) {
			const parsed = parseLocationSuffix(base);
			if (parsed) {
				variants.push(parsed);
			}
			variants.push({ path: base });
		}
		if (flavor === "posix") {
			variants = variants.flatMap(v => {
				const unescaped = unescapeShell(v.path);
				return unescaped === v.path ? [v] : [v, { ...v, path: unescaped }];
			});
		}
		// git diff 的 a/ b/ 前缀只追加为最低优先级, 真实存在的 a/ 目录不受影响.
		const withoutGitPrefix = variants
			.filter(v => /^[ab][\\/]/.test(v.path))
			.map(v => ({ ...v, path: v.path.slice(2) }));
		variants.push(...withoutGitPrefix);
	}

	const seen = new Set<string>();
	const result: PathTarget[] = [];
	for (const v of variants) {
		const expanded = expandTilde(v.path, homeDir, flavor);
		if (expanded === "") {
			continue;
		}
		const target: PathTarget = { ...v, raw: v.path, path: expanded };
		const key = variantKey(target);
		if (!seen.has(key)) {
			seen.add(key);
			result.push(target);
		}
	}
	return result;
}

export function parseSelection(text: string, options: ParseOptions): ParsedSelection {
	const lines = splitSelectionLines(text);
	const candidates: Candidate[] = [];
	for (const line of lines.slice(0, MAX_CANDIDATES)) {
		const variants = buildVariants(line, options);
		if (variants.length > 0) {
			candidates.push({ index: candidates.length, sourceText: line, variants });
		}
	}
	return { candidates, truncated: lines.length > MAX_CANDIDATES };
}

export function resolveTargetPath(
	target: Pick<PathTarget, "path">,
	cwdPath: string | undefined,
	flavor: PathFlavor
): string | undefined {
	if (flavor === "win32" && /^[\\/](?![\\/])/.test(target.path)) {
		if (cwdPath === undefined) {
			return undefined;
		}
		const drive = path.win32.parse(cwdPath).root.slice(0, 2);
		return path.win32.normalize(drive + target.path);
	}
	if (isAbsolutePath(target.path, flavor)) {
		return target.path;
	}
	return cwdPath === undefined ? undefined : joinCwd(cwdPath, target.path, flavor);
}

export function targetKey(absPath: string, line?: number, column?: number): string {
	return `${absPath}\0${line ?? ""}\0${column ?? ""}`;
}

export function unicodeAlternatives(p: string): string[] {
	const alternatives = new Set([p.normalize("NFC"), p.normalize("NFD")]);
	alternatives.delete(p);
	return [...alternatives];
}

export function toUriPath(absolutePath: string, flavor: PathFlavor): string {
	return flavor === "win32" ? `/${absolutePath.replace(/\\/g, "/")}` : absolutePath;
}

export function toZeroBasedPosition(
	line?: number,
	column?: number
): { line: number; character: number } | undefined {
	if (line === undefined) {
		return undefined;
	}
	return { line: line - 1, character: (column ?? 1) - 1 };
}

export function parseLsofCwd(stdout: string): string | undefined {
	const line = stdout.split("\n").find(entry => entry.startsWith("n"));
	const cwd = line?.slice(1);
	return cwd === undefined || cwd === "" ? undefined : cwd;
}

const WORD_CHAR_AT_END = /[\p{L}\p{N}_]$/u;
const WORD_CHAR_AT_START = /^[\p{L}\p{N}_]/u;

/** 片段两端是词字符时, 命中处外侧不能紧挨词字符, 否则会把 `opyPath` 链到 `copyPath` 上. */
function onWordBoundary(line: string, start: number, segment: string): boolean {
	const end = start + segment.length;
	if (WORD_CHAR_AT_START.test(segment) && WORD_CHAR_AT_END.test(line.slice(0, start))) {
		return false;
	}
	return !(WORD_CHAR_AT_END.test(segment) && WORD_CHAR_AT_START.test(line.slice(end)));
}

export function findSelectionLinkRanges(line: string, selection: string): LinkRange[] {
	if (selection.length > MAX_SELECTION_LENGTH) {
		return [];
	}
	const segments = splitSelectionLines(selection);
	if (segments.length > MAX_CANDIDATES) {
		return [];
	}
	const hits: LinkRange[] = [];
	for (const segment of segments) {
		let from = 0;
		for (;;) {
			const start = line.indexOf(segment, from);
			if (start === -1) {
				break;
			}
			if (onWordBoundary(line, start, segment)) {
				hits.push({ start, length: segment.length, text: segment });
				from = start + segment.length;
			} else {
				from = start + 1;
			}
		}
	}
	hits.sort((a, b) => a.start - b.start || b.length - a.length);
	const ranges: LinkRange[] = [];
	let end = 0;
	for (const hit of hits) {
		if (hit.start >= end) {
			ranges.push(hit);
			end = hit.start + hit.length;
		}
		if (ranges.length === MAX_LINKS_PER_LINE) {
			break;
		}
	}
	return ranges;
}

export type DirectoryAction = "explorer" | "os" | "prompt";

/** remoteName 取 vscode.env.remoteName. */
export function decideDirectoryAction(
	inWorkspace: boolean,
	remoteName: string | undefined
): DirectoryAction {
	if (inWorkspace) {
		return "explorer";
	}
	return remoteName === undefined || remoteName === "wsl" ? "os" : "prompt";
}

export type TargetKind = "file" | "directory" | "missing" | "unknown";

export interface ResolvedCandidate {
	readonly index: number;
	readonly sourceText: string;
	readonly target: PathTarget;
	/** 相对路径且没有 cwd 时为 undefined, 此时 kind 恒为 missing. */
	readonly absPath: string | undefined;
	readonly kind: TargetKind;
	readonly reason?: string;
}

export function dedupeCandidates(items: readonly ResolvedCandidate[]): ResolvedCandidate[] {
	const seen = new Set<string>();
	return items.filter(item => {
		const key =
			item.absPath === undefined
				? `src:${item.sourceText}`
				: targetKey(item.absPath, item.target.line, item.target.column);
		if (seen.has(key)) {
			return false;
		}
		seen.add(key);
		return true;
	});
}

export function isOpenable(kind: TargetKind): boolean {
	return kind === "file" || kind === "directory";
}

export type OpenDecision<T> =
	| { readonly type: "open"; readonly item: T }
	| { readonly type: "pick"; readonly items: readonly T[] }
	| { readonly type: "inaccessible"; readonly item: T }
	| { readonly type: "prompt"; readonly item: T | undefined };

export function sortForPick<T extends { readonly kind: TargetKind }>(items: readonly T[]): T[] {
	const rank = (kind: TargetKind): number => (isOpenable(kind) ? 0 : kind === "unknown" ? 1 : 2);
	return items
		.map((item, order) => ({ item, order }))
		.sort((a, b) => rank(a.item.kind) - rank(b.item.kind) || a.order - b.order)
		.map(entry => entry.item);
}

export function decideOpen<T extends { readonly kind: TargetKind }>(
	items: readonly T[]
): OpenDecision<T> {
	if (items.length === 0) {
		return { type: "prompt", item: undefined };
	}
	const openable = items.filter(item => isOpenable(item.kind));
	if (openable.length === 1) {
		return { type: "open", item: openable[0] };
	}
	if (openable.length > 1) {
		return { type: "pick", items: sortForPick(items) };
	}
	const unknown = items.find(item => item.kind === "unknown");
	return unknown ? { type: "inaccessible", item: unknown } : { type: "prompt", item: items[0] };
}

export function formatPosSuffix(line?: number, column?: number): string {
	if (line === undefined) {
		return "";
	}
	return column === undefined ? `:${line}` : `:${line}:${column}`;
}

export function prefillText(
	item: { readonly sourceText: string } | undefined,
	rawText: string
): string {
	if (item) {
		return item.sourceText;
	}
	return splitSelectionLines(rawText)[0] ?? rawText.trim();
}

export type Raced<T> = { timedOut: false; value: T } | { timedOut: true };

/** 超时后不取消原 Promise. */
export async function raceTimeout<T>(p: PromiseLike<T>, ms: number): Promise<Raced<T>> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise<Raced<T>>(resolve => {
		timer = setTimeout(() => resolve({ timedOut: true }), ms);
	});
	try {
		return await Promise.race([
			Promise.resolve(p).then((value): Raced<T> => ({ timedOut: false, value })),
			timeout,
		]);
	} finally {
		clearTimeout(timer);
	}
}

/** 后一个任务在前一个结束(无论成败)后才开始. */
export function createSerialQueue(): <T>(task: () => Promise<T>) => Promise<T> {
	let tail: Promise<unknown> = Promise.resolve();
	return <T>(task: () => Promise<T>): Promise<T> => {
		const result = tail.then(task);
		tail = result.then(
			() => undefined,
			() => undefined
		);
		return result;
	};
}

/** U+2063 不可见且不会出现在终端选区里; 不能用 NUL, 部分平台剪贴板会在 NUL 处截断. */
export function makeSentinel(nowMs: number, rand: string): string {
	return `\u2063etk-probe:${nowMs}:${rand}`;
}

/** original 为降级前的剪贴板文本, probe 为写入的哨兵('' 表示未写), after 为复制后读回的文本. */
export function interpretProbe(
	original: string,
	probe: string,
	after: string
): { readonly selection: string | undefined; readonly restore: boolean } {
	return {
		selection: after !== probe && after.trim() !== "" ? after : undefined,
		restore: probe !== original || after !== original,
	};
}
