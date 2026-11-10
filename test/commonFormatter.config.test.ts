// 验证格式化配置边界, 平台覆盖和环境变量大小写.
import { describe, expect, it } from "vitest";
import {
	loadFormatterRules,
	mergeEnvironment,
	selectFormatter,
} from "../src/features/commonFormatter/config";
import { COMMON_FORMATTER_ITEM_DEFAULTS } from "../src/shared/config-defaults.generated";

const base = { name: "CLI", languages: ["typescript"], command: "formatter" };

describe("通用格式化配置", () => {
	it("应用默认值并选择第一条启用的语言匹配项", () => {
		const rules = loadFormatterRules(
			[{ ...base, name: "关闭", enabled: false }, base, { ...base, name: "后备" }],
			"darwin"
		);
		expect(selectFormatter(rules, "typescript")).toEqual({
			...base,
			enabled: COMMON_FORMATTER_ITEM_DEFAULTS.enabled,
			args: COMMON_FORMATTER_ITEM_DEFAULTS.args,
			cwd: COMMON_FORMATTER_ITEM_DEFAULTS.cwd,
			env: COMMON_FORMATTER_ITEM_DEFAULTS.env,
			timeout: COMMON_FORMATTER_ITEM_DEFAULTS.timeout,
		});
		expect(selectFormatter(rules, "javascript")).toBeUndefined();
		expect(loadFormatterRules([], "linux")).toEqual([]);
	});
	it("平台覆盖替换参数数组, 按键合并环境并保留 null", () => {
		const [rule] = loadFormatterRules(
			[
				{
					...base,
					args: ["base"],
					env: { KEEP: "yes", DROP: "value" },
					windows: {
						command: "formatter.cmd",
						args: ["windows"],
						env: { DROP: null, NEW: "new" },
						timeout: 200,
					},
				},
			],
			"win32"
		);
		expect(rule.command).toBe("formatter.cmd");
		expect(rule.args).toEqual(["windows"]);
		expect(rule.env).toEqual({ KEEP: "yes", DROP: null, NEW: "new" });
		expect(rule.timeout).toBe(200);
	});
	it.each([
		null,
		{},
		[null],
		[{ ...base, name: " " }],
		[base, base],
		[{ ...base, languages: [] }],
		[{ ...base, languages: [3] }],
		[{ ...base, command: "" }],
		[{ ...base, args: "--write" }],
		[{ ...base, args: [null] }],
		[{ ...base, args: ["a\0b"] }],
		[{ ...base, env: [] }],
		[{ ...base, env: { A: 2 } }],
		[{ ...base, env: { "A=B": "c" } }],
		[{ ...base, timeout: 0 }],
		[{ ...base, timeout: 2.5 }],
		[{ ...base, timeout: 2 ** 31 }],
		[{ ...base, enabled: "true" }],
		[{ ...base, unknown: true }],
		[{ ...base, linux: { languages: ["go"] } }],
		[{ ...base, linux: { command: "" } }],
	])("拒绝无效配置 %#", raw => {
		expect(() => loadFormatterRules(raw, "darwin")).toThrow(/commonFormatter.list/);
	});
	it("Windows 环境变量按大小写不敏感覆盖和删除", () => {
		expect(
			mergeEnvironment({ Path: "base", KEEP: "yes" }, { PATH: "new", keep: null }, "win32")
		).toEqual({ PATH: "new" });
		expect(mergeEnvironment({ A: "base" }, { a: "new" }, "linux")).toEqual({
			A: "base",
			a: "new",
		});
	});
});
