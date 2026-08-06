/**
 * Editor Text Toolkit 的图标: 底座 + 行号槽 + 未对齐的左侧正文 + 对齐列 + 对齐后的右侧内容。
 *
 * 三行右侧内容全部从同一列起始, 对应 Align by RegEx; 左侧长度不一, 表示对齐前的状态。
 * 只描述图形, 不做渲染; SVG 与 PNG 都由 `scripts/gen-icon.mjs` 从这份数据生成。
 */
import { ACCENT_FROM, ACCENT_TO, FOREGROUND, SIZE, baseShapes } from './lib/icon-brand.mjs';

const GUTTER = '#5D6880';
const LEFT_BAR = '#9AA6BF';

const BAR_HEIGHT = 16;
const BAR_RADIUS = 8;

/** 每行: y 为条形上沿, left/right 为左右两侧条形的宽度, accent 表示右侧用强调色。 */
const ROWS = [
  { y: 80, left: 46, right: 52, accent: false },
  { y: 120, left: 30, right: 66, accent: true },
  { y: 160, left: 38, right: 40, accent: false },
];

export const spec = {
  size: SIZE,
  label: 'Editor Text Toolkit',
  shapes: [
    ...baseShapes(),
    // 行号槽
    ...ROWS.map((row) => ({
      kind: 'circle',
      cx: 46,
      cy: row.y + BAR_HEIGHT / 2,
      r: 4.5,
      fill: GUTTER,
    })),
    // 左侧正文: 长度不一, 代表未对齐的内容
    ...ROWS.map((row) => ({
      kind: 'roundedRect',
      x: 68,
      y: row.y,
      w: row.left,
      h: BAR_HEIGHT,
      r: BAR_RADIUS,
      fill: LEFT_BAR,
    })),
    // 对齐列: 三行在同一列对齐
    {
      kind: 'roundedRect',
      x: 122,
      y: 62,
      w: 10,
      h: 132,
      r: 5,
      fill: { kind: 'linear', from: ACCENT_FROM, to: ACCENT_TO, direction: 'vertical' },
    },
    // 右侧内容: 全部从对齐列起始
    ...ROWS.map((row) => ({
      kind: 'roundedRect',
      x: 145,
      y: row.y,
      w: row.right,
      h: BAR_HEIGHT,
      r: BAR_RADIUS,
      fill: row.accent ? ACCENT_FROM : FOREGROUND,
    })),
  ],
};
