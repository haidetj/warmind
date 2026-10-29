"use strict";
(function () {
  const $ = s => document.querySelector(s);
  const el = (tag, attrs, kids) => {
    const n = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k === "class") n.className = v; else if (k === "text") n.textContent = v; else n.setAttribute(k, v === true ? "" : v);
    }
    (kids || []).forEach(c => c != null && c !== false && n.appendChild(typeof c === "string" || typeof c === "number" ? document.createTextNode(String(c)) : c));
    return n;
  };
  const app = $("#app");
  const LID = new URLSearchParams(location.search).get("l");
  let META = null, STATE = null, pollT = null, busy = false, lastSig = "";

  // ======================================================================= i18n
  const I18N = window.WM_I18N || { langs: [["en", "English"]], dict: { en: {} } };
  I18N.langs = I18N.langs.filter(x => x[0] === "en" || I18N.dict[x[0]]);   // only offer languages that ship a dictionary
  const LANGS = I18N.langs.map(x => x[0]);
  let LANG = (() => {
    try { const s = localStorage.getItem("wm_lang"); if (s && LANGS.indexOf(s) >= 0) return s; } catch (e) {}
    const n = (navigator.language || "en").slice(0, 2).toLowerCase();
    return LANGS.indexOf(n) >= 0 ? n : "en";
  })();
  const dictOf = l => I18N.dict[l] || {};
  function has(key) { return dictOf(LANG)[key] != null || dictOf("en")[key] != null; }
  function t(key, p) {
    const s = dictOf(LANG)[key] != null ? dictOf(LANG)[key] : dictOf("en")[key] != null ? dictOf("en")[key] : key;
    return p ? String(s).replace(/\{(\w+)\}/g, (m, k) => (p[k] != null ? p[k] : m)) : s;
  }
  // A server phrase {k, p}: translate by key, translating params that are themselves keys.
  function tp(ph, fallback) {
    if (!ph || !ph.k || !has(ph.k)) return fallback || "";
    const p = Object.assign({}, ph.p || {});
    if (p.style) p.style = styleLabel(p.style);
    if (p.axis) p.axis = t("axis." + p.axis);
    if (p.why) p.why = t(p.why);
    return t(ph.k, p);
  }
  const styleLabel = k => (has("ps." + k + ".label") ? t("ps." + k + ".label") : k);
  const nf = n => (n == null ? "—" : Number(n).toLocaleString(LANG));

  function initLang() {
    const s = $("#lang"); s.innerHTML = "";
    if (LANGS.length < 2) { s.parentNode.style.display = "none"; return; }
    I18N.langs.forEach(([c, n]) => s.appendChild(el("option", { value: c }, [n])));
    s.value = LANG; s.setAttribute("aria-label", t("lang.label"));
    document.documentElement.lang = LANG;
    s.onchange = () => {
      LANG = s.value;
      try { localStorage.setItem("wm_lang", LANG); } catch (e) {}
      document.documentElement.lang = LANG; s.setAttribute("aria-label", t("lang.label"));
      if (!LID) renderHome(); else if (STATE) { lastSig = ""; render(); }
    };
  }

  // ======================================================================= storage
  const store = {
    creator: lid => { try { return localStorage.getItem("wm_creator_" + lid); } catch (e) { return null; } },
    setCreator: (lid, tk) => { try { localStorage.setItem("wm_creator_" + lid, tk); } catch (e) {} },
    me: lid => { try { return JSON.parse(localStorage.getItem("wm_me_" + lid)); } catch (e) { return null; } },
    setMe: (lid, o) => { try { localStorage.setItem("wm_me_" + lid, JSON.stringify(o)); } catch (e) {} },
  };

  // ======================================================================= api
  async function api(path, opts) {
    let r;
    try { r = await fetch(path, opts); } catch (e) { throw new Error(t("err.reach")); }
    // 502/503/504 come from the host while a new version deploys (disk-backed services restart)
    if ([502, 503, 504].indexOf(r.status) >= 0) throw new Error(t("err.redeploy"));
    if (!r.ok) { let m = r.statusText; try { m = (await r.json()).detail || m; } catch (e) {} throw new Error(m); }
    return r.status === 204 ? {} : r.json();
  }
  const jpost = (path, body, token) => api(path, { method: "POST", headers: Object.assign({ "content-type": "application/json" }, token ? { "x-token": token } : {}), body: JSON.stringify(body) });
  const fdpost = (path, fd, token) => api(path, { method: "POST", headers: token ? { "x-token": token } : {}, body: fd });

  // ======================================================================= galactic war (community API, cached server-side)
  let WAR = null, warAt = 0, warP = null, moOpen = false;
  function loadWar() {
    if (warP && Date.now() - warAt < 120000) return warP;
    warAt = Date.now();
    warP = api("/api/war").then(w => (WAR = w && w.ok ? w : null), () => (WAR = null));
    return warP;
  }
  function timeLeft(iso) {
    const ms = Date.parse(iso) - Date.now();
    if (!(ms > 0)) return "";
    const h = Math.floor(ms / 3600000);
    return h >= 48 ? t("war.days", { n: Math.floor(h / 24) }) : t("war.hours", { n: Math.max(1, h) });
  }
  function moPct(o) {
    const ts = o.tasks || [];
    // overall: the mean of each task's progress (a count task counts its share; a planet task is 0 or 100)
    return Math.round(ts.reduce((a, x) => a + (x.goal ? x.pct : x.done ? 100 : 0), 0) / Math.max(1, ts.length));
  }
  const meter = pct => el("div", { class: "meter", role: "img", "aria-label": pct + "%" }, [el("i", { style: "width:" + Math.max(0, Math.min(100, pct || 0)) + "%" })]);
  // The current Major Order as a fold: one line closed, briefing + tasks open.
  function moStrip(o) {
    const pct = moPct(o), left = timeLeft(o.expires);
    const d = el("details", { class: "mo", open: moOpen ? true : null });
    d.addEventListener("toggle", () => { moOpen = d.open; });
    d.appendChild(el("summary", {}, [
      el("span", { class: "mok" }, ["★ " + t("war.mo")]),
      el("span", { class: "mot" }, [o.title]),
      left ? el("span", { class: "mol" }, [left]) : null,
      el("span", { class: "mop" }, [pct + "%"]),
    ]));
    const mp = ((WAR && WAR.planets) || []).filter(p => p.mo).map(p => p.name);
    d.appendChild(el("div", { class: "mob" }, [
      meter(pct),
      o.briefing ? el("p", {}, [o.briefing]) : null,
      el("ol", { class: "motasks" }, (o.tasks || []).map(x => el("li", { class: x.done || x.pct >= 100 ? "done" : null }, [
        x.kind ? el("b", {}, [t("war.k." + x.kind, { who: x.faction ? t("faction." + x.faction) : x.planet }) + ": "]) : null,
        x.goal ? nf(x.got) + " / " + nf(x.goal) + " (" + x.pct + "%)" : x.done ? "✓ " + t("war.task.done") : t("war.task.open")]))),
      mp.length ? el("div", { class: "hint", style: "margin:0" }, [t("war.mo.planets") + ": " + mp.join(" · ")]) : null,
      el("div", { class: "hint", style: "margin:0" }, [t("war.source") + (WAR && WAR.stale ? " · " + t("war.stale") : "")]),
    ]));
    return d;
  }
  function planetLabel(p) {
    return (p.mo ? "★ " : "") + p.name + " · " + t("faction." + p.enemy) + (p.defense ? " · " + t("war.defense") : "") +
      " · " + t("war.divers", { n: nf(p.players) });
  }
  function warPanel() {
    const body = el("div", { class: "stack", style: "gap:10px" }, [el("div", { class: "hint", style: "margin:0" }, [t("home.loading")])]);
    const card = panel("SYS-00", t("war.title"), { status: t("war.live"), statusKind: "ok" }, [body]);
    loadWar().then(w => {
      if (!w || (!w.orders.length && !w.planets.length)) { card.remove(); return; }
      body.innerHTML = "";
      w.orders.forEach(o => body.appendChild(moStrip(o)));
      const top = w.planets.slice(0, 8);
      if (top.length) body.appendChild(el("div", { class: "fronts" }, [el("span", { class: "label" }, [t("war.fronts")])].concat(top.map(p =>
        el("div", { class: "front f-" + p.enemy }, [
          el("div", { class: "fn" }, [(p.mo ? "★ " : "") + p.name, el("span", { class: "fs" }, [[t("faction." + p.enemy), p.defense ? t("war.defense") : null, p.biome].filter(Boolean).join(" · ")])]),
          el("div", { class: "fp" }, [t("war.divers", { n: nf(p.players) })]),
          p.progress != null ? meter(p.progress) : null,
          p.hazard_names.length ? el("div", { class: "fh" }, [p.hazard_names.join(" · ")]) : null,
        ])))));
    });
    return card;
  }

  // ======================================================================= feedback
  let toastT;
  function toast(m) { const n = $("#toast"); n.textContent = m; n.classList.add("show"); clearTimeout(toastT); toastT = setTimeout(() => n.classList.remove("show"), 2600); }
  function setStatus(node, kind, msg) {
    if (!node) return;
    node.className = "upstatus " + kind; node.innerHTML = "";
    if (kind === "working") node.appendChild(el("span", { class: "spin", "aria-hidden": "true" }));
    node.appendChild(el("span", {}, [msg]));
    node.style.display = "flex";
  }
  const lines = (prefix, n) => Array.from({ length: n }, (_, i) => t(prefix + (i + 1)));
  // rotating Helldivers-flavoured status while a model call is in flight; returns stop()
  function workTicker(node, ls) {
    let i = Math.floor(Math.random() * ls.length);
    setStatus(node, "working", ls[i]);
    const tm = setInterval(() => { i = (i + 1) % ls.length; const s = node.querySelector("span:not(.spin)"); if (s) s.textContent = ls[i]; }, 2400);
    return () => clearInterval(tm);
  }
  // full-screen "regenerating loadouts" screen: themed lines, held for at least `min` ms so it registers
  async function regenScreen(work, min) {
    const ov = el("div", { class: "regen", role: "status", "aria-live": "polite" }, [
      el("div", { class: "box" }, [el("div", { class: "hex", "aria-hidden": "true" }, ["⬡"]), el("div", { class: "rt" }, [t("regen.title")]), el("div", { class: "upstatus working" })])]);
    document.body.appendChild(ov);
    const stop = workTicker(ov.querySelector(".upstatus"), lines("tick.gen.", 6));
    const t0 = Date.now();
    try { return await work; }
    finally {
      await new Promise(r => setTimeout(r, Math.max(0, (min || 1500) - (Date.now() - t0))));
      stop(); ov.remove();
    }
  }
  // lock upload controls until the request succeeds or fails
  function lockControls(els, locked) {
    els.forEach(c => {
      if (!c) return;
      c.classList.toggle("locked", locked); c.setAttribute("aria-disabled", String(locked));
      const inp = c.tagName === "INPUT" ? c : c.querySelector("input");
      if (inp) { inp.disabled = locked; if (!locked && inp.type === "file") inp.value = ""; }
      if (c.tagName === "BUTTON") c.disabled = locked;
    });
  }
  function copy(text, msg) {
    (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(() => toast(msg), () => {
      const ta = el("textarea"); ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); } catch (e) {} document.body.removeChild(ta); toast(msg);
    });
  }

  // ======================================================================= building blocks
  function panel(pid, title, opts, kids) {
    opts = opts || {};
    const ps = opts.status ? el("span", { class: "ps " + (opts.statusKind || "info") }, [opts.status]) : null;
    return el("section", { class: "panel" + (opts.tone ? " " + opts.tone : ""), id: opts.id }, [
      el("div", { class: "ph" }, [el("span", { class: "pid" }, [pid]), el("span", { class: "pt" }, [title]), ps]),
    ].concat(kids || []));
  }
  // item name -> wiki link (opens a new tab), so any diver can double-check a pick
  const wk = name => { const u = META && META.wiki && META.wiki[name]; return u ? el("a", { class: "wk", href: u, target: "_blank", rel: "noopener" }, [name]) : name; };
  const tag = (cls, text, title) => el("span", { class: "tag " + (cls || ""), title: title }, [text]);
  const fileBtn = (cls, text, multiple) => el("label", { class: "btn filebtn " + (cls || "") }, [text, el("input", { type: "file", accept: "image/*", multiple: multiple ? "" : null })]);

  // ======================================================================= boot
  initLang();
  // device handoff: a "use on another device" link carries #me=<pid>.<token>
  (function claimFromHash() {
    const m = location.hash.match(/^#me=([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/);
    if (!m || !LID) return;
    store.setMe(LID, { id: m[1], token: m[2] });
    history.replaceState(null, "", location.pathname + location.search);   // don't leave the token in the address bar
  })();
  (async function boot() {
    META = await api("/api/meta");
    if (!LID) return renderHome();
    startPolling();
    loadWar().then(w => { if (w && STATE && !busy) { lastSig = ""; tick(); } });
  })().catch(e => { app.innerHTML = ""; app.appendChild(el("div", { class: "alert red" }, [el("b", {}, ["ERR"]), t("err.start", { msg: e.message })])); });

  // ======================================================================= home
  function renderHome() {
    app.innerHTML = ""; app.className = "stack boot";
    const name = el("input", { type: "text", id: "sq-name", placeholder: t("home.name.ph"), maxlength: "40", autocomplete: "off" });
    let size = 4;
    const sizeSeg = el("div", { class: "seg big", role: "group", "aria-label": t("home.size.label") });
    [1, 2, 3, 4].forEach(n => {
      const b = el("button", { type: "button", "aria-pressed": String(n === size) }, [String(n)]);
      b.onclick = () => { size = n; sizeSeg.querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", String(x === b))); };
      sizeSeg.appendChild(b);
    });
    const deploy = el("button", { class: "btn primary wide deploy", type: "button" }, ["▶ " + t("home.deploy")]);
    deploy.onclick = async () => {
      deploy.disabled = true; deploy.textContent = "▶ " + t("home.deploying");
      try {
        const fd = new FormData(); fd.append("name", name.value.trim() || "Squad"); fd.append("squad_size", String(size));
        const r = await fdpost("/api/lobby", fd);
        store.setCreator(r.lobby_id, r.creator_token);
        location.search = "?l=" + r.lobby_id;
      } catch (e) { toast(e.message); deploy.disabled = false; deploy.textContent = "▶ " + t("home.deploy"); }
    };
    name.addEventListener("keydown", e => { if (e.key === "Enter") deploy.click(); });

    const term = el("div", { class: "term", "aria-hidden": "true" });
    app.appendChild(el("section", { class: "hero" }, [
      el("div", { class: "fx rings" }), el("div", { class: "fx radar" }),
      el("div", { class: "hero-body" }, [
        el("div", { class: "eyebrow" }, [t("app.eyebrow")]),
        el("h1", { class: "wordmark", style: "font-size:inherit;margin:0" }, [el("div", { class: "wordmark" }, ["WARMIND"])]),
        el("div", { class: "tag-line" }, [t("app.tagline")]),
        term,
        el("div", { class: "console" }, [
          el("div", { class: "field" }, [el("label", { class: "label", for: "sq-name" }, ["> " + t("home.name.label")]), name]),
          el("div", { class: "field" }, [el("span", { class: "label" }, ["> " + t("home.size.label")]), sizeSeg]),
          deploy,
        ]),
      ]),
    ]));
    app.appendChild(panel("SYS-01", t("home.j.title"), {}, [el("div", { class: "journey" }, [1, 2, 3].map(i =>
      el("div", { class: "st" }, [el("div", { class: "n" }, ["0" + i]), el("div", { class: "t" }, [t("home.j" + i + ".t")]), el("div", { class: "d" }, [t("home.j" + i + ".d")])])))]));
    app.appendChild(warPanel());
    const fmFold = el("details", { class: "fold panel fmfold", style: "padding:0" }, [el("summary", {}, ["▤ " + t("gl.title") + " — " + t("gl.teaser")])]);
    fmFold.addEventListener("toggle", () => { if (fmFold.open && fmFold.children.length < 2) fmFold.appendChild(manualBody()); });
    app.appendChild(fmFold);
    renderMyLobbies();
    app.appendChild(el("div", { class: "btnrow", style: "justify-content:center" }, [feedbackBtn()]));
    if (META.vision && META.vision.mock) app.appendChild(el("div", { class: "alert" }, [el("b", {}, [t("alert.mock.t")]), t("alert.mock")]));
    bootSequence(term);
  }

  function storedLobbies() {
    const map = {};
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i), m = k && k.match(/^wm_(creator|me)_(.+)$/);
        if (m) { const id = m[2]; map[id] = map[id] || { id: id }; map[id][m[1] === "creator" ? "own" : "member"] = true; }
      }
    } catch (e) {}
    return Object.keys(map).map(id => map[id]);
  }
  function forgetLobby(id) { try { localStorage.removeItem("wm_creator_" + id); localStorage.removeItem("wm_me_" + id); } catch (e) {} }

  async function renderMyLobbies() {
    const mine = storedLobbies();
    if (!mine.length) return;
    const list = el("div", {}, [el("div", { class: "hint", style: "margin:0" }, [t("home.loading")])]);
    const card = panel("SYS-02", t("home.tables"), {}, [list]);
    app.appendChild(card);
    let data;
    try { data = await jpost("/api/lobbies/summary", { ids: mine.map(x => x.id) }); } catch (e) { card.remove(); return; }
    const found = new Set((data.lobbies || []).map(l => l.id));
    mine.forEach(x => { if (!found.has(x.id)) forgetLobby(x.id); });  // prune expired
    const rows = (data.lobbies || []).sort((a, b) => (b.updated_at || 0) - (a.updated_at || 0));
    if (!rows.length) { card.remove(); return; }
    list.innerHTML = "";
    const owned = new Set(mine.filter(x => x.own).map(x => x.id));
    rows.forEach(l => {
      const meta = [l.players === 1 ? t("home.meta.diver") : t("home.meta.divers", { n: l.players }) + (l.squad_size ? " / " + l.squad_size : ""),
        l.mission_name || t("home.meta.nomission"), l.mode ? t("mode." + l.mode) : null].filter(Boolean).join(" · ");
      const resume = el("a", { class: "btn sm", href: "/?l=" + encodeURIComponent(l.id) }, [t("home.resume")]);
      const forget = el("button", { class: "btn sm red", type: "button", title: t("home.forget"), "aria-label": t("home.forget") }, ["×"]);
      const row = el("div", { class: "lrow" }, [
        el("div", { style: "min-width:0" }, [el("div", { class: "nm" }, [l.name || "Squad"]), el("div", { class: "mt" }, [meta])]),
        tag(owned.has(l.id) ? "amber" : "cyan", owned.has(l.id) ? t("common.creator") : t("common.diver")), resume, forget,
      ]);
      forget.onclick = () => { forgetLobby(l.id); row.remove(); if (!list.children.length) card.remove(); };
      list.appendChild(row);
    });
  }

  function bootSequence(term) {
    const M = META || {};
    const L = [
      [t("home.boot.1"), t("home.boot.ok")], [t("home.boot.2"), t("home.boot.est")],
      [t("home.boot.3"), t("home.boot.ops", { n: (M.missions || []).length || "—" })],
      [t("home.boot.4"), t("home.boot.tags", { n: (M.hazards || []).length || "—" })],
      [t("home.boot.5"), t("home.boot.online")], [t("home.boot.6"), ""],
    ];
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let i = 0;
    (function add() {
      if (!term.isConnected) return;
      const [head, tail] = L[i];
      const ln = el("div", { class: "ln" }, ["> " + head + (tail ? " … " : "")]);
      if (tail) ln.appendChild(el("span", { class: "ok" }, [tail]));
      if (i === L.length - 1) ln.appendChild(el("span", { class: "cur" }));
      term.appendChild(ln);
      if (++i < L.length) reduce ? add() : setTimeout(add, 190);
    })();
  }

  // ======================================================================= polling
  function startPolling() { tick(); pollT = setInterval(tick, 3500); }
  async function tick() {
    if (busy) return;
    // don't yank a dropdown out from under the user mid-choice
    const ae = document.activeElement;
    if (ae && ae.tagName === "SELECT" && ae.id !== "lang" && app.contains(ae)) return;
    let s;
    try { s = await api("/api/lobby/" + LID); }
    catch (e) {
      if (String(e.message).match(/not found/i)) {
        clearInterval(pollT); app.innerHTML = "";
        app.appendChild(panel("ERR-404", t("lobby.notfound"), { tone: "red" }, [el("a", { class: "btn primary", href: "/" }, [t("lobby.new")])]));
      }
      return;
    }
    const sig = JSON.stringify(s);
    if (sig === lastSig && STATE) return;   // nothing changed: leave the page (and any open folds) alone
    if (STATE && s.directive && (JSON.stringify(STATE.mission) !== JSON.stringify(s.mission) || (STATE.reroll || 0) !== (s.reroll || 0))) {
      busy = true;
      try { await regenScreen(null, 1500); } finally { busy = false; }
    }
    if (STATE) announce(STATE, s);
    lastSig = sig; STATE = s;
    try { liveRoot ? renderLive() : render(); } catch (e) { console.error("WARMIND render failed:", e); }
  }
  // what changed since the last poll that someone else did — divers in, mission edits, loadouts landing
  function announce(prev, next) {
    const me = meRec(), had = new Set(prev.players.map(p => p.id));
    const fresh = next.players.filter(p => !had.has(p.id) && !(me && me.id === p.id)).map(p => p.callsign);
    const msgs = [];
    if (fresh.length) msgs.push(t("toast.diver_in", { list: fresh.join(", ") }));
    if (JSON.stringify(prev.mission) !== JSON.stringify(next.mission) && prev.mission)
      msgs.push(next.directive ? t("toast.mission_changed") : t("toast.mission_changed.plain"));
    else if (!prev.directive && next.directive) msgs.push(t("toast.loadouts_ready"));
    else if ((prev.reroll || 0) !== (next.reroll || 0)) msgs.push(t("toast.rerolled"));
    if (msgs.length) toast(msgs.join(" · "));
  }
  async function refresh() { STATE = await api("/api/lobby/" + LID); lastSig = JSON.stringify(STATE); renderLive(); }

  // ======================================================================= lobby
  // Full render builds the skeleton + the forms ONCE (join, mission editor); the poll only
  // refreshes the live regions, so it never clobbers a form you're filling in.
  let liveRoot = null, R = {};
  const isCreator = () => !!store.creator(LID);
  const meRec = () => store.me(LID);
  const myPlayer = () => { const m = meRec(); return m && STATE.players.find(p => p.id === m.id); };
  const meta = id => (META.missions || []).find(x => x.id === id);

  function sect(n, key) {
    const s = el("div", { class: "sect", id: "s" + n }, [
      el("div", { class: "num", "aria-hidden": "true" }, ["0" + n]),
      el("div", {}, [el("div", { class: "tt" }, [t("phase." + n)]), el("div", { class: "ss" }, [t("phase." + n + ".s")])]),
      el("div", { class: "bar" }),
    ]);
    return s;
  }

  // Tabbed views instead of one long scroll. The tab bar follows the squad's progress
  // (assemble -> mission -> briefing -> debrief) until the viewer picks a tab; after that
  // a dot marks tabs that changed. The choice is remembered per war table.
  let curTab = null, tabPinned = false, lastTarget = null, curSub = "loadouts";
  let kitView = (() => { try { return localStorage.getItem("wm_kitview") || "screen"; } catch (e) { return "screen"; } })();
  const tabDots = {};
  const TAB_KEY = () => "wm_tab_" + LID;
  try { const v = parseInt(localStorage.getItem(TAB_KEY()), 10); if (v >= 1 && v <= 5) { curTab = v; tabPinned = true; } } catch (e) {}

  function render() {
    app.innerHTML = ""; app.className = "stack boot";
    R = {};
    if (META.vision && META.vision.mock) app.appendChild(el("div", { class: "alert" }, [el("b", {}, [t("alert.mock.t")]), t("alert.mock")]));
    R.cmd = el("div"); app.appendChild(R.cmd);
    R.tabbar = el("nav", { class: "tabbar", role: "tablist", "aria-label": t("tabs.label") }); app.appendChild(R.tabbar);
    R.views = {};
    for (let i = 1; i <= 5; i++) { R.views[i] = el("div", { class: "view stack", role: "tabpanel", id: "v" + i }); app.appendChild(R.views[i]); }

    // 01 ASSEMBLE — join (static form), manifest + my setup (live)
    R.s1 = sect(1); R.views[1].appendChild(R.s1);
    if (!myPlayer()) R.views[1].appendChild(joinPanel());
    R.live1 = el("div", { class: "stack" }); R.views[1].appendChild(R.live1);
    // 02 MISSION — readout (live) + editor (static, creator)
    R.s2 = sect(2); R.views[2].appendChild(R.s2); R.views[2].appendChild(missionPanel());
    // 03 BRIEFING (with sub-tabs), 04 DEBRIEF — live
    R.s3 = sect(3); R.views[3].appendChild(R.s3);
    R.live3 = el("div", { class: "stack" }); R.views[3].appendChild(R.live3);
    R.s4 = sect(4); R.views[4].appendChild(R.s4);
    R.live4 = el("div", { class: "stack" }); R.views[4].appendChild(R.live4);
    // FIELD MANUAL — its own tab
    R.views[5].appendChild(el("div", { class: "sect", id: "s5" }, [
      el("div", { class: "num", "aria-hidden": "true" }, ["FM"]),
      el("div", {}, [el("div", { class: "tt" }, [t("gl.title")]), el("div", { class: "ss" }, [t("gl.teaser")])]),
      el("div", { class: "bar" })]));
    R.views[5].appendChild(manualPanel());
    liveRoot = app;
    renderLive();
  }

  function setTab(i, pin) {
    if (pin) { tabPinned = true; try { localStorage.setItem(TAB_KEY(), String(i)); } catch (e) {} }
    const changed = curTab !== i;
    curTab = i; delete tabDots[i];
    for (let k = 1; k <= 5; k++) R.views[k].hidden = k !== i;
    paintTabs();
    if (changed && pin) {
      R.views[i].classList.remove("scanin"); void R.views[i].offsetWidth; R.views[i].classList.add("scanin");
      const top = R.tabbar.getBoundingClientRect().top + window.scrollY - 6;
      if (window.scrollY > top) window.scrollTo(0, top);
    }
  }

  function paintTabs() {
    const ph = phases();
    R.tabbar.innerHTML = "";
    [1, 2, 3, 4, 5].forEach(i => {
      const done = i <= 4 && ph.done[i - 1], active = i <= 4 && ph.active === i - 1;
      const b = el("button", { type: "button", role: "tab", "aria-selected": String(curTab === i),
        class: "tab" + (done ? " done" : "") + (active ? " live" : "") + (i === 5 ? " manual" : "") + (tabDots[i] ? " dot" : "") }, [
        el("span", { class: "led", "aria-hidden": "true" }),
        el("span", { class: "tn" }, [i === 5 ? "FM" : "0" + i]),
        el("b", {}, [i === 5 ? t("gl.short") : t("phase." + i)]),
      ]);
      b.onclick = () => (curTab === 1 && i !== 1 ? guardGear(() => setTab(i, true)) : setTab(i, true));
      R.tabbar.appendChild(b);
    });
  }

  function phases() {
    const r = STATE.readiness || {}, d = !!STATE.directive;
    const done = [
      !!(r.briefed || (r.joined > 0 && r.joined >= r.expected && r.read >= r.joined && r.gear >= r.joined)),
      !!r.mission_set,
      !!(d && r.final),
      !!(d && STATE.players.length && STATE.players.every(p => p.aar)),
    ];
    let active = done.indexOf(false);
    return { done: done, active: active };
  }

  function renderLive() {
    if (!liveRoot) return render();
    const y = window.scrollY;
    const ph = phases();
    [R.s1, R.s2, R.s3, R.s4].forEach((s, i) => { s.classList.toggle("done", ph.done[i]); s.classList.toggle("active", ph.active === i); });
    R.cmd.innerHTML = ""; R.cmd.appendChild(commandPanel(ph));
    R.live1.innerHTML = ""; R.live1.appendChild(manifestPanel()); const me = myPlayer(); if (me) R.live1.appendChild(setupPanel(me));
    updateMissionReadout();
    R.live3.innerHTML = ""; briefingView().forEach(n => R.live3.appendChild(n));
    R.live4.innerHTML = ""; R.live4.appendChild(debriefPanel());
    // which tab: follow the squad's phase until the viewer picks one; then flag what changed
    // not joined yet: Assemble, where the join form is (a late joiner must not land on Debrief)
    const target = !myPlayer() ? 1 : ph.active < 0 ? 4 : ph.active + 1;
    if (curTab === null) curTab = target;
    if (!tabPinned && !gearDirty() && curTab !== target && lastTarget !== null) { setTab(target, false); toast(t("tabs.moved", { tab: t("phase." + target) })); }
    else { if (tabPinned && lastTarget !== null && target !== lastTarget && target !== curTab) tabDots[target] = true; setTab(curTab, false); }
    lastTarget = target;
    window.scrollTo(0, y);
  }

  // Briefing sub-tabs: Loadouts / Squad review / Plan — the long briefing in focused pieces
  function briefingView() {
    const nodes = briefing();
    if (!STATE.directive) return nodes;
    const subs = [["loadouts", t("sub.loadouts")], ["review", t("sub.review")], ["plan", t("sub.plan")]];
    const bar = el("div", { class: "seg subtabs", role: "tablist" });
    const show = () => {
      bar.querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.sub === curSub)));
      nodes.forEach(n => { n.hidden = !!n.dataset.sub && n.dataset.sub !== curSub; });
    };
    subs.forEach(([k, label]) => {
      if (!nodes.some(n => n.dataset.sub === k)) return;
      const b = el("button", { type: "button", "data-sub": k }, [label]);
      b.onclick = () => { curSub = k; show(); };
      bar.appendChild(b);
    });
    if (!nodes.some(n => n.dataset.sub === curSub)) curSub = "loadouts";
    show();
    return [bar].concat(nodes);
  }

  // Feedback: name + kind + message, saved with a timestamp and where in the app it came
  // from. Synced daily into public GitHub issues, so the form says it's public.
  function feedbackBtn(cls) {
    const b = el("button", { type: "button", class: "btn sm " + (cls || "") }, ["✎ " + t("fb.button")]);
    b.onclick = openFeedback;
    return b;
  }
  function openFeedback() {
    const me = LID && STATE ? myPlayer() : null;
    let saved = ""; try { saved = localStorage.getItem("wm_fb_name") || ""; } catch (e) {}
    const name = el("input", { type: "text", maxlength: "40", value: (me && me.callsign) || saved, placeholder: t("fb.name.ph"), autocomplete: "off" });
    let kind = "idea";
    const kinds = el("div", { class: "seg", role: "group" });
    ["bug", "idea", "other"].forEach(k => {
      const b = el("button", { type: "button", "aria-pressed": String(k === kind) }, [t("fb.kind." + k)]);
      b.onclick = () => { kind = k; kinds.querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", String(x === b))); };
      kinds.appendChild(b);
    });
    const text = el("textarea", { rows: "5", maxlength: "2000", placeholder: t("fb.text.ph") });
    const send = el("button", { type: "button", class: "btn primary" }, ["➤ " + t("fb.send")]);
    const cancel = el("button", { type: "button", class: "btn" }, [t("fb.cancel")]);
    const dlg = el("dialog", { class: "modal fbmodal", "aria-label": t("fb.title") });
    send.onclick = async () => {
      if (text.value.trim().length < 3) { text.focus(); return; }
      send.disabled = true;
      try {
        try { localStorage.setItem("wm_fb_name", name.value.trim()); } catch (e) {}
        await jpost("/api/feedback", { name: name.value.trim(), kind: kind, text: text.value.trim(), lobby: LID || "",
          page: LID ? "tab" + (curTab || "") : "home", lang: LANG });
        dlg.close(); toast(t("fb.thanks"));
      } catch (e) { toast(e.message); send.disabled = false; }
    };
    cancel.onclick = () => dlg.close();
    dlg.append(
      el("div", { class: "mhead" }, [el("b", {}, [t("fb.title")])]),
      el("div", { class: "mbody" }, [
        el("span", { class: "label" }, [t("fb.name")]), name,
        el("span", { class: "label" }, [t("fb.kind")]), kinds,
        el("span", { class: "label" }, [t("fb.text")]), text,
        el("div", { class: "hint", style: "margin:0" }, [t("fb.public")]),
      ]),
      el("div", { class: "mfoot" }, [el("div", { class: "btnrow", style: "margin:0" }, [send, cancel])]));
    dlg.addEventListener("close", () => dlg.remove());
    document.body.appendChild(dlg);
    dlg.showModal ? dlg.showModal() : dlg.setAttribute("open", "");
    (name.value ? text : name).focus();
  }

  function homeLink() {
    const a = el("a", { class: "btn sm", href: "/" }, [t("cmd.home")]);
    a.onclick = e => { if (!gearDirty()) return; e.preventDefault(); guardGear(() => { location.href = "/"; }); };
    return a;
  }

  // ----------------------------------------------------------------- command header
  function commandPanel(ph) {
    const link = location.origin + "/?l=" + LID;
    const inv = el("button", { class: "btn primary", type: "button" }, [t("cmd.invite")]);
    inv.onclick = () => copy(link, t("common.copied"));
    const role = isCreator() ? tag("amber", t("common.creator")) : myPlayer() ? tag("cyan", t("common.diver")) : null;
    const fm = el("button", { class: "btn sm fmbtn", type: "button" }, ["▤ " + t("gl.short")]);
    fm.onclick = () => guardGear(() => setTab(5, true));
    const status = ph.active < 0 ? t("phase.4") + " ✓" : t("phase." + (ph.active + 1));
    return panel(t("cmd.pid"), t("cmd.title"), { status: status, statusKind: ph.active < 0 ? "ok" : "warn" }, [
      el("div", { class: "cmd" }, [el("div", { class: "top" }, [
        el("div", { class: "who" }, [el("div", { class: "big" }, [STATE.name || "Squad"]),
          el("div", { class: "code" }, [t("cmd.code") + ": ", el("b", {}, [LID])])]),
        el("div", { class: "acts" }, [role, inv, fm, feedbackBtn(), homeLink()]),
      ])]),
      el("div", { class: "uplink", "aria-hidden": "true" }, [
        el("span", { class: "ok" }, ["● " + t("cmd.uplink")]),
        el("span", {}, ["SEC-" + LID.slice(0, 4).toUpperCase()]),
        el("span", {}, [STATE.players.length + "/" + ((STATE.readiness || {}).expected || STATE.players.length) + " " + t("cmd.divers")]),
        el("span", { class: "clock" }, [new Date().toISOString().slice(11, 16) + " UTC"]),
      ]),
      ...((WAR && WAR.orders) || []).slice(0, 2).map(moStrip),
    ]);
  }

  // ----------------------------------------------------------------- 01: join
  function joinPanel() {
    const name = el("input", { type: "text", id: "cs", placeholder: t("join.cs.ph"), maxlength: "32", autocomplete: "off" });
    const status = el("div", { class: "upstatus", role: "status", "aria-live": "polite" });
    const upload = fileBtn("primary", t("join.upload"), true);
    const skip = el("button", { class: "btn", type: "button" }, [t("join.skip")]);
    const controls = [upload, skip, name];
    upload.querySelector("input").onchange = ev => { if (ev.target.files && ev.target.files.length) doJoin(name.value, ev.target.files, status, controls); };
    skip.onclick = () => doJoin(name.value, null, status, controls);
    name.addEventListener("keydown", e => { if (e.key === "Enter") skip.click(); });
    return panel(t("join.pid"), t("join.title"), { tone: "amber", status: t("common.diver"), statusKind: "warn" }, [
      el("div", { class: "field" }, [el("label", { class: "label", for: "cs" }, [t("join.cs.label")]), name]),
      el("div", { class: "btnrow" }, [upload, skip]),
      status,
      el("div", { class: "hint" }, [t("join.hint")]),
      el("div", { class: "hint" }, [t("join.hint.return")]),
      STATE && STATE.players.length ? el("div", { class: "hint linked" }, [t("join.linked")]) : null,
    ]);
  }
  async function doJoin(callsign, files, status, controls) {
    if (busy) return;
    busy = true;
    const list = files ? Array.from(files) : [];
    lockControls(controls, true);
    const stop = list.length ? workTicker(status, lines("tick.read.", 10)) : (setStatus(status, "working", t("join.joining")), () => {});
    try {
      const fd = new FormData(); fd.append("callsign", (callsign || "").trim());
      list.forEach(f => fd.append("images", f));
      const r = await fdpost("/api/lobby/" + LID + "/join", fd);
      store.setMe(LID, { id: r.player_id, token: r.player_token });
      stop();
      STATE = await api("/api/lobby/" + LID); lastSig = JSON.stringify(STATE);
      render();
      if (r.gear_restored == null) {   // not remembered by callsign: fall back to this device's last gear
        let dev = null; try { dev = JSON.parse(localStorage.getItem("wm_gear")); } catch (e) {}
        if (dev && ("owned" in dev)) {
          try { await jpost("/api/lobby/" + LID + "/player/" + r.player_id + "/owned", dev, r.player_token); STATE = await api("/api/lobby/" + LID); lastSig = JSON.stringify(STATE); render(); r.gear_restored = "device"; } catch (e) {}
        }
      }
      if (r.gear_restored != null) setTimeout(() => toast(r.gear_restored === "device" ? t("toast.gear_device") : t("toast.gear_restored")), 2800);
      const st = styleLabel(r.play_style);
      toast(r.over_budget ? r.vision_error : r.vision_error ? t("toast.joined.err2") : r.restored ? t("toast.joined.restored", { style: st })
        : list.length ? (list.length > 1 ? t("toast.joined.reads", { style: st, n: list.length }) : t("toast.joined.read", { style: st })) : t("toast.joined.plain"));
    } catch (e) {
      stop(); lockControls(controls, false);
      setStatus(status, "err", t("join.failed", { msg: e.message }));
    } finally { stop(); busy = false; }
  }

  // ----------------------------------------------------------------- 01: manifest
  function manifestPanel() {
    const r = STATE.readiness || {}, me = meRec();
    const rows = el("div", { class: "manifest" });
    STATE.players.forEach(p => {
      const mine = me && me.id === p.id;
      const stats = !p.has_stats ? tag("amber dash", t("man.stats.none")) : p.style_source === "remembered" ? tag("cyan", t("man.stats.rem")) : tag("green", t("man.stats.read"));
      const gear = p.gear_confirmed ? tag("green", t("man.gear.set")) : tag("amber dash", t("man.gear.unset"));
      const medal = p.aar && p.aar.verdict && p.aar.verdict.medal ? tag("amber", "🎖 " + p.aar.verdict.medal.id) : null;
      const sub = [styleLabel(p.play_style), p.assignment ? p.assignment.role : null].filter(Boolean).join(" · ");
      const row = el("div", { class: "mrow" + (mine ? " me" : "") }, [
        el("div", { class: "stripe" }),
        el("div", { style: "min-width:0" }, [el("div", { class: "nm" }, [p.callsign]), el("div", { class: "sub" }, [sub])]),
        el("div", { class: "pips" }, [mine ? tag("amber", t("common.you")) : null, stats, gear, medal,
          isCreator() && !mine ? (() => {
            const rm = el("button", { class: "btn sm red rm", type: "button", title: t("man.remove"), "aria-label": t("man.remove") }, ["×"]);
            rm.onclick = async () => {
              if (busy || !confirm(t("man.remove.confirm", { callsign: p.callsign }))) return;
              busy = true;
              try { await api("/api/lobby/" + LID + "/player/" + p.id, { method: "DELETE", headers: { "x-token": store.creator(LID) } }); busy = false; await refresh(); }
              catch (e) { toast(e.message); } finally { busy = false; }
            };
            return rm;
          })() : null]),
      ]);
      row.style.setProperty("--acc", p.accent);
      rows.appendChild(row);
    });
    for (let i = STATE.players.length; i < (r.expected || 0); i++) {
      rows.appendChild(el("div", { class: "mrow empty" }, [el("div", { class: "stripe" }), el("div", { class: "nm" }, ["// " + t("man.awaiting")]), el("div")]));
    }
    const item = (ok, txt) => el("div", { class: "it" + (ok ? " ok" : "") }, [el("i", { "aria-hidden": "true" }, [ok ? "✓" : ""]), txt]);
    const rdy = el("div", { class: "rdy" }, [
      item(r.mission_set, t("rdy.mission")),
      item(r.joined >= r.expected && r.joined > 0, t("rdy.divers", { a: r.joined || 0, b: r.expected || 0 })),
      item(r.joined > 0 && r.read >= r.joined, t("rdy.reads", { a: r.read || 0, b: r.joined || 0 })),
      item(r.joined > 0 && r.gear >= r.joined, t("rdy.gear", { a: r.gear || 0, b: r.joined || 0 })),
    ]);
    const kids = [rows, rdy];
    if (STATE.squad_readout_keys && STATE.squad_readout_keys.length)
      kids.push(el("div", { class: "readout-q" }, [t("readout.prefix", { list: STATE.squad_readout_keys.map(k => t("ro." + k)).join("; ") })]));
    else if (STATE.squad_readout) kids.push(el("div", { class: "readout-q" }, [STATE.squad_readout]));
    if (r.final) kids.push(el("div", { class: "hint" }, [r.ready ? t("rdy.final.ready") : t("rdy.final.early")]));
    else {
      kids.push(el("div", { class: "hint" }, [t("rdy.hold")]));
      if (isCreator() && r.joined > 0 && r.mission_set) {
        const b = el("button", { class: "btn", type: "button" }, [t("rdy.generate")]);
        b.onclick = async () => {
          if (busy) return; busy = true; b.disabled = true;
          try { STATE = await jpost("/api/lobby/" + LID + "/brief", {}, store.creator(LID)); lastSig = JSON.stringify(STATE); renderLive(); toast(t("rdy.generated")); }
          catch (e) { toast(e.message); b.disabled = false; } finally { busy = false; }
        };
        kids.push(el("div", { class: "btnrow" }, [b]), el("div", { class: "hint" }, [t("rdy.generate.hint")]));
      }
    }
    return panel(t("man.pid"), t("man.title"), { status: r.final ? t("rdy.briefed") : t("rdy.status.wait"), statusKind: r.final ? "ok" : "warn" }, kids);
  }

  // ----------------------------------------------------------------- 01: my setup
  let gearOpen = {};   // pid -> open state, kept across re-renders
  function setupPanel(p) {
    const status = el("div", { class: "upstatus", role: "status", "aria-live": "polite" });
    const reread = fileBtn("", t("me.upload_new"), true);
    const styleSel = el("select", { id: "my-style", "aria-label": t("me.style") }, (META.archetypes || []).map(k => el("option", { value: k }, [styleLabel(k)])));
    styleSel.value = p.play_style;
    styleSel.onchange = async () => {
      if (busy) return; busy = true;
      try { await jpost("/api/lobby/" + LID + "/player/" + p.id + "/style", { play_style: styleSel.value }, meRec().token); await refresh(); }
      catch (e) { toast(e.message); } finally { busy = false; }
    };
    reread.querySelector("input").onchange = async ev => {
      const list = Array.from(ev.target.files || []); if (!list.length || busy) return;
      busy = true; lockControls([reread, styleSel], true);
      const stop = workTicker(status, lines("tick.read.", 10));
      try {
        const fd = new FormData(); list.forEach(f => fd.append("images", f));
        const r = await fdpost("/api/lobby/" + LID + "/player/" + p.id + "/career", fd, meRec().token);
        stop();
        if (r.ok === false) setStatus(status, "warn", r.over_budget ? r.vision_error : t("me.reread.bad"));
        else { await refresh(); toast(t("toast.joined.read", { style: styleLabel(r.play_style) })); }
      } catch (e) { stop(); setStatus(status, "err", t("join.failed", { msg: e.message })); }
      finally { stop(); lockControls([reread, styleSel], false); busy = false; }
    };

    const gear = gearFold(p);
    const kids = [];
    if (gear && !p.gear_confirmed) kids.push(gear);             // gear-first until it's set
    kids.push(el("div", { class: "hint", style: "margin-top:0" }, [tp(p.style_note_i18n, p.style_note)]));
    if (p.has_stats) kids.push(statBlock(p)); else kids.push(el("div", { class: "hint" }, [t("me.noread")]));
    kids.push(el("div", { class: "grid2", style: "margin-top:14px;align-items:end" }, [
      el("div", { class: "field" }, [el("label", { class: "label", for: "my-style" }, [t("me.style")]), styleSel]),
      el("div", { class: "field" }, [reread]),
    ]));
    kids.push(status);
    const dev = el("button", { class: "btn sm", type: "button" }, ["⇄ " + t("me.device")]);
    dev.onclick = () => copy(location.origin + "/?l=" + LID + "#me=" + p.id + "." + meRec().token, t("me.device.copied"));
    kids.push(el("div", { class: "btnrow" }, [dev]));
    if (gear && p.gear_confirmed) kids.push(gear);
    const pn = panel(t("me.pid"), t("me.title"), { tone: "amber", status: p.callsign, statusKind: "warn" }, kids);
    return pn;
  }

  function statBlock(p) {
    const wrap = el("div");
    const sc = p.scorecard || [];
    if (sc.length) {
      wrap.appendChild(el("div", { class: "sub-h" }, [t("me.read.cool")]));
      wrap.appendChild(el("div", { class: "statgrid" }, sc.map(row => el("div", { class: "stat", title: row.hint || null }, [
        el("div", { class: "k" }, [has("sc." + row.key) ? t("sc." + row.key) : row.label]), el("div", { class: "v" }, [row.value])]))));
    }
    const s = p.stats || {}, conf = p.confidence || null;
    const ver = new Set((conf && conf.verified) || []), unc = new Set((conf && conf.uncertain) || []);
    const mark = f => unc.has(f) ? el("i", { class: "cm warn", title: t("me.conf.warn") }, ["⚠"]) : ver.has(f) ? el("i", { class: "cm ok", title: t("me.conf.ok") }, ["✓"]) : null;
    const raw = el("div", { class: "rawgrid" });
    const add = (k, f, v) => { if (v == null || v === "") return; raw.appendChild(el("span", { class: "k" }, [t(k)])); raw.appendChild(el("span", { class: "v" }, [v, mark(f)])); };
    add("raw.enemy_kills", "enemy_kills", nf(s.enemy_kills)); add("raw.deaths", "deaths", nf(s.deaths));
    add("raw.shots", "shots_hit", nf(s.shots_hit) + " / " + nf(s.shots_fired)); add("raw.missions", "missions_won", nf(s.missions_won) + " / " + nf(s.missions_played));
    add("raw.extractions", "extractions", nf(s.extractions)); add("raw.samples", "samples", nf(s.samples));
    add("raw.stratagems", "total_stratagems", nf(s.total_stratagems)); add("raw.friendly", "friendly_kills", nf(s.friendly_kills));
    const fold = el("details", { class: "fold" }, [el("summary", {}, [t("me.read.raw")]), el("div", { class: "body" }, [raw, unc.size ? el("div", { class: "hint" }, [t("me.read.unc")]) : null])]);
    wrap.appendChild(fold);
    return wrap;
  }

  // ---- unsaved gear: drafts survive live re-renders; leaving the Assemble tab or the page with
  // one asks first (save and continue / discard / keep editing)
  const gearDraft = {};   // pid -> { owned: Set, total }
  const gearDirty = () => { const me = meRec(); return !!(me && gearDraft[me.id]); };
  async function saveGearDraft(pid) {
    const d = gearDraft[pid]; if (!d) return true;
    const payload = d.owned.size >= d.total ? { owned: null, v: 2 } : { owned: Array.from(d.owned), v: 2 };
    if (busy) { toast(t("gf.wait")); return false; }
    busy = true;
    try {
      await jpost("/api/lobby/" + LID + "/player/" + pid + "/owned", payload, meRec().token);
      try { localStorage.setItem("wm_gear", JSON.stringify(payload)); } catch (e) {}   // this device remembers too
      delete gearDraft[pid];
      busy = false; await refresh(); toast(t("gear.saved"));
      return true;
    } catch (e) { toast(e.message); return false; } finally { busy = false; }
  }
  function guardGear(go) {
    if (!gearDirty()) return go();
    const me = meRec();
    const dlg = el("dialog", { class: "modal confirm", "aria-label": t("unsaved.title") });
    const save = el("button", { type: "button", class: "btn primary" }, ["✓ " + t("unsaved.save")]);
    const drop = el("button", { type: "button", class: "btn red" }, [t("unsaved.discard")]);
    const stay = el("button", { type: "button", class: "btn" }, [t("unsaved.stay")]);
    save.onclick = async () => { save.disabled = true; if (await saveGearDraft(me.id)) { dlg.close(); go(); } else save.disabled = false; };
    drop.onclick = () => { delete gearDraft[me.id]; dlg.close(); renderLive(); go(); };
    stay.onclick = () => dlg.close();
    dlg.append(
      el("div", { class: "mhead" }, [el("b", {}, [t("unsaved.title")])]),
      el("div", { class: "mbody" }, [el("p", { style: "margin:0" }, [t("unsaved.body")])]),
      el("div", { class: "mfoot" }, [el("div", { class: "btnrow", style: "margin:0" }, [save, drop, stay])]));
    dlg.addEventListener("close", () => dlg.remove());
    document.body.appendChild(dlg);
    dlg.showModal ? dlg.showModal() : dlg.setAttribute("open", "");
  }
  window.addEventListener("beforeunload", e => { if (gearDirty()) { e.preventDefault(); e.returnValue = ""; } });   // reload / close / external link

  // Gear checklist: the whole library (base game, warbonds, Superstore, events), laid out like the
  // in-game loadout menu — tabs per slot, stratagems under their permit colour with their icons,
  // weapons with their renders and handling stats. A Filter modal narrows it by source, owned
  // state or name; the list re-renders as the filter changes, and bulk actions act on what's shown.
  let gearTab = {};   // pid -> active tab, kept across re-renders
  const GF_KEY = "wm_gearfilter";
  let gearFilter = (() => { try { return JSON.parse(localStorage.getItem(GF_KEY)) || {}; } catch (e) { return {}; } })();
  const gfNorm = f => ({ sources: Array.isArray(f.sources) ? f.sources : [], show: f.show || "all", q: f.q || "" });
  function statLine(st) {
    if (!st) return "";
    const b = [];
    if (st.damage != null) b.push(t("st.dmg", { n: nf(st.damage) }));
    if (st.rpm != null) b.push(t("st.rpm", { n: nf(st.rpm) }));
    if (st.capacity != null) b.push(t("st.cap", { n: nf(st.capacity) }));
    if (st.recoil != null) b.push(t("st.recoil", { n: nf(st.recoil) }));
    return b.join(" · ");
  }
  function gearFold(p) {
    const tabs = META.armory || [], srcs = META.sources || [];
    if (!tabs.length) return null;
    const allItems = []; tabs.forEach(tb => tb.groups.forEach(g => g.items.forEach(i => allItems.push(i))));
    const allNames = allItems.map(i => i.name);
    const saved = new Set(p.owned == null ? allNames : p.owned);   // null = owns everything
    // edits build a draft (kept across live re-renders) until Save; leaving with one asks first
    const owned = gearDraft[p.id] ? gearDraft[p.id].owned : new Set(saved);
    const unset = !p.gear_confirmed;
    const d = el("details", { class: "fold" + (unset ? " attn" : "") });
    d.open = gearOpen[p.id] !== undefined ? gearOpen[p.id] : unset;
    d.addEventListener("toggle", () => { gearOpen[p.id] = d.open; });
    d.appendChild(el("summary", {}, [unset ? t("gear2.step") : t("gear2.title")]));
    const body = el("div", { class: "body" }, [el("div", { class: "hint", style: "margin:0 0 8px" }, [t("gear2.hint")])]);
    d.appendChild(body);

    const changes = () => { let n = 0; owned.forEach(x => { if (!saved.has(x)) n++; }); saved.forEach(x => { if (!owned.has(x)) n++; }); return n; };
    function save() {   // any edit: record the draft and update the sticky footer
      if (changes()) gearDraft[p.id] = { owned: owned, total: allNames.length };
      else delete gearDraft[p.id];
      paintFoot();
    }

    // ---- filter
    let F = gfNorm(gearFilter[p.id] || {});
    const keep = () => { gearFilter[p.id] = F; try { localStorage.setItem(GF_KEY, JSON.stringify(gearFilter)); } catch (e) {} };
    const srcLabel = n => n === "Base game" ? t("src.base") : n === "Events & special unlocks" ? t("gear.special") : n;
    const match = i => (!F.sources.length || F.sources.indexOf(i.source) >= 0)
      && (F.show === "all" || (F.show === "owned") === owned.has(i.name))
      && (!F.q || i.name.toLowerCase().indexOf(F.q.toLowerCase()) >= 0);
    const fbtn = el("button", { type: "button", class: "btn sm filterbtn", "aria-haspopup": "dialog" });
    const fsum = el("div", { class: "fsum" });
    const clear = el("button", { type: "button", class: "btn sm" }, ["× " + t("gf.clear")]);
    clear.onclick = () => { F = gfNorm({}); keep(); paintAll(); };
    const active = () => F.sources.length + (F.show !== "all" ? 1 : 0) + (F.q ? 1 : 0);
    function paintFilterBar() {
      const n = active();
      fbtn.textContent = "⚲ " + t("gf.button") + (n ? " · " + n : "");
      fbtn.classList.toggle("on", n > 0);
      const bits = [];
      if (F.sources.length) bits.push(F.sources.length <= 2 ? F.sources.map(srcLabel).join(", ") : t("gf.nsources", { n: F.sources.length }));
      if (F.show !== "all") bits.push(t("gf.show." + F.show));
      if (F.q) bits.push("“" + F.q + "”");
      fsum.textContent = bits.length ? bits.join(" · ") + " — " + t("gf.matching", { n: allItems.filter(match).length }) : t("gf.everything", { n: allItems.length });
      clear.hidden = !n;
    }
    fbtn.onclick = () => openFilter();
    body.appendChild(el("div", { class: "filterbar" }, [fbtn, fsum, clear]));

    function openFilter() {
      const dlg = el("dialog", { class: "modal", "aria-label": t("gf.title") });
      const showSeg = el("div", { class: "seg", role: "group" });
      ["all", "owned", "missing"].forEach(k => {
        const b = el("button", { type: "button", "aria-pressed": String(F.show === k) }, [t("gf.show." + k)]);
        b.onclick = () => { F.show = k; showSeg.querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", String(x === b))); changed(); };
        showSeg.appendChild(b);
      });
      const q = el("input", { type: "search", placeholder: t("gf.search.ph"), value: F.q, autocomplete: "off" });
      q.oninput = () => { F.q = q.value.trim(); changed(); };
      const chips = el("div", { class: "chips srcchips" });
      const kinds = [["base", t("gf.k.base")], ["warbond", t("gf.k.warbond")], ["superstore", "Superstore"], ["special", t("gear.special")]];
      const chipEls = [];
      kinds.forEach(([k, label]) => {
        const list = srcs.filter(x => x.kind === k);
        if (!list.length) return;
        if (k !== "superstore" && k !== "special") chips.appendChild(el("div", { class: "sublabel" }, [label]));
        list.forEach(x => {
          const ownedN = () => allItems.filter(i => i.source === x.name && owned.has(i.name)).length;
          const c = el("button", { type: "button", class: "chip", "aria-pressed": String(F.sources.indexOf(x.name) >= 0) },
            [srcLabel(x.name), el("small", {}, [" " + ownedN() + "/" + x.n])]);
          c.onclick = () => {
            const i = F.sources.indexOf(x.name); i >= 0 ? F.sources.splice(i, 1) : F.sources.push(x.name);
            c.setAttribute("aria-pressed", String(i < 0)); changed();
          };
          c._paint = () => { c.querySelector("small").textContent = " " + ownedN() + "/" + x.n; };
          chipEls.push(c); chips.appendChild(c);
        });
      });
      const allSrc = el("button", { type: "button", class: "btn sm" }, [t("gf.allsources")]);
      allSrc.onclick = () => { F.sources = []; chipEls.forEach(c => c.setAttribute("aria-pressed", "false")); changed(); };
      const count = el("div", { class: "gfcount", role: "status", "aria-live": "polite" });
      const own = el("button", { type: "button", class: "btn sm" }, ["✓ " + t("gf.markown")]);
      const lose = el("button", { type: "button", class: "btn sm" }, ["✗ " + t("gf.marknot")]);
      own.onclick = () => { allItems.filter(match).forEach(i => owned.add(i.name)); changed(true); };
      lose.onclick = () => { allItems.filter(match).forEach(i => owned.delete(i.name)); changed(true); };
      const done = el("button", { type: "button", class: "btn primary" }, [t("gf.done")]);
      done.onclick = () => dlg.close();
      function changed(gear) {
        keep(); paintAll(); chipEls.forEach(c => c._paint());
        count.textContent = t("gf.matching", { n: allItems.filter(match).length });
        if (gear) save();
      }
      dlg.append(
        el("div", { class: "mhead" }, [el("b", {}, [t("gf.title")]), el("button", { type: "button", class: "btn sm", "aria-label": t("gf.done") }, ["×"])]),
        el("div", { class: "mbody" }, [
          el("span", { class: "label" }, [t("gf.search")]), q,
          el("span", { class: "label" }, [t("gf.show")]), showSeg,
          el("div", { class: "srchead" }, [el("span", { class: "label", style: "margin:0" }, [t("gf.sources")]), allSrc]),
          el("div", { class: "hint", style: "margin:0 0 6px" }, [t("gf.sources.hint")]),
          chips,
        ]),
        el("div", { class: "mfoot" }, [count, el("div", { class: "btnrow", style: "margin:0" }, [own, lose, done])]),
      );
      dlg.querySelector(".mhead .btn").onclick = () => dlg.close();
      dlg.addEventListener("close", () => dlg.remove());
      dlg.addEventListener("click", e => { if (e.target === dlg) dlg.close(); });   // tap the backdrop to close
      document.body.appendChild(dlg);
      count.textContent = t("gf.matching", { n: allItems.filter(match).length });
      dlg.showModal ? dlg.showModal() : dlg.setAttribute("open", "");
    }

    // ---- in-game tabs (counts follow the filter)
    const order = ["Stratagem", "Primary", "Secondary", "Grenade", "Armor", "Booster"];
    const sorted = order.map(k => tabs.find(tb => tb.slot === k)).filter(Boolean);
    let cur = gearTab[p.id] && sorted.some(tb => tb.slot === gearTab[p.id]) ? gearTab[p.id] : sorted[0].slot;
    const tabbar = el("div", { class: "seg geartabs", role: "tablist" });
    const pane = el("div", { class: "gearpane" });
    const gkey = g => "grp." + String(g).replace(/[^A-Za-z0-9]+/g, "_");
    const refreshers = [];
    const sync = () => refreshers.forEach(f => f());
    function showTab(slot) {
      cur = gearTab[p.id] = slot;
      tabbar.querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.slot === slot)));
      pane.innerHTML = ""; refreshers.length = 0;
      const tb = sorted.find(x => x.slot === slot);
      let lastPermit = null, shown = 0;
      tb.groups.forEach(g => {
        const items = g.items.filter(match);
        if (!items.length) return;
        shown += items.length;
        if (g.permit && g.permit !== lastPermit) {
          pane.appendChild(el("div", { class: "permit " + g.permit.toLowerCase() }, [has("perm." + g.permit) ? t("perm." + g.permit) : g.permit]));
          lastPermit = g.permit;
        }
        const names = items.map(i => i.name);
        const cnt = el("span", { class: "gs" });
        const paintCnt = () => { cnt.textContent = names.filter(n => owned.has(n)).length + "/" + names.length; };
        const allB = el("button", { type: "button", class: "btn sm" }, [t("gear.all")]);
        const noneB = el("button", { type: "button", class: "btn sm" }, [t("gear.none")]);
        allB.onclick = () => { names.forEach(n => owned.add(n)); after(); };
        noneB.onclick = () => { names.forEach(n => owned.delete(n)); after(); };
        const grid = el("div", { class: "tiles" });
        items.forEach(i => {
          const cb = el("input", { type: "checkbox" });
          const paint = () => { cb.checked = owned.has(i.name); };
          cb.onchange = () => { cb.checked ? owned.add(i.name) : owned.delete(i.name); after(); };
          const src = i.icon || i.img;
          const icon = src ? el("img", { src: src, class: i.icon ? null : "pic", alt: "", loading: "lazy" }) : el("span", { class: "noicon", "aria-hidden": "true" }, ["◇"]);
          if (src) icon.onerror = () => icon.replaceWith(el("span", { class: "noicon", "aria-hidden": "true" }, ["◇"]));
          const sl = statLine(i.stats);
          grid.appendChild(el("label", { class: "tile" }, [cb, el("span", { class: "ti" }, [icon]), el("span", { class: "tn" }, [
            wk(i.name), el("small", {}, [srcLabel(i.source)]), sl ? el("small", { class: "ts" }, [sl]) : null])]));
          paint(); refreshers.push(paint);
        });
        paintCnt(); refreshers.push(paintCnt);
        pane.appendChild(el("div", { class: "ggroup" }, [
          el("div", { class: "gearhead" }, [el("span", { class: "wbname" }, [has(gkey(g.group)) ? t(gkey(g.group)) : g.group, " ", cnt]), el("span", { class: "btnrow", style: "margin:0" }, [allB, noneB])]),
          grid]));
      });
      if (!shown) pane.appendChild(el("div", { class: "hint" }, [t("gf.empty")]));
    }
    // an owned-state filter means a tick can move an item out of view: re-filter after a short pause
    let refT = null;
    function after() { sync(); save(); if (F.show !== "all") { clearTimeout(refT); refT = setTimeout(paintAll, 900); } }
    sorted.forEach(tb => {
      const b = el("button", { type: "button", role: "tab", "data-slot": tb.slot }, [has("slot." + tb.slot) ? t("slot." + tb.slot) : tb.slot, el("small", {})]);
      b.onclick = () => showTab(tb.slot);
      tabbar.appendChild(b);
    });
    function paintAll() {
      paintFilterBar();
      const counts = {};
      tabbar.querySelectorAll("button").forEach(b => {
        const tb = sorted.find(x => x.slot === b.dataset.slot);
        const n = counts[tb.slot] = tb.groups.reduce((a, g) => a + g.items.filter(match).length, 0);
        b.querySelector("small").textContent = active() ? " " + n : "";
        b.classList.toggle("empty", active() > 0 && !n);
      });
      if (!counts[cur]) {   // the filter emptied this tab: show the first tab that has matches
        const first = sorted.find(tb => counts[tb.slot]);
        if (first) cur = first.slot;
      }
      showTab(cur);
    }
    body.appendChild(el("div", { class: "sub-h" }, [t("gear.items")]));
    body.appendChild(tabbar);
    body.appendChild(pane);
    paintAll();

    // sticky footer: always in reach while scrolling the checklist
    const saveBtn = el("button", { class: "btn primary", type: "button" }, ["✓ " + t("gear.save")]);
    saveBtn.onclick = async () => {
      gearDraft[p.id] = { owned: owned, total: allNames.length };   // save even with no edits: confirms the gear
      if (await saveGearDraft(p.id)) delete gearOpen[p.id];
    };
    const allBtn = el("button", { class: "btn sm", type: "button" }, [t("gear.everything")]);
    allBtn.onclick = async () => {
      if (!window.confirm(t("gear.everything.confirm"))) return;
      allNames.forEach(n => owned.add(n)); sync(); gearDraft[p.id] = { owned: owned, total: allNames.length }; await saveGearDraft(p.id);
    };
    const fstat = el("span", { class: "fstat", role: "status", "aria-live": "polite" });
    function paintFoot() {
      const n = changes();
      fstat.className = "fstat " + (n ? "dirty" : unset ? "unset" : "ok");
      fstat.textContent = n ? (n === 1 ? t("gf.unsaved1") : t("gf.unsaved", { n: n })) : unset ? t("gf.notyet") : "✓ " + t("gf.saved");
    }
    paintFoot();
    body.appendChild(el("div", { class: "btnrow" }, [allBtn]));
    body.appendChild(el("div", { class: "hint" }, [t("gear.remembered")]));
    body.appendChild(el("div", { class: "gearfoot" }, [fstat, saveBtn]));
    return d;
  }

  // ----------------------------------------------------------------- 02: mission
  function missionPanel() {
    R.misStatus = el("span", { class: "ps warn" });
    R.misReadout = el("div");
    const pn = el("section", { class: "panel" }, [
      el("div", { class: "ph" }, [el("span", { class: "pid" }, [t("mis.pid")]), el("span", { class: "pt" }, [t("mis.title")]), R.misStatus]),
      R.misReadout,
    ]);
    if (isCreator()) pn.appendChild(missionEditor());
    return pn;
  }

  function updateMissionReadout() {
    const m = STATE.mission, set = !!(m && m.mission_id);
    R.misStatus.className = "ps " + (set ? "ok" : "warn"); R.misStatus.textContent = set ? t("mis.status.set") : t("mis.status.unset");
    R.misReadout.innerHTML = "";
    if (!set) { if (!isCreator()) R.misReadout.appendChild(el("div", { class: "hint", style: "margin:0" }, [t("mis.waiting")])); return; }
    const mm = meta(m.mission_id);
    const ro = (k, v, cls) => el("div", { class: "ro " + (cls || "") }, [el("div", { class: "k" }, [k]), el("div", { class: "v" }, [v])]);
    const oath = oathsOf(m).length ? oathsOf(m).map(k => t("oath." + k + ".name")).join(" · ") : t("common.none");
    const mods = (m.operation_modifiers || []).map(x => has("mod." + x) ? t("mod." + x) : ((META.op_modifiers || []).find(o => o.id === x) || { name: x }).name).concat(m.is_city_map ? [t("mod.__city")] : [])
      .concat(m.stealth ? [t("mod.__stealth")] : []);
    R.misReadout.appendChild(el("div", { class: "readout" }, [
      ro(t("mis.mission"), mm ? mm.name : m.mission_id, "wide"),
      m.planet_name ? ro(t("mis.planet"), m.planet_name, "wide") : null,
      ro(t("mis.faction"), t("faction." + m.faction)),
      ro(t("mis.difficulty"), "D" + m.difficulty + (Number(m.difficulty) === 10 ? " · " + t("mis.super") : "")),
      ro(t("mis.mode"), t("mode." + m.mode), m.mode === "d100" ? "d100" : ""),
      ro(t("mis.oath"), oath),
      mods.length ? ro(t("mis.mods"), mods.join(" · "), "wide") : null,
      (m.planet_hazards || []).length ? ro(t("mis.hazards"), m.planet_hazards.map(id => ((META.hazards || []).find(h => h.id === id) || { name: id }).name).join(" · "), "wide") : null,
      (m.tactical_objectives || []).length ? ro(t("mis.tacticals"), m.tactical_objectives.map(id => ((META.tacticals || []).find(x => x.id === id) || { name: id }).name).join(" · "), "wide") : null,
    ]));
  }

  function missionEditor() {
    const base = { mode: "challenge", faction: "automatons", difficulty: 7, mission_id: "", operation_modifiers: [], planet_hazards: [], tactical_objectives: [], is_city_map: false, oath: null, oaths: [] };
    const draft = JSON.parse(JSON.stringify(Object.assign(base, (STATE && STATE.mission) || {})));
    ["operation_modifiers", "planet_hazards", "tactical_objectives"].forEach(k => { if (!Array.isArray(draft[k])) draft[k] = []; });
    const set = !!(STATE.mission && STATE.mission.mission_id);
    const d = el("details", { class: "fold" + (set ? "" : " attn"), open: set ? null : true });
    d.appendChild(el("summary", {}, [set ? t("mis.edit") : t("mis.setup")]));
    const body = el("div", { class: "body editor" }); d.appendChild(body);

    // mode
    const modes = el("div", { class: "seg modes", role: "group", "aria-label": t("mis.mode") });
    ["optimize", "fun", "challenge", "improvement", "d100"].forEach(k => {
      const b = el("button", { type: "button", class: k === "d100" ? "d100" : null, "aria-pressed": String(draft.mode === k) }, [t("mode." + k), el("span", { class: "sub" }, [t("mode." + k + ".s")])]);
      b.onclick = () => { draft.mode = k; modes.querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", String(x === b))); };
      modes.appendChild(b);
    });
    body.appendChild(el("div", { class: "blk", style: "margin-top:4px" }, [el("span", { class: "label" }, [t("mis.mode")]), modes, el("div", { class: "hint" }, [t("mis.d100.hint")])]));

    // planet from the live war: fills faction + hazards (optional)
    const planetSel = el("select", { id: "m-planet" }, [el("option", { value: "" }, [t("war.pick.none")])]);
    const planetInfo = el("div", { class: "hint" }, [t("war.pick.hint")]);
    const planetBlk = el("div", { class: "blk field", style: "display:none" }, [el("label", { class: "label", for: "m-planet" }, ["★ " + t("war.pick")]), planetSel, planetInfo]);
    body.appendChild(planetBlk);
    let paintHaz = () => {};
    loadWar().then(w => {
      if (!w || !w.planets.length) return;
      w.planets.forEach(p => planetSel.appendChild(el("option", { value: String(p.index) }, [planetLabel(p)])));
      const cur = w.planets.find(p => p.name === draft.planet_name);
      if (cur) planetSel.value = String(cur.index);
      planetBlk.style.display = "";
    });
    planetSel.onchange = () => {
      const p = ((WAR && WAR.planets) || []).find(x => String(x.index) === planetSel.value);
      if (!p) { draft.planet_name = ""; planetInfo.textContent = t("war.pick.hint"); return; }
      draft.planet_name = p.name; draft.faction = p.enemy; facSel.value = p.enemy;
      draft.planet_hazards = p.hazards.slice();
      paintHaz(); fillMissions(); fillTacticals(); fillOps();
      planetInfo.textContent = [p.biome, p.sector, p.hazard_names.length ? p.hazard_names.join(", ") : t("war.nohaz"), p.progress != null ? t("war.liberation", { n: p.progress }) : null].filter(Boolean).join(" · ");
    };

    // faction / difficulty / mission
    const facSel = el("select", { id: "m-fac" }, ["automatons", "terminids", "illuminate"].map(f => el("option", { value: f }, [t("faction." + f)])));
    facSel.value = draft.faction;
    const diffSel = el("select", { id: "m-diff" }, Array.from({ length: 10 }, (_, i) => el("option", { value: i + 1 }, ["D" + (i + 1) + (i === 9 ? " · " + t("mis.super") : "")])));
    diffSel.value = draft.difficulty;
    const misSel = el("select", { id: "m-mis" });
    function fillMissions() {
      misSel.innerHTML = "";
      const dv = parseInt(diffSel.value, 10);
      const list = (META.missions || []).filter(x => x.factions.indexOf(facSel.value) >= 0 && dv >= x.dmin && dv <= x.dmax);
      if (!list.length) { misSel.appendChild(el("option", { value: "" }, [t("mis.none_at")])); draft.mission_id = ""; }
      else { if (!list.some(x => x.id === draft.mission_id)) draft.mission_id = list[0].id; list.forEach(x => misSel.appendChild(el("option", { value: x.id }, [x.name]))); misSel.value = draft.mission_id; }
    }
    fillMissions();
    let fillTacticals = () => {};
    facSel.onchange = () => {
      draft.faction = facSel.value; fillMissions(); fillTacticals(); fillOps();
      const p = ((WAR && WAR.planets) || []).find(x => String(x.index) === planetSel.value);
      if (p && p.enemy !== facSel.value) { planetSel.value = ""; draft.planet_name = ""; planetInfo.textContent = t("war.pick.hint"); }   // that planet isn't this enemy's
    };
    diffSel.onchange = () => { draft.difficulty = parseInt(diffSel.value, 10); fillMissions(); fillTacticals(); fillOps(); };
    misSel.onchange = () => { draft.mission_id = misSel.value; };
    body.appendChild(el("div", { class: "blk grid2" }, [
      el("div", { class: "field" }, [el("label", { class: "label", for: "m-fac" }, [t("mis.faction")]), facSel]),
      el("div", { class: "field" }, [el("label", { class: "label", for: "m-diff" }, [t("mis.difficulty")]), diffSel]),
      el("div", { class: "field", style: "grid-column:1/-1" }, [el("label", { class: "label", for: "m-mis" }, [t("mis.mission")]), misSel]),
    ]));

    // operation modifiers (from the data, filtered to this faction + difficulty) + our toggles
    const ops = el("div", { class: "chips" }), opsDesc = el("div", { class: "hint opdesc" });
    const opName = id => (has("mod." + id) ? t("mod." + id) : ((META.op_modifiers || []).find(x => x.id === id) || { name: id }).name);
    const paintOpsDesc = () => {
      opsDesc.innerHTML = "";
      draft.operation_modifiers.forEach(id => {
        const m = (META.op_modifiers || []).find(x => x.id === id);
        if (m && m.desc) opsDesc.appendChild(el("div", {}, [el("b", {}, [opName(id) + ": "]), has("opmod." + id + ".desc") ? t("opmod." + id + ".desc") : m.desc]));
      });
    };
    let fillOps = () => {};
    fillOps = () => {
      ops.innerHTML = "";
      const dv = parseInt(diffSel.value, 10);
      const list = (META.op_modifiers || []).filter(x => (x.faction === "any" || x.faction === facSel.value) && dv >= x.dmin);
      draft.operation_modifiers = draft.operation_modifiers.filter(id => list.some(x => x.id === id));   // this front can't have it
      list.map(x => x.id).concat(["__city", "__stealth"]).forEach(id => {
        const on = id === "__city" ? draft.is_city_map : id === "__stealth" ? !!draft.stealth : draft.operation_modifiers.indexOf(id) >= 0;
        const m = (META.op_modifiers || []).find(x => x.id === id);
        const c = el("button", { type: "button", class: "chip", "aria-pressed": String(on), title: m ? m.desc : null }, [opName(id)]);
        c.onclick = () => {
          if (id === "__city") draft.is_city_map = !draft.is_city_map;
          else if (id === "__stealth") draft.stealth = !draft.stealth;
          else { const i = draft.operation_modifiers.indexOf(id); i >= 0 ? draft.operation_modifiers.splice(i, 1) : draft.operation_modifiers.push(id); }
          c.setAttribute("aria-pressed", String(c.getAttribute("aria-pressed") !== "true"));
          paintOpsDesc();
        };
        ops.appendChild(c);
      });
      paintOpsDesc();
    };
    fillOps();
    body.appendChild(el("div", { class: "blk" }, [el("span", { class: "label" }, [t("mis.mods.label")]), ops, opsDesc,
      el("div", { class: "hint" }, [t("mis.stealth.hint")])]));

    // planet hazards + tactical objectives: both feed the mission pressure
    const toggle = (arr, id, chip) => { const i = arr.indexOf(id); i >= 0 ? arr.splice(i, 1) : arr.push(id); chip.setAttribute("aria-pressed", String(i < 0)); };
    const haz = el("div", { class: "chips" });
    (META.hazards || []).forEach(h => {
      const c = el("button", { type: "button", class: "chip", "data-id": h.id, "aria-pressed": String(draft.planet_hazards.indexOf(h.id) >= 0) }, [h.name]);
      c.onclick = () => toggle(draft.planet_hazards, h.id, c);
      haz.appendChild(c);
    });
    paintHaz = () => haz.querySelectorAll(".chip").forEach(c => c.setAttribute("aria-pressed", String(draft.planet_hazards.indexOf(c.dataset.id) >= 0)));
    body.appendChild(el("div", { class: "blk" }, [el("span", { class: "label" }, [t("mis.hazards.label")]), haz]));
    const tac = el("div", { class: "chips" });
    fillTacticals = () => {
      tac.innerHTML = "";
      const dv = parseInt(diffSel.value, 10);
      const list = (META.tacticals || []).filter(x => (x.faction === "any" || x.faction === facSel.value) && dv >= x.dmin && dv <= x.dmax);
      draft.tactical_objectives = draft.tactical_objectives.filter(id => list.some(x => x.id === id));   // drop ones this map can't have
      if (!list.length) tac.appendChild(el("div", { class: "hint", style: "margin:0" }, [t("mis.tacticals.none")]));
      list.forEach(x => {
        const c = el("button", { type: "button", class: "chip", "aria-pressed": String(draft.tactical_objectives.indexOf(x.id) >= 0) }, [x.name]);
        c.onclick = () => toggle(draft.tactical_objectives, x.id, c);
        tac.appendChild(c);
      });
    };
    fillTacticals();
    body.appendChild(el("div", { class: "blk" }, [el("span", { class: "label" }, [t("mis.tacticals.label")]), tac, el("div", { class: "hint" }, [t("mis.vars.hint")])]));

    // oath
    const oathRow = el("div", { class: "chips" }), oathHint = el("div", { class: "hint" });
    draft.oaths = oathsOf(draft);
    const setHint = () => {
      draft.oath = draft.oaths[0] || null;   // older clients read the first
      oathHint.innerHTML = "";
      oathHint.appendChild(draft.oaths.length ? medalPreview(draft.oaths, draft.mode === "d100") : document.createTextNode(t("mis.oath.hint.none")));
      if (draft.oaths.length) oathHint.appendChild(el("div", { class: "hint", style: "margin-top:6px" }, [t("mis.oaths.hint")]));
      oathRow.querySelectorAll(".chip").forEach(x => x.setAttribute("aria-pressed", String(x.dataset.k ? draft.oaths.indexOf(x.dataset.k) >= 0 : !draft.oaths.length)));
    };
    [null].concat((META.oaths || []).map(o => o.key)).forEach(k => {
      const c = el("button", { type: "button", class: "chip", "data-k": k || "" }, [k ? t("oath." + k + ".name") : t("mis.oath.none")]);
      c.onclick = () => {
        if (!k) draft.oaths = [];
        else if (draft.oaths.indexOf(k) >= 0) draft.oaths = draft.oaths.filter(x => x !== k);
        else if (draft.oaths.length < 3) draft.oaths = draft.oaths.concat([k]);
        else { toast(t("mis.oaths.max")); return; }
        setHint();
      };
      oathRow.appendChild(c);
    });
    setHint();
    body.appendChild(el("div", { class: "blk" }, [el("span", { class: "label" }, [t("mis.oath.label")]), oathRow, oathHint]));

    // actions
    const save = el("button", { class: "btn primary", type: "button" }, [t("mis.save")]);
    save.onclick = async () => {
      if (busy) return; busy = true; save.disabled = true;
      try {
        const req = jpost("/api/lobby/" + LID + "/mission", { mission: draft }, store.creator(LID));
        STATE = STATE && STATE.directive ? await regenScreen(req, 1500) : await req;
        lastSig = JSON.stringify(STATE); renderLive(); d.open = false;
        d.querySelector("summary").textContent = t("mis.edit"); d.classList.remove("attn");
        toast(STATE.directive ? t("toast.mission_changed") : t("mis.saved"));
      } catch (e) { toast(e.message); } finally { busy = false; save.disabled = false; }
    };
    const prefill = fileBtn("", t("mis.prefill"), false);
    prefill.querySelector("input").onchange = async ev => {
      const f = ev.target.files[0]; if (!f || busy) return;
      busy = true; lockControls([prefill, save], true);
      try {
        const fd = new FormData(); fd.append("image", f);
        const r = await fdpost("/api/lobby/" + LID + "/mission/prefill", fd, store.creator(LID));
        const s = r.suggestion || {};
        if (s.faction) { facSel.value = s.faction; draft.faction = s.faction; }
        if (s.difficulty) { diffSel.value = s.difficulty; draft.difficulty = s.difficulty; }
        fillMissions(); fillTacticals();
        toast(s.note ? s.note : t("mis.prefilled"));
      } catch (e) { toast(e.message); } finally { lockControls([prefill, save], false); busy = false; }
    };
    body.appendChild(el("div", { class: "btnrow" }, [save, prefill]));
    body.appendChild(el("div", { class: "hint" }, [t("mis.prefill.hint")]));
    return d;
  }

  // ----------------------------------------------------------------- 03: briefing
  const sub = (k, node) => { node.dataset.sub = k; return node; };
  function briefing() {
    const d = STATE.directive, r = STATE.readiness || {};
    if (!d) return [r.mission_set
      ? el("div", { class: "alert" }, [el("b", {}, [t("brief.hold.t")]), t("brief.hold")])
      : el("div", { class: "alert" }, [el("b", {}, ["//"]), t("brief.waiting")])];
    const out = [];

    // the read
    const pr = el("div", { class: "pressure" }, ((d.pressure && d.pressure.top) || []).map(([k, v]) =>
      el("span", { class: "k" + (v < 0 ? " neg" : "") }, [k.replace(/_/g, " "), el("b", {}, [(v >= 0 ? "+" : "") + Number(v).toFixed(2)])])));
    const readKids = [pr];
    if (d.pressure && d.pressure.driver) {
      const line = el("div", { class: "driver" }); const [a, b] = t("read.driver", { d: "\u0000" }).split("\u0000");
      line.appendChild(document.createTextNode(a)); line.appendChild(el("b", {}, [d.pressure.driver])); line.appendChild(document.createTextNode(b || ""));
      readKids.push(line);
    }
    out.push(sub("plan", panel(t("read.pid"), t("read.title"), {}, readKids)));

    // doctrine (e.g. Commando)
    if (d.doctrine) {
      const k = d.doctrine.kind, orders = d.doctrine.orders || [];
      const ol = el("ol", { class: "orders" }, orders.map((o, i) => el("li", {}, [has("doctrine." + k + "." + (i + 1)) ? t("doctrine." + k + "." + (i + 1)) : o])));
      out.push(sub("plan", panel(t("doc.pid"), has("doctrine." + k + ".title") ? t("doctrine." + k + ".title") : d.doctrine.title, { status: k, statusKind: "info" }, [ol])));
    }

    // mission-coverage swaps
    if (d.swaps && d.swaps.length) {
      out.push(sub("review", panel(t("swap.pid"), t("swap.title"), { tone: "amber" }, [el("div", { class: "hint", style: "margin:0 0 10px" }, [t("swap.hint")])].concat(
        d.swaps.map(s => el("div", { class: "swap" }, [
          el("div", { class: "mv" }, [s.callsign + ": ", el("b", {}, [s.from_role]), " → ", el("b", {}, [s.to_role])]),
          el("div", { class: "why" }, [t("swap.why", { to: s.to_role, callsign: s.callsign, from: s.from_role })]),
        ]))))));
    }

    // loadouts
    const roster = el("div", { class: "roster" }); const me = meRec();
    const fillRoster = () => { roster.innerHTML = ""; STATE.players.forEach(p => roster.appendChild(diverCard(p, me && me.id === p.id, false))); };
    fillRoster();
    const viewSeg = el("div", { class: "seg kitview", role: "group", "aria-label": t("kv.label") });
    [["screen", "▦ " + t("kv.screen")], ["list", "☰ " + t("kv.list")]].forEach(([k, label]) => {
      const b = el("button", { type: "button", "aria-pressed": String(kitView === k) }, [label]);
      b.onclick = () => {
        kitView = k; try { localStorage.setItem("wm_kitview", k); } catch (e) {}
        viewSeg.querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", String(x === b))); fillRoster();
      };
      viewSeg.appendChild(b);
    });
    const rkids = [viewSeg, roster];
    if (isCreator()) {
      const rb = el("button", { class: "btn sm", type: "button" }, ["⟳ " + t("roster.reroll")]);
      rb.onclick = async () => {
        if (busy) return; busy = true; rb.disabled = true;
        try { STATE = await regenScreen(jpost("/api/lobby/" + LID + "/reroll", {}, store.creator(LID)), 1200); lastSig = JSON.stringify(STATE); renderLive(); toast(t("toast.rerolled")); }
        catch (e) { toast(e.message); } finally { busy = false; rb.disabled = false; }
      };
      rkids.push(el("div", { class: "btnrow" }, [rb]), el("div", { class: "hint" }, [t("roster.reroll.hint")]));
    }
    out.push(sub("loadouts", panel(t("roster.pid"), t("roster.title"), { status: t("rdy.briefed"), statusKind: "ok" }, rkids)));

    // squad review: redundancy + impact, each line with its research sources
    if (d.review && d.review.length) {
      const host = u => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch (e) { return u; } };
      const lines = el("ul", { class: "review" }, d.review.map(r => el("li", { class: r.status }, [
        el("span", { class: "st" }, [r.status === "ok" ? "✓" : r.status === "fixed" ? "⟳" : "!"]),
        el("span", { class: "tx" }, [
          has(r.k) ? t(r.k, r.p) : r.k,
          r.status === "fixed" ? tag("amber", t("rev.fixed")) : r.status === "gap" ? tag("red", t("rev.gap")) : null,
          (r.sources || []).length ? el("span", { class: "src" }, [t("rev.sources") + ": "].concat(
            r.sources.filter((u, i, a) => a.findIndex(x => host(x) === host(u)) === i)   // one link per site
              .map((u, i) => el("a", { href: u, target: "_blank", rel: "noopener" }, [(i ? ", " : "") + host(u)])))) : null,
        ]),
      ])));
      const fixed = d.review.some(r => r.status === "fixed"), gap = d.review.some(r => r.status === "gap");
      out.push(sub("review", panel(t("rev.pid"), t("rev.title"), { status: gap ? t("rev.gap") : fixed ? t("rev.fixed") : "OK", statusKind: gap ? "bad" : fixed ? "warn" : "ok" },
        [el("div", { class: "hint", style: "margin:0 0 10px" }, [t("rev.hint")]), lines, el("div", { class: "hint" }, [t("rev.rules")])])));
    }

    // coordination
    const mtx = el("div", { class: "matrix" });
    ["at", "st", "ch", "bc"].forEach(ax => {
      const h = (d.matrix && d.matrix[ax]) || [];
      mtx.appendChild(el("div", { class: "ax" }, [t("axis." + ax)]));
      mtx.appendChild(el("div", { class: h.length ? "" : "none" }, [h.length ? h.join(", ") : t("coord.nobody")]));
    });
    const blocks = [el("div", {}, [el("div", { class: "sub-h", style: "margin-top:0" }, [t("coord.matrix")]), mtx])];
    if (d.loop && d.loop.length) {
      const order = d.loop.map(x => x[0]); const loop = el("div", { class: "loop" });
      order.forEach(x => { loop.appendChild(el("span", {}, [x])); loop.appendChild(el("span", { class: "arw" }, ["→"])); });
      loop.appendChild(el("span", {}, [order[0]]));
      blocks.push(el("div", {}, [el("div", { class: "sub-h", style: "margin-top:0" }, [t("coord.loop")]), loop]));
    }
    if (d.cadence && d.cadence.length) {
      const cad = el("div", { class: "cadence" });
      d.cadence.forEach(([bt, ro]) => { cad.appendChild(el("div", { class: "b" }, [has("beat." + bt) ? t("beat." + bt) : bt])); cad.appendChild(el("div", {}, [ro])); });
      blocks.push(el("div", {}, [el("div", { class: "sub-h", style: "margin-top:0" }, [t("coord.cadence")]), cad,
        d.reactive ? el("div", { class: "hint" }, [t("coord.reactive", { role: d.reactive })]) : null]));
    }
    out.push(sub("plan", panel(t("coord.pid"), t("coord.title"), {}, [el("div", { class: "coord" }, blocks)])));

    // field notes
    const notes = el("ul", { class: "notes" }, (d.notes || []).map((n, i) => {
      const ph = (d.notes_i18n || [])[i];
      return el("li", { class: ph && ph.k.indexOf("d100.") === 0 ? "d100" : null }, [tp(ph, n)]);
    }));
    out.push(sub("plan", panel(t("notes.pid"), t("notes.title"), { tone: STATE.mission && STATE.mission.mode === "d100" ? "red" : null }, [notes])));
    return out;
  }

  // The kit as the in-game loadout screen shows it: four stratagem slots in their permit
  // colours, then the armour on the diver beside the weapon racks. Pictures come from the
  // wiki (verify_wiki.py --armory); anything without one falls back to its name.
  const pic = (name, kind) => {
    const m = (META.pics || {})[name] || {}, src = kind === "icon" ? m.icon || m.img : m.img || m.icon;
    if (!src) return el("span", { class: "nopic", "aria-hidden": "true" }, ["◇"]);
    const im = el("img", { src: src, alt: "", loading: "lazy", decoding: "async" });
    im.onerror = () => im.replaceWith(el("span", { class: "nopic", "aria-hidden": "true" }, ["◇"]));
    return im;
  };
  function locker(a) {
    const strats = el("div", { class: "strats" }, (a.stratagems || []).map(s => {
      const pm = String(((META.pics || {})[s] || {}).permit || "supply").toLowerCase();
      return el("div", { class: "sslot " + pm, title: s }, [
        el("div", { class: "sq" }, [pic(s, "icon"), s === a.growth_slot ? el("span", { class: "grow" }, [t("card.growth")]) : null]),
        el("div", { class: "sn" }, [wk(s)]),
      ]);
    }));
    const statsOf = n => { for (const tb of META.armory || []) for (const g of tb.groups) for (const i of g.items) if (i.name === n) return i.stats; return null; };
    const wt = (cls, label, name, stats) => el("div", { class: "wtile " + cls }, [
      el("span", { class: "lab" }, [label]), el("div", { class: "pv" }, [pic(name, "img")]), el("div", { class: "nm" }, [name ? wk(name) : "—"]),
      stats && statLine(statsOf(name)) ? el("div", { class: "st" }, [statLine(statsOf(name))]) : null]);
    const pkey = "pe." + String(a.armor_passive).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
    const eff = has(pkey) ? t(pkey) : META.passives && META.passives[a.armor_passive];
    const armor = el("div", { class: "armorfig" }, [
      el("span", { class: "lab" }, [t("card.armor")]), el("div", { class: "pv" }, [pic(a.armor, "img")]),
      el("div", { class: "nm" }, [wk(a.armor)]),
      el("div", { class: "ps", title: eff || "" }, [(has("w." + a.armor_weight) ? t("w." + a.armor_weight) : a.armor_weight) + " · " + a.armor_passive]),
    ]);
    return el("div", { class: "locker" }, [
      strats,
      el("div", { class: "equip" }, [armor, el("div", { class: "weps" }, [
        wt("primary", t("card.primary"), a.primary, true), wt("", t("card.secondary"), a.secondary, true),
        wt("", t("card.grenade"), a.grenade), wt("booster", t("card.booster"), a.booster)])]),
      eff ? el("div", { class: "eff" }, [el("b", {}, [a.armor_passive + ": "]), eff]) : null,
    ]);
  }

  // "Why this kit": one line per decision — the stat read behind the play style, the role,
  // what the mission asks for, why the weapons (mission tags, the support weapon they cover
  // for, accuracy), what the stratagems bring, why the armour.
  const WHY_ICON = { stats: "◉", role: "◆", mission: "◎", handling: "⌖", weapon: "▸", strats: "✦", armor: "⛨",
                     growth: "↗", thin: "⚠", nostats: "ⓘ", reroll: "⟳" };
  function whyLine(w) {
    const p = Object.assign({}, w.p || {});
    if (w.k.indexOf("why.") !== 0) return tp(w, "");
    if (p.style) p.style = styleLabel(p.style);
    if (p.mode) p.mode = t("mode." + p.mode);
    if (Array.isArray(p.tags)) p.tags = p.tags.map(x => x.tag.replace(/_/g, " ") + (x.src ? " (" + x.src + ")" : "")).join(", ");
    if (Array.isArray(p.axes)) p.axes = p.axes.map(x => t("axis." + x)).join(", ");
    return t(w.k, p);
  }
  function whyKit(p, a) {
    const rows = [];
    const read = p.style_read;
    if (read && read.style === p.play_style && has(read.k)) rows.push(["stats", t("why.stats", { style: styleLabel(p.play_style), read: tp(read, "") })]);
    else if (p.style_source === "manual") rows.push(["stats", t("why.stats.chosen", { style: styleLabel(p.play_style) })]);
    a.why.forEach(w => { const line = whyLine(w); if (line) rows.push([w.kind, line]); });
    return el("div", { class: "whykit" }, [
      el("div", { class: "wk-h" }, [t("why.title")]),
      el("ul", {}, rows.map(([k, line]) => el("li", { class: "w-" + k }, [el("span", { class: "ic", "aria-hidden": "true" }, [WHY_ICON[k] || "•"]), el("span", {}, [line])]))),
    ]);
  }

  function diverCard(p, mine, provisional) {
    const a = p.assignment;
    const card = el("article", { class: "dcard" + (mine ? " me" : "") }); card.style.setProperty("--acc", p.accent);
    const medal = p.aar && p.aar.verdict && p.aar.verdict.medal;
    card.appendChild(el("div", { class: "hd" }, [
      el("div", { class: "role" }, [a ? a.role : t("card.awaiting"), a && provisional ? tag("amber dash", t("brief.prov")) : null]),
      el("div", { class: "meta" }, [el("span", { class: "cs" }, [p.callsign]), "·", styleLabel(p.play_style),
        mine ? tag("amber", t("common.you")) : null, medal ? tag("amber", "🎖 " + medal.id) : null]),
    ]));
    if (!a) return card;
    if (kitView === "screen") {
      card.appendChild(locker(a));
    } else {
    const kit = el("ul", { class: "kit" });
    const row = (k, v, small) => el("li", {}, [el("span", { class: "sl" }, [t(k)]), el("span", { class: "vv" }, [v, small ? el("small", {}, [small]) : null])]);
    kit.appendChild(row("card.primary", wk(a.primary)));
    kit.appendChild(row("card.secondary", wk(a.secondary)));
    kit.appendChild(row("card.grenade", wk(a.grenade)));
    const armorRow = row("card.armor", wk(a.armor), (has("w." + a.armor_weight) ? t("w." + a.armor_weight) : a.armor_weight) + " · " + a.armor_passive);
    const pkey = "pe." + String(a.armor_passive).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
    const eff = has(pkey) ? t(pkey) : META.passives && META.passives[a.armor_passive];
    if (eff) armorRow.querySelector(".vv").appendChild(el("small", { class: "eff" }, [eff]));   // the passive's wiki effect
    kit.appendChild(armorRow);
    kit.appendChild(row("card.booster", wk(a.booster)));
    (a.stratagems || []).forEach((s, i) => kit.appendChild(el("li", {}, [
      el("span", { class: "sl" }, [i === 0 ? t("card.strats") : ""]),
      el("span", { class: "vv" }, [wk(s), s === a.growth_slot ? el("span", { class: "grow" }, [t("card.growth")]) : null]),
    ])));
    card.appendChild(kit);
    }
    const thin = (a.thin_axes && a.thin_axes.length ? a.thin_axes.map(x => t("axis." + x)) : a.thin) || [];
    if (thin.length) card.appendChild(el("div", { class: "thin" }, [t("card.thin", { list: thin.join(", ") })]));
    card.appendChild(a.why && a.why.length ? whyKit(p, a) : el("div", { class: "why" }, [
      (a.rationale_parts || []).map(x => tp(x, "")).filter(Boolean).join(" ") || a.rationale]));
    return card;
  }

  // ----------------------------------------------------------------- 04: debrief
  // Medal card: a 1200x630 image (previews well in Discord) drawn on a canvas, then the
  // system share sheet (phones: Discord, Messages…). Falls back to text+link sharing, then
  // to downloading the card and copying the text.
  async function shareMedal(v, mname, callsign) {
    const mission = STATE.mission || {}, mm = meta(mission.mission_id);
    const text = t("share.text", { medal: mname, callsign: callsign, oath: t("oath." + v.oath + ".name"), id: v.medal.id,
                                   mission: mm ? mm.name : "" });
    const url = location.origin + "/?l=" + LID;
    try { await document.fonts.ready; } catch (e) {}
    const W = 1200, H = 630, c = document.createElement("canvas"); c.width = W; c.height = H;
    const g = c.getContext("2d");
    g.fillStyle = "#04070b"; g.fillRect(0, 0, W, H);
    g.strokeStyle = "rgba(62,230,255,.07)"; g.lineWidth = 1;                       // bunker grid
    for (let x = 0; x < W; x += 40) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
    for (let y = 0; y < H; y += 40) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
    const rg = g.createRadialGradient(300, 315, 10, 300, 315, 330); rg.addColorStop(0, "rgba(255,194,58,.28)"); rg.addColorStop(1, "rgba(255,194,58,0)");
    g.fillStyle = rg; g.fillRect(0, 0, W, H);
    g.strokeStyle = "#ffc23a"; g.lineWidth = 6; g.shadowColor = "#ffc23a"; g.shadowBlur = 24;   // medal hex
    g.beginPath(); for (let i = 0; i < 6; i++) { const a = Math.PI / 3 * i - Math.PI / 2; g.lineTo(300 + 150 * Math.cos(a), 315 + 150 * Math.sin(a)); } g.closePath(); g.stroke();
    g.font = "700 120px 'Chakra Petch', sans-serif"; g.fillStyle = "#ffc23a"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("★", 300, 322);
    g.shadowBlur = 0; g.textAlign = "left"; g.textBaseline = "alphabetic";
    const fit = (txt, font, max) => { let sz = font; g.font = `700 ${sz}px 'Chakra Petch', sans-serif`; while (g.measureText(txt).width > max && sz > 22) { sz -= 2; g.font = `700 ${sz}px 'Chakra Petch', sans-serif`; } };
    g.fillStyle = "#3ee6ff"; g.font = "500 22px 'JetBrains Mono', monospace"; g.fillText(t("share.eyebrow").toUpperCase(), 500, 150);
    g.fillStyle = "#ffffff"; fit(mname.toUpperCase(), 58, 650); g.fillText(mname.toUpperCase(), 500, 222);
    g.fillStyle = "#ffc23a"; fit(callsign, 44, 650); g.fillText(callsign, 500, 290);
    g.fillStyle = "#9fb3c2"; g.font = "400 26px 'JetBrains Mono', monospace";
    g.fillText(t("oath." + v.oath + ".name") + " · " + (mm ? mm.name : ""), 500, 345);
    g.fillText((STATE.name || "Squad") + (mission.difficulty ? " · D" + mission.difficulty : ""), 500, 385);
    g.fillStyle = "#4dffa1"; g.font = "500 24px 'JetBrains Mono', monospace"; g.fillText("ID " + v.medal.id, 500, 450);
    g.fillStyle = "#3ee6ff"; g.font = "700 34px 'Chakra Petch', sans-serif"; g.fillText("WARMIND", 500, 560);
    g.fillStyle = "#5d7383"; g.font = "400 18px 'JetBrains Mono', monospace"; g.fillText(location.host, 680, 558);
    const blob = await new Promise(r => c.toBlob(r, "image/png"));
    const file = blob && new File([blob], "warmind-medal-" + v.medal.id + ".png", { type: "image/png" });
    try {
      if (file && navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: mname, text: text + " " + url }); return; }
      if (navigator.share) { await navigator.share({ title: mname, text: text, url: url }); return; }
    } catch (e) { if (e && e.name === "AbortError") return; }   // the diver closed the share sheet
    if (blob) { const a = el("a", { href: URL.createObjectURL(blob), download: file.name }); document.body.appendChild(a); a.click(); a.remove(); }
    copy(text + " " + url, t("share.copied"));
  }

  const oathsOf = m => (m && Array.isArray(m.oaths) ? m.oaths : m && m.oath ? [m.oath] : []);
  // what's at stake: the medal each sworn oath earns, before anyone uploads a result
  function medalPreview(keys, d100) {
    return el("div", { class: "stakes" }, keys.map(k => {
      const base = t("oath." + k + ".medal");
      return el("div", { class: "medal preview" }, [el("div", { class: "hex", "aria-hidden": "true" }, ["★"]), el("div", {}, [
        el("div", { class: "mn" }, [d100 ? t("medal.d100", { name: base }) : base]),
        el("div", { class: "mw" }, [t("oath." + k + ".name") + ": " + t("oath." + k + ".rule")]),
        has("oath." + k + ".proof") ? el("div", { class: "mw proof" }, [t("oath." + k + ".proof")]) : null])]);
    }));
  }

  function verdictBlock(v, callsign) {
    if (!v) return null;
    const name = t("oath." + v.oath + ".name"), reason = tp({ k: v.reason_key, p: v.reason_params }, v.reason);
    if (v.passed === true && v.medal) {
      const base = t("oath." + v.oath + ".medal"), mname = v.medal.d100 ? t("medal.d100", { name: base }) : base;
      const shareBtn = el("button", { class: "btn sm share", type: "button" }, ["⇪ " + t("share.btn")]);
      shareBtn.onclick = () => shareMedal(v, mname, callsign || "");
      return el("div", { class: "medal" }, [el("div", { class: "hex", "aria-hidden": "true" }, ["★"]), el("div", {}, [
        el("div", { class: "mn" }, [mname]), el("div", { class: "mid" }, [t("deb.medal", { id: v.medal.id })]),
        el("div", { class: "mw" }, [t("deb.kept", { name: name, reason: reason })]),
        el("div", { class: "btnrow", style: "margin:8px 0 0" }, [shareBtn])])]);
    }
    if (v.passed === false) return el("div", { class: "broken" }, [el("div", { class: "bt" }, [t("deb.broken", { name: name })]), el("div", { class: "bw" }, [reason])]);
    return el("div", { class: "unver" }, [t("deb.unver", { reason: reason })]);
  }

  function debriefPanel() {
    if (!STATE.directive) return el("div", { class: "alert" }, [el("b", {}, ["//"]), t("deb.waiting")]);
    const m = STATE.mission || {}, me = myPlayer();
    const kids = [];
    if (oathsOf(m).length) kids.push(el("div", { class: "sub-h", style: "margin-top:0" }, [t("deb.stakes")]), medalPreview(oathsOf(m), m.mode === "d100"));
    // result upload: the diver for themself, or the creator for any diver (a diver on another device)
    function uploader(target, label, primary) {
      const status = el("div", { class: "upstatus", role: "status", "aria-live": "polite" });
      const up = fileBtn(primary ? "primary" : "sm", label, false);
      up.querySelector("input").onchange = async ev => {
        const f = ev.target.files[0]; if (!f || busy) return;
        busy = true; lockControls([up], true);
        const stop = workTicker(status, lines("tick.review.", 5));
        try {
          const fd = new FormData(); fd.append("image", f); fd.append("lang", LANG);
          const token = me && me.id === target.id ? meRec().token : store.creator(LID);
          const rr = await fdpost("/api/lobby/" + LID + "/player/" + target.id + "/result", fd, token);
          stop(); busy = false; await refresh();
          const vs = rr.verdicts || (rr.verdict ? [rr.verdict] : []), won = vs.filter(v => v.passed === true && v.medal);
          toast(won.length ? t("toast.medal", { name: won.map(v => v.medal.d100 ? t("medal.d100", { name: t("oath." + v.oath + ".medal") }) : t("oath." + v.oath + ".medal")).join(" + ") })
            : vs.some(v => v.passed === false) ? t("toast.broken") : t("toast.aar"));
        } catch (e) { stop(); setStatus(status, "err", t("deb.failed", { msg: e.message })); }
        finally { stop(); lockControls([up], false); busy = false; }
      };
      return [up, status];
    }
    if (me) {
      const [up, status] = uploader(me, t("deb.submit"), true);
      kids.push(el("div", { class: "btnrow", style: "margin-top:0" }, [up]), status, el("div", { class: "hint" }, [t("deb.submit.hint")]));
    } else if (!isCreator()) {
      kids.push(el("div", { class: "alert" }, [el("b", {}, ["!"]), t("deb.nodevice")]));
    }
    kids.push(el("div", { class: "sub-h" }, [t("deb.honors")]));
    const honors = el("div", { class: "honors" });
    STATE.players.forEach(p => {
      const aar = p.aar, inner = [el("div", { class: "nm" }, [p.callsign + (p.assignment ? "  ·  " + p.assignment.role : "")])];
      if (!aar) {
        inner.push(el("div", { class: "st" }, [t("deb.pending")]));
        if (isCreator() && !(me && me.id === p.id)) {
          const [up, status] = uploader(p, t("deb.upload_for", { callsign: p.callsign }), false);
          inner.push(el("div", { class: "btnrow", style: "margin:6px 0 0" }, [up]), status);
        }
      }
      else {
        (aar.verdicts || (aar.verdict ? [aar.verdict] : [])).forEach(v => { const vb = verdictBlock(v, p.callsign); if (vb) inner.push(vb); });
        const r = aar.result || {};
        const chips = [["sb.kills", r.kills], ["sb.accuracy", r.accuracy_pct != null ? r.accuracy_pct + "%" : null], ["sb.deaths", r.deaths],
          ["sb.accidentals", r.accidentals], ["sb.reinforces", r.times_reinforcing], ["sb.samples", r.samples_extracted]].filter(x => x[1] != null);
        if (chips.length) inner.push(el("div", { class: "scoreline", title: t("deb.score") }, chips.map(([k, v]) => el("span", {}, [t(k), el("b", {}, [String(v)])]))));
        if (aar.text) inner.push(el("div", { class: "aartext" }, [aar.text]));
      }
      const row = el("div", { class: "hrow" }, [el("div", { class: "stripe" }), el("div", { class: "in" }, inner)]);
      row.style.setProperty("--acc", p.accent);
      honors.appendChild(row);
    });
    kids.push(honors);
    const anyMedal = STATE.players.some(p => p.aar && (p.aar.verdicts || [p.aar.verdict]).some(v => v && v.medal));
    return panel(t("deb.pid"), t("deb.title"), { tone: anyMedal ? "amber" : null }, kids);
  }

  // ----------------------------------------------------------------- reference
  function manualPanel() {
    return panel(t("gl.pid"), t("gl.title"), { tone: "amber", status: t("gl.status"), statusKind: "info" }, [manualBody()]);
  }
  function manualBody() {
    const g = el("div", { class: "gloss" });
    const add = (k, v) => { g.appendChild(el("div", { class: "gk" }, [k])); g.appendChild(el("div", { class: "gv" }, [v])); };
    const body = el("div", { class: "body" });
    body.appendChild(el("div", { class: "sub-h", style: "margin-top:4px" }, [t("gl.roles")]));
    (META.roles || []).forEach(r => {
      const key = "role." + r.name.replace(/ /g, "_") + ".blurb";
      add(r.name, (has(key) ? t(key) : r.blurb) + (r.reactive ? " " + t("gl.reactive") : ""));
    });
    body.appendChild(g);
    const g2 = el("div", { class: "gloss" });
    (META.play_styles || []).forEach(p => { g2.appendChild(el("div", { class: "gk" }, [styleLabel(p.key)])); g2.appendChild(el("div", { class: "gv" }, [has("ps." + p.key + ".desc") ? t("ps." + p.key + ".desc") : p.desc])); });
    body.appendChild(el("div", { class: "sub-h" }, [t("gl.styles")])); body.appendChild(g2);
    const g3 = el("div", { class: "gloss" });
    g3.appendChild(el("div", { class: "gk" }, [t("gl.growth")])); g3.appendChild(el("div", { class: "gv" }, [t("gl.growth.d")]));
    g3.appendChild(el("div", { class: "gk" }, [t("gl.thin")])); g3.appendChild(el("div", { class: "gv" }, [t("gl.thin.d")]));
    g3.appendChild(el("div", { class: "gk" }, [t("gl.handling")])); g3.appendChild(el("div", { class: "gv" }, [t("gl.handling.d")]));
    body.appendChild(el("div", { class: "sub-h" }, [t("gl.card")])); body.appendChild(g3);
    // research sources behind the kit rules
    const src = el("div", { class: "gloss" });
    (META.kit_rules || []).forEach(r => {
      src.appendChild(el("div", { class: "gk" }, [r.id.replace(/_/g, " ")]));
      src.appendChild(el("div", { class: "gv" }, [r.rule, " ", el("span", { class: "src" }, (r.sources || []).map((u, i) =>
        el("a", { href: u, target: "_blank", rel: "noopener" }, [(i ? " · " : "") + "[" + (i + 1) + "]"])))]));
    });
    body.appendChild(el("div", { class: "sub-h" }, [t("gl.sources")]));
    body.appendChild(el("div", { class: "hint", style: "margin:0 0 8px" }, [t("gl.sources.d"), " ", t("gl.icons")]));
    body.appendChild(src);
    return body;
  }
})();
