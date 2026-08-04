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
