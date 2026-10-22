// 终端当前目录的逐级解析, 以及路径存在性探测与 Uri 转换.
import { execFile } from "child_process";
import * as fs from "fs";
import * as vscode from "vscode";
import {
	errorMessage,
	isAbsolutePath,
	joinCwd,
	parseLsofCwd,
	parseProcStatTpgid,
	parsePsTpgid,
	raceTimeout,
	STAT_TIMEOUT_MS,
	toUriPath,
	type PathFlavor,
	type TargetKind,
} from "./core";

export type CwdSource =
	| "foregroundProcess"
	| "shellIntegration"
	| "process"
	| "creationOptions"
	| "workspaceFolder"
	| "none";

/** source 为 none 时没有拼接基准, 只接受绝对路径. */
export type ResolvedCwd =
	| { readonly uri: vscode.Uri; readonly source: Exclude<CwdSource, "none"> }
	| { readonly uri: undefined; readonly source: "none" };

/** 整个 shell 进程 cwd 探测(取 pid 加读 cwd)的总超时. */
export const PROCESS_CWD_TIMEOUT_MS = 500;
/** 写全路径: 扩展宿主的 PATH 里可能没有 /usr/sbin. */
export const DARWIN_LSOF_PATH = "/usr/sbin/lsof";
export const DARWIN_PS_PATH = "/bin/ps";

const LSOF_MAX_BUFFER_BYTES = 64 * 1024;

export function hostFlavor(): PathFlavor {
	return process.platform === "win32" ? "win32" : "posix";
}

/** 绝对路径不能用 Uri.joinPath 拼, 它会把 `/abs` 拼成 `base/abs`; 非 file 模板保留 scheme 与 authority. */
export function toUri(absPath: string, flavor: PathFlavor, template?: vscode.Uri): vscode.Uri {
	const base = template ?? vscode.workspace.workspaceFolders?.[0]?.uri;
	if (!base || base.scheme === "file") {
		return vscode.Uri.file(absPath);
	}
	return base.with({ path: toUriPath(absPath, flavor), query: "", fragment: "" });
}

