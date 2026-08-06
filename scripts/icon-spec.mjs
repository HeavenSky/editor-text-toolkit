/**
 * Editor Text Toolkit 的图标: 上半是 `Aa`, 下半是一组左参差右对齐的文本行。
 *
 * 这个插件的功能面比较宽 —— 复制路径与行号, 大小写转换, 正则对齐, 差异对比, 纯文本模式 ——
 * 图标不试图把五件事都画出来, 而是取其中最有画面感的三件, 让轮廓能被读成"对文本做精确操作":
 *
 * - `Aa` → 大小写转换
 * - 左侧长短不一 → 右侧整齐对齐 → 正则对齐
 * - 中间那条竖线 → 差异对比的中缝, 同时也是对齐的基准线
 *
 * 前景刻意不用单一前景色: 左侧各行用不同颜色表示"处理前"的参差状态, 右侧统一成一种颜色
 * 表示"处理后"的整齐结果, 颜色本身在讲这个变化。
 *
 * 只描述图形, 不做渲染; SVG 与 PNG 都由 `scripts/gen-icon.mjs` 从这份数据生成。
 */
import { SIZE, baseShapes } from './lib/icon-brand.mjs';

const LETTER_UPPER = '#6FD6FF';
const LETTER_LOWER = '#FFC145';
/** 对齐基准线用标点色, 与两侧内容拉开层次。 */
const GUIDE = '#C792EA';
/** 处理前: 每行各不相同。 */
const BEFORE = ['#FF6B60', '#FFC145'];
/** 处理后: 统一。 */
const AFTER = '#4EDD6E';

const segment = (x1, y, x2, stroke, width = 11) => ({
  kind: 'polyline',
  points: [
    [x1, y],
    [x2, y],
  ],
  stroke,
  strokeWidth: width,
});

/** 大写 A: 两撇加一道横杠。 */
const upperA = (x, yTop, yBottom, width, stroke, strokeWidth) => [
  {
    kind: 'polyline',
    points: [
      [x, yBottom],
      [x + width / 2, yTop],
      [x + width, yBottom],
    ],
    stroke,
    strokeWidth,
  },
  segment(
    x + width * 0.22,
    yBottom - (yBottom - yTop) * 0.34,
    x + width * 0.78,
    stroke,
    strokeWidth * 0.8,
  ),
];

/** 小写 a: 一个圆环加右侧竖笔。 */
const lowerA = (cx, cy, radius, stroke, strokeWidth) => [
  { kind: 'ring', cx, cy, outer: radius, inner: radius - strokeWidth, fill: stroke },
  {
    kind: 'polyline',
    points: [
      [cx + radius - strokeWidth / 2, cy - radius + strokeWidth / 2],
      [cx + radius - strokeWidth / 2, cy + radius - strokeWidth / 2],
    ],
    stroke,
    strokeWidth,
  },
];

export const spec = {
  size: SIZE,
  label: 'Editor Text Toolkit',
  shapes: [
    ...baseShapes(),

    // 大小写转换
    ...upperA(58, 60, 112, 40, LETTER_UPPER, 11),
    ...lowerA(126, 96, 22, LETTER_LOWER, 10),

    // 对齐基准线, 兼作差异对比的中缝
    {
      kind: 'polyline',
      points: [
        [104, 134],
        [104, 198],
      ],
      stroke: GUIDE,
      strokeWidth: 8,
    },

    // 处理前长短不一, 处理后右侧对齐
    segment(52, 148, 88, BEFORE[0]),
    segment(120, 148, 204, AFTER),
    segment(52, 176, 74, BEFORE[1]),
    segment(120, 176, 204, AFTER),
  ],
};
