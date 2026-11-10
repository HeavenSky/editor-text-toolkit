/**
 * 从 package.json 的 contributes.configuration 生成运行时默认值模块。
 *
 * package.json 是配置默认值的唯一事实来源; 运行时与测试需要不依赖 vscode 的默认值,
 * 因此由 gen-config-defaults.mjs 生成 src/shared/config-defaults.generated.ts 并提交入库。
 * 生成物不是独立事实来源, 漂移由 npm run check 的「配置默认值与生成文件一致」检查卡住。
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const readJson = path => JSON.parse(readFileSync(path, "utf8"));

/**
 * 以 JSON 风格(tab 缩进, 双引号)渲染一个值; 生成文件在 .oxfmtrc.json 的 ignorePatterns 里,
 * 不参与格式化, 因此只需稳定, 不需贴合 oxfmt 的折行风格。
 */
function renderValue(value, indent) {
	if (Array.isArray(value)) {
		if (value.length === 0) return "[]";
		const items = value.map(item => `${indent}\t${renderValue(item, `${indent}\t`)}`);
		return `[\n${items.join(",\n")},\n${indent}]`;
	}
	if (value !== null && typeof value === "object") {
		const entries = Object.entries(value);
		if (entries.length === 0) return "{}";
		const items = entries.map(
			([key, item]) =>
				`${indent}\t${JSON.stringify(key)}: ${renderValue(item, `${indent}\t`)}`
		);
		return `{\n${items.join(",\n")},\n${indent}}`;
	}
	return JSON.stringify(value);
}

export function renderDefaultsModule(pkg) {
	const configurations = pkg.contributes?.configuration ?? [];
	const entries = Array.isArray(configurations) ? configurations : [configurations];
	const lines = [];
	for (const configuration of entries) {
		for (const [key, prop] of Object.entries(configuration.properties ?? {})) {
			if (!("default" in prop)) continue;
			lines.push(`\t${JSON.stringify(key)}: ${renderValue(prop.default, "\t")}`);
		}
	}

	const itemProps =
		entries
			.flatMap(configuration =>
				Object.entries(configuration.properties ?? {}).filter(
					([key]) => key === "commonFormatter.list"
				)
			)
			.map(([, prop]) => prop?.items?.properties ?? {})[0] ?? {};
	const itemLines = Object.entries(itemProps)
		.filter(([, prop]) => "default" in prop)
		.map(([key, prop]) => `\t${JSON.stringify(key)}: ${renderValue(prop.default, "\t")}`);

	return [
		"// 由 scripts/gen-config-defaults.mjs 从 package.json 生成, 提交入库; 不要手改.",
		"// 修改 package.json 的配置后运行 npm run gen:config 再 npm run check.",
		"",
		"/** contributes.configuration 各顶层配置键的 schema default, 与 package.json 逐字相等. */",
		"export const CONFIG_DEFAULTS: Readonly<Record<string, unknown>> = {",
		lines.join(",\n"),
		"};",
		"",
		"/** commonFormatter.list 数组元素各字段的 schema default. */",
		"export const COMMON_FORMATTER_ITEM_DEFAULTS: Readonly<Record<string, unknown>> = {",
		itemLines.join(",\n"),
		"};",
		"",
	].join("\n");
}

/** 生成文件与 package.json 的默认值不一致时返回问题描述数组。 */
export function checkGenerated(root) {
	const pkg = readJson(join(root, "package.json"));
	const expected = renderDefaultsModule(pkg);
	const target = join(root, "src/shared/config-defaults.generated.ts");
	const actual = readFileSync(target, "utf8");
	if (actual === expected) return [];
	return [`${target} 与 package.json 的默认值不一致, 运行 npm run gen:config`];
}
