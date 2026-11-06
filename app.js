import { D, S, load, save, replace, today, addDays, daysTo, ruleOf, record, queue, tally, weakest, stats, forecast } from "./store.js";

const $ = s => document.querySelector(s), app = $("#app"), dlg = $("#sheet"), root = document.documentElement;
const h = (tag, a, ...kids) => {
  if (!a || a.nodeType || Array.isArray(a) || typeof a !== "object") { kids.unshift(a); a = {}; }
  const e = document.createElement(tag);
  for (const k in a) {
    if (k.startsWith("on")) e.addEventListener(k.slice(2), a[k]);
    else if (k.startsWith("aria-")) e.setAttribute(k, a[k]);
    else if (a[k] !== false && a[k] != null) e.setAttribute(k, a[k] === true ? "" : a[k]);
  }
  e.append(...kids.flat(9).filter(x => x != null && x !== false));
  return e;
};
const view = (...k) => app.replaceChildren(...k.flat(9).filter(Boolean));
const paras = t => t.split("\n").filter(Boolean).map(p => h("p", p));
const cnt = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
const pct = (a, c) => a ? Math.round(100 * c / a) : 0;
const fmt = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
const go = hash => location.hash === hash ? route() : (location.hash = hash);
const MODES = { apply: ["Fact patterns", ["apply"]], issue: ["Issue spotting", ["issue"]], essay: ["Essay practice", ["essay"]], cards: ["Flashcards", ["recall"]] };
const MIXED = ["apply", "issue", "recall"];
const track = p => h("div", { class: "track" }, h("i", { style: `width:${p}%` }));
let sess, tick;
const tm = { left: 0, run: true };

// ---- text: normalization, cross-reference links, quote highlight, citation sheet
const SUB = { "‘": "'", "’": "'", "“": '"', "”": '"', "–": "-", "—": "-" };
const norm = s => {
  const map = []; let t = "";
  for (let i = 0; i < s.length; i++) {
    let c = s[i];
    if (/\s/.test(c)) { if (t.endsWith(" ")) continue; c = " "; } else c = SUB[c] || c;
    t += c; map.push(i);
  }
  return { t, map };
};
const nt = o => o._n ||= norm(o.text).t;
const XREF = /\bRules? (\d+(?:\.\d+)?)((?:\([A-Za-z0-9]+\))*)/g;
const rich = t => {
  const out = []; let i = 0;
  for (const m of t.matchAll(XREF)) {
    if (!D.R[m[1]]) continue;
    out.push(t.slice(i, m.index), h("a", { href: "#/rule/" + m[1] + (m[2] && D.S[m[1] + m[2]] ? "/" + m[1] + m[2] : "") }, m[0]));
    i = m.index + m[0].length;
  }
  return [...out, t.slice(i)];
};
const mark = (text, quote) => {
  const { t, map } = norm(text), q = norm(quote).t.trim(), i = q ? t.indexOf(q) : -1;
  if (i < 0) return rich(text);
  const a = map[i], b = map[i + q.length - 1] + 1;
  return [...rich(text.slice(0, a)), h("mark", rich(text.slice(a, b))), ...rich(text.slice(b))];
};
function sheet({ cite, quote }) {
  const id = ruleOf(cite), r = D.R[id], s = D.S[cite] || r;
  dlg.replaceChildren(h("div", { class: "sheet" },
    h("div", { class: "bar" }, h("h2", "Rule " + cite), h("button", { class: "chip", onclick: () => dlg.close() }, "Close")),
    h("p", { class: "mute" }, r.title),
    h("div", { class: "rule serif" }, quote ? mark(s.text, quote) : rich(s.text)),
    h("a", { class: "btn primary", href: "#/rule/" + (cite === id ? id : id + "/" + cite) }, "Open full rule")));
  dlg.showModal();
}
dlg.addEventListener("click", e => (e.target === dlg || e.target.closest("a")) && dlg.close());
const chip = c => h("button", { class: "chip", onclick: () => sheet(c) }, "Rule " + c.cite);
const chips = it => h("div", { class: "chips" }, (it.cites || it.rubric).map(chip));

