// Runs the real AppSync resolvers against the in-memory simulator.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createSimBackend } from '../devsim/backend.js';
import { clock } from '../devsim/appsync-utils.js';
import { EVENT_SETTINGS } from '../amplify/settings.ts';

const CENTER = { lat: 35.0757663, lng: 33.313154 };
// Tuesday 27 Oct 2026, 12:00 UTC - before the event closes
const BEFORE_EVENT = Date.parse('2026-10-27T12:00:00Z');

// A dummy group code; the real one only exists in the Amplify console.
const ENV = { ...EVENT_SETTINGS, GROUP_CODE: 'TESTCODE' };

let api;
beforeEach(() => {
  clock.offsetMs = BEFORE_EVENT - Date.now();
  api = createSimBackend({ env: ENV });
});

const add = (extra = {}) =>
  api.call('createEntry', { groupCode: 'TESTCODE', consent: true, ...CENTER, ...extra });

async function rejects(p, type) {
  await assert.rejects(p, (e) => {
    assert.equal(e.errorType, type, `expected ${type}, got ${e.errorType}: ${e.message}`);
    return true;
  });
}

test('createEntry returns an id and a WORD-123 edit code, stored with TTL', async () => {
  const r = await add({ names: ' Maria & Nikos ', apartment: '101' });
  assert.match(r.editCode, /^[A-Z]+-\d{3}$/);
  const item = api.table.get(r.id);
  assert.equal(item.editCode, r.editCode);
  assert.equal(item.names, 'Maria & Nikos');
  assert.equal(item.expiresAt, Date.parse(EVENT_SETTINGS.DELETE_AT) / 1000);
  assert.equal(item.buzzer, undefined, 'empty optional fields are not stored');
});

test('createEntry validates group code, consent, area and lengths', async () => {
  await rejects(add({ groupCode: 'WRONG' }), 'BAD_GROUP_CODE');
  await rejects(add({ consent: false }), 'CONSENT_REQUIRED');
  await rejects(add({ lat: 35.09 }), 'OUTSIDE_AREA');
  await rejects(add({ lng: 33.30 }), 'OUTSIDE_AREA');
  await rejects(add({ notes: 'x'.repeat(201) }), 'TOO_LONG');
  await add({ notes: 'x'.repeat(200) });
  await add({ groupCode: ' testcode ' }); // case and spaces ignored
  assert.equal(api.table.size, 2);
});

test('without the group code only locations are returned; never edit codes', async () => {
  await add({ names: 'Maria', notes: 'side gate', apartment: '1', buzzer: 'A1' });
  const anon = await api.call('listPins', {});
  assert.equal(anon.groupCodeOk, false);
  assert.deepEqual(Object.keys(anon.pins[0]).sort(), ['id', 'lat', 'lng']);
  const wrong = await api.call('listPins', { groupCode: 'nope' });
  assert.equal(wrong.groupCodeOk, false);
  assert.equal(wrong.pins[0].names, undefined);
  const ok = await api.call('listPins', { groupCode: 'testcode' });
  assert.equal(ok.groupCodeOk, true);
  assert.equal(ok.pins[0].names, 'Maria');
  assert.equal(ok.pins[0].notes, 'side gate');
  for (const res of [anon, ok]) assert.ok(!JSON.stringify(res).includes('editCode'));
});

test('acceptance: two apartments at one location; each controls only their own', async () => {
  const a = await add({ apartment: '101', names: 'Anna' });
  const b = await add({ apartment: '202', names: 'Babis' });
  let list = await api.call('listPins', { groupCode: 'TESTCODE' });
  assert.equal(list.pins.length, 2);

  // B uses B's code on A's entry -> refused
  await rejects(api.call('updateEntry', { id: a.id, editCode: b.editCode, ...CENTER, apartment: 'hacked' }), 'WRONG_CODE');
  await rejects(api.call('deleteEntry', { id: a.id, editCode: b.editCode }), 'WRONG_CODE');
  assert.equal(api.table.get(a.id).apartment, '101');

  // A removes theirs; B's remains
  assert.equal(await api.call('deleteEntry', { id: a.id, editCode: a.editCode }), true);
  list = await api.call('listPins', { groupCode: 'TESTCODE' });
  assert.deepEqual(list.pins.map((p) => p.apartment), ['202']);
});

