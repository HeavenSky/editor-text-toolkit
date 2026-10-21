// 把终端选中文本当作路径打开: 命令入口, 三个入口共用的打开流程, 多候选选择与路径不存在时的输入框.
import * as fs from "fs";
import * as os from "os";
import * as vscode from "vscode";
import { showMenu, type MenuItem } from "../../shared/quickPick";
import { applyTilde } from "../copyPath/core";
import {
	decideDirectoryAction,
	decideOpen,
	dedupeCandidates,
	errorMessage,
	formatPosSuffix,
	isAbsolutePath,
	isOpenable,
	joinCwd,
	MAX_CANDIDATES,
	MAX_SELECTION_LENGTH,
	parseSelection,
	prefillText,
	resolveTargetPath,
	toZeroBasedPosition,
	unicodeAlternatives,
	type Candidate,
	type ResolvedCandidate,
	type TargetKind,
} from "./core";
import {
	cwdSourceLabel,
	cwdToPath,
	hostFlavor,
	resolveTerminalCwd,
	statTarget,
	toUri,
	type ResolvedCwd,
} from "./cwd";
import { registerSelectionLinkProvider } from "./linkProvider";
import { readTerminalSelection } from "./selection";

export const OPEN_SELECTION_COMMAND = "textToolkit.terminal.openSelection";

/** 键是一次打开流程的 cwd 对象, 让同一流程内的候选共用一次 realpath. */
const realCwdCache = new WeakMap<ResolvedCwd, Promise<string | undefined>>();

function realCwdPath(cwd: ResolvedCwd, cwdPath: string): Promise<string | undefined> {
	let cached = realCwdCache.get(cwd);
	if (!cached) {
		cached = fs.promises.realpath(cwdPath).catch(() => undefined);
		realCwdCache.set(cwd, cached);
	}
	return cached;
}

/** 按变体顺序逐个探测, 第一个不是 missing 的胜出; unknown 也就此停止, 免得误开后面的同名文件. */
async function resolveCandidate(c: Candidate, cwd: ResolvedCwd): Promise<ResolvedCandidate> {
	const flavor = hostFlavor();
	const cwdPath = cwd.uri ? cwdToPath(cwd.uri, flavor) : undefined;
	const base = { index: c.index, sourceText: c.sourceText };
	let firstMissing: ResolvedCandidate | undefined;

	for (const variant of c.variants) {
		const absPath = resolveTargetPath(variant, cwdPath, flavor);
		if (absPath === undefined) {
			continue;
		}
		const attempts = [absPath];
		// APFS 查找不区分 NFC/NFD, 只有其他文件系统需要补试另一种形式.
		if (process.platform !== "darwin" && flavor === "posix") {
			attempts.push(...unicodeAlternatives(absPath));
		}
		const climbsUp =
			!isAbsolutePath(variant.path, flavor) && variant.path.split(/[\\/]/).includes("..");
		if (climbsUp && cwdPath !== undefined && cwd.uri?.scheme === "file") {
			const real = await realCwdPath(cwd, cwdPath);
			if (real !== undefined && real !== cwdPath) {
				attempts.push(joinCwd(real, variant.path, flavor));
			}
		}
		for (const attempt of attempts) {
			const { kind, reason } = await statTarget(toUri(attempt, flavor, cwd.uri));
			if (kind !== "missing") {
				return { ...base, target: variant, absPath: attempt, kind, reason };
			}
		}
		firstMissing ??= { ...base, target: variant, absPath, kind: "missing" };
	}
	return firstMissing ?? { ...base, target: c.variants[0], absPath: undefined, kind: "missing" };
}

/** Quick Pick, 提示与输入框共用的显示路径. */
export function displayPath(uri: vscode.Uri): string {
	if (vscode.workspace.getWorkspaceFolder(uri)) {
		const relative = vscode.workspace.asRelativePath(
			uri,
			(vscode.workspace.workspaceFolders?.length ?? 0) > 1
		);
		if (relative !== "") {
			return relative;
		}
	}
	return uri.scheme === "file" ? applyTilde(uri.fsPath, os.homedir()) : uri.fsPath;
}

