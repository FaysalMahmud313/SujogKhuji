import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const CustomSync = vm.runInThisContext(`${readFileSync(new URL('../site/sync.js', import.meta.url), 'utf8')}\nCustomSync;`);

function fakeAccount() {
  const rows = new Map();
  let tick = 0;
  const stamp = () => new Date(Date.UTC(2026, 10, 14, 6, 0, tick += 1)).toISOString();
  const device = () => {
    const link = { online: true, calls: 0 };
    const rest = async (path, { method = 'GET', body } = {}) => {
      link.calls += 1;
      if (!link.online) throw Object.assign(new Error("Can't reach the server."), { offline: true });
      const url = new URL(`http://db.test${path}`);
      if (url.pathname !== '/custom_items') throw Object.assign(new Error('not found'), { status: 404 });
      if (method === 'GET') return [...rows.values()].sort((a, b) => b.created_at.localeCompare(a.created_at)).map((r) => ({ id: r.id, data: structuredClone(r.data), updated_at: r.updated_at }));
      if (method === 'DELETE') { rows.delete(url.searchParams.get('id').replace(/^eq\./, '')); return null; }
      if (method === 'POST') {
        if (!/^custom-[a-z0-9]{1,40}$/.test(body.id) || JSON.stringify(body.data).length > 8000) throw Object.assign(new Error('check violation'), { status: 400 });
        if (!rows.has(body.id) && rows.size >= 100) throw Object.assign(new Error('You can keep at most 100 added items'), { status: 400 });
        const old = rows.get(body.id);
        const now = stamp();
        const row = { id: body.id, data: structuredClone(body.data), created_at: old ? old.created_at : now, updated_at: now };
        rows.set(body.id, row);
        return [{ id: row.id, data: row.data, updated_at: row.updated_at }];
      }
      throw Object.assign(new Error('bad method'), { status: 405 });
    };
    return { link, rest, state: { custom: [], pending: { upsert: [], remove: [], profile: false, customUpsert: [], customRemove: [] } } };
  };
  return { rows, device };
}

let serial = 0;
const item = (title, extra = {}) => ({
  id: `custom-${(serial += 1).toString(36)}x`, title, org: 'Beta Telecom', region: 'BD', category: 'internship', deadline: '2026-12-20', pay: 'BDT 15,000 per month',
  steps_json: [{ t: 'Apply', d: '2026-12-20' }], url: 'https://beta.example.com/intern', source: 'you', custom: true, verified: false,
  added: new Date(Date.UTC(2026, 10, 14, 5, 0, serial)).toISOString(), evidence: { deadline: { status: 'verified', quote: 'Apply by 20 December 2026', url: 'https://beta.example.com/intern' } }, warnings: [], ...extra,
});

test('an item added on one device appears on another device after a pull', async () => {
  const account = fakeAccount();
  const pc = account.device();
  const phone = account.device();
  const added = CustomSync.add(pc.state, item('Software Engineering Intern'));
  assert.deepEqual(pc.state.pending.customUpsert, [added.id]);
  assert.deepEqual(await CustomSync.flush(pc.state, pc.rest), { ok: true, sent: 1 });
  assert.deepEqual(pc.state.pending.customUpsert, []);
  assert.ok(pc.state.custom[0].rev);
  assert.equal(await CustomSync.pull(phone.state, phone.rest), true);
  assert.equal(phone.state.custom.length, 1);
  const got = phone.state.custom[0];
  assert.equal(got.id, added.id);
  assert.equal(got.title, 'Software Engineering Intern');
  assert.equal(got.deadline, '2026-12-20');
  assert.equal(got.custom, true);
  assert.equal(got.verified, false);
  assert.equal(got.evidence.deadline.quote, 'Apply by 20 December 2026');
  assert.deepEqual(got.steps_json, [{ t: 'Apply', d: '2026-12-20' }]);
  assert.equal(await CustomSync.pull(phone.state, phone.rest), false);
  assert.deepEqual(phone.state.pending.customUpsert, []);
});

test('changes made offline stay queued and are sent when the connection is back', async () => {
  const account = fakeAccount();
  const pc = account.device();
  const phone = account.device();
  phone.link.online = false;
  const added = CustomSync.add(phone.state, item('Offline Fellowship'));
  const failed = await CustomSync.flush(phone.state, phone.rest);
  assert.equal(failed.ok, false);
  assert.equal(failed.missing, false);
  assert.deepEqual(phone.state.pending.customUpsert, [added.id]);
  assert.equal(account.rows.size, 0);
  await CustomSync.pull(pc.state, pc.rest);
  assert.equal(pc.state.custom.length, 0);
  phone.link.online = true;
  assert.equal((await CustomSync.flush(phone.state, phone.rest)).ok, true);
  assert.deepEqual(phone.state.pending.customUpsert, []);
  await CustomSync.pull(pc.state, pc.rest);
  assert.deepEqual(pc.state.custom.map((x) => x.title), ['Offline Fellowship']);
});

