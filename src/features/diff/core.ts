/**
 * Compare (Diff) 的纯逻辑内核.
 *
 * 与 shared/advanced.ts 同理, 本文件不 import vscode, 也不 import 任何 node 模块,
 * 以便直接单测, 并保证 build.mjs 声明 browser 入口时的打包路径始终可用.
 */

/** diff 的两侧. 上游用 reg1/reg2/clipboard/visible1/visible2 五个键, 实际只服务于"一对". */
export type DiffSlot = "left" | "right";

export type ReplaceWith = string | { letterCase: "upper" | "lower" };

/** 用户配置的比较前归一化规则, 加载后附带运行时的启停状态. */
export interface NormalizationRule {
	name?: string;
	match: string;
	replaceWith: ReplaceWith;
	active: boolean;
}

/** 行号从 0 起, 与 vscode.Position.line 一致; 渲染成标签时才 +1. */
export interface LineRange {
	start: number;
	end: number;
}

/** 参与比较的一侧. rangeLabel 为 `full` 表示取了整个文档而非某段选区. */
export interface SelectionInfo {
	text: string;
	baseName: string;
	rangeLabel: string;
	languageId?: string;
	/** 来源文档的 URI scheme. 剪贴板没有来源文档, 因此这一侧不填. */
	sourceScheme?: string;
	/** 来源文档 URI 的字符串形式, 供「打开来源文件」回跳; 剪贴板一侧不填. */
	sourceUri?: string;
	/** 第一段选区的行范围, 回跳时用来定位; 取了整个文档时不填. */
	sourceRange?: LineRange;
}

/** 单个非空选区的位置与内容, 由调用方从 vscode.Selection 摘出后传入. */
export interface SelectionPart {
	startLine: number;
	startChar: number;
	endLine: number;
	text: string;
}

export interface DiffPathParts {
	sessionId: string;
	slot: DiffSlot;
	rangeLabel: string;
	baseName: string;
}

/** rangeLabel 的这个取值表示"整个文档", 标题中会省略括号部分. */
export const FULL_RANGE_LABEL = "full";

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readReplaceWith(value: unknown): ReplaceWith | undefined {
	if (typeof value === "string") {
		return value;
	}
	if (isPlainObject(value) && (value.letterCase === "upper" || value.letterCase === "lower")) {
		return { letterCase: value.letterCase };
	}
	return undefined;
}

/**
 * 把用户配置读成规则列表. 非法条目一律丢弃而不是抛异常, 与 resolveAdvanced 的取向一致:
 * 一条写错的规则不应该让整个比较功能不可用.
 */
export function loadRules(raw: unknown): NormalizationRule[] {
	if (!Array.isArray(raw)) {
		return [];
	}

	const rules: NormalizationRule[] = [];
	let malformed = 0;
	let badPattern = 0;

	for (const entry of raw) {
		if (!isPlainObject(entry) || typeof entry.match !== "string") {
			malformed += 1;
			continue;
		}
		const replaceWith = readReplaceWith(entry.replaceWith);
		if (replaceWith === undefined) {
			malformed += 1;
			continue;
		}
		try {
			new RegExp(entry.match, "g");
		} catch {
			badPattern += 1;
			continue;
		}
		rules.push({
			...(typeof entry.name === "string" ? { name: entry.name } : {}),
			match: entry.match,
			replaceWith,
			active: entry.enableOnStart !== false,
		});
	}

	// 每类问题只报一次, 避免配置写错时刷屏.
	if (malformed > 0) {
		console.log(
			`[Text Toolkit] compare: skipped ${malformed} normalization rule(s) missing a valid "match" or "replaceWith".`
		);
	}
	if (badPattern > 0) {
		console.log(
			`[Text Toolkit] compare: skipped ${badPattern} normalization rule(s) whose "match" is not a valid regular expression.`
		);
	}

	return rules;
}

function applyRule(text: string, rule: NormalizationRule): string {
	const pattern = new RegExp(rule.match, "g");
	if (typeof rule.replaceWith === "string") {
		// 字符串替换保留 $N 的捕获组语义.
		return text.replace(pattern, rule.replaceWith);
	}
	const { letterCase } = rule.replaceWith;
	return text.replace(pattern, matched =>
		letterCase === "upper" ? matched.toUpperCase() : matched.toLowerCase()
	);
}

/** 按数组顺序依次应用; 只作用于 diff 中显示的文本, 不改动任何源文档. */
export function applyRules(text: string, rules: NormalizationRule[]): string {
	return rules.reduce(applyRule, text);
}

/**
 * 把多光标的若干非空选区按文档位置排序后拼成一段.
 * 返回 null 表示没有非空选区, 由调用方决定改取整个文档 —— 纯函数读不到文档内容.
 */
export function aggregateSelections(
	parts: SelectionPart[]
): { text: string; ranges: LineRange[] } | null {
	if (parts.length === 0) {
		return null;
	}
	const sorted = [...parts].sort((a, b) =>
		a.startLine !== b.startLine ? a.startLine - b.startLine : a.startChar - b.startChar
	);
	return {
		text: sorted.map(part => part.text).join("\n"),
		ranges: sorted.map(part => ({ start: part.startLine, end: part.endLine })),
	};
}

function rangeLabelOf(range: LineRange): string {
	return range.start === range.end
		? `l.${range.start + 1}`
		: `ll.${range.start + 1}-${range.end + 1}`;
}

/** 空范围渲染为 `full`; 其余形如 `l.4` 或 `ll.4-8`, 多片段以逗号连接. */
export function formatRangeLabel(ranges: LineRange[] | null): string {
	if (!ranges || ranges.length === 0) {
		return FULL_RANGE_LABEL;
	}
	return ranges.map(rangeLabelOf).join(",");
}

