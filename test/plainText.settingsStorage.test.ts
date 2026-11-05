// 用独立进程验证备份存储的互斥, 崩溃回收和原子读写.
import { execFile, spawn } from "node:child_process";
import { once } from "node:events";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import * as path from "node:path";
import { promisify } from "node:util";
import { transformSync } from "esbuild";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { overrideStorage } from "../src/features/plainText/settingsStorage";

let root: string;
const source = transformSync(readFileSync("src/features/plainText/settingsStorage.ts", "utf8"), {
	loader: "ts",
	format: "cjs",
}).code;

beforeEach(() => {
	const cache = path.resolve(".ai-ctx/cache/plain-text-tests");
	mkdirSync(cache, { recursive: true });
	root = mkdtempSync(path.join(cache, "storage-"));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("跨进程设置备份存储", () => {
	it("四个独立进程同时更新同一作用域不会丢失值", async () => {
		const script = `${source}
const store = module.exports.overrideStorage(process.argv[1], 'shared');
(async () => {
  for (let i = 0; i < 4; i++) await store.exclusive(async () => {
    const entry = store.read() || { target: 1, values: { count: 0 }, owners: {} };
    await new Promise(resolve => setTimeout(resolve, 10));
    entry.values.count++;
    store.save(entry);
  });
})().catch(error => { console.error(error); process.exitCode = 1; });`;
		await Promise.all(
			Array.from({ length: 4 }, () =>
				promisify(execFile)(process.execPath, ["-e", script, root], { timeout: 5000 })
			)
		);
		expect(overrideStorage(root, "shared").read()?.values.count).toBe(16);
	});

	it("持锁进程被强制结束后可以回收锁并继续恢复", async () => {
		const script = `${source}
module.exports.overrideStorage(process.argv[1], 'shared').exclusive(async () => {
  process.stdout.write('locked');
  await new Promise(() => {});
  setInterval(() => {}, 1000);
});
setInterval(() => {}, 1000);`;
		const child = spawn(process.execPath, ["-e", script, root], {
			stdio: ["ignore", "pipe", "pipe"],
		});
		try {
			await Promise.race([
				once(child.stdout, "data"),
				once(child, "exit").then(() => {
					throw new Error("持锁进程提前退出");
				}),
			]);
			const exited = once(child, "exit");
			child.kill("SIGKILL");
			await exited;
			const store = overrideStorage(root, "shared");
			await store.exclusive(async () =>
				store.save({ target: 1, values: { original: "off" }, owners: {} })
			);
			expect(store.read()?.values.original).toBe("off");
		} finally {
			child.kill("SIGKILL");
		}
	});
});
