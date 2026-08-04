import * as esbuild from 'esbuild';

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');
const test = process.argv.includes('--test');

/** 测试入口逐个列出: 纯逻辑模块不 import vscode, 因此可直接被 mocha 运行. */
const TEST_ENTRY_POINTS = [
  'src/test/copyPath.core.test.ts',
  'src/test/changeCase.transforms.test.ts',
  'src/test/alignByRegex.block.test.ts',
  'src/test/plainText.core.test.ts',
  'src/test/advanced.test.ts'
];

/** change-case@5 是纯 ESM, 扩展宿主是 CJS, 因此必须 bundle 成 cjs 才能被 require. */
const shared = {
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node18',
  external: ['vscode'],
  logLevel: 'info'
};

const extensionOptions = {
  ...shared,
  entryPoints: ['src/extension.ts'],
  outfile: 'out/extension.js',
  sourcemap: !production,
  minify: production
};

const testOptions = {
  ...shared,
  entryPoints: TEST_ENTRY_POINTS,
  outdir: 'out/test',
  sourcemap: true
};

const targets = test ? [testOptions] : [extensionOptions];

if (watch) {
  for (const options of targets) {
    const context = await esbuild.context(options);
    await context.watch();
  }
} else {
  await Promise.all(targets.map((options) => esbuild.build(options)));
}
