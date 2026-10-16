# Develop the extension

**English** · [简体中文](../zh/docs/development.md)

This page is for working on the extension itself: it covers what the `package.json` scripts do not tell you. Use the Node version from `.nvmrc` and run `npm install` first.

## Run the checks before packaging

`npm run package` builds the VSIX and checks its contents, but it does not run the other checks for you. Run them first:

```bash
npm run typecheck
npm test
npm run check
npm run package
```

`npm run check` catches what a build cannot: a missing `package.nls` entry renders as a raw `%placeholder%`, and a missing `l10n` entry silently falls back to English. It fails on missing entries and on unused ones.

## Install dependencies with npm 12

With npm 12, `npm ci` only accepts a lockfile resolved from `registry.npmjs.org`, and dependency install scripts (`esbuild`, `@vscode/vsce-sign`, `fsevents`) are skipped by default. None of them is needed to check, test or package. Approve one with `npm install-scripts approve <package>` only if signing or publishing locally fails; CI uses the npm bundled with the Node version in `.nvmrc` and is not affected.

## Add a language

Command titles and setting descriptions live in `package.nls.json` and `package.nls.<locale>.json`; runtime messages live in `l10n/bundle.l10n.<locale>.json`, keyed by the English text in the source. To add a language, copy both Chinese files to the new locale suffix, for example `package.nls.ja.json` and `l10n/bundle.l10n.ja.json`, and translate the values.

## Refresh the screenshots

`npm run shots` drives a separate VS Code window on macOS and writes the images used by the README and this guide to `media/screenshots/`. Run it by hand after a visible change; it is not part of packaging or publishing.

## Where the code lives

Each feature lives in `src/features/<name>/`. Pure logic sits in files that never import `vscode`, so `test/*.test.ts` can test it directly.
