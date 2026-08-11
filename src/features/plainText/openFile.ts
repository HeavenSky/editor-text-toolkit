import * as vscode from 'vscode';
import { PLAIN_TEXT_LANGUAGE_ID, toFileAssociationPattern } from './core';
import { guessLanguageId, type LanguageContribution } from './language';

/**
 * 以纯文本模式打开文件, 且不惊动语言扩展.
 *
 * 背景: 文本模型一建好, VS Code 就按它的语言触发 `onLanguage:<id>` 激活事件, 于是打开一个
 * 大 `.ts` 文件会拉起 TypeScript 扩展, 后者加载整个项目并抓取 types —— 这段时间编辑器一直卡在
 * "Activating Extensions...", 文件迟迟不显示. 建好模型之后再 `setTextDocumentLanguage`
 * 已经晚了, 语言必须在模型诞生那一刻就是 plaintext.
 *
 * 做法: 打开前临时往用户设置里写一条只匹配该文件的 `files.associations`, 打开后立刻把语言钉死
 * (钉死之前撤销关联的话, 模型会跳回原语言, 语言扩展照样被激活), 然后撤销这条临时关联.
 * 中途崩溃留下的残条目在下次激活时清理.
 */

const ASSOCIATIONS_SECTION = 'files';
const ASSOCIATIONS_KEY = 'associations';
/** 临时关联写在用户级: 工作区级会去改仓库里的 `.vscode/settings.json`. */
const ASSOCIATIONS_TARGET = vscode.ConfigurationTarget.Global;
const PENDING_ASSOCIATIONS_KEY = 'textToolkit.plainText.pendingAssociations';

export interface PlainTextOpenResult {
  uri: vscode.Uri;
  /** 打开失败时为 undefined. */
  document?: vscode.TextDocument;
  /** 打开前该文件本应使用的语言; 推断不出时为 undefined. */
  originalLanguageId?: string;
}

function associationsConfiguration(): vscode.WorkspaceConfiguration {
  return vscode.workspace.getConfiguration(ASSOCIATIONS_SECTION);
}

function readUserAssociations(): Record<string, string> {
  return associationsConfiguration().get<Record<string, string>>(ASSOCIATIONS_KEY, {});
}

function readGlobalAssociations(): Record<string, string> | undefined {
  return associationsConfiguration().inspect<Record<string, string>>(ASSOCIATIONS_KEY)
    ?.globalValue;
}

function collectLanguageContributions(): LanguageContribution[] {
  const contributions: LanguageContribution[] = [];
  for (const extension of vscode.extensions.all) {
    const languages = extension.packageJSON?.contributes?.languages;
    if (!Array.isArray(languages)) {
      continue;
    }
    for (const language of languages) {
      if (language && typeof language.id === 'string') {
        contributions.push(language as LanguageContribution);
      }
    }
  }
  return contributions;
}

async function addAssociations(
  context: vscode.ExtensionContext,
  patterns: readonly string[]
): Promise<void> {
  const current = readGlobalAssociations();
  const next: Record<string, string> = { ...current };
  for (const pattern of patterns) {
    next[pattern] = PLAIN_TEXT_LANGUAGE_ID;
  }
  const pending = new Set(context.globalState.get<string[]>(PENDING_ASSOCIATIONS_KEY, []));
  for (const pattern of patterns) {
    pending.add(pattern);
  }
  await context.globalState.update(PENDING_ASSOCIATIONS_KEY, [...pending]);
  await associationsConfiguration().update(ASSOCIATIONS_KEY, next, ASSOCIATIONS_TARGET);
}

/** 只摘掉自己写进去的键; 全部摘完后若对象已空则整条设置移除, 不留 `"files.associations": {}`. */
async function removeAssociations(
  context: vscode.ExtensionContext,
  patterns: readonly string[]
): Promise<void> {
  const current = readGlobalAssociations();
  if (current) {
    const next: Record<string, string> = { ...current };
    let changed = false;
    for (const pattern of patterns) {
      if (next[pattern] === PLAIN_TEXT_LANGUAGE_ID) {
        delete next[pattern];
        changed = true;
      }
    }
    if (changed) {
      await associationsConfiguration().update(
        ASSOCIATIONS_KEY,
        Object.keys(next).length > 0 ? next : undefined,
        ASSOCIATIONS_TARGET
      );
    }
  }

  const pending = context.globalState
    .get<string[]>(PENDING_ASSOCIATIONS_KEY, [])
    .filter((pattern) => !patterns.includes(pattern));
  await context.globalState.update(
    PENDING_ASSOCIATIONS_KEY,
    pending.length > 0 ? pending : undefined
  );
}