test('edit code is forgiving about case, spaces and the dash', async () => {
  const a = await add();
  const [word, num] = a.editCode.split('-');
  for (const variant of [a.editCode.toLowerCase(), `${word} ${num}`, `${word}${num}`]) {
    const pin = await api.call('getEntryForEdit', { id: a.id, editCode: variant });
    assert.equal(pin.id, a.id);
    assert.equal(pin.editCode, undefined, 'the code itself is never returned');
  }
});

test('updateEntry saves, clears emptied fields, moves the pin and validates', async () => {
  const a = await add({ names: 'Anna', notes: 'ring twice' });
  const moved = { lat: CENTER.lat + 0.001, lng: CENTER.lng - 0.001 };
  const pin = await api.call('updateEntry', { id: a.id, editCode: a.editCode, ...moved, names: 'Anna & Kostas', notes: '   ' });
  assert.equal(pin.names, 'Anna & Kostas');
  assert.equal(pin.notes, null);
  assert.equal(pin.lat, moved.lat);
  assert.equal(api.table.get(a.id).notes, undefined);
  assert.equal(api.table.get(a.id).editCode, a.editCode, 'code unchanged');
  await rejects(api.call('updateEntry', { id: a.id, editCode: a.editCode, lat: 36, lng: 33.31 }), 'OUTSIDE_AREA');
  await rejects(api.call('updateEntry', { id: a.id, editCode: a.editCode, ...CENTER, names: 'x'.repeat(61) }), 'TOO_LONG');
});

test('5 wrong codes lock the entry for 15 minutes, even for the right code', async () => {
  const a = await add();
  const tryWrong = () => api.call('getEntryForEdit', { id: a.id, editCode: 'BAT-000' === a.editCode ? 'CAT-000' : 'BAT-000' });
  const messages = [];
  for (let i = 0; i < 5; i += 1) {
    await assert.rejects(tryWrong(), (e) => (messages.push(e.message), e.errorType === 'WRONG_CODE'));
  }
  assert.match(messages[0], /4 tries left/);
  assert.match(messages[3], /1 tries left/);
  await rejects(api.call('getEntryForEdit', { id: a.id, editCode: a.editCode }), 'LOCKED');
  await rejects(api.call('deleteEntry', { id: a.id, editCode: a.editCode }), 'LOCKED');

  clock.offsetMs += 14 * 60 * 1000;
  await rejects(api.call('getEntryForEdit', { id: a.id, editCode: a.editCode }), 'LOCKED');
  clock.offsetMs += 61 * 1000;
  const pin = await api.call('getEntryForEdit', { id: a.id, editCode: a.editCode });
  assert.equal(pin.id, a.id);
});

test('a correct code resets the attempt counter', async () => {
  const a = await add();
  const wrong = a.editCode === 'BAT-000' ? 'CAT-000' : 'BAT-000';
  for (let i = 0; i < 4; i += 1) await rejects(api.call('getEntryForEdit', { id: a.id, editCode: wrong }), 'WRONG_CODE');
  await api.call('getEntryForEdit', { id: a.id, editCode: a.editCode });
  for (let i = 0; i < 4; i += 1) await rejects(api.call('getEntryForEdit', { id: a.id, editCode: wrong }), 'WRONG_CODE');
  await api.call('updateEntry', { id: a.id, editCode: a.editCode, ...CENTER, names: 'ok' });
  assert.equal(api.table.get(a.id).attempts, undefined);
});