// ---- home and practice setup
function headline() {
  const t = stats(), m = Math.round(100 * t.mastery);
  return h("section", { class: "head" }, h("div", { class: "bar" }, h("b", "Mastery"), h("b", m + "%")), track(m),
    h("div", { class: "stats" }, [["Seen", `${t.seen} of ${t.total}`], ["Due today", t.due], ["Mastered", t.mastered]].map(([k, v]) => h("div", h("b", v), h("small", k)))));
}
function home() {
  const n = k => D.items.filter(i => i.kind === k).length, left = S.exam && daysTo(S.exam), t = stats(), unseen = t.total - t.seen;
  const tiles = [["#/p/apply", "Fact patterns", cnt(n("apply"), "item")], ["#/p/issue", "Issue spotting", cnt(n("issue"), "item")],
    ["#/p/essay", "Essay practice", cnt(n("essay"), "item")], ["#/p/cards", "Flashcards", cnt(n("recall"), "card")],
    ["#/rules", "Rules", cnt(D.rules.length, "rule")], ["#/progress", "Progress", t.seen + " seen"]];
  view(h("p", { class: "mute" }, "Assume federal court, proper jurisdiction and venue, current FRCP, no state holidays beyond the federal ones, unless the facts say otherwise."),
    h("label", { class: "exam" }, "Exam date",
      h("input", { type: "date", value: S.exam || "", onchange: e => { S.exam = e.target.value || null; save(); route(); } }),
      left != null && h("b", left > 0 ? left + " days left" : left === 0 ? "Exam day" : "Exam has passed")),
    headline(),
    left > 0 && unseen > 0 && h("p", { class: "mute" }, `Pace: ${Math.ceil(unseen / left)} new a day to see everything by your exam`),
    h("button", { class: "today", onclick: () => start({ kinds: MIXED, n: Math.min(20, Math.max(10, t.due)) }) }, h("b", "Today"),
      h("span", t.due ? `${cnt(t.due, "item")} due, then new ones, weakest rules first` : "Nothing due. New items, weakest rules first")),
    h("div", { class: "tiles" }, tiles.map(([href, t, sub]) => h("a", { class: "tile", href }, h("b", t), h("small", sub)))));
}
function setup(mode) {
  const [label, kinds] = MODES[mode], o = { kinds, topics: [], n: mode === "essay" ? 1 : 10, timer: false };
  const pool = D.items.filter(i => kinds.includes(i.kind)), L = mode === "essay" ? [1, 3, Infinity] : [10, 20, Infinity];
  const info = h("p", { class: "mute" }), btn = h("button", { class: "btn primary", onclick: () => start(o) }, "Start");
  const upd = () => {
    const q = queue({ ...o, n: Infinity }), td = today(), due = q.filter(i => S.items[i.id]?.due <= td).length;
    info.textContent = q.length ? `${q.length} available, ${due} due` : "No items here yet."; btn.disabled = !q.length;
  };
  const lens = L.map((v, j) => h("button", { class: "chip pill", "aria-pressed": v === o.n, onclick: () => {
    o.n = v; lens.forEach((b, k) => b.setAttribute("aria-pressed", k === j));
  } }, v === Infinity ? "All" : v));
  const topics = D.topics.filter(t => pool.some(i => i.topic === t.id)).map(t => h("button", { class: "chip pill", "aria-pressed": false, onclick: e => {
    const k = o.topics.indexOf(t.id); k < 0 ? o.topics.push(t.id) : o.topics.splice(k, 1);
    e.currentTarget.setAttribute("aria-pressed", k < 0); upd();
  } }, t.label));
  view(h("h1", label), h("h2", "Topics"), h("div", { class: "chips" }, topics), h("p", { class: "mute" }, "None selected means all topics."),
    h("h2", "Length"), h("div", { class: "chips" }, lens),
    kinds[0] === "apply" || kinds[0] === "issue" ? h("label", { class: "check" }, h("input", { type: "checkbox", onchange: e => o.timer = e.target.checked }), "Timer: 90 s per fact pattern") : null,
    info, btn);
  upd();
}
function start(o) {
  sess = { o, q: queue(o), i: 0, hits: 0, miss: [], ans: new Set(), timer: o.timer };
  go("#/q");
}

