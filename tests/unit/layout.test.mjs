import test from 'node:test';
import assert from 'node:assert/strict';
import { validateLayout } from '../../packages/contracts/src/layout.ts';
const pane = paneId => ({ type: 'leaf', paneId });
const split = (first, second, ratio = 0.5) => ({ type: 'split', axis: 'horizontal', ratio, first, second });
test('nested layout preserves pane order and unique view ownership', () => {
  const a = { ...pane('a'), viewInstanceId: 'view' };
  assert.deepEqual([...validateLayout(split(a, pane('b'))).paneIds], ['a', 'b']);
  for (const bad of [split(a,a), split(a,{...a,paneId:'b'}), split(a,pane('b'),1), null])
    assert.throws(() => validateLayout(bad));
});

test('1000 mixed host layout edits preserve surviving pane and view identities', async () => {
  const { edit } = await import('../../packages/host-core/src/workspace/operations.ts');
  const leaf = id => ({ type: 'leaf', paneId: 'p' + id, viewInstanceId: 'v' + id });
  let tree = leaf(0);
  const owners = new Map([['p0', 'v0']]);
  let seed = 4981;
  function pick(length) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return Math.floor(seed / 2 ** 32 * length);
  }
  for (let step = 1; step <= 1000; step++) {
    const ids = [...owners.keys()];
    const target = ids[pick(ids.length)];
    const kind = pick(4);
    let command;
    if (ids.length === 1 || (kind === 0 && ids.length < 12)) {
      const added = leaf(step);
      command = { kind: 'split', axis: pick(2) ? 'vertical' : 'horizontal', leaf: added };
      owners.set(added.paneId, added.viewInstanceId);
    } else if (kind === 1) {
      command = { kind: 'close' };
      owners.delete(target);
    } else if (kind === 2) {
      command = { kind: 'resize', ratio: (10 + pick(81)) / 100 };
    } else {
      command = { kind: 'swap', other: ids[pick(ids.length)] };
    }
    const previous = JSON.stringify(tree);
    const next = edit(tree, target, command);
    assert.equal(JSON.stringify(tree), previous);
    tree = JSON.parse(JSON.stringify(next));
    const actual = new Map();
    function visit(node) {
      if (node.type === 'leaf') actual.set(node.paneId, node.viewInstanceId);
      else { visit(node.first); visit(node.second); }
    }
    validateLayout(tree);
    visit(tree);
    assert.deepEqual(actual, owners);
  }
});
