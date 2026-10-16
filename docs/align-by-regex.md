# Align lines by a regular expression

**English** · [简体中文](../zh/docs/align-by-regex.md)

This page shows how to line up selected lines on a separator and how to save the expressions you reuse; you need a selection that covers the lines to align.

## Align a selection

Select the lines, run `Text Toolkit: Align by RegEx`, and enter a regular expression or the name of a saved template. The picker lists your templates next to their patterns, so you do not have to remember a name.

![Entering a regular expression for the selected lines](../media/screenshots/align-input.png)

![The lines aligned on both separators](../media/screenshots/align-result.png)

Whole lines covered by the primary selection are aligned; a selection that ends at column 0 of the next line does not drag that line in. Column widths use your `editor.tabSize`.

The input box pre-fills with the last expression used in this window. To start empty every time:

```json
{ "textToolkit.advanced": { "alignByRegex.rememberLastInput": false } }
```

## Save templates

Templates map a name to an expression in `textToolkit.alignByRegex.templates`:

```json
{ "textToolkit.alignByRegex.templates": { "assign": "=|,|:", "arrow": "=>" } }
```

A keybinding can pass either form directly: `{ "regex": "=" }` or `{ "template": "assign" }`.

## How column widths are measured

Each column is as wide as the longest text before that separator, counted only among the lines that have it:

```text
# before                # after
const a = 1;            const a  = 1;
let bbbb = 22;          let bbbb = 22;
var cc = 333;           var cc   = 333;
```

**The lines do not need the same number of matches.** A short line never widens an unrelated column, and a column only one line reaches is left as it is:

```text
# before                # after
x = 111111111;          x  = 111111111;
yy = 2; zzz = 3;        yy = 2; zzz   = 3;
w = 4; vvvvv = 5;       w  = 4; vvvvv = 5;
```