function candidateDisplayPath(item: ResolvedCandidate, cwd: ResolvedCwd): string {
	return item.absPath === undefined
		? item.target.path
		: displayPath(toUri(item.absPath, hostFlavor(), cwd.uri));
}

function warnInaccessible(item: ResolvedCandidate, cwd: ResolvedCwd): void {
	void vscode.window.showWarningMessage(
		vscode.l10n.t("Cannot access {0}: {1}", candidateDisplayPath(item, cwd), item.reason ?? "")
	);
}

export async function revealDirectory(uri: vscode.Uri): Promise<void> {
	const action = decideDirectoryAction(
		vscode.workspace.getWorkspaceFolder(uri) !== undefined,
		vscode.env.remoteName
	);
	try {
		if (action === "explorer") {
			await vscode.commands.executeCommand("revealInExplorer", uri);
			return;
		}
		if (action === "os") {
			await vscode.commands.executeCommand("revealFileInOS", uri);
			return;
		}
		const openLabel = vscode.l10n.t("Open in New Window");
		const copyLabel = vscode.l10n.t("Copy Path");
		const choice = await vscode.window.showInformationMessage(
			vscode.l10n.t("Folder is outside the current workspace: {0}", displayPath(uri)),
			openLabel,
			copyLabel
		);
		if (choice === openLabel) {
			await vscode.commands.executeCommand("vscode.openFolder", uri, {
				forceNewWindow: true,
			});
		} else if (choice === copyLabel) {
			await vscode.env.clipboard.writeText(uri.fsPath);
			void vscode.window.showInformationMessage(vscode.l10n.t("Copied: {0}", uri.fsPath));
		}
	} catch (error) {
		void vscode.window.showWarningMessage(
			vscode.l10n.t("Cannot access {0}: {1}", displayPath(uri), errorMessage(error))
		);
	}
}

async function openResolved(target: ResolvedCandidate, cwd: ResolvedCwd): Promise<void> {
	if (target.absPath === undefined) {
		return;
	}
	const uri = toUri(target.absPath, hostFlavor(), cwd.uri);
	if (target.kind === "directory") {
		await revealDirectory(uri);
		return;
	}
	const pos = toZeroBasedPosition(target.target.line, target.target.column);
	try {
		if (pos) {
			const at = new vscode.Range(pos.line, pos.character, pos.line, pos.character);
			await vscode.commands.executeCommand("vscode.open", uri, { selection: at });
		} else {
			// 不传 options: 已打开的文件保留原光标位置.
			await vscode.commands.executeCommand("vscode.open", uri);
		}
	} catch {
		void vscode.window.showErrorMessage(vscode.l10n.t("Cannot open {0}.", uri.fsPath));
	}
}

function kindIcon(kind: TargetKind): string {
	switch (kind) {
		case "file":
			return "$(file)";
		case "directory":
			return "$(folder)";
		case "missing":
			return "$(warning)";
		case "unknown":
			return "$(question)";
	}
}

function kindLabel(kind: TargetKind): string {
	switch (kind) {
		case "file":
			return vscode.l10n.t("File");
		case "directory":
			return vscode.l10n.t("Folder");
		case "missing":
			return vscode.l10n.t("Not found");
		case "unknown":
			return vscode.l10n.t("Inaccessible");
	}
}

export async function pickCandidate(
	items: readonly ResolvedCandidate[],
	cwd: ResolvedCwd
): Promise<ResolvedCandidate | undefined> {
	const menu: MenuItem[] = items.map(item => ({
		id: `cand:${item.index}`,
		label: `${kindIcon(item.kind)} ${candidateDisplayPath(item, cwd)}${formatPosSuffix(item.target.line, item.target.column)}`,
		description: kindLabel(item.kind),
		detail: vscode.l10n.t(
			"Selection line {0} · {1}",
			item.index + 1,
			item.absPath ?? item.sourceText
		),
	}));
	const picked = await showMenu(
		menu,
		vscode.l10n.t("Multiple paths found in the selection; pick one to open"),
		false
	);
	return picked && items.find(item => `cand:${item.index}` === picked.id);
}

