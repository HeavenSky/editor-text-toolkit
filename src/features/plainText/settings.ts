import * as vscode from 'vscode';
import { PLAIN_TEXT_LANGUAGE_ID } from './core';

const STORAGE_KEY = 'textToolkit.plainText.previousOverrides';

interface StoredOverrides {
  target: vscode.ConfigurationTarget;
  /**
   * 覆盖前的 `[plaintext]` 语言作用域值.
   * `null` 表示"当时未设置", 还原时写回 undefined 以移除该覆盖 ——
   * globalState 按 JSON 持久化, 直接存 undefined 会让整个键消失.
   */
  values: Record<string, unknown>;
}

export interface ApplyResult {
  applied: number;
  failed: string[];
}

function plainTextConfiguration(): vscode.WorkspaceConfiguration {
  return vscode.workspace.getConfiguration(undefined, { languageId: PLAIN_TEXT_LANGUAGE_ID });
}

function readPreviousValue(
  configuration: vscode.WorkspaceConfiguration,
  key: string,
  target: vscode.ConfigurationTarget
): unknown {
  const inspected = configuration.inspect(key);
  if (!inspected) {
    return undefined;
  }
  return target === vscode.ConfigurationTarget.Workspace
    ? inspected.workspaceLanguageValue
    : inspected.globalLanguageValue;
}

export function isApplied(context: vscode.ExtensionContext): boolean {
  return context.globalState.get<StoredOverrides>(STORAGE_KEY) !== undefined;
}

/**
 * 把生效后的覆盖表以 `[plaintext]` 语言作用域写入设置, 并记录原值以便还原.
 * 逐键 try/catch: 不同 VS Code 版本对"哪些设置可按语言覆盖"的判定不同,
 * 单个键不被接受时不应让整个操作失败.
 */
export async function applyOverrides(
  context: vscode.ExtensionContext,
  overrides: Readonly<Record<string, unknown>>
): Promise<ApplyResult> {
  const target =
    vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0
      ? vscode.ConfigurationTarget.Workspace
      : vscode.ConfigurationTarget.Global;

  const configuration = plainTextConfiguration();
  const previous: Record<string, unknown> = {};
  const failed: string[] = [];
  let applied = 0;

  for (const [key, value] of Object.entries(overrides)) {
    try {
      previous[key] = readPreviousValue(configuration, key, target) ?? null;
      await configuration.update(key, value, target, true);
      applied += 1;
    } catch {
      delete previous[key];
      failed.push(key);
    }
  }

  // 重复进入时保留最早记录的原值, 避免用"已被我们改过的值"覆盖真正的原值.
  if (!isApplied(context) && applied > 0) {
    await context.globalState.update(STORAGE_KEY, { target, values: previous });
  }

  return { applied, failed };
}

/** 还原 applyOverrides 记录的原值; 原值为 null(当时未设置)时移除该覆盖. */
export async function restoreOverrides(context: vscode.ExtensionContext): Promise<number> {
  const stored = context.globalState.get<StoredOverrides>(STORAGE_KEY);
  if (!stored) {
    return 0;
  }

  const configuration = plainTextConfiguration();
  let restored = 0;
  for (const [key, value] of Object.entries(stored.values)) {
    try {
      await configuration.update(key, value === null ? undefined : value, stored.target, true);
      restored += 1;
    } catch {
      /* 该键已不再可写(例如设置被重命名), 跳过 */
    }
  }

  await context.globalState.update(STORAGE_KEY, undefined);
  return restored;
}