test('parallel guesses cannot exceed 5 per window (atomic attempt counter)', async () => {
  const { execute } = api;
  const a = await add();
  // Simulate 20 requests that all loaded the entry before any of them counted an attempt.
  const loadEntry = await import('../amplify/data/resolvers/loadEntry.js');
  const countAttempt = await import('../amplify/data/resolvers/countAttempt.js');
  const ctxs = Array.from({ length: 20 }, () => ({ args: { id: a.id, editCode: 'X' }, env: ENV, stash: {} }));
  for (const ctx of ctxs) {
    ctx.result = execute(loadEntry.request(ctx));
    loadEntry.response(ctx);
  }
  // The first counts a new window; others then race on the window/attempts condition.
  let counted = 0;
  for (const ctx of ctxs) {
    // After the first write, a racing request would have read the newer item; re-load like a retry would.
    if (counted > 0) {
      ctx.result = execute(loadEntry.request(ctx));
      try { loadEntry.response(ctx); } catch { continue; }
    }
    try {
      ctx.result = execute(countAttempt.request(ctx));
      ctx.error = undefined;
    } catch {
      ctx.error = { type: 'DynamoDB:ConditionalCheckFailedException', message: 'failed' };
    }
    try { countAttempt.response(ctx); counted += 1; } catch { /* BUSY */ }
  }
  assert.equal(counted, 5);

  // Stale contexts (loaded before the window started) can never write.
  const stale = ctxs[19];
  stale.stash = {};
  stale.result = { ...api.table.get(a.id), attempts: 0, attemptWindowStart: undefined };
  loadEntry.response(stale);
  assert.throws(() => execute(countAttempt.request(stale)));
});

test('after HIDE_AT the map is empty and nothing can be changed', async () => {
  const a = await add({ names: 'Anna' });
  clock.offsetMs = Date.parse(EVENT_SETTINGS.HIDE_AT) - Date.now() + 1000;
  const list = await api.call('listPins', { groupCode: 'TESTCODE' });
  assert.deepEqual(list, { groupCodeOk: false, closed: true, pins: [] });
  await rejects(add(), 'CLOSED');
  await rejects(api.call('updateEntry', { id: a.id, editCode: a.editCode, ...CENTER }), 'CLOSED');
  await rejects(api.call('deleteEntry', { id: a.id, editCode: a.editCode }), 'CLOSED');
});

test('unknown entry id is reported as NOT_FOUND', async () => {
  await rejects(api.call('getEntryForEdit', { id: 'missing', editCode: 'BAT-123' }), 'NOT_FOUND');
});

// ---------- regression tests for the 29 Oct audit ----------

test('an edit-code guess racing a delete does not re-create the entry', async () => {
  const loadEntry = await import('../amplify/data/resolvers/loadEntry.js');
  const countAttempt = await import('../amplify/data/resolvers/countAttempt.js');
  const a = await add();
  const ctx = { args: { id: a.id, editCode: 'X' }, env: ENV, stash: {} };
  ctx.result = api.execute(loadEntry.request(ctx));
  loadEntry.response(ctx); // the guess has loaded the entry...
  await api.call('deleteEntry', { id: a.id, editCode: a.editCode }); // ...then the owner deletes it
  assert.throws(() => api.execute(countAttempt.request(ctx)), 'conditional write must fail');
  assert.equal(api.table.size, 0, 'no ghost item without coordinates');
});

test('listPins skips rows without coordinates instead of failing', async () => {
  await add({ names: 'Real' });
  api.table.set('broken', { id: 'broken', attempts: 1, attemptWindowStart: 1 });
  const list = await api.call('listPins', { groupCode: 'TESTCODE' });
  assert.deepEqual(list.pins.map((p) => p.names), ['Real']);
});

