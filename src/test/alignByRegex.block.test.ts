import * as assert from 'assert';
import { Block, type Eol } from '../features/alignByRegex/block';
import type { Line } from '../features/alignByRegex/line';

const TAB_SIZE = 4;

function concatLineParts(line: Line): string {
  return line.parts.map((part) => part.value).join('');
}

function render(text: string, input: string, eol: Eol = '\n', tabSize = TAB_SIZE): string[] {
  return new Block(text, input, 0, eol)
    .trim()
    .align(tabSize)
    .lines.map(concatLineParts);
}

describe('alignByRegex Block', () => {
  describe('构造(移植上游 Test constructor)', () => {
    const block = new Block('a.a.a\nbb.bb\nccc.\n.ddd\ne..e', '\\.', 0, '\n');

    it('行数与行号', () => {
      assert.strictEqual(block.lines.length, 5);
      assert.deepStrictEqual(
        block.lines.map((line) => line.number),
        [0, 1, 2, 3, 4]
      );
    });

    it('切分结果', () => {
      assert.deepStrictEqual(
        block.lines.map((line) => line.parts.map((part) => part.value)),
        [
          ['a', '.', 'a', '.', 'a'],
          ['bb', '.', 'bb'],
          ['ccc', '.', ''],
          ['', '.', 'ddd'],
          ['e', '.', '', '.', 'e']
        ]
      );
    });

    it('matchCount', () => {
      assert.deepStrictEqual(block.lines.map(Block.matchCount), [2, 1, 1, 1, 2]);
    });
  });

  describe('trim(移植上游 Test trim)', () => {
    it('首个 part 保留一个尾随空格, 中间 part 两侧各留一个, 末尾 part 去掉尾随空白', () => {
      const block = new Block('a   . a   .a\n    bb.bb    ', '\\.', 0, '\n').trim();
      assert.deepStrictEqual(
        block.lines.map((line) => line.parts.map((part) => part.value)),
        [
          ['a ', '.', ' a ', '.', 'a'],
          ['    bb', '.', 'bb']
        ]
      );
    });
  });

  describe('align(移植上游用例)', () => {
    it('Test align', () => {
      const block = new Block('a   . a   .a\n    bb.bb    ', '\\.', 0, '\n').trim().align(TAB_SIZE);
      assert.deepStrictEqual(
        block.lines.map((line) => line.parts.map((part) => part.value)),
        [
          ['a     ', '.', ' a ', '.', 'a'],
          ['    bb', '.', 'bb']
        ]
      );
    });

    it('Test align spacing 2', () => {
      assert.deepStrictEqual(
        render('a    a(aaa)\nb   b(bbbb)\nc  c(c)\nd d(ddddddd)', '\\)'),
        ['a    a(aaa )', 'b   b(bbbb )', 'c  c(c     )', 'd d(ddddddd)']
      );
    });

    it('Ignore non-matching lines', () => {
      assert.deepStrictEqual(
        render(
          'function blah() { "hi there" }\n' +
            '# This function does amazing things the likes of which you have never seen.\n' +
            'function longerfunc() { "hi there" }',
          '\\{'
        ),
        [
          'function blah()       { "hi there" }',
          '# This function does amazing things the likes of which you have never seen.',
          'function longerfunc() { "hi there" }'
        ]
      );
    });

    it('Test tab-size awareness', () => {
      assert.deepStrictEqual(render('a.\n\tb.', '\\.'), [`a${' '.repeat(TAB_SIZE)}.`, '\tb.']);
    });

    it('Markdown table', () => {
      assert.deepStrictEqual(render('I|have|a|table\nIt|is|not|aligned', '\\|'), [
        'I |have|a  |table',
        'It|is  |not|aligned'
      ]);
    });

    it('非法正则不产生任何行(命令因此不做编辑)', () => {
      assert.deepStrictEqual(render('I|have|a|table\nIt|is|not|aligned', '('), []);
    });

    it('0 长度匹配保持原样', () => {
      assert.deepStrictEqual(render('I|have|a|table\nIt|is|not|aligned', '|'), [
        'I|have|a|table',
        'It|is|not|aligned'
      ]);
    });

    it('Unexpected Alignment 2', () => {
      assert.deepStrictEqual(render('a(123) // 123\nbb(45)  // 45\nccc(6)   // 6', '\\('), [
        'a  (123) // 123',
        'bb (45)  // 45',
        'ccc(6)   // 6'
      ]);
    });

    it('CRLF 文本按 \\r\\n 切分', () => {
      assert.deepStrictEqual(render('a = 1;\r\nbbbb = 2;', '=', '\r\n'), ['a    = 1;', 'bbbb = 2;']);
    });
  });

  /**
   * 匹配数不一致时的分层列对齐(方案 §6.5.1).
   * 上游会把"匹配数少的行的行尾长度"计入列宽, A1/A2/A3 因此与上游输出不同.
   */
  describe('匹配数不一致的分层列对齐', () => {
    it('A1 匹配数 1/2/2', () => {
      assert.deepStrictEqual(
        render('x = 111111111;\nyy = 2; zzz = 3;\nw = 4; vvvvv = 5;', '='),
        ['x  = 111111111;', 'yy = 2; zzz   = 3;', 'w  = 4; vvvvv = 5;']
        // 上游: ['x  = 111111111;', 'yy = 2; zzz    = 3;', 'w  = 4; vvvvv  = 5;']
      );
    });

    it('A2 匹配数 1/2, 第二列只有一行 => 不填充', () => {
      assert.deepStrictEqual(render('x = 111111111;\nyy = 2; zzz = 3;', '='), [
        'x  = 111111111;',
        'yy = 2; zzz = 3;'
        // 上游: 'yy = 2; zzz    = 3;'
      ]);
    });

    it('A3 匹配数 1/3/3', () => {
      assert.deepStrictEqual(
        render('a = 9999999999;\nb = 1, c = 2, d = 3;\ne = 11, f = 22, g = 33;', '='),
        ['a = 9999999999;', 'b = 1, c  = 2, d  = 3;', 'e = 11, f = 22, g = 33;']
        // 上游: 'b = 1, c       = 2, d  = 3;'
      );
    });

    it('A4 匹配数一致时与上游逐字符相同', () => {
      assert.deepStrictEqual(render('let a = 1;\nlet bbbb = 22;\nlet cc = 333;', '='), [
        'let a    = 1;',
        'let bbbb = 22;',
        'let cc   = 333;'
      ]);
    });

    it('A5 含无匹配行', () => {
      assert.deepStrictEqual(render('a = 1;\n// comment\nbbbb = 2;', '='), [
        'a    = 1;',
        '// comment',
        'bbbb = 2;'
      ]);
    });

    it('A6 多列匹配数一致', () => {
      assert.deepStrictEqual(render('a = 1, b = 2;\nccc = 3, dddd = 4;', '=|,'), [
        'a   = 1, b    = 2;',
        'ccc = 3, dddd = 4;'
      ]);
    });

    it('上游 Test align spacing 1: 后续列只有一行匹配时不再产生大段填充', () => {
      assert.deepStrictEqual(
        render(
          "I'm gonna pop some tags\n" +
            'Only got twenty dollars in my pocket\n' +
            "I'm, I'm, I'm hunting, looking for a come up\n" +
            'This is fucking awesome.',
          "'"
        ),
        [
          "I'm gonna pop some tags",
          'Only got twenty dollars in my pocket',
          "I'm, I'm, I'm hunting, looking for a come up",
          'This is fucking awesome.'
        ]
        // 上游第 3 行: "I'm, I                 'm, I'm hunting, looking for a come up"
      );
    });

    it('行尾文本永不被填充', () => {
      for (const line of render('x = 111111111;\nyy = 2; zzz = 3;\nw = 4; vvvvv = 5;', '=')) {
        assert.strictEqual(line, line.trimEnd(), `行尾出现多余空格: ${JSON.stringify(line)}`);
      }
    });

    it('正则匹配长度不一致时按最宽匹配对齐', () => {
      assert.deepStrictEqual(render('a => 1;\nbb = 2;', '=>|='), ['a  => 1;', 'bb =  2;']);
    });
  });
});