/** 上次会话异常结束时可能留下临时关联, 激活时清掉. */
export async function cleanUpPendingAssociations(
  context: vscode.ExtensionContext
): Promise<void> {
  const pending = context.globalState.get<string[]>(PENDING_ASSOCIATIONS_KEY, []);
  if (pending.length === 0) {
    return;
  }
  try {
    await removeAssociations(context, pending);
  } catch {
    /* 设置暂时不可写时下次激活再试 */
  }
}

function findOpenDocument(uri: vscode.Uri): vscode.TextDocument | undefined {
  const key = uri.toString();
  return vscode.workspace.textDocuments.find((document) => document.uri.toString() === key);
}

async function openPlainly(uri: vscode.Uri): Promise<PlainTextOpenResult> {
  try {
    const document = await vscode.workspace.openTextDocument(uri);
    return { uri, document, originalLanguageId: document.languageId };
  } catch {
    return { uri };
  }
}

/**
 * 批量打开. 多选时只写一次设置: 一次性挂上全部临时关联, 打开并钉死语言后再一次性撤销.
 * `suppressLanguageActivation` 为 false 时退化成普通打开.
 */
export async function openDocumentsAsPlainText(
  context: vscode.ExtensionContext,
  uris: readonly vscode.Uri[],
  suppressLanguageActivation: boolean
): Promise<PlainTextOpenResult[]> {
  const results = new Map<string, PlainTextOpenResult>();
  const order: string[] = [];
  const viaAssociation: { uri: vscode.Uri; pattern: string; originalLanguageId?: string }[] = [];

  for (const uri of uris) {
    const key = uri.toString();
    if (order.includes(key)) {
      continue;
    }
    order.push(key);
    const opened = findOpenDocument(uri);
    if (opened) {
      // 已经打开过: 模型早就建好, 语言扩展也早已被激活, 临时关联毫无意义.
      results.set(key, { uri, document: opened, originalLanguageId: opened.languageId });
      continue;
    }
    const pattern = suppressLanguageActivation ? toFileAssociationPattern(uri.fsPath) : undefined;
    if (pattern) {
      viaAssociation.push({ uri, pattern });
    } else {
      results.set(key, await openPlainly(uri));
    }
  }

  if (viaAssociation.length > 0) {
    // 语言必须在挂上临时关联之前推断, 否则推出来的只会是 plaintext.
    const contributions = collectLanguageContributions();
    const associations = readUserAssociations();
    for (const target of viaAssociation) {
      target.originalLanguageId = guessLanguageId(target.uri.fsPath, contributions, associations);
    }

    const patterns = viaAssociation.map((target) => target.pattern);
    let associated = true;
    try {
      await addAssociations(context, patterns);
    } catch {
      // 设置不可写(只读配置文件, 受管策略等): 退回普通打开, 慢但不至于打不开.
      associated = false;
    }
    if (!associated) {
      for (const target of viaAssociation) {
        results.set(target.uri.toString(), await openPlainly(target.uri));
      }
      return order
        .map((key) => results.get(key))
        .filter((result): result is PlainTextOpenResult => result !== undefined);
    }
    try {
      for (const target of viaAssociation) {
        const key = target.uri.toString();
        try {
          const document = await vscode.workspace.openTextDocument(target.uri);
          // 钉死语言: 之后撤销关联时模型才不会跳回原语言并激活语言扩展.
          await vscode.languages.setTextDocumentLanguage(document, PLAIN_TEXT_LANGUAGE_ID);
          results.set(key, {
            uri: target.uri,
            document,
            originalLanguageId: target.originalLanguageId
          });
        } catch {
          results.set(key, { uri: target.uri });
        }
      }
    } finally {
      try {
        await removeAssociations(context, patterns);
      } catch {
        /* 撤销失败时残留条目记在 globalState 里, 下次激活再清 */
      }
    }
  }

  return order
    .map((key) => results.get(key))
    .filter((result): result is PlainTextOpenResult => result !== undefined);
}
