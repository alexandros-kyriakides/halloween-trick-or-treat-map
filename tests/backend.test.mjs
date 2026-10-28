// Runs the real AppSync resolvers against the in-memory simulator.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createSimBackend } from '../devsim/backend.js';
import { clock } from '../devsim/appsync-utils.js';
import { EVENT_SETTINGS } from '../amplify/settings.ts';

const CENTER = { lat: 35.0757663, lng: 33.313154 };
// Tuesday 27 Oct 2026, 12:00 UTC - before the event closes
const BEFORE_EVENT = Date.parse('2026-10-27T12:00:00Z');

let api;
beforeEach(() => {
  clock.offsetMs = BEFORE_EVENT - Date.now();
  api = createSimBackend({ env: EVENT_SETTINGS });
});

const add = (extra = {}) =>
  api.call('createEntry', { groupCode: '31OCT', consent: true, ...CENTER, ...extra });

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
  await add({ groupCode: ' 31oct ' }); // case and spaces ignored
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
  const ok = await api.call('listPins', { groupCode: '31oct' });
  assert.equal(ok.groupCodeOk, true);
  assert.equal(ok.pins[0].names, 'Maria');
  assert.equal(ok.pins[0].notes, 'side gate');
  for (const res of [anon, ok]) assert.ok(!JSON.stringify(res).includes('editCode'));
});

test('acceptance: two apartments at one location; each controls only their own', async () => {
  const a = await add({ apartment: '101', names: 'Anna' });
  const b = await add({ apartment: '202', names: 'Babis' });
  let list = await api.call('listPins', { groupCode: '31OCT' });
  assert.equal(list.pins.length, 2);

  // B uses B's code on A's entry -> refused
  await rejects(api.call('updateEntry', { id: a.id, editCode: b.editCode, ...CENTER, apartment: 'hacked' }), 'WRONG_CODE');
  await rejects(api.call('deleteEntry', { id: a.id, editCode: b.editCode }), 'WRONG_CODE');
  assert.equal(api.table.get(a.id).apartment, '101');

  // A removes theirs; B's remains
  assert.equal(await api.call('deleteEntry', { id: a.id, editCode: a.editCode }), true);
  list = await api.call('listPins', { groupCode: '31OCT' });
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
  const ctxs = Array.from({ length: 20 }, () => ({ args: { id: a.id, editCode: 'X' }, env: EVENT_SETTINGS, stash: {} }));
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
  const list = await api.call('listPins', { groupCode: '31OCT' });
  assert.deepEqual(list, { groupCodeOk: false, closed: true, pins: [] });
  await rejects(add(), 'CLOSED');
  await rejects(api.call('updateEntry', { id: a.id, editCode: a.editCode, ...CENTER }), 'CLOSED');
  await rejects(api.call('deleteEntry', { id: a.id, editCode: a.editCode }), 'CLOSED');
});

test('unknown entry id is reported as NOT_FOUND', async () => {
  await rejects(api.call('getEntryForEdit', { id: 'missing', editCode: 'BAT-123' }), 'NOT_FOUND');
});
