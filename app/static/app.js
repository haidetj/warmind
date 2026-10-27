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
  const tag = (cls, text, title) => el("span", { class: "tag " + (cls || ""), title: title }, [text]);
  const fileBtn = (cls, text, multiple) => el("label", { class: "btn filebtn " + (cls || "") }, [text, el("input", { type: "file", accept: "image/*", multiple: multiple ? "" : null })]);

  // ======================================================================= boot
  initLang();
  (async function boot() {
    META = await api("/api/meta");
    if (!LID) return renderHome();
    startPolling();
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
    renderMyLobbies();
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

  function render() {
    const y = window.scrollY;
    app.innerHTML = ""; app.className = "stack boot";
    R = {};
    if (META.vision && META.vision.mock) app.appendChild(el("div", { class: "alert" }, [el("b", {}, [t("alert.mock.t")]), t("alert.mock")]));
    R.cmd = el("div"); app.appendChild(R.cmd);

    // 01 ASSEMBLE — join (static form), manifest + my setup (live)
    R.s1 = sect(1); app.appendChild(R.s1);
    if (!myPlayer()) app.appendChild(joinPanel());
    R.live1 = el("div", { class: "stack" }); app.appendChild(R.live1);

    // 02 MISSION — readout (live) + editor (static, creator)
    R.s2 = sect(2); app.appendChild(R.s2);
    app.appendChild(missionPanel());

    // 03 BRIEFING, 04 DEBRIEF — live
    R.s3 = sect(3); app.appendChild(R.s3);
    R.live3 = el("div", { class: "stack" }); app.appendChild(R.live3);
    R.s4 = sect(4); app.appendChild(R.s4);
    R.live4 = el("div", { class: "stack" }); app.appendChild(R.live4);

    app.appendChild(glossaryPanel());
    liveRoot = app;
    renderLive();
    window.scrollTo(0, y);
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
    R.live3.innerHTML = ""; briefing().forEach(n => R.live3.appendChild(n));
    R.live4.innerHTML = ""; R.live4.appendChild(debriefPanel());
    window.scrollTo(0, y);
  }

  // ----------------------------------------------------------------- command header
  function commandPanel(ph) {
    const link = location.origin + "/?l=" + LID;
    const inv = el("button", { class: "btn primary", type: "button" }, [t("cmd.invite")]);
    inv.onclick = () => copy(link, t("common.copied"));
    const role = isCreator() ? tag("amber", t("common.creator")) : myPlayer() ? tag("cyan", t("common.diver")) : null;
    const rail = el("nav", { class: "rail", "aria-label": "Phases" }, [1, 2, 3, 4].map(i =>
      el("a", { href: "#s" + i, class: (ph.done[i - 1] ? "done" : "") + (ph.active === i - 1 ? " active" : ""), "aria-current": ph.active === i - 1 ? "step" : null },
        ["0" + i + (ph.done[i - 1] ? " ✓" : ""), el("b", {}, [t("phase." + i)])])));
    const status = ph.active < 0 ? t("phase.4") + " ✓" : t("phase." + (ph.active + 1));
    return panel(t("cmd.pid"), t("cmd.title"), { status: status, statusKind: ph.active < 0 ? "ok" : "warn" }, [
      el("div", { class: "cmd" }, [el("div", { class: "top" }, [
        el("div", { class: "who" }, [el("div", { class: "big" }, [STATE.name || "Squad"]),
          el("div", { class: "code" }, [t("cmd.code") + ": ", el("b", {}, [LID])])]),
        el("div", { class: "acts" }, [role, inv, el("a", { class: "btn sm", href: "/" }, [t("cmd.home")])]),
      ])]),
      rail,
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
      const st = styleLabel(r.play_style);
      toast(r.vision_error ? t("toast.joined.err") : r.restored ? t("toast.joined.restored", { style: st })
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
        el("div", { class: "pips" }, [mine ? tag("amber", t("common.you")) : null, stats, gear, medal]),
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
    const reread = fileBtn("", t("me.reread"), true);
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
        if (r.ok === false) setStatus(status, "warn", t("me.reread.bad"));
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

  function gearFold(p) {
    const wbs = META.warbonds || [];
    if (!wbs.length) return null;
    const allNames = []; wbs.forEach(w => w.items.forEach(i => allNames.push(i.name)));
    const owned = new Set(p.owned == null ? allNames : p.owned);   // null = owns everything
    const unset = !p.gear_confirmed;
    const d = el("details", { class: "fold" + (unset ? " attn" : "") });
    d.open = gearOpen[p.id] !== undefined ? gearOpen[p.id] : unset;
    d.addEventListener("toggle", () => { gearOpen[p.id] = d.open; });
    d.appendChild(el("summary", {}, [unset ? t("gear.step") : t("gear.title")]));
    const body = el("div", { class: "body" }, [el("div", { class: "hint", style: "margin:0 0 8px" }, [t("gear.hint")])]);
    d.appendChild(body);
    async function save() {
      if (busy) return; busy = true;
      try {
        const payload = owned.size >= allNames.length ? { owned: null } : { owned: Array.from(owned) };
        await jpost("/api/lobby/" + LID + "/player/" + p.id + "/owned", payload, meRec().token);
        await refresh(); toast(t("gear.saved"));
      } catch (e) { toast(e.message); } finally { busy = false; }
    }
    wbs.forEach(w => {
      const names = w.items.map(i => i.name);
      const haveN = names.filter(n => owned.has(n)).length;
      const state = haveN === names.length ? "all" : haveN === 0 ? "none" : "some";
      const seg = el("div", { class: "gseg", role: "group", "aria-label": w.name });
      const btns = {};
      ["all", "some", "none"].forEach(v => { const b = el("button", { type: "button", class: state === v ? "on" : "", "aria-pressed": String(state === v) }, [t("gear." + v)]); btns[v] = b; seg.appendChild(b); });
      const items = el("div", { class: "gearitems" }); items.style.display = state === "some" ? "grid" : "none";
      w.items.forEach(i => {
        const cb = el("input", { type: "checkbox" }); cb.checked = owned.has(i.name);
        cb.onchange = () => { cb.checked ? owned.add(i.name) : owned.delete(i.name); save(); };
        items.appendChild(el("label", { class: "gearitem" }, [cb, el("span", {}, [i.name]), el("span", { class: "gs" }, [has("slot." + i.slot) ? t("slot." + i.slot) : i.slot])]));
      });
      const setSeg = v => { ["all", "some", "none"].forEach(k => { btns[k].classList.toggle("on", k === v); btns[k].setAttribute("aria-pressed", String(k === v)); }); items.style.display = v === "some" ? "grid" : "none"; };
      btns.all.onclick = () => { names.forEach(n => owned.add(n)); setSeg("all"); save(); };
      btns.none.onclick = () => { names.forEach(n => owned.delete(n)); setSeg("none"); save(); };
      btns.some.onclick = () => setSeg("some");
      const cnt = el("span", { class: "gs" }, [haveN + "/" + names.length]);
      items.addEventListener("change", () => { cnt.textContent = names.filter(n => owned.has(n)).length + "/" + names.length; });
      body.appendChild(el("div", { class: "gearrow" }, [el("div", { class: "gearhead" }, [el("span", { class: "wbname" }, [w.name, " ", cnt]), seg]), items]));
    });
    const confirm = el("button", { class: "btn primary", type: "button" }, [unset ? t("gear.confirm") : t("gear.everything")]);
    confirm.onclick = () => { if (!unset) allNames.forEach(n => owned.add(n)); delete gearOpen[p.id]; save(); };
    body.appendChild(el("div", { class: "btnrow" }, [confirm]));
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
    const oath = m.oath ? t("oath." + m.oath + ".name") : t("common.none");
    const mods = (m.operation_modifiers || []).map(x => t("mod." + x)).concat(m.is_city_map ? [t("mod.__city")] : []);
    R.misReadout.appendChild(el("div", { class: "readout" }, [
      ro(t("mis.mission"), mm ? mm.name : m.mission_id, "wide"),
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
    const base = { mode: "challenge", faction: "automatons", difficulty: 7, mission_id: "", operation_modifiers: [], planet_hazards: [], tactical_objectives: [], is_city_map: false, oath: null };
    const draft = JSON.parse(JSON.stringify(Object.assign(base, (STATE && STATE.mission) || {})));
    ["operation_modifiers", "planet_hazards", "tactical_objectives"].forEach(k => { if (!Array.isArray(draft[k])) draft[k] = []; });
    const set = !!(STATE.mission && STATE.mission.mission_id);
    const d = el("details", { class: "fold" + (set ? "" : " attn"), open: set ? null : true });
    d.appendChild(el("summary", {}, [set ? t("mis.edit") : t("mis.setup")]));
    const body = el("div", { class: "body editor" }); d.appendChild(body);

    // mode
    const modes = el("div", { class: "seg modes", role: "group", "aria-label": t("mis.mode") });
    ["fun", "challenge", "improvement", "d100"].forEach(k => {
      const b = el("button", { type: "button", class: k === "d100" ? "d100" : null, "aria-pressed": String(draft.mode === k) }, [t("mode." + k), el("span", { class: "sub" }, [t("mode." + k + ".s")])]);
      b.onclick = () => { draft.mode = k; modes.querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", String(x === b))); };
      modes.appendChild(b);
    });
    body.appendChild(el("div", { class: "blk", style: "margin-top:4px" }, [el("span", { class: "label" }, [t("mis.mode")]), modes, el("div", { class: "hint" }, [t("mis.d100.hint")])]));

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
    facSel.onchange = () => { draft.faction = facSel.value; fillMissions(); fillTacticals(); };
    diffSel.onchange = () => { draft.difficulty = parseInt(diffSel.value, 10); fillMissions(); fillTacticals(); };
    misSel.onchange = () => { draft.mission_id = misSel.value; };
    body.appendChild(el("div", { class: "blk grid2" }, [
      el("div", { class: "field" }, [el("label", { class: "label", for: "m-fac" }, [t("mis.faction")]), facSel]),
      el("div", { class: "field" }, [el("label", { class: "label", for: "m-diff" }, [t("mis.difficulty")]), diffSel]),
      el("div", { class: "field", style: "grid-column:1/-1" }, [el("label", { class: "label", for: "m-mis" }, [t("mis.mission")]), misSel]),
    ]));

    // modifiers
    const ops = el("div", { class: "chips" });
    ["complex_stratagem_plotting", "poor_intel", "__city"].forEach(id => {
      const on = id === "__city" ? draft.is_city_map : draft.operation_modifiers.indexOf(id) >= 0;
      const c = el("button", { type: "button", class: "chip", "aria-pressed": String(on) }, [t("mod." + id)]);
      c.onclick = () => {
        if (id === "__city") draft.is_city_map = !draft.is_city_map;
        else { const i = draft.operation_modifiers.indexOf(id); i >= 0 ? draft.operation_modifiers.splice(i, 1) : draft.operation_modifiers.push(id); }
        c.setAttribute("aria-pressed", String(c.getAttribute("aria-pressed") !== "true"));
      };
      ops.appendChild(c);
    });
    body.appendChild(el("div", { class: "blk" }, [el("span", { class: "label" }, [t("mis.mods.label")]), ops]));

    // planet hazards + tactical objectives: both feed the mission pressure
    const toggle = (arr, id, chip) => { const i = arr.indexOf(id); i >= 0 ? arr.splice(i, 1) : arr.push(id); chip.setAttribute("aria-pressed", String(i < 0)); };
    const haz = el("div", { class: "chips" });
    (META.hazards || []).forEach(h => {
      const c = el("button", { type: "button", class: "chip", "aria-pressed": String(draft.planet_hazards.indexOf(h.id) >= 0) }, [h.name]);
      c.onclick = () => toggle(draft.planet_hazards, h.id, c);
      haz.appendChild(c);
    });
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
    const setHint = () => { oathHint.textContent = draft.oath ? t("mis.oath.hint", { rule: t("oath." + draft.oath + ".rule"), medal: t("oath." + draft.oath + ".medal") }) : t("mis.oath.hint.none"); };
    [null].concat((META.oaths || []).map(o => o.key)).forEach(k => {
      const c = el("button", { type: "button", class: "chip", "aria-pressed": String((draft.oath || null) === k) }, [k ? t("oath." + k + ".name") : t("mis.oath.none")]);
      c.onclick = () => { draft.oath = k; oathRow.querySelectorAll(".chip").forEach(x => x.setAttribute("aria-pressed", String(x === c))); setHint(); };
      oathRow.appendChild(c);
    });
    setHint();
    body.appendChild(el("div", { class: "blk" }, [el("span", { class: "label" }, [t("mis.oath.label")]), oathRow, oathHint]));

    // actions
    const save = el("button", { class: "btn primary", type: "button" }, [t("mis.save")]);
    save.onclick = async () => {
      if (busy) return; busy = true; save.disabled = true;
      try {
        STATE = await jpost("/api/lobby/" + LID + "/mission", { mission: draft }, store.creator(LID));
        lastSig = JSON.stringify(STATE); renderLive(); d.open = false;
        d.querySelector("summary").textContent = t("mis.edit"); d.classList.remove("attn");
        toast(t("mis.saved"));
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
    out.push(panel(t("read.pid"), t("read.title"), {}, readKids));

    // doctrine (e.g. Commando)
    if (d.doctrine) {
      const k = d.doctrine.kind, orders = d.doctrine.orders || [];
      const ol = el("ol", { class: "orders" }, orders.map((o, i) => el("li", {}, [has("doctrine." + k + "." + (i + 1)) ? t("doctrine." + k + "." + (i + 1)) : o])));
      out.push(panel(t("doc.pid"), has("doctrine." + k + ".title") ? t("doctrine." + k + ".title") : d.doctrine.title, { status: k, statusKind: "info" }, [ol]));
    }

    // mission-coverage swaps
    if (d.swaps && d.swaps.length) {
      out.push(panel(t("swap.pid"), t("swap.title"), { tone: "amber" }, [el("div", { class: "hint", style: "margin:0 0 10px" }, [t("swap.hint")])].concat(
        d.swaps.map(s => el("div", { class: "swap" }, [
          el("div", { class: "mv" }, [s.callsign + ": ", el("b", {}, [s.from_role]), " → ", el("b", {}, [s.to_role])]),
          el("div", { class: "why" }, [t("swap.why", { to: s.to_role, callsign: s.callsign, from: s.from_role })]),
        ])))));
    }

    // loadouts
    const roster = el("div", { class: "roster" }); const me = meRec();
    STATE.players.forEach(p => roster.appendChild(diverCard(p, me && me.id === p.id, false)));
    const rkids = [roster];
    if (isCreator()) {
      const rb = el("button", { class: "btn sm", type: "button" }, ["⟳ " + t("roster.reroll")]);
      rb.onclick = async () => {
        if (busy) return; busy = true; rb.disabled = true;
        try { STATE = await jpost("/api/lobby/" + LID + "/reroll", {}, store.creator(LID)); lastSig = JSON.stringify(STATE); renderLive(); toast(t("toast.rerolled")); }
        catch (e) { toast(e.message); } finally { busy = false; rb.disabled = false; }
      };
      rkids.push(el("div", { class: "btnrow" }, [rb]), el("div", { class: "hint" }, [t("roster.reroll.hint")]));
    }
    out.push(panel(t("roster.pid"), t("roster.title"), { status: t("rdy.briefed"), statusKind: "ok" }, rkids));

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
    out.push(panel(t("coord.pid"), t("coord.title"), {}, [el("div", { class: "coord" }, blocks)]));

    // field notes
    const notes = el("ul", { class: "notes" }, (d.notes || []).map((n, i) => {
      const ph = (d.notes_i18n || [])[i];
      return el("li", { class: ph && ph.k.indexOf("d100.") === 0 ? "d100" : null }, [tp(ph, n)]);
    }));
    out.push(panel(t("notes.pid"), t("notes.title"), { tone: STATE.mission && STATE.mission.mode === "d100" ? "red" : null }, [notes]));
    return out;
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
    const kit = el("ul", { class: "kit" });
    const row = (k, v, small) => el("li", {}, [el("span", { class: "sl" }, [t(k)]), el("span", { class: "vv" }, [v, small ? el("small", {}, [small]) : null])]);
    kit.appendChild(row("card.primary", a.primary));
    kit.appendChild(row("card.secondary", a.secondary));
    kit.appendChild(row("card.grenade", a.grenade));
    kit.appendChild(row("card.armor", a.armor, (has("w." + a.armor_weight) ? t("w." + a.armor_weight) : a.armor_weight) + " · " + a.armor_passive));
    kit.appendChild(row("card.booster", a.booster));
    (a.stratagems || []).forEach((s, i) => kit.appendChild(el("li", {}, [
      el("span", { class: "sl" }, [i === 0 ? t("card.strats") : ""]),
      el("span", { class: "vv" }, [s, s === a.growth_slot ? el("span", { class: "grow" }, [t("card.growth")]) : null]),
    ])));
    card.appendChild(kit);
    const thin = (a.thin_axes && a.thin_axes.length ? a.thin_axes.map(x => t("axis." + x)) : a.thin) || [];
    if (thin.length) card.appendChild(el("div", { class: "thin" }, [t("card.thin", { list: thin.join(", ") })]));
    const why = a.rationale_parts && a.rationale_parts.length ? a.rationale_parts.map(x => tp(x, "")).filter(Boolean).join(" ") : "";
    card.appendChild(el("div", { class: "why" }, [why || a.rationale]));
    return card;
  }

  // ----------------------------------------------------------------- 04: debrief
  function verdictBlock(v) {
    if (!v) return null;
    const name = t("oath." + v.oath + ".name"), reason = tp({ k: v.reason_key, p: v.reason_params }, v.reason);
    if (v.passed === true && v.medal) {
      const base = t("oath." + v.oath + ".medal"), mname = v.medal.d100 ? t("medal.d100", { name: base }) : base;
      return el("div", { class: "medal" }, [el("div", { class: "hex", "aria-hidden": "true" }, ["★"]), el("div", {}, [
        el("div", { class: "mn" }, [mname]), el("div", { class: "mid" }, [t("deb.medal", { id: v.medal.id })]),
        el("div", { class: "mw" }, [t("deb.kept", { name: name, reason: reason })])])]);
    }
    if (v.passed === false) return el("div", { class: "broken" }, [el("div", { class: "bt" }, [t("deb.broken", { name: name })]), el("div", { class: "bw" }, [reason])]);
    return el("div", { class: "unver" }, [t("deb.unver", { reason: reason })]);
  }

  function debriefPanel() {
    if (!STATE.directive) return el("div", { class: "alert" }, [el("b", {}, ["//"]), t("deb.waiting")]);
    const m = STATE.mission || {}, me = myPlayer();
    const kids = [];
    if (m.oath) kids.push(el("div", { class: "readout-q", style: "margin:0 0 12px;font-style:normal" }, [t("deb.oath", { name: t("oath." + m.oath + ".name"), rule: t("oath." + m.oath + ".rule") })]));
    if (me && me.assignment) {
      const status = el("div", { class: "upstatus", role: "status", "aria-live": "polite" });
      const up = fileBtn("primary", t("deb.submit"), false);
      up.querySelector("input").onchange = async ev => {
        const f = ev.target.files[0]; if (!f || busy) return;
        busy = true; lockControls([up], true);
        const stop = workTicker(status, lines("tick.review.", 5));
        try {
          const fd = new FormData(); fd.append("image", f); fd.append("lang", LANG);
          const rr = await fdpost("/api/lobby/" + LID + "/player/" + me.id + "/result", fd, meRec().token);
          stop(); await refresh();
          const v = rr.verdict;
          toast(v && v.passed === true && v.medal ? t("toast.medal", { name: v.medal.d100 ? t("medal.d100", { name: t("oath." + v.oath + ".medal") }) : t("oath." + v.oath + ".medal") })
            : v && v.passed === false ? t("toast.broken") : t("toast.aar"));
        } catch (e) { stop(); setStatus(status, "err", t("deb.failed", { msg: e.message })); }
        finally { stop(); lockControls([up], false); busy = false; }
      };
      kids.push(el("div", { class: "btnrow", style: "margin-top:0" }, [up]), status, el("div", { class: "hint" }, [t("deb.submit.hint")]));
    }
    kids.push(el("div", { class: "sub-h" }, [t("deb.honors")]));
    const honors = el("div", { class: "honors" });
    STATE.players.forEach(p => {
      const aar = p.aar, inner = [el("div", { class: "nm" }, [p.callsign + (p.assignment ? "  ·  " + p.assignment.role : "")])];
      if (!aar) inner.push(el("div", { class: "st" }, [t("deb.pending")]));
      else {
        const vb = verdictBlock(aar.verdict); if (vb) inner.push(vb);
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
    const anyMedal = STATE.players.some(p => p.aar && p.aar.verdict && p.aar.verdict.medal);
    return panel(t("deb.pid"), t("deb.title"), { tone: anyMedal ? "amber" : null }, kids);
  }

  // ----------------------------------------------------------------- reference
  function glossaryPanel() {
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
    body.appendChild(el("div", { class: "sub-h" }, [t("gl.card")])); body.appendChild(g3);
    return el("details", { class: "fold panel", style: "padding:0" }, [el("summary", {}, [t("gl.title")]), body]);
  }
})();