test('without the group code, real entry ids are not revealed', async () => {
  const a = await add();
  const b = await add({ lat: CENTER.lat + 0.001 });
  const anon = await api.call('listPins', {});
  const ids = anon.pins.map((p) => p.id);
  assert.ok(!ids.includes(a.id) && !ids.includes(b.id));
  assert.equal(new Set(ids).size, 2, 'placeholder ids are unique');
  const ok = await api.call('listPins', { groupCode: 'TESTCODE' });
  assert.deepEqual(ok.pins.map((p) => p.id).sort(), [a.id, b.id].sort());
});

test('each repeated lockout doubles the window; a correct code resets it', async () => {
  const a = await add();
  const wrong = a.editCode === 'BAT-000' ? 'CAT-000' : 'BAT-000';
  const guess = (code = wrong) => api.call('getEntryForEdit', { id: a.id, editCode: code });
  const fiveWrong = async () => {
    for (let i = 0; i < 5; i += 1) await rejects(guess(), 'WRONG_CODE');
  };

  await fiveWrong(); // window 1: 15 min
  await rejects(guess(a.editCode), 'LOCKED');
  clock.offsetMs += 15 * 60 * 1000 + 1000;

  await fiveWrong(); // window 2: 30 min
  clock.offsetMs += 20 * 60 * 1000;
  await assert.rejects(guess(a.editCode), (e) => e.errorType === 'LOCKED' && e.errorInfo.waitMinutes === 10);
  clock.offsetMs += 10 * 60 * 1000 + 1000;

  await fiveWrong(); // window 3: 60 min
  assert.equal(api.table.get(a.id).strikes, 2);
  clock.offsetMs += 59 * 60 * 1000;
  await rejects(guess(a.editCode), 'LOCKED');
  clock.offsetMs += 2 * 60 * 1000;

  await guess(a.editCode); // correct: everything cleared
  const item = api.table.get(a.id);
  assert.equal(item.strikes, undefined);
  assert.equal(item.attempts, undefined);
});

test('a window that ends without a lockout does not add a strike', async () => {
  const a = await add();
  const wrong = a.editCode === 'BAT-000' ? 'CAT-000' : 'BAT-000';
  for (let i = 0; i < 2; i += 1) await rejects(api.call('getEntryForEdit', { id: a.id, editCode: wrong }), 'WRONG_CODE');
  clock.offsetMs += 16 * 60 * 1000;
  await rejects(api.call('getEntryForEdit', { id: a.id, editCode: wrong }), 'WRONG_CODE');
  assert.equal(api.table.get(a.id).strikes, 0);
  assert.equal(api.table.get(a.id).attempts, 1);
});

test('edit codes come from util.autoId, not Math.random, and cover the code space', async () => {
  const realRandom = Math.random;
  Math.random = () => 0; // if codes used Math.random they would all be identical
  try {
    const codes = [];
    for (let i = 0; i < 400; i += 1) codes.push((await add()).editCode);
    for (const c of codes) assert.match(c, /^[A-Z]+-\d{3}$/);
    const words = new Set(codes.map((c) => c.split('-')[0]));
    assert.ok(words.size > 80, `expected most of the 100 words, got ${words.size}`);
    assert.ok(new Set(codes).size > 390, 'codes are almost all distinct');
  } finally {
    Math.random = realRandom;
  }
});

test('area is 1.5 km x 1.5 km: 700 m from the centre is accepted, 800 m is rejected', async () => {
  const dLat700 = 700 / 111_000; // ~0.0063 degrees of latitude
  const dLat800 = 800 / 111_000;
  await add({ lat: CENTER.lat + dLat700 });
  await add({ lat: CENTER.lat - dLat700 });
  await rejects(add({ lat: CENTER.lat + dLat800 }), 'OUTSIDE_AREA');
  await rejects(add({ lat: CENTER.lat - dLat800 }), 'OUTSIDE_AREA');
  const dLng700 = 700 / (111_000 * Math.cos((CENTER.lat * Math.PI) / 180));
  const dLng800 = 800 / (111_000 * Math.cos((CENTER.lat * Math.PI) / 180));
  await add({ lng: CENTER.lng + dLng700 });
  await rejects(add({ lng: CENTER.lng + dLng800 }), 'OUTSIDE_AREA');
  await rejects(add({ lng: CENTER.lng - dLng800 }), 'OUTSIDE_AREA');
});

