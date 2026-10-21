import { describe, it } from "vitest";
import * as assert from "node:assert";
import { guessLanguageId, type LanguageContribution } from "../src/features/plainText/language";

/** 取自 VS Code 内置扩展的贡献声明, 只留下测试需要的字段. */
const CONTRIBUTIONS: LanguageContribution[] = [
	{ id: "typescript", extensions: [".ts", ".cts", ".mts"] },
	{ id: "typescriptreact", extensions: [".tsx"] },
	{ id: "javascript", extensions: [".js", ".cjs", ".mjs"] },
	{ id: "json", extensions: [".json"], filenames: [".eslintrc"] },
	{ id: "jsonc", filenames: ["tsconfig.json"], filenamePatterns: ["tsconfig.*.json"] },
	{ id: "dockerfile", filenames: ["Dockerfile"], filenamePatterns: ["Dockerfile.*"] },
	{ id: "log", extensions: [".log"] },
];

describe("plainText language (原语言推断)", () => {
	it("按扩展名命中", () => {
		assert.strictEqual(guessLanguageId("/repo/src/big.ts", CONTRIBUTIONS), "typescript");
		assert.strictEqual(guessLanguageId("/repo/src/App.TSX", CONTRIBUTIONS), "typescriptreact");
		assert.strictEqual(guessLanguageId("C:\\repo\\a.mjs", CONTRIBUTIONS), "javascript");
	});

	it("精确文件名优先于扩展名", () => {
		assert.strictEqual(guessLanguageId("/repo/tsconfig.json", CONTRIBUTIONS), "jsonc");
		assert.strictEqual(guessLanguageId("/repo/other.json", CONTRIBUTIONS), "json");
	});

	it("文件名模式排在精确文件名之后, 扩展名之前", () => {
		assert.strictEqual(guessLanguageId("/repo/tsconfig.build.json", CONTRIBUTIONS), "jsonc");
		assert.strictEqual(guessLanguageId("/repo/Dockerfile.dev", CONTRIBUTIONS), "dockerfile");
	});

	it("用户 files.associations 压过扩展贡献", () => {
		assert.strictEqual(
			guessLanguageId("/repo/src/big.ts", CONTRIBUTIONS, { "**/*.ts": "plaintext" }),
			"plaintext"
		);
		assert.strictEqual(
			guessLanguageId("/repo/logs/app.log", CONTRIBUTIONS, { "/repo/logs/*.log": "json" }),
			"json"
		);
	});

	it("多条模式命中时取最长的一条", () => {
		const associations = { "**/*.log": "json", "/repo/logs/**/*.log": "javascript" };
		assert.strictEqual(
			guessLanguageId("/repo/logs/a.log", CONTRIBUTIONS, associations),
			"javascript"
		);
	});

	it("不含路径分隔符的模式只比文件名", () => {
		assert.strictEqual(
			guessLanguageId("/repo/a.log", CONTRIBUTIONS, { "*.log": "json" }),
			"json"
		);
		assert.strictEqual(
			guessLanguageId("/repo/a.log", CONTRIBUTIONS, { "/other/*.log": "json" }),
			"log"
		);
	});

	it("推断不出时返回 undefined", () => {
		assert.strictEqual(guessLanguageId("/repo/data.unknownext", CONTRIBUTIONS), undefined);
		assert.strictEqual(guessLanguageId("/repo/", CONTRIBUTIONS), undefined);
	});

	it("非字符串的关联值被忽略", () => {
		assert.strictEqual(
			guessLanguageId("/repo/a.ts", CONTRIBUTIONS, { "**/*.ts": 42 as unknown as string }),
			"typescript"
		);
	});
});
