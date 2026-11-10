import { describe, it } from "vitest";
import * as assert from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import {
	ADVANCED_KEYS,
	advancedDefaults,
	DEFAULT_EDITOR_OVERRIDES,
	mergeEditorOverrides,
	resolveAdvanced,
	type ResolvedKeys,
} from "../src/shared/advanced";
import { CONFIG_DEFAULTS } from "../src/shared/config-defaults.generated";

/** 测试产物在 out/test/ 下, 上溯两级即仓库根. */
const REPO_ROOT = path.resolve(import.meta.dirname, "..");

function readJson(relativePath: string): Record<string, any> {
	return JSON.parse(fs.readFileSync(path.join(REPO_ROOT, relativePath), "utf8"));
}

/** 把显式值构造成 getAdvanced() 传入的 keys 形状; undefined 表示新键未显式设置. */
function keys(values: Partial<Record<keyof ResolvedKeys, unknown>>): ResolvedKeys {
	return values as ResolvedKeys;
}

const legacy = (values: Record<string, unknown>) => values;

describe("advanced (新顶层键 + 旧对象兼容层)", () => {
	describe("advancedDefaults", () => {
		it("默认值来自生成模块的 schema default", () => {
			const defaults = advancedDefaults();
			assert.strictEqual(
				defaults.copyPath.useLineCountSyntax,
				CONFIG_DEFAULTS["textToolkit.copyPath.useLineCountSyntax"]
			);
			assert.strictEqual(
				defaults.changeCase.includeDotInCurrentWord,
				CONFIG_DEFAULTS["textToolkit.changeCase.includeDotInCurrentWord"]
			);
			assert.strictEqual(
				defaults.alignByRegex.rememberLastInput,
				CONFIG_DEFAULTS["textToolkit.alignByRegex.rememberLastInput"]
			);
			assert.strictEqual(
				defaults.plainText.applyEditorSettings,
				CONFIG_DEFAULTS["textToolkit.plainText.applyEditorSettings"]
			);
			assert.strictEqual(
				defaults.plainText.disableLineNumbers,
				CONFIG_DEFAULTS["textToolkit.plainText.disableLineNumbers"]
			);
			assert.strictEqual(
				defaults.plainText.suppressLanguageActivation,
				CONFIG_DEFAULTS["textToolkit.plainText.suppressLanguageActivation"]
			);
			assert.strictEqual(
				defaults.terminalOpen.selectionLink,
				CONFIG_DEFAULTS["textToolkit.terminalOpen.selectionLink"]
			);
			assert.deepStrictEqual(defaults.plainText.editorOverrides, {
				...DEFAULT_EDITOR_OVERRIDES,
			});
		});

		it("返回的覆盖表是副本, 改动不影响内置表", () => {
			const defaults = advancedDefaults();
			defaults.plainText.editorOverrides["editor.folding"] = true;
			assert.strictEqual(DEFAULT_EDITOR_OVERRIDES["editor.folding"], false);
		});

		it("全部覆盖键都是 editor.* 且包含关键项", () => {
			for (const key of Object.keys(DEFAULT_EDITOR_OVERRIDES)) {
				assert.ok(key.startsWith("editor."), `unexpected setting scope: ${key}`);
			}
			assert.strictEqual(DEFAULT_EDITOR_OVERRIDES["editor.wordWrap"], "on");
			assert.strictEqual(DEFAULT_EDITOR_OVERRIDES["editor.minimap.enabled"], false);
		});
	});

	describe("mergeEditorOverrides", () => {
		it("增量修改已有项", () => {
			const merged = mergeEditorOverrides(DEFAULT_EDITOR_OVERRIDES, {
				"editor.minimap.enabled": true,
			});
			assert.strictEqual(merged["editor.minimap.enabled"], true);
			assert.strictEqual(merged["editor.folding"], false);
		});

		it("null 表示移除内置覆盖", () => {
			const merged = mergeEditorOverrides(DEFAULT_EDITOR_OVERRIDES, {
				"editor.wordWrap": null,
			});
			assert.ok(!("editor.wordWrap" in merged));
			assert.strictEqual(
				Object.keys(merged).length,
				Object.keys(DEFAULT_EDITOR_OVERRIDES).length - 1
			);
		});

		it("可以追加内置表以外的键", () => {
			const merged = mergeEditorOverrides(DEFAULT_EDITOR_OVERRIDES, { "editor.rulers": [] });
			assert.deepStrictEqual(merged["editor.rulers"], []);
		});

		it("非对象输入按无覆盖处理", () => {
			for (const raw of [undefined, null, 42, "x", ["a"]]) {
				assert.deepStrictEqual(mergeEditorOverrides(DEFAULT_EDITOR_OVERRIDES, raw), {
					...DEFAULT_EDITOR_OVERRIDES,
				});
			}
		});
	});

	describe("resolveAdvanced", () => {
		it("空配置返回内置默认值", () => {
			assert.deepStrictEqual(resolveAdvanced(keys({}), undefined), advancedDefaults());
			assert.deepStrictEqual(resolveAdvanced(keys({}), {}), advancedDefaults());
		});

		it("新键显式值优先于旧对象", () => {
			const resolved = resolveAdvanced(
				keys({ rememberLastInput: false, selectionLink: true }),
				legacy({
					[ADVANCED_KEYS.rememberLastInput.legacy]: true,
					[ADVANCED_KEYS.selectionLink.legacy]: false,
				})
			);
			assert.strictEqual(resolved.alignByRegex.rememberLastInput, false);
			assert.strictEqual(resolved.terminalOpen.selectionLink, true);
		});

		it("新键未设置时回退旧对象", () => {
			const resolved = resolveAdvanced(
				keys({}),
				legacy({
					[ADVANCED_KEYS.useLineCountSyntax.legacy]: true,
					[ADVANCED_KEYS.disableLineNumbers.legacy]: true,
					[ADVANCED_KEYS.editorOverrides.legacy]: { "editor.wordWrap": "off" },
				})
			);
			assert.strictEqual(resolved.copyPath.useLineCountSyntax, true);
			assert.strictEqual(resolved.plainText.disableLineNumbers, true);
			assert.strictEqual(resolved.plainText.editorOverrides["editor.wordWrap"], "off");
			assert.strictEqual(resolved.plainText.editorOverrides["editor.folding"], false);
		});

		it("类型不符的新键与旧键都忽略", () => {
			const resolved = resolveAdvanced(
				keys({ rememberLastInput: "yes" as unknown as boolean }),
				legacy({
					[ADVANCED_KEYS.rememberLastInput.legacy]: 42,
					[ADVANCED_KEYS.applyEditorSettings.legacy]: "on",
				})
			);
			assert.strictEqual(resolved.alignByRegex.rememberLastInput, true);
			assert.strictEqual(resolved.plainText.applyEditorSettings, true);
		});

		it("editorOverrides 新键对象优先, 非对象新键回退旧对象", () => {
			const fromNew = resolveAdvanced(
				keys({ editorOverrides: { "editor.hover.enabled": true } }),
				legacy({ [ADVANCED_KEYS.editorOverrides.legacy]: { "editor.folding": null } })
			);
			assert.strictEqual(fromNew.plainText.editorOverrides["editor.hover.enabled"], true);
			assert.strictEqual(fromNew.plainText.editorOverrides["editor.folding"], false);

			const fromLegacy = resolveAdvanced(
				keys({ editorOverrides: 42 }),
				legacy({ [ADVANCED_KEYS.editorOverrides.legacy]: { "editor.folding": null } })
			);
			assert.ok(!("editor.folding" in fromLegacy.plainText.editorOverrides));
		});
	});

	/**
	 * package.json 的 schema default 是默认值的唯一来源, 生成模块是它的直接副本.
	 * 这几条断言把三方锁在一起: schema default / 生成模块 / advancedDefaults().
	 */
	describe("package.json schema 与默认值一致", () => {
		const properties = readJson("package.json").contributes.configuration.properties;

		it("8 个新顶层键都已声明且 default 与代码默认值相等", () => {
			for (const [name, descriptor] of Object.entries(ADVANCED_KEYS)) {
				assert.ok(descriptor.setting in properties, `schema 缺少 ${descriptor.setting}`);
				const schemaDefault = properties[descriptor.setting].default;
				if (name === "editorOverrides") {
					assert.deepStrictEqual(
						schemaDefault,
						CONFIG_DEFAULTS[descriptor.setting],
						`schema default 与生成模块不一致: ${descriptor.setting}`
					);
					assert.deepStrictEqual(schemaDefault, { ...DEFAULT_EDITOR_OVERRIDES });
				} else {
					const defaults = advancedDefaults() as any;
					const codeValue =
						name === "useLineCountSyntax"
							? defaults.copyPath.useLineCountSyntax
							: name === "includeDotInCurrentWord"
								? defaults.changeCase.includeDotInCurrentWord
								: name === "rememberLastInput"
									? defaults.alignByRegex.rememberLastInput
									: name === "applyEditorSettings"
										? defaults.plainText.applyEditorSettings
										: name === "disableLineNumbers"
											? defaults.plainText.disableLineNumbers
											: name === "suppressLanguageActivation"
												? defaults.plainText.suppressLanguageActivation
												: defaults.terminalOpen.selectionLink;
					assert.strictEqual(
						schemaDefault,
						codeValue,
						`schema default 与代码默认值不一致: ${descriptor.setting}`
					);
				}
			}
		});

		it("editorOverrides 的 default 是完整 29 项内置表", () => {
			assert.strictEqual(Object.keys(DEFAULT_EDITOR_OVERRIDES).length, 29);
			assert.deepStrictEqual(properties[ADVANCED_KEYS.editorOverrides.setting].default, {
				...DEFAULT_EDITOR_OVERRIDES,
			});
		});

		it("旧 textToolkit.advanced 只是不透明兼容对象, 不再声明子键", () => {
			const schema = properties["textToolkit.advanced"];
			assert.strictEqual(schema.type, "object");
			assert.deepStrictEqual(schema.default, {});
			assert.strictEqual(schema.additionalProperties, true);
			assert.ok(!schema.properties);
			assert.ok(!schema.defaultSnippets);
		});

		it("editorOverrides 只保留改一项/删一项的示例 snippet", () => {
			const snippets =
				properties[ADVANCED_KEYS.editorOverrides.setting].defaultSnippets ?? [];
			for (const snippet of snippets) {
				assert.ok(
					Object.keys(snippet.body).length <= 2,
					"snippet 不得复制默认值, 只保留演示用的部分覆盖"
				);
			}
		});
	});
});
