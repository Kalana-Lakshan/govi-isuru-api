const test = require('node:test');
const assert = require('node:assert/strict');
const TtlCache = require('../src/utils/ttlCache');

test('expires entries and caps the size', async () => {
  const c = new TtlCache({ ttlMs: 20, max: 2 });
  c.set('a', 1);
  c.set('b', 2);
  c.set('c', 3);
  assert.equal(c.get('a'), undefined); // evicted (oldest)
  assert.equal(c.get('c'), 3);
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(c.get('c'), undefined); // expired
});

test('wrap computes once for concurrent callers', async () => {
  const c = new TtlCache({ ttlMs: 1000 });
  let calls = 0;
  const fn = async () => { calls += 1; await new Promise((r) => setTimeout(r, 10)); return 'x'; };
  const out = await Promise.all([c.wrap('k', fn), c.wrap('k', fn), c.wrap('k', fn)]);
  assert.deepEqual(out, ['x', 'x', 'x']);
  assert.equal(calls, 1);
});

test('wrap does not cache failures', async () => {
  const c = new TtlCache({ ttlMs: 1000 });
  await assert.rejects(c.wrap('k', async () => { throw new Error('down'); }));
  assert.equal(await c.wrap('k', async () => 'ok'), 'ok');
});
