// 按作用域保存设置备份, 用进程间互斥保护同一作用域的读改写.
import { createHash, randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

export interface StoredEntry {
	target: number;
	/** null 表示原来没有语言级覆盖. */
	values: Record<string, unknown>;
	/** 窗口标识 -> 扩展宿主 PID; 活跃窗口共享原值, 最后一个退出时还原. */
	owners: Record<string, number>;
}

export function processIsAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		return (error as NodeJS.ErrnoException).code !== "ESRCH";
	}
}

export function overrideStorage(root: string, scope: string) {
	// globalState 在不同扩展宿主中有各自缓存, 不能用它对共享对象做原子读改写.
	// 独立文件与跨进程锁让备份和窗口所有权始终从同一份最新状态读取.
	const directory = path.join(root, "plain-text-settings");
	const name = createHash("sha256").update(scope).digest("hex");
	const file = path.join(directory, `${name}.json`);
	const lock = path.join(directory, `${name}.lock`);
	return {
		read(): StoredEntry | null | undefined {
			try {
				return JSON.parse(fs.readFileSync(file, "utf8"));
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
				throw error;
			}
		},
		save(entry: StoredEntry | null): void {
			// null 是迁移墓碑, 防止其他窗口的旧 globalState 缓存再次导入已还原的备份.
			const temporary = `${file}.${randomUUID()}`;
			try {
				fs.writeFileSync(temporary, JSON.stringify(entry), { mode: 0o600 });
				fs.renameSync(temporary, file);
			} finally {
				fs.rmSync(temporary, { force: true });
			}
		},
		async exclusive<T>(run: () => Promise<T>): Promise<T> {
			fs.mkdirSync(directory, { recursive: true });
			const owner = `${process.pid}-${randomUUID()}`;
			const candidate = `${lock}.${owner}`;
			fs.mkdirSync(candidate);
			let acquired = false;
			try {
				// 先准备完整所有者信息再原子认领, 消除 mkdir 后崩溃留下空锁的窗口.
				fs.writeFileSync(path.join(candidate, owner), "", { flag: "wx", mode: 0o600 });
				const deadline = Date.now() + 10_000;
				for (;;) {
					try {
						fs.renameSync(candidate, lock);
						acquired = true;
						break;
					} catch (error) {
						const code = (error as NodeJS.ErrnoException).code ?? "";
						const occupied =
							["EEXIST", "ENOTEMPTY"].includes(code) ||
							(["EPERM", "EACCES"].includes(code) && fs.existsSync(lock));
						if (!occupied) throw error;
					}
					try {
						const previousOwners = fs.readdirSync(lock);
						if (previousOwners.length === 0) fs.rmdirSync(lock);
						for (const previous of previousOwners) {
							const pid = Number(previous.split("-")[0]);
							if (Number.isInteger(pid) && pid > 0 && !processIsAlive(pid)) {
								// 只有成功删除旧 owner 的竞争者才删目录, 避免删除新持有者的锁.
								fs.unlinkSync(path.join(lock, previous));
								fs.rmdirSync(lock);
							}
						}
					} catch (error) {
						const code = (error as NodeJS.ErrnoException).code ?? "";
						if (!["ENOENT", "ENOTEMPTY"].includes(code)) throw error;
					}
					if (Date.now() >= deadline) throw new Error("等待纯文本设置锁超时, 请重试");
					await new Promise(resolve => setTimeout(resolve, 25));
				}
				return await run();
			} finally {
				// 先原子释放, 再清理自己的目录, 不触碰下一位持有者的新锁.
				if (acquired) fs.renameSync(lock, candidate);
				fs.rmSync(candidate, { recursive: true, force: true });
			}
		},
	};
}
