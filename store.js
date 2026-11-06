export const base = new URLSearchParams(globalThis.location?.search).get("data") || "data";
const KEY = "pqcp.v2";
const blank = () => ({ v: 2, items: {}, rs: {}, drafts: {}, flagged: [], essays: [] });
export const S = blank();
try { Object.assign(S, JSON.parse(localStorage[KEY])); } catch {}
export const save = () => { try { localStorage[KEY] = JSON.stringify(S); } catch {} };
export const replace = o => { for (const k in S) delete S[k]; Object.assign(S, blank(), o); save(); };

export const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
export const addDays = (iso, n) => new Date(Date.parse(iso) + n * 864e5).toISOString().slice(0, 10);
export const daysTo = iso => Math.round((Date.parse(iso) - Date.parse(today())) / 864e5);
export const ruleOf = cite => cite.split("(")[0];

export const D = { rules: [], R: Object.create(null), S: Object.create(null), topics: [], yield: {}, items: [], byId: {} };
export async function load() {
  const get = async p => { const r = await fetch(`${base}/${p}`); if (!r.ok) throw new Error(p); return r.json(); };
  const [rules, tp, man] = await Promise.all(["rules.json", "topics.json", "manifest.json"].map(get));
  const files = (Array.isArray(man) ? man : man.items || man.files || []).map(f => f.includes("/") ? f : "items/" + f);
  Object.assign(D, { rules, topics: tp.topics, yield: tp.yield || {}, items: (await Promise.all(files.map(get))).flat() });
  for (const r of rules) { D.R[r.id] = r; for (const s of r.subs) D.S[s.cite] = s; }
  for (const i of D.items) D.byId[i.id] = i;
}

const stat = r => S.rs[r] || [0, 0];
export const weak = r => { const [a, c] = stat(r); return a ? 1 - c / a : 0; };
export const tally = rs => rs.reduce(([a, c], r) => [a + stat(r)[0], c + stat(r)[1]], [0, 0]);
const smooth = r => { const [a, c] = stat(r); return (c + 1) / (a + 2); };
export const weakest = k => Object.keys(S.rs).filter(r => D.R[r])
  .sort((x, y) => smooth(x) - smooth(y) || (D.yield[y] || 1) - (D.yield[x] || 1)).slice(0, k);

// SM-2 on one item. q 0-5. Interval stays uncapped in state (mastery); only the due date is compressed to exam - 1 day (min 1).
export function sm2(s, q, exam, td = today()) {
  let { ef = 2.5, n = 0, interval = 0, lapses = 0, seen = 0, correct = 0 } = s || {};
  if (q < 3) { n = 0; interval = 1; lapses++; }
  else { n++; interval = n < 2 ? 1 : n < 3 ? 6 : Math.round(interval * ef); ef = Math.max(1.3, ef + .1 - (5 - q) * (.08 + (5 - q) * .02)); }
  const cap = exam ? Math.max(1, Math.round((Date.parse(exam) - Date.parse(td)) / 864e5) - 1) : Infinity;
  return { ef, n, interval, due: addDays(td, Math.min(interval, cap)), lapses, seen: seen + 1, correct: correct + (q >= 3), last: q };
}

// Counts use only items in the loaded data. Mastery m = 0 if unseen or lapsed last time, else min(1, interval / 21).
export function stats(items = D.items) {
  const td = today(); let seen = 0, due = 0, mastered = 0, sum = 0;
  for (const i of items) {
    const s = S.items[i.id]; if (!s) continue;
    seen++; due += s.due <= td; mastered += s.interval >= 21; sum += s.last < 3 ? 0 : Math.min(1, s.interval / 21);
  }
  return { total: items.length, seen, due, mastered, mastery: items.length ? sum / items.length : 0 };
}
export const forecast = () => {
  const td = today(), out = Array(7).fill(0);
  for (const i of D.items) { const d = S.items[i.id]?.due; if (d) { const k = Math.round((Date.parse(d) - Date.parse(td)) / 864e5); if (k < 7) out[Math.max(k, 0)]++; } }
  return out;
};

// q = quality 0-5; pts = essay rubric [[cite, hit]] so each missed point counts against its own rule
export function record(it, q, pts) {
  const bump = (r, hit) => { const x = S.rs[r] ||= [0, 0]; x[0]++; x[1] += +hit; };
  if (pts) {
    pts.forEach(([cite, hit]) => bump(ruleOf(cite), hit));
    S.essays.push({ id: it.id, date: today(), score: pts.filter(p => p[1]).length, total: pts.length });
  } else it.rules.forEach(r => bump(r, q >= 3));
  S.items[it.id] = sm2(S.items[it.id], q, S.exam);
  save();
}

// Due (most overdue first), then new (yield, never-seen rules, weak rules), then soonest due; max 3 in a row per topic.
export function queue({ kinds, topics = [], rule, ids, n = Infinity }) {
  const td = today();
  const score = i => {
    const s = S.items[i.id], w = Math.max(0, ...i.rules.map(weak));
    if (!s) return [1, -(Math.max(1, ...i.rules.map(r => D.yield[r] || 1)) + 2 * i.rules.some(r => !S.rs[r]) + 2 * w) + Math.random() * 1.5];
    return [s.due <= td ? 0 : 2, Date.parse(s.due)];
  };
  const pool = D.items
    .filter(i => ids ? ids.includes(i.id) : kinds.includes(i.kind) && (!topics.length || topics.includes(i.topic)) && (!rule || i.rules.includes(rule)))
    .map(i => [score(i), i]).sort(([a], [b]) => a[0] - b[0] || a[1] - b[1]).map(x => x[1]);
  const out = [];
  while (out.length < n && pool.length) {
    const k = out.length, run = k >= 3 && out.slice(-3).every(x => x.topic === out[k - 1].topic);
    const j = run ? pool.findIndex(x => x.topic !== out[k - 1].topic) : 0;
    out.push(...pool.splice(Math.max(j, 0), 1));
  }
  return out;
}
