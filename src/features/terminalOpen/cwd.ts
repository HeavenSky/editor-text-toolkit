// 终端当前目录的逐级解析, 以及路径存在性探测与 Uri 转换.
import { execFile } from "child_process";
import * as fs from "fs";
import * as vscode from "vscode";
import {
	errorMessage,
	isAbsolutePath,
	joinCwd,
	parseLsofCwd,
	raceTimeout,
	STAT_TIMEOUT_MS,
	toUriPath,
	type PathFlavor,
	type TargetKind,
} from "./core";

export type CwdSource =
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

function runLsof(pid: number): Promise<string> {
	return new Promise((resolve, reject) => {
		execFile(
			DARWIN_LSOF_PATH,
			["-a", "-d", "cwd", "-p", String(pid), "-Fn"],
			{
				timeout: PROCESS_CWD_TIMEOUT_MS,
				maxBuffer: LSOF_MAX_BUFFER_BYTES,
				windowsHide: true,
			},
			(error, stdout) => (error ? reject(error) : resolve(stdout))
		);
	});
}

async function readProcessCwd(terminal: vscode.Terminal): Promise<string | undefined> {
	try {
		const pid = await terminal.processId;
		if (pid === undefined) {
			return undefined;
		}
		if (process.platform === "darwin") {
			return parseLsofCwd(await runLsof(pid));
		}
		return await fs.promises.readlink(`/proc/${pid}/cwd`);
	} catch {
		return undefined;
	}
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

/** 每次实时解析, 不缓存: 用户随时可能 cd. 前三级取到的目录必须真实存在才采纳. */
export async function resolveTerminalCwd(terminal: vscode.Terminal): Promise<ResolvedCwd> {
	const flavor = hostFlavor();

	const shellCwd = terminal.shellIntegration?.cwd;
	if (shellCwd && (await isDirectory(shellCwd))) {
		return { uri: shellCwd, source: "shellIntegration" };
	}

	const probesProcess = process.platform === "darwin" || process.platform === "linux";
	if (probesProcess && terminal.exitStatus === undefined) {
		const raced = await raceTimeout(readProcessCwd(terminal), PROCESS_CWD_TIMEOUT_MS);
		const processCwd = raced.timedOut ? undefined : raced.value;
		if (processCwd && isAbsolutePath(processCwd, flavor)) {
			const uri = toUri(processCwd, flavor);
			if (await isDirectory(uri)) {
				return { uri, source: "process" };
			}
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