// ---- session: question, essay, flashcard
function timer(sec, el, end) {
  tm.left = sec; tm.run = true; el.textContent = fmt(sec);
  tick = setInterval(() => { if (tm.run && tm.left > 0) { el.textContent = fmt(--tm.left); if (!tm.left) end?.(); } }, 1000);
}
const answer = (it, q, pts) => {
  if (sess.ans.has(sess.i)) return;
  sess.ans.add(sess.i); sess.hits += q >= 3; if (q < 3) sess.miss.push(it);
  record(it, q, pts);
};
const nextBtn = () => h("button", { class: "btn primary", onclick: () => { sess.i++; route(); } }, sess.i + 1 < sess.q.length ? "Next" : "Finish");

function sessView() {
  if (!sess) return go("#/");
  const it = sess.q[sess.i];
  if (!it) return finish();
  const time = h("span", { class: "time" }), on = S.flagged.includes(it.id);
  const flag = h("button", { class: "chip", "aria-pressed": on, onclick: e => {
    const k = S.flagged.indexOf(it.id), b = e.currentTarget;
    k < 0 ? S.flagged.push(it.id) : S.flagged.splice(k, 1); save();
    b.setAttribute("aria-pressed", k < 0); b.textContent = k < 0 ? "Flagged" : "Flag";
  } }, on ? "Flagged" : "Flag");
  view(h("div", { class: "bar" }, h("span", `${sess.i + 1} of ${sess.q.length}`), time, flag),
    { apply: question, issue: question, essay, recall: card }[it.kind](it, time));
}
function question(it, time) {
  const multi = it.kind === "issue", pick = new Set(); let done = false;
  const opts = it.options.map((o, i) => h("button", { class: "opt", onclick: () => {
    if (done) return;
    if (!multi) pick.clear();
    multi && pick.has(i) ? pick.delete(i) : pick.add(i);
    opts.forEach((b, j) => b.classList.toggle("sel", pick.has(j))); btn.disabled = !pick.size;
  } }, h("span", { class: "tag" }), o.t));
  const list = h("div", { class: "opts" + (multi ? " multi" : "") }, opts), reveal = h("div");
  const submit = () => {
    done = true; clearInterval(tick); btn.remove(); list.classList.add("done");
    const key = new Set(it.key), found = [...pick].filter(i => key.has(i)).length, wrong = pick.size - found, ok = found === key.size && !wrong;
    opts.forEach((b, i) => {
      const k = key.has(i), p = pick.has(i);
      if (k || p) b.classList.add(k ? "right" : "wrong");
      b.firstChild.textContent = k ? (multi && !p ? "Missed" : "Correct") : p ? "Wrong" : "";
      b.append(h("span", { class: "why" }, it.options[i].why));
    });
    answer(it, ok ? 4 : 1);
    reveal.append(h("p", { class: "verdict " + (ok ? "right" : "wrong") }, multi ? `Found ${found} of ${key.size}, ${wrong} wrong` : ok ? "Correct" : "Not quite"),
      h("p", { class: "serif" }, it.explain), chips(it), nextBtn());
  };
  const btn = h("button", { class: "btn primary", disabled: true, onclick: submit }, "Submit");
  if (sess.timer) timer(90, time, submit);
  return [h("div", { class: "serif stem" }, paras(it.stem)), h("p", { class: "ask" }, it.ask), list, btn, reveal];
}
function essay(it, time) {
  let dt;
  const ta = h("textarea", { rows: 12, placeholder: "Write your answer here. It saves as you type.", "aria-label": "Your answer", oninput: () => {
    S.drafts[it.id] = ta.value; clearTimeout(dt); dt = setTimeout(save, 500);
  } }, S.drafts[it.id] || "");
  const boxes = it.rubric.map(() => h("input", { type: "checkbox" })), score = h("p", { class: "verdict" });
  const upd = () => score.textContent = `${boxes.filter(b => b.checked).length} of ${boxes.length} points`;
  const done = h("button", { class: "btn primary", onclick: () => {
    const pts = it.rubric.map((p, i) => [p.cite, boxes[i].checked]), hit = pts.filter(p => p[1]).length;
    const f = hit / pts.length;
    answer(it, f < .5 ? 2 : f < .7 ? 3 : f < .9 ? 4 : 5, pts); done.replaceWith(nextBtn());
  } }, "Save score");
  const rev = h("div", { hidden: true, onchange: upd }, h("h2", "Rubric: tap the points you hit"),
    it.rubric.map((p, i) => h("label", { class: "pt" }, boxes[i], h("span", p.point + " ", chip(p)))), score,
    h("h2", "Model answer"), h("div", { class: "serif" }, paras(it.model)), done);
  const reveal = h("button", { class: "btn", onclick: () => { rev.hidden = false; reveal.remove(); upd(); rev.scrollIntoView(); } }, "Reveal rubric and model answer");
  const pause = h("button", { class: "chip", onclick: () => { tm.run = !tm.run; pause.textContent = tm.run ? "Pause" : "Resume"; } }, "Pause");
  const adj = d => h("button", { class: "chip", onclick: () => { tm.left = Math.max(0, tm.left + d * 60); time.textContent = fmt(tm.left); } }, (d > 0 ? "+" : "-") + Math.abs(d) + " min");
  timer((it.minutes || 20) * 60, time);
  return [h("div", { class: "serif stem" }, paras(it.stem)), h("p", { class: "ask" }, it.ask),
    h("div", { class: "chips" }, adj(-5), pause, adj(5)), ta, reveal, rev];
}
function card(it) {
  let side = 0, seen = false;
  const face = h("button", { class: "card serif", onclick: () => { side ^= 1; seen = true; draw(); } });
  const cx = h("div", { hidden: true }, chips(it));
  const rate = (q, t) => h("button", { class: "btn" + (q === 4 ? " primary" : ""), onclick: () => { answer(it, q, null); sess.i++; route(); } }, t);
  const acts = h("div", { class: "chips rate", hidden: true }, rate(1, "Again"), rate(3, "Hard"), rate(4, "Good"), rate(5, "Easy"));
  const draw = () => {
    face.replaceChildren(h("small", side ? "Answer" : "Question, tap to flip"), h("span", side ? it.back : it.front));
    cx.hidden = !side; acts.hidden = !seen;
  };
  draw();
  return [face, cx, acts];
}
function finish() {
  const n = sess.q.length;
  view(h("h1", n ? "Set complete" : "Nothing here yet"),
    n ? h("p", { class: "big" }, `${sess.hits} of ${n} correct`) : h("p", "Try other topics, or come back when items are due."),
    sess.miss.length > 0 && [h("h2", "Review"), sess.miss.map(it => h("div", { class: "box" }, h("p", { class: "serif" }, (it.stem || it.front).slice(0, 140) + "..."), chips(it)))],
    h("div", { class: "chips" }, n ? h("button", { class: "btn primary", onclick: () => start(sess.o) }, "Again") : null, h("a", { class: "btn", href: "#/" }, "Home")));
}

