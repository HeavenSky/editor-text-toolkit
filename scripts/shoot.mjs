// 功能截图: 在独立的 VS Code 实例里演示各功能并截图, 启动与截图的公共部分见 scripts/lib/shoot-ext.mjs.
// 用法: node scripts/shoot.mjs [输出目录, 默认 artifacts/shots] [--readme] [场景名过滤...]
//   commands       两级选择器的第一级: 五个功能分类
//   change-case    选中一个标识符后打开 Change Case, 每项预览转换结果
//   align-input    选中几行后输入对齐用的正则
//   align-result   按正则对齐后的结果
//   diff           两段选区的对比视图
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, gitInit } from './lib/shoot-ext.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const SERVICE_TS = `import { fetchJson } from './http';

export class UserService {
  private userProfileCache = new Map<string, unknown>();

  async load(id: string) {
    const cached = this.userProfileCache.get(id);
    if (cached) return cached;
    const profile = await fetchJson(\`/users/\${id}\`);
    this.userProfileCache.set(id, profile);
    return profile;
  }
}
`;

// 每行有两处可对齐的位置: 冒号与行尾注释
const DEFAULTS_TS = `export const defaults = {
  host: 'localhost', // dev server
  port: 8080, // HTTP
  requestTimeoutMs: 30000, // per request
  retries: 3, // then give up
  baseUrl: '/api/v1', // REST prefix
};
`;

// 同一文件里的两段配置, 用选区对比
const DEPLOY_YAML = `staging:
  replicas: 2
  image: registry.example.com/web:1.8.0
  memory: 512Mi
  logLevel: debug
  features:
    - search
    - export

production:
  replicas: 6
  image: registry.example.com/web:1.7.3
  memory: 2Gi
  logLevel: info
  features:
    - search
    - export
    - billing
`;

const h = await launch({
  repo: REPO, id: 'ett', port: 9336,
  setup(ws) {
    fs.mkdirSync(path.join(ws, 'src'), { recursive: true });
    fs.writeFileSync(path.join(ws, 'src/user-service.ts'), SERVICE_TS);
    fs.writeFileSync(path.join(ws, 'src/http.ts'), 'export const fetchJson = async (url: string) => url;\n');
    fs.writeFileSync(path.join(ws, 'src/defaults.ts'), DEFAULTS_TS);
    fs.writeFileSync(path.join(ws, 'deploy.yaml'), DEPLOY_YAML);
    fs.writeFileSync(path.join(ws, 'package.json'), '{ "name": "toolkit-demo", "private": true }\n');
    gitInit(ws);
  },
});
const { page } = h;
const editor = page.locator('#workbench\\.parts\\.editor');
const quickInput = page.locator('.quick-input-widget');

/** 整行选中 from..to 行(选区停在 to 行行尾, 不带入下一行) */
async function selectLines(from, to) {
  await h.goto(from, 1);
  for (let i = from; i < to; i++) await page.keyboard.press('Shift+ArrowDown');
  await page.keyboard.press('Shift+End');
  await h.sleep(300);
}

/** 编辑区左上角起宽 1020, 高 height 的区域, 去掉右侧空白; 输入框居中, 仍在区域内 */
async function narrow(height) {
  const b = await editor.boundingBox();
  return { x: b.x, y: b.y, width: Math.min(b.width, 1020), height };
}

try {
  await h.command('View: Close Primary Side Bar', 500);

  if (h.want('commands')) {
    // 不打开文件, 选择器背后是空白的编辑区
    await h.command('Text Toolkit: Show All Commands', 1200);
    await h.shot('commands', { clip: quickInput, pad: 4 });
    await h.escape();
    await h.reset();
  }

  if (h.want('change-case')) {
    await h.openFile('user-service.ts');
    // 选中第 4 行的 userProfileCache
    await h.select(4, 11, 'userProfileCache'.length);
    await h.command('Text Toolkit: Change Case...', 1200);
    await h.shot('change-case', { clip: editor, pad: 0, maxHeight: 420 });
    await h.escape();
    await h.reset();
  }

  if (h.want('align')) {
    await h.openFile('defaults.ts');
    await selectLines(2, 6);
    await h.command('Text Toolkit: Align by RegEx', 1000);
    await h.type(':|//', 600);
    if (h.want('align-input')) await h.shot('align-input', { clip: await narrow(240) });
    await h.press('Enter', 1000);
    await h.goto(8, 1);
    if (h.want('align-result')) await h.shot('align-result', { clip: await narrow(240) });
    // 撤销对齐, 关闭编辑器时不会弹出保存确认
    await h.command('File: Revert File', 800);
    await h.reset();
  }

  if (h.want('diff')) {
    await h.openFile('deploy.yaml');
    await selectLines(2, 8);
    await h.command('Text Toolkit: Select Text for Compare', 1000);
    await selectLines(11, 18);
    await h.command('Text Toolkit: Compare Text with Marked Selection', 2500);
    await h.command('Notifications: Clear All Notifications', 500);
    await h.shot('diff', { clip: editor, pad: 0, maxHeight: 240 });
    await h.reset();
  }
} finally {
  await h.close();
}