function sideTitle(info: SelectionInfo | null): string {
	if (!info) {
		return "N/A";
	}
	return info.rangeLabel === FULL_RANGE_LABEL
		? info.baseName
		: `${info.baseName} (${info.rangeLabel})`;
}

/**
 * diff 标签页标题. 中缀沿用上游语义: `~` 表示内容经过归一化, `↔` 表示原样比较.
 * 该符号是打开那一刻的快照, 之后切换规则不会更新 —— 常驻的状态栏计数才是准确指示.
 *
 * `editable` 的 `✎` 前缀与中缀正交: 前者说明这是一份可编辑副本, 后者说明打开时是否套了规则.
 */
export function buildDiffTitle(
	left: SelectionInfo | null,
	right: SelectionInfo | null,
	normalized: boolean,
	editable = false
): string {
	const title = `${sideTitle(left)} ${normalized ? "~" : "↔"} ${sideTitle(right)}`;
	return editable ? `✎ ${title}` : title;
}

/** 该侧是「整个文件」且其来源文件系统可写, 即用户本来就能直接编辑它. */
function editableInPlace(info: SelectionInfo, isWritable: (scheme: string) => boolean): boolean {
	return (
		info.rangeLabel === FULL_RANGE_LABEL &&
		info.sourceScheme !== undefined &&
		isWritable(info.sourceScheme)
	);
}

/**
 * 两侧是否都已经能被原生编辑. 为真时做可编辑副本没有意义: VS Code 自带的
 * Select for Compare / Compare with Selected 就能给出可编辑且带 Git 集成的 diff.
 *
 * 只要有一侧是选区片段, 或来自剪贴板(没有 sourceScheme), 或来自只读的虚拟文档
 * (例如 `git:` / `output:`), 原生就给不出等价的可编辑比较, 因此仍然允许做副本.
 */
export function bothSidesEditableInPlace(
	left: SelectionInfo,
	right: SelectionInfo,
	isWritable: (scheme: string) => boolean
): boolean {
	return editableInPlace(left, isWritable) && editableInPlace(right, isWritable);
}

/**
 * 虚拟文档的 URI 路径: `/<sessionId>/<slot>/<rangeLabel>/<原文件 basename>`.
 *
 * basename 留在最后一段有两个作用: 让标签页与外部扩展能读到来源文件名(上游 issue #66),
 * 并让 VS Code 在语言未被显式设置时仍能按扩展名做出合理判定.
 */
export function encodeDiffPath(parts: DiffPathParts): string {
	return `/${[parts.sessionId, parts.slot, parts.rangeLabel, parts.baseName].map(encodeURIComponent).join("/")}`;
}

export function decodeDiffPath(path: string): DiffPathParts | null {
	const segments = path.split("/");
	if (segments[0] === "") {
		segments.shift();
	}
	if (segments.length !== 4) {
		return null;
	}
	let decoded: string[];
	try {
		decoded = segments.map(decodeURIComponent);
	} catch {
		return null;
	}
	const [sessionId, slot, rangeLabel, baseName] = decoded;
	if (slot !== "left" && slot !== "right") {
		return null;
	}
	return { sessionId, slot, rangeLabel, baseName };
}

/** 以最后一个 `.` 切出主干与扩展名; 点开头的名字(`.gitignore`)整体算主干. */
function splitName(baseName: string): { stem: string; extension: string } {
	const dot = baseName.lastIndexOf(".");
	return dot <= 0
		? { stem: baseName, extension: "" }
		: { stem: baseName.slice(0, dot), extension: baseName.slice(dot) };
}

/** 多光标会产生任意多段的标签; 超过两段就只留第一段并记下剩余段数, 免得文件名无界增长. */
function compactLabel(rangeLabel: string): string {
	const parts = rangeLabel.split(",");
	return parts.length <= 2 ? rangeLabel : `${parts[0]},+${parts.length - 1}`;
}

/**
 * 可编辑副本的文件名. 副本是扩展存储目录下的真实文件, 因此这个名字就是用户在标签页,
 * 面包屑和另存对话框里看到的东西, 要一眼看出"哪个文件的哪几行".
 *
 * `fallbackExtension` 让没有扩展名的一侧(典型是剪贴板)借用另一侧的扩展名: 语法高亮因此
 * 由 VS Code 按扩展名自动判定, 不需要再调 `setTextDocumentLanguage` —— 那个 API 会让
 * VS Code 关闭并重开文档, 是副本机制里最容易出错的一环.
 */
export function copyFileName(
	baseName: string,
	rangeLabel: string,
	fallbackExtension: string
): string {
	const { stem, extension } = splitName(baseName);
	// 点开头的名字(`.gitignore`)本身就决定了语言, 借来的扩展名只会破坏判定.
	const suffix = extension || (baseName.startsWith(".") ? "" : fallbackExtension);
	return rangeLabel === FULL_RANGE_LABEL
		? `${stem}${suffix}`
		: `${stem} (${compactLabel(rangeLabel)})${suffix}`;
}

/** 从文件名取扩展名, 供另一侧继承; 没有扩展名时返回空串. */
export function extensionOf(baseName: string): string {
	return splitName(baseName).extension;
}

/**
 * 两侧各用各的来源语言; 只有一侧有来源时(典型情况是剪贴板对选区)另一侧继承它,
 * 这样"与剪贴板比较"也能拿到语法高亮 —— 上游 issue #38 的核心诉求.
 */
export function resolveLanguages(
	leftLanguageId?: string,
	rightLanguageId?: string
): { left?: string; right?: string } {
	const fallback = leftLanguageId ?? rightLanguageId;
	if (fallback === undefined) {
		return {};
	}
	return { left: leftLanguageId ?? fallback, right: rightLanguageId ?? fallback };
}