// ---- rules reader
function rulesIndex() {
  const res = h("div"), short = r => r.title.split(/[:;]/)[0];
  const row = (r, cite, snip) => h("a", { class: "hit", href: "#/rule/" + r.id + (cite ? "/" + cite : "") },
    h("b", "Rule " + (cite || r.id)), " " + short(r), snip && h("span", { class: "snip serif" }, snip));
  const browse = D.topics.map(t => {
    const rs = t.rules.filter(id => D.R[id]);
    return rs.length > 0 && h("details", h("summary", t.label), rs.map(id => row(D.R[id])));
  });
  const find = v => {
    v = v.trim().toLowerCase();
    if (v.length < 2) return res.replaceChildren(...browse.filter(Boolean));
    const cq = v.replace(/^rule\s*/, ""), out = [], jump = D.R[cq] ? cq : Object.keys(D.S).find(k => k.toLowerCase() === cq);
    if (jump) out.push(row(D.R[ruleOf(jump)], jump === ruleOf(jump) ? "" : jump));
    for (const r of D.rules) {
      if (!nt(r).toLowerCase().includes(v) && !r.title.toLowerCase().includes(v)) continue;
      const subs = r.subs.filter(s => nt(s).toLowerCase().includes(v)).sort((a, b) => nt(a).length - nt(b).length);
      const s = subs[0], t = nt(s || r), k = t.toLowerCase().indexOf(v);
      out.push(row(r, s?.cite, k < 0 ? "" : [t.slice(Math.max(0, k - 50), k), h("mark", t.slice(k, k + v.length)), t.slice(k + v.length, k + v.length + 70)]));
      if (out.length >= 30) break;
    }
    res.replaceChildren(...(out.length ? out : [h("p", { class: "mute" }, "No matches.")]));
  };
  const q = h("input", { type: "search", placeholder: "Search rule text and titles", "aria-label": "Search rules", oninput: () => find(q.value) });
  view(h("h1", "Rules"), q, res); find("");
}
function ruleView(id, cite) {
  const r = D.R[id], stack = [];
  if (!r) return view(h("p", "No such rule."), h("a", { href: "#/rules" }, "All rules"));
  const body = r.text.split("\n").map(p => {
    const m = p.match(/^\(([A-Za-z0-9]+)\)/); let c = "", d = 0;
    if (m) for (let k = 5; k >= 1; k--) {
      const cand = (k > 1 ? stack[k - 2] : id) + `(${m[1]})`;
      if ((k === 1 || stack[k - 2]) && D.S[cand]) { stack.length = k - 1; stack.push(cand); c = cand; d = k; break; }
    }
    if (!c) d = Math.max(stack.length - 1, 0);
    return h("p", { class: "para d" + d, "data-d": d, "data-cite": c || null }, c ? [h("b", m[0]), ...rich(p.slice(m[0].length))] : rich(p));
  });
  view(h("a", { href: "#/rules" }, "All rules"), h("h1", `Rule ${id}. ${r.title}`),
    h("button", { class: "btn primary", onclick: () => start({ kinds: MIXED, rule: id, n: 10 }) }, "Practice this rule"),
    h("div", { class: "rule serif" }, body));
  let e = cite && app.querySelector(`[data-cite="${cite}"]`);
  if (e) { e.scrollIntoView(); const d = +e.dataset.d; do { e.classList.add("hl"); e = e.nextElementSibling; } while (e && +e.dataset.d > d); }
}

