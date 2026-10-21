/**
 * 按文件名推断 VS Code 会给该文件选用的语言.
 *
 * 为什么需要它: 以纯文本模式打开文件时, 我们先用一条临时的 `files.associations`
 * 把文件关联成 plaintext, 文本模型因此从一开始就是 plaintext, 语言扩展(TypeScript 等)
 * 不会被激活; 但临时关联撤销前必须把语言"钉死", 于是文档原本该用的语言就丢了.
 * 退出纯文本模式时要还原语言, 只能在打开前先按同一套规则推断出来.
 *
 * 规则对齐 VS Code 的 mime 查表(`vs/editor/common/services/languagesAssociations.ts`):
 * 用户 `files.associations` 优先于扩展贡献; 同一层内 精确文件名 > 文件名模式(最长优先) >
 * 扩展名(最长优先); 全部按小写比较. 未命中时返回 undefined, 调用方保留 plaintext.
 *
 * 不 import vscode, 以便直接单测.
 */

export interface LanguageContribution {
	id: string;
	extensions?: readonly string[];
	filenames?: readonly string[];
	filenamePatterns?: readonly string[];
}

function normalizePath(fsPath: string): string {
	return fsPath.replace(/\\/g, "/").toLowerCase();
}

function basenameOf(path: string): string {
	return path.slice(path.lastIndexOf("/") + 1);
}

/** 只实现 `*`, `?` 与 `**` 三种通配: files.associations 与 filenamePatterns 的常见形态. */
function globToRegExp(pattern: string): RegExp {
	let source = "";
	for (let index = 0; index < pattern.length; index += 1) {
		const char = pattern[index];
		if (char === "*") {
			if (pattern[index + 1] === "*") {
				// `**/` 吃掉任意层目录, 末尾的 `**` 吃掉剩余全部
				index += 1;
				if (pattern[index + 1] === "/") {
					index += 1;
					source += "(?:.*/)?";
				} else {
					source += ".*";
				}
			} else {
				source += "[^/]*";
			}
		} else if (char === "?") {
			source += "[^/]";
		} else {
			source += char.replace(/[.+^${}()|[\]\\]/g, "\\$&");
		}
	}
	return new RegExp(`^${source}$`);
}

function matchGlob(pattern: string, path: string, base: string): boolean {
	// 与 VS Code 一致: 模式里带路径分隔符才拿整个路径去比, 否则只比文件名.
	const target = pattern.includes("/") ? path : base;
	try {
		return globToRegExp(pattern.toLowerCase()).test(target);
	} catch {
		return false;
	}
}

/** 同类模式命中多条时取最长的那条, 与 VS Code 的取舍一致. */
function pickLongestMatch(
	entries: Iterable<readonly [string, string]>,
	path: string,
	base: string
): string | undefined {
	let bestPattern: string | undefined;
	let bestId: string | undefined;
	for (const [pattern, id] of entries) {
		if (pattern.length > (bestPattern?.length ?? -1) && matchGlob(pattern, path, base)) {
			bestPattern = pattern;
			bestId = id;
		}
	}
	return bestId;
}

function pickLongestExtension(
	contributions: readonly LanguageContribution[],
	base: string
): string | undefined {
	let bestExtension: string | undefined;
	let bestId: string | undefined;
	for (const contribution of contributions) {
		for (const extension of contribution.extensions ?? []) {
			const normalized = extension.toLowerCase();
			if (
				normalized.length > (bestExtension?.length ?? -1) &&
				normalized.length > 0 &&
				base.endsWith(normalized)
			) {
				bestExtension = normalized;
				bestId = contribution.id;
			}
		}
	}
	return bestId;
}

export function guessLanguageId(
	fsPath: string,
	contributions: readonly LanguageContribution[],
	associations: Readonly<Record<string, string>> = {}
): string | undefined {
	const path = normalizePath(fsPath);
	const base = basenameOf(path);
	if (base.length === 0) {
		return undefined;
	}

	const userMatch = pickLongestMatch(
		Object.entries(associations).filter(
			(entry): entry is [string, string] => typeof entry[1] === "string"
		),
		path,
		base
	);
	if (userMatch) {
		return userMatch;
	}

	for (const contribution of contributions) {
		for (const filename of contribution.filenames ?? []) {
			if (filename.toLowerCase() === base) {
				return contribution.id;
			}
		}
	}

	const patternEntries: [string, string][] = [];
	for (const contribution of contributions) {
		for (const pattern of contribution.filenamePatterns ?? []) {
			patternEntries.push([pattern, contribution.id]);
		}
	}
	const patternMatch = pickLongestMatch(patternEntries, path, base);
	if (patternMatch) {
		return patternMatch;
	}

	return pickLongestExtension(contributions, base);
}
