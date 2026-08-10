import { describe, it } from 'vitest';
import * as assert from 'node:assert';
import { EditableCopyStore } from '../src/features/diff/editableStore';

const LEFT = 'text-toolkit-diff-edit:/abc-e1/left/ll.3-7/service.ts';
const RIGHT = 'text-toolkit-diff-edit:/abc-e1/right/full/Clipboard';

describe('EditableCopyStore (可编辑副本的内容存储)', () => {
  it('会话 id 用注入的时间戳并逐次递增', () => {
    const store = new EditableCopyStore();
    assert.strictEqual(store.nextSessionId(0), '0-e1');
    assert.strictEqual(store.nextSessionId(0), '0-e2');
    // 同一毫秒内连续建立两份副本也不会撞 id.
    assert.notStrictEqual(store.nextSessionId(1), store.nextSessionId(1));
  });

  it('register 一次写入两侧, 版本号从 1 起', () => {
    const store = new EditableCopyStore();
    store.register([LEFT, RIGHT], ['left text', 'right text']);

    assert.strictEqual(store.read(LEFT), 'left text');
    assert.strictEqual(store.read(RIGHT), 'right text');
    assert.strictEqual(store.versionOf(LEFT), 1);
    assert.strictEqual(store.size, 2);
  });

  it('write 覆盖内容并让版本号单调增长', () => {
    const store = new EditableCopyStore();
    store.register([LEFT, RIGHT], ['left text', 'right text']);

    store.write(LEFT, 'edited');
    assert.strictEqual(store.read(LEFT), 'edited');
    assert.strictEqual(store.versionOf(LEFT), 2);
    // 另一侧不受影响.
    assert.strictEqual(store.read(RIGHT), 'right text');
    assert.strictEqual(store.versionOf(RIGHT), 1);
  });

  it('未登记的 URI 读不到内容, 但保存后能读出', () => {
    const store = new EditableCopyStore();
    assert.strictEqual(store.read(LEFT), undefined);
    assert.strictEqual(store.versionOf(LEFT), 0);

    // 窗口重载后被恢复的旧副本标签页保存时会走到这里.
    store.write(LEFT, 'restored');
    assert.strictEqual(store.read(LEFT), 'restored');
    assert.strictEqual(store.versionOf(LEFT), 1);
  });

  it('release 释放内容, 只影响那一侧', () => {
    const store = new EditableCopyStore();
    store.register([LEFT, RIGHT], ['left text', 'right text']);

    store.release(LEFT);
    assert.strictEqual(store.read(LEFT), undefined);
    assert.strictEqual(store.read(RIGHT), 'right text');
    assert.strictEqual(store.size, 1);
  });
});
