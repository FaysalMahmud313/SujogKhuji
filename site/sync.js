'use strict';

const CustomSync = (() => {
  const LIMIT = 100;
  const ID = /^custom-[a-z0-9]{1,40}$/;
  const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
  const TEXT = {
    title: 200, org: 100, pay: 60, country: 60, source: 80, summary: 400, level: 20, category: 20, region: 10, funding: 10,
    job_type: 20, work_mode: 20, education: 20, field: 20, org_type: 20, added: 40, engine: 10,
  };
  const text = (v, n) => (typeof v === 'string' && v ? v.slice(0, n) : null);
  const whole = (v) => (Number.isInteger(v) && v >= 0 && v <= 60 ? v : null);

  function clean(o) {
    const src = o && typeof o === 'object' ? o : {};
    const out = {};
    for (const [key, max] of Object.entries(TEXT)) {
      const v = text(src[key], max);
      if (v !== null) out[key] = v;
    }
    out.title = out.title || 'Opportunity';
    out.org = out.org || '';
    out.url = typeof src.url === 'string' && /^https?:\/\//i.test(src.url) ? src.url.slice(0, 1000) : '';
    out.deadline = typeof src.deadline === 'string' && ISO_DAY.test(src.deadline) ? src.deadline : null;
    out.exp_min = whole(src.exp_min);
    out.exp_max = whole(src.exp_max);
    out.steps_json = (Array.isArray(src.steps_json) ? src.steps_json : [])
      .filter((s) => s && typeof s.d === 'string' && ISO_DAY.test(s.d))
      .slice(0, 20)
      .map((s) => ({ t: String(s.t || 'Step').slice(0, 60), d: s.d }));
    out.warnings = (Array.isArray(src.warnings) ? src.warnings : []).filter((w) => typeof w === 'string').slice(0, 6).map((w) => w.slice(0, 40));
    const evidence = {};
    if (src.evidence && typeof src.evidence === 'object' && !Array.isArray(src.evidence)) {
      for (const [field, e] of Object.entries(src.evidence).slice(0, 24)) {
        if (!e || typeof e !== 'object' || typeof e.status !== 'string') continue;
        const item = { status: e.status.slice(0, 20) };
        if (typeof e.quote === 'string' && e.quote) item.quote = e.quote.slice(0, 240);
        if (typeof e.url === 'string' && /^https?:\/\//i.test(e.url)) item.url = e.url.slice(0, 300);
        evidence[String(field).slice(0, 30)] = item;
      }
    }
    out.evidence = evidence;
    return out;
  }

  function toRow(item) {
    const data = clean(item);
    if (JSON.stringify(data).length > 6000) {
      data.evidence = Object.fromEntries(Object.entries(data.evidence).map(([k, e]) => [k, { status: e.status }]));
    }
    if (JSON.stringify(data).length > 6000) {
      data.evidence = {};
      data.summary = '';
    }
    return { id: item.id, data };
  }

  const fromRow = (r) => ({ ...clean(r.data), id: r.id, custom: true, verified: false, rev: r.updated_at || null });
  const validId = (id) => typeof id === 'string' && ID.test(id);
  const byAdded = (a, b) => String(b.added || '').localeCompare(String(a.added || ''));

  function queues(state) {
    const p = state.pending;
    if (!Array.isArray(p.customUpsert)) p.customUpsert = [];
    if (!Array.isArray(p.customRemove)) p.customRemove = [];
    return p;
  }

  function add(state, item) {
    const p = queues(state);
    state.custom = [item, ...state.custom.filter((x) => x.id !== item.id)];
    for (const extra of state.custom.slice(LIMIT)) {
      p.customUpsert = p.customUpsert.filter((x) => x !== extra.id);
      if (extra.rev && !p.customRemove.includes(extra.id)) p.customRemove.push(extra.id);
    }
    state.custom = state.custom.slice(0, LIMIT);
    p.customRemove = p.customRemove.filter((x) => x !== item.id);
    if (!p.customUpsert.includes(item.id)) p.customUpsert.push(item.id);
    return item;
  }

  function remove(state, id) {
    const p = queues(state);
    const item = state.custom.find((x) => x.id === id);
    if (!item) return null;
    state.custom = state.custom.filter((x) => x.id !== id);
    p.customUpsert = p.customUpsert.filter((x) => x !== id);
    if (item.rev && !p.customRemove.includes(id)) p.customRemove.push(id);
    return item;
  }

  function merge(state, rows) {
    const p = queues(state);
    const before = JSON.stringify(state.custom.map((x) => [x.id, x.rev || null]));
    const removing = new Set(p.customRemove);
    const sending = new Set(p.customUpsert);
    const remote = new Map();
    for (const r of Array.isArray(rows) ? rows : []) {
      if (r && validId(r.id) && r.data && typeof r.data === 'object' && !removing.has(r.id)) remote.set(r.id, fromRow(r));
    }
    const next = [];
    for (const local of state.custom) {
      if (sending.has(local.id)) {
        next.push(local);
      } else if (remote.has(local.id)) {
        next.push(remote.get(local.id));
      } else if (!local.rev && validId(local.id)) {
        next.push(local);
        p.customUpsert.push(local.id);
      } else if (!validId(local.id)) {
        next.push(local);
      }
      remote.delete(local.id);
    }
    state.custom = [...next, ...remote.values()].sort(byAdded).slice(0, LIMIT);
    return before !== JSON.stringify(state.custom.map((x) => [x.id, x.rev || null]));
  }

  async function flush(state, rest) {
    const p = queues(state);
    let sent = 0;
    try {
      for (const id of [...p.customRemove]) {
        if (validId(id)) await rest(`/custom_items?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE', prefer: 'return=minimal' });
        p.customRemove = p.customRemove.filter((x) => x !== id);
        sent += 1;
      }
      for (const id of [...p.customUpsert]) {
        const item = state.custom.find((x) => x.id === id);
        if (item && validId(id)) {
          const rows = await rest('/custom_items?on_conflict=user_id,id', { method: 'POST', body: toRow(item), prefer: 'resolution=merge-duplicates,return=representation' });
          const row = Array.isArray(rows) ? rows[0] : null;
          const now = state.custom.find((x) => x.id === id);
          if (now && row) now.rev = row.updated_at || now.rev || null;
          sent += 1;
        }
        p.customUpsert = p.customUpsert.filter((x) => x !== id);
      }
      return { ok: true, sent };
    } catch (error) {
      return { ok: false, sent, error, missing: !!error && error.status === 404 };
    }
  }

  async function pull(state, rest) {
    const rows = await rest(`/custom_items?select=id,data,updated_at&order=created_at.desc&limit=${LIMIT}`);
    return merge(state, rows);
  }

  return { LIMIT, clean, toRow, fromRow, add, remove, merge, flush, pull };
})();
