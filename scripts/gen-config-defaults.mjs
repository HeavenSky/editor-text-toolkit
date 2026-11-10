/**
 * 从 package.json 生成 src/shared/config-defaults.generated.ts。
 *
 * 用法: node scripts/gen-config-defaults.mjs --write   写入生成文件
 *       node scripts/gen-config-defaults.mjs           仅校验, 不一致时非零退出
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkGenerated, renderDefaultsModule } from "./lib/config-defaults.mjs";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
const target = join(ROOT, "src/shared/config-defaults.generated.ts");

if (process.argv.includes("--write")) {
	writeFileSync(target, renderDefaultsModule(pkg));
	console.log(`wrote ${target}`);
	process.exit(0);
}

const problems = checkGenerated(ROOT);
if (problems.length > 0) {
	console.error(problems.join("\n"));
	process.exit(1);
}
console.log("config defaults up to date");