type InputProbe =
	| { readonly status: "empty" }
	| { readonly status: "unparsable" }
	| { readonly status: "noBase" }
	| { readonly status: "probed"; readonly item: ResolvedCandidate & { absPath: string } };

async function probeInput(value: string, cwd: ResolvedCwd): Promise<InputProbe> {
	if (value === "") {
		return { status: "empty" };
	}
	const [candidate] = parseSelection(value, {
		flavor: hostFlavor(),
		homeDir: os.homedir(),
	}).candidates;
	if (!candidate) {
		return { status: "unparsable" };
	}
	const item = await resolveCandidate(candidate, cwd);
	const { absPath } = item;
	return absPath === undefined
		? { status: "noBase" }
		: { status: "probed", item: { ...item, absPath } };
}

function validationMessage(probe: InputProbe): vscode.InputBoxValidationMessage {
	const { Error: error, Warning: warning, Info: info } = vscode.InputBoxValidationSeverity;
	switch (probe.status) {
		case "empty":
			return { message: vscode.l10n.t("Enter a path"), severity: error };
		case "unparsable":
			return {
				message: vscode.l10n.t("Cannot parse a path from the input"),
				severity: error,
			};
		case "noBase":
			return {
				message: vscode.l10n.t(
					"Cannot determine the terminal working directory; enter an absolute path"
				),
				severity: error,
			};
		case "probed":
			break;
	}
	const abs = probe.item.absPath;
	switch (probe.item.kind) {
		case "missing":
			return { message: vscode.l10n.t("Not found: {0}", abs), severity: error };
		case "unknown":
			return {
				message: vscode.l10n.t("Cannot confirm it exists: {0}", abs),
				severity: warning,
			};
		case "file":
			return { message: vscode.l10n.t("Will open file: {0}", abs), severity: info };
		case "directory":
			return { message: vscode.l10n.t("Will open folder: {0}", abs), severity: info };
	}
}

/** Error 级校验挡住回车; 回车后重新探测, 仍不存在(校验后文件被删的竞态)就带提示再弹一次. */
export async function promptMissing(
	text: string,
	cwd: ResolvedCwd,
	item: ResolvedCandidate | undefined
): Promise<void> {
	const basePrompt =
		cwd.source === "none"
			? vscode.l10n.t(
					"Cannot determine the terminal working directory; enter an absolute path, a ~ path or a file:// URI"
				)
			: vscode.l10n.t(
					"Relative paths resolve against: {0} ({1})",
					displayPath(cwd.uri),
					cwdSourceLabel(cwd.source)
				);
	const probes = new Map<string, Promise<InputProbe>>();
	const probe = (value: string): Promise<InputProbe> => {
		const key = value.trim();
		let cached = probes.get(key);
		if (!cached) {
			cached = probeInput(key, cwd);
			probes.set(key, cached);
		}
		return cached;
	};
	const withValue = (value: string, prompt: string): vscode.InputBoxOptions => ({
		title: vscode.l10n.t("Open Terminal Selection as Path"),
		value,
		valueSelection: [value.length, value.length],
		prompt,
		placeHolder: vscode.l10n.t("Path, optionally with :line[:column]"),
		ignoreFocusOut: true,
		validateInput: async input => validationMessage(await probe(input)),
	});

	let options = withValue(prefillText(item, text), basePrompt);
	for (;;) {
		const value = await vscode.window.showInputBox(options);
		if (value === undefined) {
			return;
		}
		probes.delete(value.trim());
		const result = await probe(value);
		if (result.status !== "probed") {
			options = withValue(value, options.prompt ?? basePrompt);
			continue;
		}
		const { kind, absPath, reason } = result.item;
		if (isOpenable(kind)) {
			await openResolved(result.item, cwd);
			return;
		}
		if (kind === "unknown") {
			void vscode.window.showWarningMessage(
				vscode.l10n.t("Cannot access {0}: {1}", absPath, reason ?? "")
			);
			return;
		}
		options = withValue(value, vscode.l10n.t("Still not found: {0}. {1}", absPath, basePrompt));
	}
}

