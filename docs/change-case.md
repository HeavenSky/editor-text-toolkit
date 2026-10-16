# Convert case

**English** · [简体中文](../zh/docs/change-case.md)

This page lists the 16 styles `Change Case...` offers and how it decides what text to convert; it works on any editor with a selection or a cursor in a word.

## Pick a style with a preview

`Text Toolkit: Change Case...` opens the style picker and converts every selection at once. With a single-line selection each entry previews the converted text, so you see the result before you apply it.

![Change Case previews every style for the selection](../media/screenshots/change-case.png)

To skip the picker, bind a key with a style argument, for example `{ "style": "kebab" }`; see [Find commands and bind keys](commands-and-keybindings.md#bind-keys-with-arguments).

## The 16 styles

Applied to the input `fooBar baz-qux`:

| Style | Result | Notes |
| --- | --- | --- |
| `camel` | `fooBarBazQux` | |
| `pascal` | `FooBarBazQux` | |
| `snake` | `foo_bar_baz_qux` | |
| `constant` | `FOO_BAR_BAZ_QUX` | |
| `kebab` | `foo-bar-baz-qux` | |
| `param` | `foo-bar-baz-qux` | alias of `kebab` |
| `dot` | `foo.bar.baz.qux` | |
| `path` | `foo/bar/baz/qux` | |
| `no` | `foo bar baz qux` | lower case, space separated |
| `sentence` | `Foo bar baz qux` | first character uppercased |
| `title` | `Foo Bar Baz Qux` | every word capitalized |
| `lower` | `foobar baz-qux` | whole string, separators untouched |
| `upper` | `FOOBAR BAZ-QUX` | whole string, separators untouched |
| `lowerFirst` | `fooBar baz-qux` | only the first character |
| `upperFirst` | `FooBar baz-qux` | only the first character |
| `swap` | `FOObAR BAZ-QUX` | every character's case reversed |

## What counts as the word under the cursor

With no selection, the word under the cursor is converted, and it is wider than the editor's own word: `_`, `-`, `/` and `$` always count as word characters, so `foo_bar-baz` converts as one unit. The `.` does not count by default; turn it on and a cursor inside `foo_bar.baz` converts the whole thing instead of just `baz`:

```json
{ "textToolkit.advanced": { "changeCase.includeDotInCurrentWord": true } }
```

Multi-line selections are split on the document's own line ending, so an LF file on Windows keeps its lines.
