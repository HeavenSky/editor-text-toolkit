# Copy a path with line numbers

**English** · [简体中文](../zh/docs/copy-path.md)

This page shows how to shape the reference that `Copy Path With Line Numbers` puts on the clipboard; the file must be saved to disk.

Run it from the editor's right-click menu, from the picker, or as `Text Toolkit: Copy Path With Line Numbers` in the Command Palette:

```text
src/features/diff/core.ts:112-118
```

## Choose how the path is written

`textToolkit.copyPath.pathStyle` sets the path part. The picker also offers every style as a one-off that does not change your settings, and a keybinding can pass `{ "pathStyle": "relative" }` for the same effect.

| Style | Result |
| --- | --- |
| `absolute` (default) | `/Users/you/project/src/app.ts` |
| `relative` | `src/app.ts`; falls back to the absolute path when no workspace folder contains the file |
| `tilde` | `~/project/src/app.ts`; only rewrites the prefix when the file is under your home directory |
| `fileName` | `app.ts` |

## Choose how lines are written

Line numbers come from every cursor and selection; they are deduplicated, sorted, and consecutive lines merge into one fragment. `textToolkit.copyPath.multiLineFormat` picks the shape. For selected lines 3, 4, 8, 12, 13 and 14:

| Format | Output |
| --- | --- |
| `range` (default) | `path:3-4,8,12-14` |
| `list` | `path:3,4,8,12,13,14` |
| `perLine` | `path:3`, `path:4`, … one per line |

To write a fragment as a start line plus a count, turn on the `a+n` form. The same selection then copies as `path:3+2,8,12+3`; single lines stay `a`, and `list` and `perLine` are unaffected because they never produce fragments.

```json
{ "textToolkit.advanced": { "copyPath.useLineCountSyntax": true } }
```

## Change the separator

`textToolkit.copyPath.separator` replaces the `:` between path and lines with any string; with `#L` the reference reads `app.ts#L3-4`.

Untitled documents and documents without a file, such as output channels, cannot be copied; see [Troubleshooting](troubleshooting.md#current-document-is-not-saved-as-a-file).