export function cwdToPath(uri: vscode.Uri, flavor: PathFlavor): string {
	if (uri.scheme === "file") {
		return uri.fsPath;
	}
	if (flavor === "posix") {
		return uri.path;
	}
	return uri.path.replace(/^\//, "").replace(/\//g, "\\");
}

export function cwdSourceLabel(source: Exclude<CwdSource, "none">): string {
	switch (source) {
		case "foregroundProcess":
			return vscode.l10n.t("Foreground program");
		case "shellIntegration":
			return vscode.l10n.t("Shell integration");
		case "process":
			return vscode.l10n.t("Shell process");
		case "creationOptions":
			return vscode.l10n.t("Terminal launch directory");
		case "workspaceFolder":
			return vscode.l10n.t("First workspace folder");
	}
}

export async function statTarget(
	uri: vscode.Uri
): Promise<{ readonly kind: TargetKind; readonly reason?: string }> {
	try {
		const raced = await raceTimeout(vscode.workspace.fs.stat(uri), STAT_TIMEOUT_MS);
		if (raced.timedOut) {
			return { kind: "unknown", reason: vscode.l10n.t("timed out") };
		}
		// 跟随符号链接后类型位会与 SymbolicLink 组合, 必须按位判断.
		return {
			kind: (raced.value.type & vscode.FileType.Directory) !== 0 ? "directory" : "file",
		};
	} catch (error) {
		if (
			error instanceof vscode.FileSystemError &&
			(error.code === "FileNotFound" || error.code === "FileNotADirectory")
		) {
			return { kind: "missing" };
		}
		return { kind: "unknown", reason: errorMessage(error) };
	}
}

async function isDirectory(uri: vscode.Uri): Promise<boolean> {
	return (await statTarget(uri)).kind === "directory";
}

function run(file: string, args: readonly string[]): Promise<string> {
	return new Promise((resolve, reject) => {
		execFile(
			file,
			args,
			{
				timeout: PROCESS_CWD_TIMEOUT_MS,
				maxBuffer: LSOF_MAX_BUFFER_BYTES,
				windowsHide: true,
			},
			(error, stdout) => (error ? reject(error) : resolve(stdout))
		);
	});
}

/** 读不到时抛错. */
async function cwdOfPid(pid: number): Promise<string> {
	if (process.platform === "darwin") {
		const cwd = parseLsofCwd(
			await run(DARWIN_LSOF_PATH, ["-a", "-d", "cwd", "-p", String(pid), "-Fn"])
		);
		if (cwd === undefined) {
			throw new Error("no cwd");
		}
		return cwd;
	}
	return fs.promises.readlink(`/proc/${pid}/cwd`);
}

async function readProcessCwd(terminal: vscode.Terminal): Promise<string | undefined> {
	try {
		const pid = await terminal.processId;
		return pid === undefined ? undefined : await cwdOfPid(pid);
	} catch {
		return undefined;
	}
}

/**
 * shell 正在运行前台程序(例如 Claude Code, vim)时取该程序进程组组长的 cwd.
 * `cd dir && claude` 这类一行命令执行期间 shell 集成仍报告上一个提示符时的目录, 只有前台程序自己的 cwd 是对的.
 */
async function readForegroundCwd(terminal: vscode.Terminal): Promise<string | undefined> {
	try {
		const pid = await terminal.processId;
		if (pid === undefined) {
			return undefined;
		}
		const tpgid =
			process.platform === "darwin"
				? parsePsTpgid(await run(DARWIN_PS_PATH, ["-o", "tpgid=", "-p", String(pid)]))
				: parseProcStatTpgid(await fs.promises.readFile(`/proc/${pid}/stat`, "utf8"));
		return tpgid === undefined || tpgid === pid ? undefined : await cwdOfPid(tpgid);
	} catch {
		return undefined;
	}
}

async function probeProcessCwd(
	read: (terminal: vscode.Terminal) => Promise<string | undefined>,
	terminal: vscode.Terminal,
	flavor: PathFlavor
): Promise<vscode.Uri | undefined> {
	const raced = await raceTimeout(read(terminal), PROCESS_CWD_TIMEOUT_MS);
	const cwd = raced.timedOut ? undefined : raced.value;
	if (!cwd || !isAbsolutePath(cwd, flavor)) {
		return undefined;
	}
	const uri = toUri(cwd, flavor);
	return (await isDirectory(uri)) ? uri : undefined;
}

function creationOptionsCwd(terminal: vscode.Terminal, flavor: PathFlavor): vscode.Uri | undefined {
	const options = terminal.creationOptions;
	if ("pty" in options) {
		return undefined;
	}
	const cwd = options.cwd;
	if (!cwd) {
		return undefined;
	}
	if (typeof cwd !== "string") {
		return cwd;
	}
	if (isAbsolutePath(cwd, flavor)) {
		return toUri(cwd, flavor);
	}
	const folder = vscode.workspace.workspaceFolders?.[0]?.uri;
	return folder
		? toUri(joinCwd(cwdToPath(folder, flavor), cwd, flavor), flavor, folder)
		: undefined;
}

/** 每次实时解析, 不缓存: 用户随时可能 cd. 前四级取到的目录必须真实存在才采纳. */
export async function resolveTerminalCwd(terminal: vscode.Terminal): Promise<ResolvedCwd> {
	const flavor = hostFlavor();
	const probesProcess =
		(process.platform === "darwin" || process.platform === "linux") &&
		terminal.exitStatus === undefined;

	if (probesProcess) {
		const uri = await probeProcessCwd(readForegroundCwd, terminal, flavor);
		if (uri) {
			return { uri, source: "foregroundProcess" };
		}
	}

	const shellCwd = terminal.shellIntegration?.cwd;
	if (shellCwd && (await isDirectory(shellCwd))) {
		return { uri: shellCwd, source: "shellIntegration" };
	}

	if (probesProcess) {
		const uri = await probeProcessCwd(readProcessCwd, terminal, flavor);
		if (uri) {
			return { uri, source: "process" };
		}
	}

	const launchCwd = creationOptionsCwd(terminal, flavor);
	if (launchCwd && (await isDirectory(launchCwd))) {
		return { uri: launchCwd, source: "creationOptions" };
	}

	const folder = vscode.workspace.workspaceFolders?.[0]?.uri;
	if (folder) {
		return { uri: folder, source: "workspaceFolder" };
	}
	return { uri: undefined, source: "none" };
}