test('removing an item removes it on every device, also when the removal happened offline', async () => {
  const account = fakeAccount();
  const pc = account.device();
  const phone = account.device();
  const keep = CustomSync.add(pc.state, item('Keep me'));
  const drop = CustomSync.add(pc.state, item('Drop me'));
  await CustomSync.flush(pc.state, pc.rest);
  await CustomSync.pull(phone.state, phone.rest);
  assert.equal(phone.state.custom.length, 2);
  phone.link.online = false;
  assert.equal(CustomSync.remove(phone.state, drop.id).title, 'Drop me');
  assert.equal((await CustomSync.flush(phone.state, phone.rest)).ok, false);
  assert.deepEqual(phone.state.pending.customRemove, [drop.id]);
  phone.link.online = true;
  await CustomSync.pull(phone.state, phone.rest);
  assert.deepEqual(phone.state.custom.map((x) => x.id), [keep.id]);
  assert.equal((await CustomSync.flush(phone.state, phone.rest)).ok, true);
  assert.equal(account.rows.has(drop.id), false);
  assert.equal(await CustomSync.pull(pc.state, pc.rest), true);
  assert.deepEqual(pc.state.custom.map((x) => x.id), [keep.id]);
});

test('signing in keeps items that were never sent, without duplicates, and a waiting edit wins', async () => {
  const account = fakeAccount();
  const pc = account.device();
  const phone = account.device();
  const shared = CustomSync.add(pc.state, item('Shared listing'));
  await CustomSync.flush(pc.state, pc.rest);
  phone.state.custom = [item('Made as a guest')];
  await CustomSync.pull(phone.state, phone.rest);
  assert.deepEqual(phone.state.custom.map((x) => x.title).sort(), ['Made as a guest', 'Shared listing']);
  assert.equal(phone.state.pending.customUpsert.length, 1);
  await CustomSync.flush(phone.state, phone.rest);
  await CustomSync.pull(phone.state, phone.rest);
  assert.equal(phone.state.custom.length, 2);
  assert.equal(account.rows.size, 2);
  const mine = phone.state.custom.find((x) => x.id === shared.id);
  mine.title = 'Shared listing, edited on the phone';
  phone.state.pending.customUpsert.push(shared.id);
  await CustomSync.pull(phone.state, phone.rest);
  assert.equal(phone.state.custom.find((x) => x.id === shared.id).title, 'Shared listing, edited on the phone');
  await CustomSync.flush(phone.state, phone.rest);
  await CustomSync.pull(pc.state, pc.rest);
  assert.equal(pc.state.custom.find((x) => x.id === shared.id).title, 'Shared listing, edited on the phone');
});

test('rows are cleaned, kept under the size limit, and capped at 100 items', async () => {
  const account = fakeAccount();
  const pc = account.device();
  const big = item('Big one', {
    summary: 's'.repeat(900), url: 'javascript:alert(1)', deadline: 'soon', exp_min: -3, secret: 'do not send',
    evidence: Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`field${i}`, { status: 'verified', quote: 'q'.repeat(400), url: 'https://beta.example.com/intern' }])),
  });
  const row = CustomSync.toRow(big);
  assert.ok(JSON.stringify(row.data).length <= 6000);
  assert.equal(row.data.url, '');
  assert.equal(row.data.deadline, null);
  assert.equal(row.data.exp_min, null);
  assert.equal(row.data.secret, undefined);
  assert.equal(row.data.id, undefined);
  CustomSync.add(pc.state, big);
  CustomSync.add(pc.state, { ...item('Bad id'), id: 'CUSTOM bad id' });
  assert.equal((await CustomSync.flush(pc.state, pc.rest)).ok, true);
  assert.deepEqual([...account.rows.keys()], [big.id]);
  for (let i = 0; i < 105; i += 1) CustomSync.add(pc.state, item(`Item ${i}`));
  assert.equal(pc.state.custom.length, 100);
  assert.equal((await CustomSync.flush(pc.state, pc.rest)).ok, true);
  assert.ok(account.rows.size <= 100);
  const phone = account.device();
  await CustomSync.pull(phone.state, phone.rest);
  assert.equal(phone.state.custom.length, account.rows.size);
  assert.equal(phone.state.custom[0].title, 'Item 104');
});

test('before the table exists nothing is lost and the failure is reported as "missing"', async () => {
  const state = { custom: [], pending: { customUpsert: [], customRemove: [] } };
  const added = CustomSync.add(state, item('Waiting for the table'));
  const res = await CustomSync.flush(state, async () => { throw Object.assign(new Error('not found'), { status: 404 }); });
  assert.equal(res.ok, false);
  assert.equal(res.missing, true);
  assert.deepEqual(state.pending.customUpsert, [added.id]);
  assert.equal(state.custom.length, 1);
});