/** 三个入口共用. */
export async function openTerminalText(terminal: vscode.Terminal, text: string): Promise<void> {
	if (text.length > MAX_SELECTION_LENGTH) {
		void vscode.window.showWarningMessage(
			vscode.l10n.t("The selection is too long to be a path.")
		);
		return;
	}
	const parsed = parseSelection(text, { flavor: hostFlavor(), homeDir: os.homedir() });
	if (parsed.truncated) {
		void vscode.window.showInformationMessage(
			vscode.l10n.t("Only the first {0} lines of the selection are used.", MAX_CANDIDATES)
		);
	}
	const cwd = await resolveTerminalCwd(terminal);
	const resolved = await Promise.all(parsed.candidates.map(c => resolveCandidate(c, cwd)));
	const decision = decideOpen(dedupeCandidates(resolved));
	switch (decision.type) {
		case "open":
			await openResolved(decision.item, cwd);
			return;
		case "inaccessible":
			warnInaccessible(decision.item, cwd);
			return;
		case "prompt":
			await promptMissing(text, cwd, decision.item);
			return;
		case "pick":
			break;
	}
	const picked = await pickCandidate(decision.items, cwd);
	if (!picked) {
		return;
	}
	if (isOpenable(picked.kind)) {
		await openResolved(picked, cwd);
	} else if (picked.kind === "unknown") {
		warnInaccessible(picked, cwd);
	} else {
		await promptMissing(text, cwd, picked);
	}
}

/** 右键菜单可能传 (Terminal, Terminal[]), Terminal 或 Terminal[]; 命令面板与快捷键什么都不传. */
function resolveTerminalArg(arg?: unknown, args?: unknown): vscode.Terminal | undefined {
	const known = vscode.window.terminals;
	const passed = [arg, args].flatMap(x => (Array.isArray(x) ? x : [x]));
	return known.find(terminal => passed.includes(terminal)) ?? vscode.window.activeTerminal;
}

async function openTerminalSelection(arg?: unknown, args?: unknown): Promise<void> {
	const terminal = resolveTerminalArg(arg, args);
	if (!terminal) {
		void vscode.window.showInformationMessage(vscode.l10n.t("No active terminal."));
		return;
	}
	const result = await readTerminalSelection(terminal);
	switch (result.kind) {
		case "text":
			await openTerminalText(terminal, result.text);
			return;
		case "none":
			if (!result.notified) {
				void vscode.window.showInformationMessage(
					vscode.l10n.t("Select text in the terminal first.")
				);
			}
			return;
		case "error":
			void vscode.window.showWarningMessage(
				vscode.l10n.t("Cannot read the terminal selection: {0}", result.message)
			);
			return;
	}
}

export function registerTerminalOpenFeature(context: vscode.ExtensionContext): void {
	const report = (error: unknown): void => {
		void vscode.window.showErrorMessage(
			vscode.l10n.t("Could not open the terminal selection: {0}", errorMessage(error))
		);
	};
	const open = (terminal: vscode.Terminal, text: string): Promise<void> =>
		openTerminalText(terminal, text).catch(report);
	context.subscriptions.push(
		vscode.commands.registerCommand(OPEN_SELECTION_COMMAND, (arg?: unknown, args?: unknown) =>
			openTerminalSelection(arg, args).catch(report)
		)
	);
	registerSelectionLinkProvider(context, open);
}
