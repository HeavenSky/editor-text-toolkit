import * as vscode from 'vscode';

/** 二级 Quick Pick 的统一返回值: 上一级据此决定是重新展示还是结束. */
export type PickOutcome = 'back' | 'done';

const BACK_ITEM_ID = 'textToolkit.back';

export interface MenuItem extends vscode.QuickPickItem {
  id: string;
}

/** 所有二级菜单的首项都是同一个"返回", 保证交互一致. */
export function backItem(): MenuItem {
  return {
    id: BACK_ITEM_ID,
    label: `$(arrow-left) ${vscode.l10n.t('Back')}`,
    alwaysShow: true
  };
}

export function isBackItem(item: MenuItem | undefined): boolean {
  return item?.id === BACK_ITEM_ID;
}

/**
 * 展示一级或二级菜单.
 * 约定: 返回 undefined 表示用户按 Esc 取消整个流程; 返回 backItem 表示回到上一级.
 */
export async function showMenu(
  items: MenuItem[],
  placeHolder: string,
  withBack: boolean
): Promise<MenuItem | undefined> {
  return vscode.window.showQuickPick(withBack ? [backItem(), ...items] : items, {
    placeHolder,
    matchOnDescription: true,
    matchOnDetail: true
  });
}
