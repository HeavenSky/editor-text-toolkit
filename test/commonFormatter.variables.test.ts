// 验证文档上下文变量, 单次求值以及进程参数的完整性.
import { describe, expect, it, vi } from "vitest";
import { loadFormatterRules } from "../src/features/commonFormatter/config";
import { resolveFormatter, type VariableContext } from "../src/features/commonFormatter/variables";

function rule(overrides: Record<string, unknown> = {}) {
	return loadFormatterRules(
		[{ name: "CLI", languages: ["typescript"], command: "formatter", ...overrides }],
		"linux"
	)[0];
}

const context: VariableContext = {
	file: "/repo/Client/src/my file.test.ts",
	workspaceFolder: "/repo/Client",
	workspaceFolders: [
		{ name: "Client", path: "/repo/Client" },
		{ name: "Server", path: "/repo/Server" },
	],
	userHome: "/home/user",
	env: { PATH: "/bin", ORIGINAL: "host", EMPTY: "", LITERAL: "${file}" },
	platform: "linux",
	getConfiguration: () => 4,
};

describe("格式化变量", () => {
	it("支持所有约定路径变量, 并保持包含空格的参数完整", () => {
		const args = [
			"${file}",
			"${fileBasename}",
			"${fileBasenameNoExtension}",
			"${fileExtname}",
			"${fileDirname}",
			"${fileDirnameBasename}",
			"${workspaceFolder}",
			"${workspaceFolderBasename}",
			"${fileWorkspaceFolder}",
			"${relativeFile}",
			"${relativeFileDirname}",
			"${workspaceFolder:Server}",
			"${userHome}",
			"${pathSeparator}",
			"${/}",
			"${env:EMPTY}",
			"--indent=${config:editor.tabSize}",
		];
		expect(resolveFormatter(rule({ args }), context).args).toEqual([
			context.file,
			"my file.test.ts",
			"my file.test",
			".ts",
			"/repo/Client/src",
			"src",
			"/repo/Client",
			"Client",
			"/repo/Client",
			"src/my file.test.ts",
			"src",
			"/repo/Server",
			"/home/user",
			"/",
			"/",
			"",
			"--indent=4",
		]);
	});
	it("不递归展开替换结果, 同名设置只求值一次", () => {
		const getConfiguration = vi.fn(() => true);
		const result = resolveFormatter(
			rule({ args: ["${env:LITERAL}", "${config:test}", "${config:test}"] }),
			{ ...context, getConfiguration }
		);
		expect(result.args).toEqual(["${file}", "true", "true"]);
		expect(getConfiguration).toHaveBeenCalledTimes(1);
	});
	it("env 读取宿主快照, 而覆盖决定最终子进程环境", () => {
		const result = resolveFormatter(
			rule({
				args: ["${env:ORIGINAL}"],
				env: { ORIGINAL: "override", COPY: "${env:ORIGINAL}", PATH: null },
			}),
			context
		);
		expect(result.args).toEqual(["host"]);
		expect(result.env).toMatchObject({ ORIGINAL: "override", COPY: "host" });
		expect(result.env.PATH).toBeUndefined();
	});
	it("相对 cwd 以工作区为基准, 命令路径以 cwd 为基准", () => {
		const result = resolveFormatter(
			rule({ cwd: "tools", command: "./bin/formatter" }),
			context
		);
		expect(result.cwd).toBe("/repo/Client/tools");
		expect(result.command).toBe("/repo/Client/tools/bin/formatter");
	});
	it("独立文件默认使用文件目录, 显式工作区变量仍报错", () => {
		const standalone = { ...context, workspaceFolder: undefined };
		expect(resolveFormatter(rule(), standalone).cwd).toBe("/repo/Client/src");
		expect(() => resolveFormatter(rule({ args: ["${workspaceFolder}"] }), standalone)).toThrow(
			/CLI.args\[0\]/
		);
	});
	it("Windows 路径与环境变量大小写按宿主解析", () => {
		const result = resolveFormatter(
			rule({ args: ["${relativeFile}", "${env:PATH}", "${/}"] }),
			{
				...context,
				file: "C:\\repo\\src\\a.ts",
				workspaceFolder: "C:\\repo",
				platform: "win32",
				env: { Path: "tools" },
			}
		);
		expect(result.args).toEqual(["src\\a.ts", "tools", "\\"]);
	});
	it.each([
		"${unknown}",
		"${env:MISSING}",
		"${workspaceFolder:Missing}",
		"${input:name}",
		"${command:extension.run}",
		"${cwd}",
		"${file",
		"${env:${file}}",
		"${}",
	])("拒绝无法解析的变量 %s", input => {
		expect(() => resolveFormatter(rule({ args: [input] }), context)).toThrow(/CLI.args\[0\]/);
	});
	it.each([null, undefined, {}, []])("拒绝非标量设置 %#", value => {
		expect(() =>
			resolveFormatter(rule({ args: ["${config:test}"] }), {
				...context,
				getConfiguration: () => value,
			})
		).toThrow(/变量无法解析/);
	});
});