// ---------- superuser code ----------

const SUPER = 'GHOST-ADMIN-2026-XYZ';
const superApi = () => createSimBackend({ env: { ...ENV, SUPER_CODE: SUPER } });

test('superuser code reads, edits and deletes any entry, and sees its edit code', async () => {
  api = superApi();
  const a = await add({ names: 'Anna', apartment: '1' });
  const b = await add({ names: 'Babis', apartment: '2' });
  const pin = await api.call('getEntryForEdit', { id: a.id, editCode: 'ghost admin 2026 xyz' });
  assert.equal(pin.superuser, true);
  assert.equal(pin.editCode, a.editCode, 'superuser can read the entry code to give it back');
  await api.call('updateEntry', { id: a.id, editCode: SUPER, ...CENTER, names: 'Anna (fixed)', apartment: '1' });
  assert.equal(api.table.get(a.id).names, 'Anna (fixed)');
  assert.equal(api.table.get(a.id).editCode, a.editCode, 'entry code unchanged');
  assert.equal(await api.call('deleteEntry', { id: b.id, editCode: SUPER }), true);
  assert.equal(api.table.has(b.id), false);
});

test('owner code never returns superuser fields', async () => {
  api = superApi();
  const a = await add();
  const pin = await api.call('getEntryForEdit', { id: a.id, editCode: a.editCode });
  assert.equal(pin.superuser, undefined);
  assert.equal(pin.editCode, undefined);
});

test('superuser code works on a locked entry and does not count attempts', async () => {
  api = superApi();
  const a = await add();
  const wrong = a.editCode === 'BAT-000' ? 'CAT-000' : 'BAT-000';
  for (let i = 0; i < 5; i += 1) await rejects(api.call('getEntryForEdit', { id: a.id, editCode: wrong }), 'WRONG_CODE');
  await rejects(api.call('getEntryForEdit', { id: a.id, editCode: a.editCode }), 'LOCKED');
  await api.call('getEntryForEdit', { id: a.id, editCode: SUPER });
  assert.equal(api.table.get(a.id).attempts, undefined, 'superuser success also unlocks the entry');
  await api.call('getEntryForEdit', { id: a.id, editCode: a.editCode }); // owner can get in again
});

test('superuser code is off when SUPER_CODE is unset or shorter than 10', async () => {
  const a = await add();
  await rejects(api.call('getEntryForEdit', { id: a.id, editCode: SUPER }), 'WRONG_CODE');
  api = createSimBackend({ env: { ...ENV, SUPER_CODE: 'SHORT-1' } });
  const b = await add();
  await rejects(api.call('deleteEntry', { id: b.id, editCode: 'SHORT-1' }), 'WRONG_CODE');
});

test('a near-miss superuser code counts as a normal wrong attempt', async () => {
  api = superApi();
  const a = await add();
  await assert.rejects(api.call('deleteEntry', { id: a.id, editCode: SUPER + 'X' }), (e) => e.errorInfo.triesLeft === 4);
  assert.equal(api.table.has(a.id), true);
});

test('superuser code of exactly 10 letters/digits works; 9 does not', async () => {
  api = createSimBackend({ env: { ...ENV, SUPER_CODE: 'ABCDE-12345' } }); // 10 after removing the dash
  const a = await add();
  const pin = await api.call('getEntryForEdit', { id: a.id, editCode: 'abcde12345' });
  assert.equal(pin.superuser, true);
  api = createSimBackend({ env: { ...ENV, SUPER_CODE: 'ABCD-12345' } }); // 9
  const b = await add();
  await rejects(api.call('getEntryForEdit', { id: b.id, editCode: 'ABCD-12345' }), 'WRONG_CODE');
});
