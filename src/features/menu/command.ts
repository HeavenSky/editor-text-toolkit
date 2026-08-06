import * as vscode from 'vscode';
import { getCopyPathConfig } from '../../shared/config';
import { isBackItem, showMenu, type MenuItem, type PickOutcome } from '../../shared/quickPick';
import { showAlignMenu } from '../alignByRegex/command';
import { showCaseStylePicker } from '../changeCase/command';
import { copyPathWithLines, PATH_STYLES } from '../copyPath/command';
import type { DiffFeature } from '../diff/command';
import type { PlainTextFeature } from '../plainText/command';
import type { PathStyle } from '../../shared/config';

/**
 * 二级 Quick Pick 规则(全扩展统一):
 * - 一级只列功能分类, 每项的 description 显示该分类当前生效的关键设置;
 * - 二级列该分类下的具体动作, 首项固定为"返回"(shared/quickPick.backItem);
 * - 二级选"返回"回到一级并保留一级的选中位置概念(重新展示一级);
 * - 任何一级按 Esc 直接结束整个流程, 不做任何修改.
 */

const PATH_STYLE_LABELS: Record<PathStyle, () => string> = {
  relative: () => vscode.l10n.t('Relative path'),
  absolute: () => vscode.l10n.t('Absolute path'),
  tilde: () => vscode.l10n.t('Home-relative path (~)'),
  fileName: () => vscode.l10n.t('File name only')
};

/** 二级菜单: 直接选一次性使用的路径风格, 不写回配置. */
async function showCopyPathMenu(withBack: boolean): Promise<PickOutcome> {
  const current = getCopyPathConfig().pathStyle;
  const items: MenuItem[] = [
    {
      id: 'current',
      label: `$(clippy) ${vscode.l10n.t('Copy using current setting')}`,
      description: PATH_STYLE_LABELS[current](),
      alwaysShow: true
    },
    ...PATH_STYLES.map((style) => ({
      id: style,
      label: PATH_STYLE_LABELS[style](),
      description: style === current ? vscode.l10n.t('current setting') : undefined
    }))
  ];

  const picked = await showMenu(items, vscode.l10n.t('Copy path with line numbers'), withBack);
  if (!picked) {
    return 'done';
  }
  if (isBackItem(picked)) {
    return 'back';
  }
  await copyPathWithLines(picked.id === 'current' ? undefined : (picked.id as PathStyle));
  return 'done';
}

export function registerMenuCommand(
  context: vscode.ExtensionContext,
  plainText: PlainTextFeature,
  diff: DiffFeature
): void {
  const categories = (): MenuItem[] => {
    const copyPath = getCopyPathConfig();
    return [
      {
        id: 'copyPath',
        label: `$(clippy) ${vscode.l10n.t('Copy Path With Line Numbers')}`,
        description: `${PATH_STYLE_LABELS[copyPath.pathStyle]()} · ${copyPath.multiLineFormat}`,
        detail: vscode.l10n.t('Copy a path:line reference for the current selection')
      },
      {
        id: 'changeCase',
        label: `$(case-sensitive) ${vscode.l10n.t('Change Case')}`,
        detail: vscode.l10n.t('Convert the selection or the word under the cursor (16 styles)')
      },
      {
        id: 'align',
        label: `$(list-flat) ${vscode.l10n.t('Align by RegEx')}`,
        detail: vscode.l10n.t('Align the selected lines by a regular expression or a template')
      },
      {
        id: 'plainText',
        label: `$(text-size) ${vscode.l10n.t('Plain Text Mode')}`,
        description: plainText.isActiveForActiveEditor() ? vscode.l10n.t('active') : undefined,
        detail: vscode.l10n.t('Strip highlighting and rendering work for large files')
      },
      {
        id: 'diff',
        label: `$(diff) ${vscode.l10n.t('Compare (Diff)')}`,
        description: diff.categoryDescription(),
        detail: vscode.l10n.t('Compare text selections, editors or the clipboard')
      }
    ];
  };

  const runSecondLevel = async (id: string): Promise<PickOutcome> => {
    switch (id) {
      case 'copyPath':
        return showCopyPathMenu(true);
      case 'changeCase':
        return showCaseStylePicker(true);
      case 'align':
        return showAlignMenu(true);
      case 'plainText':
        return plainText.showMenu(true);
      case 'diff':
        return diff.showMenu(true);
      default:
        return 'done';
    }
  };

  context.subscriptions.push(
    vscode.commands.registerCommand('textToolkit.commands', async () => {
      // "返回"时重新展示一级, 直到用户执行了某个动作或按 Esc 取消.
      for (;;) {
        const picked = await showMenu(categories(), vscode.l10n.t('Text Toolkit'), false);
        if (!picked) {
          return;
        }
        if ((await runSecondLevel(picked.id)) === 'done') {
          return;
        }
      }
    })
  );
}
