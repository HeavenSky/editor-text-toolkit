export const PLAIN_TEXT_LANGUAGE_ID = 'plaintext';

const BYTES_PER_MB = 1024 * 1024;

/** `log` 与 `.LOG` 都归一为 `.log`, 便于与路径结尾比较. */
export function normalizeExtension(extension: string): string {
  const trimmed = extension.trim().toLowerCase();
  if (trimmed.length === 0) {
    return '';
  }
  return trimmed.startsWith('.') ? trimmed : `.${trimmed}`;
}

export function matchesAutoApplyExtension(
  fsPath: string,
  extensions: readonly string[]
): boolean {
  const normalizedPath = fsPath.toLowerCase();
  return extensions.some((extension) => {
    const normalized = normalizeExtension(extension);
    return normalized.length > 0 && normalizedPath.endsWith(normalized);
  });
}

/** promptSizeMB <= 0 表示关闭体积提示. */
export function shouldPromptForSize(sizeBytes: number, promptSizeMB: number): boolean {
  if (promptSizeMB <= 0) {
    return false;
  }
  return sizeBytes >= promptSizeMB * BYTES_PER_MB;
}

/**
 * VS Code 对本地文件的 `workbench.editorLargeFileConfirmation` 默认值(MB).
 * 超过它时编辑器不再显示文件, 而是换成"文件过大"占位页.
 */
export const DEFAULT_LARGE_FILE_LIMIT_MB = 1024;

/** 与 VS Code 一致用严格大于: 恰好等于上限的文件仍会正常显示. */
export function exceedsEditorSizeLimit(sizeBytes: number, limitMB: number): boolean {
  if (!(limitMB > 0)) {
    return false;
  }
  return sizeBytes > limitMB * BYTES_PER_MB;
}

/** glob 元字符: 含这些字符的路径无法写成"只匹配这一个文件"的 files.associations 键. */
const GLOB_SPECIAL_CHARS = /[*?[\]{}]/;

/**
 * 把绝对路径转成 files.associations 的键.
 *
 * VS Code 按 `fsPath.toLowerCase()` 匹配, 且模式含路径分隔符时才匹配整个路径,
 * 所以这里统一用正斜杠的绝对路径. 无法安全表达时返回 undefined, 调用方退回普通打开.
 */
export function toFileAssociationPattern(fsPath: string): string | undefined {
  const normalized = fsPath.replace(/\\/g, '/');
  if (normalized.length === 0 || !normalized.includes('/') || GLOB_SPECIAL_CHARS.test(normalized)) {
    return undefined;
  }
  return normalized;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 100 ? 0 : 1)} ${units[unitIndex]}`;
}
