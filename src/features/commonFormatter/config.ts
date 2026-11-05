// 校验通用格式化配置, 应用平台覆盖并读取扩展宿主环境.
export const DEFAULT_TIMEOUT_MS = 5000;

export interface FormatterExecution {
	command: string;
	args: string[];
	cwd: string;
	env: Record<string, string | null>;
	timeout: number;
}

export interface FormatterRule extends FormatterExecution {
	name: string;
	languages: string[];
	enabled: boolean;
}

export interface FormatterInvocation extends Omit<FormatterExecution, "env"> {
	env: NodeJS.ProcessEnv;
}

const EXECUTION_KEYS = ["command", "args", "cwd", "env", "timeout"] as const;
const PLATFORMS = ["windows", "linux", "osx"] as const;
const RULE_KEYS = ["name", "languages", "enabled", ...EXECUTION_KEYS, ...PLATFORMS];

function object(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalid(label: string, field: string, reason: string): never {
	throw new Error(`commonFormatter.list: ${label}.${field} ${reason}`);
}

function validateExecution(raw: Record<string, unknown>, label: string): void {
	for (const field of ["command", "cwd"] as const) {
		if (
			raw[field] !== undefined &&
			(typeof raw[field] !== "string" || !raw[field].trim() || raw[field].includes("\0"))
		) {
			invalid(label, field, "必须是非空且不含 NUL 的字符串");
		}
	}
	if (
		raw.args !== undefined &&
		(!Array.isArray(raw.args) || raw.args.some(v => typeof v !== "string" || v.includes("\0")))
	) {
		invalid(label, "args", "必须是字符串数组, 每个元素是一个独立参数且不含 NUL");
	}
	if (
		raw.timeout !== undefined &&
		(!Number.isSafeInteger(raw.timeout) ||
			(raw.timeout as number) <= 0 ||
			(raw.timeout as number) > 2_147_483_647)
	) {
		invalid(label, "timeout", "必须是 1 到 2147483647 之间的整数, 单位毫秒");
	}
	if (raw.env !== undefined) {
		if (!object(raw.env)) invalid(label, "env", "必须是对象");
		for (const [key, value] of Object.entries(raw.env)) {
			if (
				!key ||
				/[=\0]/.test(key) ||
				(value !== null && (typeof value !== "string" || value.includes("\0")))
			) {
				invalid(label, `env.${key}`, "必须是字符串或 null, 变量名不得为空或包含 = 和 NUL");
			}
		}
	}
}

export function loadFormatterRules(raw: unknown, platform: NodeJS.Platform): FormatterRule[] {
	if (!Array.isArray(raw)) throw new Error("commonFormatter.list 必须是数组");
	const names = new Set<string>();
	return raw.map((value: unknown, index) => {
		const label = `[${index}]`;
		if (!object(value)) invalid(label, "配置项", "必须是对象");
		for (const key of Object.keys(value)) {
			if (!RULE_KEYS.includes(key)) invalid(label, key, "不是支持的字段");
		}
		if (typeof value.name !== "string" || !value.name.trim())
			invalid(label, "name", "必须是非空字符串");
		const name = value.name.trim();
		if (names.has(name)) invalid(label, "name", `重复: ${name}`);
		names.add(name);
		if (
			!Array.isArray(value.languages) ||
			value.languages.length === 0 ||
			value.languages.some(v => typeof v !== "string" || !/^[\w+.-]+$/.test(v))
		) {
			invalid(name, "languages", "必须是非空的 VS Code language ID 数组");
		}
		if (value.enabled !== undefined && typeof value.enabled !== "boolean")
			invalid(name, "enabled", "必须是布尔值");
		if (typeof value.command !== "string") invalid(name, "command", "是必填字段");
		validateExecution(value, name);
		for (const os of PLATFORMS) {
			const override = value[os];
			if (override === undefined) continue;
			if (!object(override)) invalid(name, os, "必须是对象");
			for (const key of Object.keys(override)) {
				if (!(EXECUTION_KEYS as readonly string[]).includes(key))
					invalid(name, `${os}.${key}`, "不允许在平台块中覆盖");
			}
			validateExecution(override, `${name}.${os}`);
		}
		const os =
			platform === "win32"
				? "windows"
				: platform === "darwin"
					? "osx"
					: platform === "linux"
						? "linux"
						: undefined;
		const override = (os ? value[os] : undefined) as Partial<FormatterExecution> | undefined;
		const merged = { ...value, ...override };
		return {
			name,
			languages: value.languages as string[],
			enabled: value.enabled === undefined ? true : (value.enabled as boolean),
			command: merged.command as string,
			args: (merged.args as string[] | undefined) ?? [],
			cwd: (merged.cwd as string | undefined) ?? "${fileDirname}",
			env: { ...(value.env as FormatterExecution["env"] | undefined), ...override?.env },
			timeout: (merged.timeout as number | undefined) ?? DEFAULT_TIMEOUT_MS,
		};
	});
}

export function selectFormatter(
	rules: readonly FormatterRule[],
	languageId: string
): FormatterRule | undefined {
	return rules.find(rule => rule.enabled && rule.languages.includes(languageId));
}

export function readHostEnvironment(): NodeJS.ProcessEnv {
	return { ...process.env };
}

export function mergeEnvironment(
	base: NodeJS.ProcessEnv,
	overrides: FormatterExecution["env"],
	platform: NodeJS.Platform
): NodeJS.ProcessEnv {
	const result: NodeJS.ProcessEnv = Object.create(null);
	for (const [key, value] of [...Object.entries(base), ...Object.entries(overrides)]) {
		if (platform === "win32") {
			for (const existing of Object.keys(result)) {
				if (existing.toLowerCase() === key.toLowerCase()) delete result[existing];
			}
		}
		if (value === null || value === undefined) delete result[key];
		else result[key] = value;
	}
	return result;
}
