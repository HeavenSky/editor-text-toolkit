# 开发本扩展

[English](../../docs/development.md) · **简体中文**

本页面向修改扩展本身的人，只写 `package.json` 的脚本里看不出来的事。先切换到 `.nvmrc` 指定的 Node 版本，再执行 `npm install`。

## 打包前先跑检查

`npm run package` 会构建 VSIX 并校验包内容，但不会替你跑其他检查。先依次执行：

```bash
npm run typecheck
npm test
npm run check
npm run package
```

`npm run check` 拦的是构建拦不住的问题：缺失的 `package.nls` 条目会原样显示成 `%placeholder%`，缺失的 `l10n` 条目会悄悄回落到英文。缺失条目和无人使用的条目都会让它失败。

## 用 npm 12 安装依赖

npm 12 下，`npm ci` 只接受从 `registry.npmjs.org` 解析出的 lockfile，依赖的安装脚本（`esbuild`、`@vscode/vsce-sign`、`fsevents`）默认不执行。检查、测试和打包都用不到它们。只有本地签名或发布报错时，才用 `npm install-scripts approve <package>` 放行；CI 使用 `.nvmrc` 中 Node 版本自带的 npm，不受影响。

## 添加一种语言

命令标题和设置说明在 `package.nls.json` 与 `package.nls.<locale>.json` 里；运行时提示在 `l10n/bundle.l10n.<locale>.json` 里，以源码中的英文原文作键。添加语言时，把两个中文文件复制成新的 locale 后缀，例如 `package.nls.ja.json` 和 `l10n/bundle.l10n.ja.json`，再翻译其中的值。

## 重新生成截图

`npm run shots` 在 macOS 上驱动一个独立的 VS Code 窗口，把 README 和本指南用到的图片写入 `media/screenshots/`。界面有可见变化后手动执行；它不参与打包和发布。

## 代码在哪里

每个功能位于 `src/features/<name>/`。纯逻辑放在从不 import `vscode` 的文件里，`test/*.test.ts` 可以直接测试。
