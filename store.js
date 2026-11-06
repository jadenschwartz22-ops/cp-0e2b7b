export const base = new URLSearchParams(location.search).get("data") || "data";
const KEY = "pqcp.v1", IV = [1, 3, 7, 14];
const blank = () => ({ items: {}, rs: {}, drafts: {}, flagged: [], essays: [] });
export const S = blank();
try { Object.assign(S, JSON.parse(localStorage[KEY])); } catch {}
export const save = () => { try { localStorage[KEY] = JSON.stringify(S); } catch {} };
export const replace = o => { for (const k in S) delete S[k]; Object.assign(S, blank(), o); save(); };

export const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
const addDays = (iso, n) => new Date(Date.parse(iso) + n * 864e5).toISOString().slice(0, 10);
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

// ok = item passed; pts = essay rubric [[cite, hit]] so each missed point counts against its own rule
export function record(it, ok, pts) {
  const bump = (r, hit) => { const x = S.rs[r] ||= [0, 0]; x[0]++; x[1] += +hit; };
  if (pts) {
    pts.forEach(([cite, hit]) => bump(ruleOf(cite), hit));
    S.essays.push({ id: it.id, date: today(), score: pts.filter(p => p[1]).length, total: pts.length });
  } else it.rules.forEach(r => bump(r, ok));
  const s = S.items[it.id] ||= { n: 0, c: 0, b: 0 };
  s.n++; s.c += +ok; s.ok = +ok; s.t = Date.now();
  s.b = ok ? Math.min(s.b + 1, 3) : 0;
  s.d = addDays(today(), IV[s.b]);
  save();
}

// Misses due now, then unseen (yield, never-seen rules, weak rules), then oldest-correct; max 3 in a row per topic.
export function queue({ kinds, topics = [], rule, ids, n = Infinity }) {
  const td = today();
  const score = i => {
    const s = S.items[i.id], w = Math.max(0, ...i.rules.map(weak));
    if (!s) return [1, -(Math.max(1, ...i.rules.map(r => D.yield[r] || 1)) + 2 * i.rules.some(r => !S.rs[r]) + 2 * w) + Math.random() * 1.5];
    return s.ok || s.d > td ? [2, s.t] : [0, -w];
  };
  const pool = D.items
    .filter(i => (ids ? ids.includes(i.id) : kinds.includes(i.kind) && (!topics.length || topics.includes(i.topic)) && (!rule || i.rules.includes(rule)))
      && (i.kind !== "recall" || !S.items[i.id] || S.items[i.id].d <= td))
    .map(i => [score(i), i]).sort(([a], [b]) => a[0] - b[0] || a[1] - b[1]).map(x => x[1]);
  const out = [];
  while (out.length < n && pool.length) {
    const k = out.length, run = k >= 3 && out.slice(-3).every(x => x.topic === out[k - 1].topic);
    const j = run ? pool.findIndex(x => x.topic !== out[k - 1].topic) : 0;
    out.push(...pool.splice(Math.max(j, 0), 1));
  }
  return out;
}
