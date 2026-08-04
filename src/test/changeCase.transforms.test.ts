import * as assert from 'assert';
import { CASE_COMMANDS, getCaseCommand } from '../features/changeCase/transforms';

const EXPECTED_LABELS = [
  'camel',
  'constant',
  'dot',
  'kebab',
  'lower',
  'lowerFirst',
  'no',
  'param',
  'pascal',
  'path',
  'sentence',
  'snake',
  'swap',
  'title',
  'upper',
  'upperFirst'
];

function convert(label: string, input: string): string {
  const command = getCaseCommand(label);
  assert.ok(command, `missing case command: ${label}`);
  return command.transform(input);
}

/** change-case@5 支撑的转换: 期望值来自实测(方案 §2.4). */
const LIBRARY_CASES: Record<string, Record<string, string>> = {
  testString: {
    camel: 'testString',
    constant: 'TEST_STRING',
    dot: 'test.string',
    kebab: 'test-string',
    no: 'test string',
    param: 'test-string',
    pascal: 'TestString',
    path: 'test/string',
    sentence: 'Test string',
    snake: 'test_string',
    title: 'Test String'
  },
  'test-string.value': {
    camel: 'testStringValue',
    constant: 'TEST_STRING_VALUE',
    dot: 'test.string.value',
    kebab: 'test-string-value',
    no: 'test string value',
    param: 'test-string-value',
    pascal: 'TestStringValue',
    path: 'test/string/value',
    sentence: 'Test string value',
    snake: 'test_string_value',
    title: 'Test String Value'
  },
  fooBarBaz42Quux: {
    camel: 'fooBarBaz42Quux',
    constant: 'FOO_BAR_BAZ42_QUUX',
    dot: 'foo.bar.baz42.quux',
    kebab: 'foo-bar-baz42-quux',
    no: 'foo bar baz42 quux',
    param: 'foo-bar-baz42-quux',
    pascal: 'FooBarBaz42Quux',
    path: 'foo/bar/baz42/quux',
    sentence: 'Foo bar baz42 quux',
    snake: 'foo_bar_baz42_quux',
    title: 'Foo Bar Baz42 Quux'
  }
};

/** 本地实现的转换(change-case@5 未提供). */
const LOCAL_CASES: Record<string, Record<string, string>> = {
  testString: {
    lower: 'teststring',
    lowerFirst: 'testString',
    swap: 'TESTsTRING',
    upper: 'TESTSTRING',
    upperFirst: 'TestString'
  },
  'test-string.value': {
    lower: 'test-string.value',
    lowerFirst: 'test-string.value',
    swap: 'TEST-STRING.VALUE',
    upper: 'TEST-STRING.VALUE',
    upperFirst: 'Test-string.value'
  },
  fooBarBaz42Quux: {
    lower: 'foobarbaz42quux',
    lowerFirst: 'fooBarBaz42Quux',
    swap: 'FOObARbAZ42qUUX',
    upper: 'FOOBARBAZ42QUUX',
    upperFirst: 'FooBarBaz42Quux'
  },
  'TEST STRING': {
    lower: 'test string',
    lowerFirst: 'tEST STRING',
    swap: 'test string',
    upper: 'TEST STRING',
    upperFirst: 'TEST STRING'
  }
};

describe('changeCase transforms', () => {
  it('命令表包含 16 项且 label 与顺序固定', () => {
    assert.strictEqual(CASE_COMMANDS.length, 16);
    assert.deepStrictEqual(
      CASE_COMMANDS.map((command) => command.label),
      EXPECTED_LABELS
    );
  });

  it('每项都有非空描述', () => {
    for (const command of CASE_COMMANDS) {
      assert.ok(command.description.length > 0, `empty description: ${command.label}`);
    }
  });

  it('未知 label 返回 undefined', () => {
    assert.strictEqual(getCaseCommand('unknown'), undefined);
  });

  for (const [input, expectations] of Object.entries(LIBRARY_CASES)) {
    describe(`change-case@5 转换 ${JSON.stringify(input)}`, () => {
      for (const [label, expected] of Object.entries(expectations)) {
        it(label, () => assert.strictEqual(convert(label, input), expected));
      }
    });
  }

  for (const [input, expectations] of Object.entries(LOCAL_CASES)) {
    describe(`本地实现转换 ${JSON.stringify(input)}`, () => {
      for (const [label, expected] of Object.entries(expectations)) {
        it(label, () => assert.strictEqual(convert(label, input), expected));
      }
    });
  }

  it('param 与 kebab 等价', () => {
    for (const input of ['testString', 'test-string.value', 'fooBarBaz42Quux', 'TEST STRING']) {
      assert.strictEqual(convert('param', input), convert('kebab', input));
    }
  });

  it('空字符串不抛异常', () => {
    for (const command of CASE_COMMANDS) {
      assert.strictEqual(typeof command.transform(''), 'string');
    }
  });
});
