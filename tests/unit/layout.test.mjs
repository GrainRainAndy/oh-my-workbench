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
