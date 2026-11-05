// 用真实子进程验证文本传输, 错误, 取消和保留公共前后缀的编辑范围.
import { describe, expect, it } from "vitest";
import {
	readHostEnvironment,
	type FormatterInvocation,
} from "../src/features/commonFormatter/config";
import {
	changedRange,
	FormatterProcessError,
	runFormatter,
} from "../src/features/commonFormatter/process";

function invocation(
	script: string,
	overrides: Partial<FormatterInvocation> = {}
): FormatterInvocation {
	return {
		command: process.execPath,
		args: ["-e", script],
		cwd: process.cwd(),
		env: readHostEnvironment(),
		timeout: 3000,
		...overrides,
	};
}

describe("格式化进程", () => {
	it("从 stdin 读取尚未保存的文本, stdout 与 stderr 分离", async () => {
		const result = await runFormatter(
			invocation(
				"process.stdin.setEncoding('utf8'); let s=''; process.stdin.on('data',x=>s+=x); process.stdin.on('end',()=>{process.stdout.write(s.toUpperCase()); process.stderr.write('warning')})"
			),
			"hello 世界\n",
			new AbortController().signal
		);
		expect(result).toEqual({ text: "HELLO 世界\n", stderr: "warning" });
	});
	it("空 stdout 是成功的空文档", async () => {
		expect(
			await runFormatter(
				invocation("process.stdin.resume()"),
				"text",
				new AbortController().signal
			)
		).toEqual({ text: "", stderr: "" });
	});
	it("失败退出保留 stderr 诊断, 不返回 stdout", async () => {
		const result = runFormatter(
			invocation(
				"process.stderr.write('bad input'); process.exitCode=2; process.stdin.resume()"
			),
			"text",
			new AbortController().signal
		);
		await expect(result).rejects.toMatchObject({
			stderr: "bad input",
			message: "格式化进程退出: 2",
		});
	});
	it("找不到命令时拒绝并退出", async () => {
		await expect(
			runFormatter(
				invocation("", { command: "common-formatter-command-does-not-exist-91f3" }),
				"",
				new AbortController().signal
			)
		).rejects.toBeInstanceOf(FormatterProcessError);
	});
	it("超时终止不会退出的进程", async () => {
		await expect(
			runFormatter(
				invocation("setInterval(()=>{},1000)", { timeout: 150 }),
				"",
				new AbortController().signal
			)
		).rejects.toThrow(/超过 150 毫秒/);
	});
	it("支持启动前取消与执行中取消", async () => {
		const before = new AbortController();
		before.abort();
		await expect(runFormatter(invocation(""), "", before.signal)).rejects.toThrow(/取消/);
		const during = new AbortController();
		const result = runFormatter(invocation("setInterval(()=>{},1000)"), "", during.signal);
		setTimeout(() => during.abort(), 80);
		await expect(result).rejects.toThrow(/取消/);
	});
	it("超过 stdout 上限时终止进程", async () => {
		await expect(
			runFormatter(
				invocation(
					"process.stdout.write('x'.repeat(33*1024*1024)); process.stdin.resume()"
				),
				"",
				new AbortController().signal
			)
		).rejects.toThrow(/32 MiB/);
	});
	it("stderr 超过上限只截断诊断, 仍排空管道", async () => {
		const result = await runFormatter(
			invocation(
				"process.stderr.write('w'.repeat(128*1024)); process.stdout.write('ok'); process.stdin.resume()"
			),
			"",
			new AbortController().signal
		);
		expect(result.text).toBe("ok");
		expect(result.stderr).toHaveLength(64 * 1024);
	});
	it("参数中的空格和 shell 元字符保持原样", async () => {
		const args = ["two words", "$(echo wrong); & | < >", "中文路径/a b.ts"];
		const result = await runFormatter(
			invocation(
				"process.stdout.write(JSON.stringify(process.argv.slice(1))); process.stdin.resume()",
				{
					args: [
						"-e",
						"process.stdout.write(JSON.stringify(process.argv.slice(1))); process.stdin.resume()",
						"--",
						...args,
					],
				}
			),
			"",
			new AbortController().signal
		);
		expect(JSON.parse(result.text)).toEqual(args);
	});
	it.skipIf(process.platform === "win32")(
		"超时会清理进程组, 包括忽略 SIGTERM 的父进程和后代",
		async () => {
			const script =
				"const {spawn}=require('node:child_process'); const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'}); process.stderr.write(String(child.pid)); process.on('SIGTERM',()=>{}); setInterval(()=>{},1000)";
			let pid: number | undefined;
			try {
				await runFormatter(
					invocation(script, { timeout: 400 }),
					"",
					new AbortController().signal
				);
				expect.fail("进程应该超时");
			} catch (error) {
				expect(error).toBeInstanceOf(FormatterProcessError);
				pid = Number((error as FormatterProcessError).stderr);
				expect(pid).toBeGreaterThan(0);
				expect((error as Error).message).toMatch(/超过/);
			}
			let alive = true;
			for (let i = 0; i < 30 && alive; i++) {
				try {
					process.kill(pid!, 0);
					await new Promise(resolve => setTimeout(resolve, 20));
				} catch {
					alive = false;
				}
			}
			expect(alive).toBe(false);
		}
	);
});

describe("文本编辑范围", () => {
	it.each([
		["hello x world", "hello y world"],
		["", "new"],
		["old", ""],
		["a\r\nb", "a\nb"],
		["a\nb", "a\r\nb"],
		["😀 x", "😁 x"],
		["a", "a\n"],
	])("编辑应用后精确得到格式化结果 %#", (before, after) => {
		const edit = changedRange(before, after)!;
		expect(before.slice(0, edit.start) + edit.text + before.slice(edit.end)).toBe(after);
		expect(
			edit.start > 0 && before[edit.start - 1] === "\r" && before[edit.start] === "\n"
		).toBe(false);
	});
	it("相同文本不生成编辑, 简单替换保留两端内容", () => {
		expect(changedRange("same", "same")).toBeUndefined();
		expect(changedRange("prefix X suffix", "prefix Y suffix")).toEqual({
			start: 7,
			end: 8,
			text: "Y",
		});
	});
});