// ---- progress
function progress() {
  const bar = (label, items, rs) => {
    const m = stats(items).mastery, [a, c] = tally(rs);
    return h("div", { class: "pb" }, h("div", { class: "bar" }, label, h("b", Math.round(100 * m) + "%")), track(100 * m),
      h("small", a ? `${a} answered, ${pct(a, c)}% correct` : "not started"));
  };
  const ruleBar = r => bar(h("a", { href: "#/rule/" + r }, "Rule " + r), D.items.filter(i => i.rules.includes(r)), [r]);
  const flagged = S.flagged.map(id => D.byId[id]).filter(Boolean), fc = forecast(), mx = Math.max(1, ...fc);
  const exportJson = () => h("a", { href: URL.createObjectURL(new Blob([JSON.stringify(S)], { type: "application/json" })), download: `civpro-progress-${today()}.json` }).click();
  const imp = async e => {
    try { const o = JSON.parse(await e.target.files[0].text()); if (o.v !== 2 || !o.items || !o.rs) throw 0; replace(o); route(); }
    catch { alert("That is not a progress file from this site."); }
  };
  view(h("h1", "Progress"), headline(),
    h("h2", "Due in the next 7 days"), h("div", { class: "fc" }, fc.map((n, k) => h("div", h("small", n), h("i", { style: `height:${4 + 40 * n / mx}px` }),
      h("small", k ? new Date(addDays(today(), k) + "T12:00").toLocaleDateString(undefined, { weekday: "short" }) : "Today")))),
    h("h2", "Topics"), D.topics.map(t => h("details", h("summary", bar(t.label, D.items.filter(i => i.topic === t.id), t.rules)),
      t.rules.filter(r => D.items.some(i => i.rules.includes(r))).map(ruleBar))),
    h("h2", "Weakest rules"), weakest(10).map(r => h("div", { class: "row2" }, ruleBar(r),
      h("button", { class: "chip", onclick: () => start({ kinds: MIXED, rule: r, n: 10 }) }, "Practice"))),
    !Object.keys(S.rs).length && h("p", { class: "mute" }, "Answer a few questions and your weakest rules show up here."),
    h("h2", "Flagged"), flagged.map(it => h("div", { class: "box" }, h("p", { class: "serif" }, (it.stem || it.front).slice(0, 90) + "..."),
      h("div", { class: "chips" }, h("button", { class: "chip", onclick: () => start({ ids: [it.id] }) }, "Practice"),
        h("button", { class: "chip", onclick: () => { S.flagged.splice(S.flagged.indexOf(it.id), 1); save(); progress(); } }, "Unflag")))),
    !flagged.length && h("p", { class: "mute" }, "Nothing flagged."),
    h("h2", "Essays"), S.essays.slice(-10).reverse().map(e => h("div", { class: "box" }, h("b", `${e.score} of ${e.total}`, " on " + e.date),
      h("p", { class: "mute" }, (D.byId[e.id]?.stem || e.id).slice(0, 80) + "..."))),
    !S.essays.length && h("p", { class: "mute" }, "No essays scored yet."),
    h("h2", "Your data"), h("div", { class: "chips" },
      h("button", { class: "btn", onclick: exportJson }, "Export progress"),
      h("label", { class: "btn" }, "Import progress", h("input", { type: "file", accept: "application/json,.json", hidden: true, onchange: imp })),
      h("button", { class: "btn danger", onclick: () => confirm("Erase all progress on this device? This cannot be undone.") && (replace({ exam: S.exam, theme: S.theme }), route()) }, "Reset progress")));
}

// ---- router, theme, boot
const ROUTES = { p: a => MODES[a] ? setup(a) : home(), q: sessView, rules: rulesIndex, rule: ruleView, progress };
function route() {
  clearInterval(tick); dlg.open && dlg.close(); scrollTo(0, 0);
  const [p, a, b] = decodeURIComponent(location.hash.slice(2)).split("/");
  (Object.hasOwn(ROUTES, p) ? ROUTES[p] : home)(a, b);
}
const dark = () => (root.dataset.theme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")) === "dark";
const paint = () => $("#theme").textContent = dark() ? "Day" : "Night";
$("#theme").onclick = () => { root.dataset.theme = S.theme = dark() ? "light" : "dark"; save(); paint(); };
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", paint);
if (S.theme) root.dataset.theme = S.theme;
paint();
addEventListener("hashchange", route);
addEventListener("pagehide", save);
load().then(route, e => view(h("p", { class: "err" }, `Could not load ${e.message}. Check the data path (?data=...).`)));
