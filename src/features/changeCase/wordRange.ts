import * as vscode from 'vscode';
import { getAdvanced } from '../../shared/config';

const WORD_CHARACTER_REGEX = /([\w_.\-/$]+)/;
const WORD_CHARACTER_REGEX_WITHOUT_DOT = /([\w_\-/$]+)/;

export function isRangeSimplyCursorPosition(range: vscode.Range): boolean {
  return range.start.line === range.end.line && range.start.character === range.end.character;
}

/**
 * Change Case 对"词"的定义比编辑器更宽: 允许 `_`, `-`, `/`, `$`(以及可配置的 `.`),
 * 所以先取编辑器词范围, 再按上述字符集向左右扩展.
 */
export function getChangeCaseWordRangeAtPosition(
  document: vscode.TextDocument,
  position: vscode.Position
): vscode.Range | undefined {
  const regex = getAdvanced().changeCase.includeDotInCurrentWord
    ? WORD_CHARACTER_REGEX
    : WORD_CHARACTER_REGEX_WITHOUT_DOT;

  const range = document.getWordRangeAtPosition(position);
  if (!range) {
    return undefined;
  }

  let startCharacterIndex = range.start.character - 1;
  while (startCharacterIndex >= 0) {
    const character = document.getText(
      new vscode.Range(range.start.line, startCharacterIndex, range.start.line, startCharacterIndex + 1)
    );
    if (character.search(regex) === -1) {
      break;
    }
    startCharacterIndex -= 1;
  }

  const lineMaxColumn = document.lineAt(range.end.line).range.end.character;
  let endCharacterIndex = range.end.character;
  while (endCharacterIndex < lineMaxColumn) {
    const character = document.getText(
      new vscode.Range(range.end.line, endCharacterIndex, range.end.line, endCharacterIndex + 1)
    );
    if (character.search(regex) === -1) {
      break;
    }
    endCharacterIndex += 1;
  }

  return new vscode.Range(
    range.start.line,
    startCharacterIndex + 1,
    range.end.line,
    endCharacterIndex
  );
}
