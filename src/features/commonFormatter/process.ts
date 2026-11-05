// 执行格式化子进程, 管理流, 超时, 取消和退出清理.
import spawn from "cross-spawn";
import { readHostEnvironment, type FormatterInvocation } from "./config";

const MAX_STDOUT_BYTES = 32 * 1024 * 1024;
const MAX_STDERR_BYTES = 64 * 1024;
const KILL_GRACE_MS = 250;

export class FormatterProcessError extends Error {
	constructor(
		message: string,
		readonly stderr: string,
		options?: ErrorOptions
	) {
		super(message, options);
	}
}

export function runFormatter(
	execution: FormatterInvocation,
	text: string,
	signal: AbortSignal
): Promise<{ text: string; stderr: string }> {
	return new Promise((resolve, reject) => {
		if (signal.aborted) {
			reject(new Error("格式化已取消"));
			return;
		}
		const child = spawn(execution.command, execution.args, {
			cwd: execution.cwd,
			env: execution.env,
			stdio: "pipe",
			windowsHide: true,
			detached: process.platform !== "win32",
		});
		const stdout: Buffer[] = [];
		const stderr: Buffer[] = [];
		let stdoutBytes = 0;
		let stderrBytes = 0;
		let failure: Error | undefined;
		let escalation: Promise<void> | undefined;
		const diagnostics = (): string => Buffer.concat(stderr).toString("utf8");
		const kill = (force: boolean): void => {
			try {
				if (process.platform === "win32" && child.pid) {
					const killer = spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
						env: readHostEnvironment(),
						windowsHide: true,
						stdio: "ignore",
						timeout: 2000,
					});
					killer.on("error", () => {
						child.kill("SIGKILL");
					});
					killer.on("exit", code => {
						if (code !== 0) child.kill("SIGKILL");
					});
				} else if (child.pid) process.kill(-child.pid, force ? "SIGKILL" : "SIGTERM");
				else child.kill(force ? "SIGKILL" : "SIGTERM");
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code !== "ESRCH") child.kill("SIGKILL");
			}
		};
		const stop = (message: string): void => {
			if (failure) return;
			failure = new Error(message);
			kill(false);
			escalation = new Promise(resolve => {
				setTimeout(() => {
					kill(true);
					child.stdout?.destroy();
					child.stderr?.destroy();
					resolve();
				}, KILL_GRACE_MS);
			});
		};
		const timeout = setTimeout(
			() => stop(`格式化超过 ${execution.timeout} 毫秒`),
			execution.timeout
		);
		const cancel = (): void => stop("格式化已取消");
		signal.addEventListener("abort", cancel, { once: true });
		child.stdout!.on("data", (chunk: Buffer) => {
			stdoutBytes += chunk.length;
			if (stdoutBytes > MAX_STDOUT_BYTES) stop("格式化输出超过 32 MiB 上限");
			else stdout.push(chunk);
		});
		child.stderr!.on("data", (chunk: Buffer) => {
			if (stderrBytes < MAX_STDERR_BYTES)
				stderr.push(chunk.subarray(0, MAX_STDERR_BYTES - stderrBytes));
			stderrBytes += chunk.length;
		});
		child.stdin!.on("error", error => {
			if ((error as NodeJS.ErrnoException).code !== "EPIPE") stop("无法向格式化进程写入文档");
		});
		child.on("error", error => {
			failure = error;
		});
		child.on("close", async (code, exitSignal) => {
			clearTimeout(timeout);
			signal.removeEventListener("abort", cancel);
			// 父进程退出不代表进程组已经退出, 必须完成后代的强制清理再结束请求.
			await escalation;
			if (failure || code !== 0) {
				reject(
					new FormatterProcessError(
						failure?.message ?? `格式化进程退出: ${code ?? exitSignal}`,
						diagnostics(),
						{ cause: failure }
					)
				);
			} else resolve({ text: Buffer.concat(stdout).toString("utf8"), stderr: diagnostics() });
		});
		child.stdin!.end(text, "utf8");
	});
}

export function changedRange(
	before: string,
	after: string
): { start: number; end: number; text: string } | undefined {
	if (before === after) return undefined;
	let start = 0;
	let end = before.length;
	let afterEnd = after.length;
	while (start < end && start < afterEnd && before[start] === after[start]) start++;
	while (end > start && afterEnd > start && before[end - 1] === after[afterEnd - 1]) {
		end--;
		afterEnd--;
	}
	const splitsPair = (text: string, index: number): boolean =>
		index > 0 &&
		index < text.length &&
		((text[index - 1] === "\r" && text[index] === "\n") ||
			(/[\uD800-\uDBFF]/.test(text[index - 1]) && /[\uDC00-\uDFFF]/.test(text[index])));
	if (splitsPair(before, start) || splitsPair(after, start)) start--;
	if (splitsPair(before, end) || splitsPair(after, afterEnd)) {
		end++;
		afterEnd++;
	}
	return { start, end, text: after.slice(start, afterEnd) };
}
