"use strict";
(function () {
  const $ = s => document.querySelector(s);
  const el = (t, a, kids) => {
    const n = document.createElement(t);
    if (a) for (const k in a) { if (k === "class") n.className = a[k]; else if (k === "html") n.innerHTML = a[k]; else n.setAttribute(k, a[k]); }
    (kids || []).forEach(c => c != null && n.appendChild(typeof c === "string" ? document.createTextNode(c) : c));
    return n;
  };
  const app = $("#app");
  const params = new URLSearchParams(location.search);
  const LID = params.get("l");
  let META = null, STATE = null, pollT = null, busy = false;

  // ---------- storage ----------
  const store = {
    creator: lid => localStorage.getItem("wm_creator_" + lid),
    setCreator: (lid, t) => localStorage.setItem("wm_creator_" + lid, t),
    me: lid => { try { return JSON.parse(localStorage.getItem("wm_me_" + lid)); } catch (e) { return null; } },
    setMe: (lid, o) => localStorage.setItem("wm_me_" + lid, JSON.stringify(o)),
  };

  // ---------- api ----------
  async function api(path, opts) {
    let r;
    try { r = await fetch(path, opts); }
    catch (e) { throw new Error("Can't reach WARMIND — check your connection"); }
    // 502/503/504 come from the host while a new version deploys (disk-backed
    // services restart on every deploy) — say so instead of "Bad Gateway"
    if ([502, 503, 504].indexOf(r.status) >= 0) throw new Error("WARMIND is redeploying, back in about a minute");
    if (!r.ok) { let m = r.statusText; try { m = (await r.json()).detail || m; } catch (e) {} throw new Error(m); }
    return r.status === 204 ? {} : r.json();
  }
  const jpost = (path, body, token) => api(path, { method: "POST", headers: Object.assign({ "content-type": "application/json" }, token ? { "x-token": token } : {}), body: JSON.stringify(body) });
  function fpost(path, file, token, field) {
    const fd = new FormData(); fd.append(field || "image", file);
    return api(path, { method: "POST", headers: token ? { "x-token": token } : {}, body: fd });
  }

  let toastT;
  function toast(m) { const t = $("#toast"); t.textContent = m; t.classList.add("show"); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("show"), 1800); }
  // Persistent inline status for uploads (model reads take several seconds —
  // a 1.8s toast isn't enough feedback). kind: working | ok | warn | err.
  function setStatus(node, kind, msg) {
    if (!node) return;
    node.className = "upstatus " + kind;
    node.innerHTML = "";
    if (kind === "working") node.appendChild(el("span", { class: "spin" }));
    node.appendChild(el("span", {}, [msg]));
    node.style.display = "flex";
  }

  // Helldivers-flavoured status lines that rotate while a model read is in flight
  const READ_LINES = [
    "Transmitting your career records to Super Earth High Command…",
    "Cross-referencing kill counts with the Ministry of Truth…",
    "Counting your accidentals. Generously.",
    "Reading every number twice — Liberty demands accuracy…",
    "Calibrating freedom-per-minute metrics…",
    "Confirming you are not a Terminid in a trench coat…",
    "Filing Form 27-B/Liberty in triplicate…",
    "Requesting orbital confirmation of your K/D…",
    "Steeping a fresh cup of Liber-Tea…",
    "Consulting the Democracy Officer for a second opinion…",
    "Redacting the friendly-fire incidents. Mostly.",
    "Decrypting Automaton-proof stat ledgers…",
  ];
  const REVIEW_LINES = [
    "Debriefing with the Ministry of Defense…",
    "Checking your oath against the official record…",
    "Polishing a medal… or sharpening an insult…",
    "Tallying the bugs, bots and squids you liberated…",
    "Reviewing helmet-cam footage. Some of it twice.",
    "Asking Democracy how it feels about your performance…",
  ];
  // Start a rotating "working" status; returns a stop() for when the request settles.
  function workTicker(node, lines) {
    let i = Math.floor(Math.random() * lines.length);
    setStatus(node, "working", lines[i]);
    const t = setInterval(() => {
      i = (i + 1) % lines.length;
      const span = node.lastElementChild; if (span) span.textContent = lines[i];
    }, 2400);
    return () => clearInterval(t);
  }
  // Lock upload controls (file-input labels and buttons) until the request completes or fails.
  function lockControls(els, locked) {
    els.forEach(c => {
      if (!c) return;
      c.classList.toggle("locked", locked);
      c.setAttribute("aria-disabled", String(locked));
      const inp = c.tagName === "INPUT" ? c : c.querySelector("input");
      if (inp) { inp.disabled = locked; if (!locked) inp.value = ""; }
      if (c.tagName === "BUTTON") c.disabled = locked;
    });
  }
  function copy(text, msg) {
    (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(() => toast(msg), () => {
      const ta = el("textarea"); ta.value = text; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); } catch (e) {} document.body.removeChild(ta); toast(msg);
    });
  }

  $("#theme").onclick = () => {
    const cur = document.documentElement.getAttribute("data-theme");
    document.documentElement.setAttribute("data-theme", cur === "dark" ? "light" : cur === "light" ? "dark" : (matchMedia("(prefers-color-scheme: dark)").matches ? "light" : "dark"));
  };

  // ---------- boot ----------
  (async function boot() {
    META = await api("/api/meta");
    if (!LID) return renderHome();
    startPolling();
  })().catch(e => { app.appendChild(el("div", { class: "card" }, ["Could not start: " + e.message])); });

  // ---------- home ----------
  function renderHome() {
    app.innerHTML = "";
    const name = el("input", { type: "text", placeholder: "SQUAD DESIGNATION", "aria-label": "Squad name" });
    let size = 4;
    const sizeSeg = el("div", { class: "sizeseg", role: "radiogroup", "aria-label": "Divers in squad" });
    [1, 2, 3, 4].forEach(n => {
      const b = el("button", { class: "sizebtn" + (n === size ? " on" : ""), type: "button", "aria-pressed": String(n === size) }, [String(n)]);
      b.onclick = () => { size = n; sizeSeg.querySelectorAll(".sizebtn").forEach(x => { const on = x === b; x.classList.toggle("on", on); x.setAttribute("aria-pressed", String(on)); }); };
      sizeSeg.appendChild(b);
    });
    const create = el("button", { class: "deploy" }, ["▶ Brief Squad"]);
    create.onclick = async () => {
      create.disabled = true; create.textContent = "▶ Establishing link…";
      try {
        const fd = new FormData(); fd.append("name", name.value || "Squad"); fd.append("squad_size", String(size));
        const r = await api("/api/lobby", { method: "POST", body: fd });
        store.setCreator(r.lobby_id, r.creator_token);
        location.search = "?l=" + r.lobby_id;
      } catch (e) { toast(e.message); create.disabled = false; create.textContent = "▶ Brief Squad"; }
    };
    name.addEventListener("keydown", e => { if (e.key === "Enter") create.click(); });

    const term = el("div", { class: "term", "aria-hidden": "true" });
    const hero = el("section", { class: "hero" }, [
      el("div", { class: "fx stars" }), el("div", { class: "fx grid" }),
      el("div", { class: "fx radar" }), el("div", { class: "fx scan" }), el("div", { class: "fx vig" }),
      el("div", { class: "hero-body" }, [
        el("div", { class: "eyebrow" }, ["Super Earth · War Table"]),
        el("div", { class: "title" }, ["WARMIND"]),
        el("div", { class: "sub" }, ["Tactical Squad Coach"]),
        term,
        el("div", { class: "console" }, [
          el("div", { class: "prompt" }, ["> DESIGNATE SQUAD"]),
          name,
          el("div", { class: "prompt", style: "margin-top:14px" }, ["> DIVERS DEPLOYING"]),
          sizeSeg,
          create,
        ]),
        el("div", { class: "foot" }, ["Create a war table, then share the link. Divers upload a career screenshot and receive a loadout — with a reason."]),
      ]),
    ]);
    app.appendChild(hero);
    renderMyLobbies();
    if (META.vision && META.vision.mock)
      app.appendChild(el("div", { class: "mockbanner" }, ["Vision is in mock mode — set ANTHROPIC_API_KEY on the server to read real screenshots. Uploads return sample data until then."]));
    bootSequence(term);
  }

  function storedLobbies() {
    const map = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      const m = k && k.match(/^wm_(creator|me)_(.+)$/);
      if (m) { const id = m[2]; map[id] = map[id] || { id: id }; if (m[1] === "creator") map[id].own = true; else map[id].member = true; }
    }
    return Object.keys(map).map(id => map[id]);
  }

  function forgetLobby(id) { localStorage.removeItem("wm_creator_" + id); localStorage.removeItem("wm_me_" + id); }

  async function renderMyLobbies() {
    const mine = storedLobbies();
    if (!mine.length) return;
    const card = el("section", { class: "card" }, [el("div", { class: "section-title" }, ["Your war tables"])]);
    const list = el("div", { class: "lobbylist" }, [el("div", { class: "hint", style: "margin:0" }, ["Loading…"])]);
    card.appendChild(list);
    app.appendChild(card);

    let data;
    try { data = await jpost("/api/lobbies/summary", { ids: mine.map(x => x.id) }); }
    catch (e) { card.remove(); return; }

    const found = new Set((data.lobbies || []).map(l => l.id));
    mine.forEach(x => { if (!found.has(x.id)) forgetLobby(x.id); });     // prune expired
    const rows = (data.lobbies || []).sort((a, b) => (b.updated_at || 0) - (a.updated_at || 0));
    if (!rows.length) { card.remove(); return; }

    list.innerHTML = "";
    const owned = new Set(mine.filter(x => x.own).map(x => x.id));
    rows.forEach(l => {
      const meta = [l.players + " diver" + (l.players === 1 ? "" : "s"), l.mission_name || "no mission set", l.mode || null].filter(Boolean).join(" · ");
      const isOwn = owned.has(l.id);
      const resume = el("button", { class: "btn" }, ["Resume"]);
      resume.onclick = () => { location.search = "?l=" + l.id; };
      const forget = el("button", { class: "forget", title: "Forget on this device", "aria-label": "Forget" }, ["×"]);
      const row = el("div", { class: "lobbyrow" }, [
        el("div", { class: "grow" }, [el("div", { class: "nm" }, [l.name || "Squad"]), el("div", { class: "mt" }, [meta])]),
        el("span", { class: "rolebadge" + (isOwn ? " own" : "") }, [isOwn ? "Created" : "Joined"]),
        resume, forget,
      ]);
      forget.onclick = () => { forgetLobby(l.id); row.remove(); if (!list.children.length) card.remove(); };
      list.appendChild(row);
    });
  }

  function bootSequence(term) {
    const M = META || {};
    const nMissions = (M.missions || []).length || "—";
    const nHazards = (M.hazards || []).length || "—";
    const lines = [
      ["> init managed_democracy ……… ", "OK"],
      ["> war table uplink ……………… ", "ESTABLISHED"],
      ["> mission database …………… ", nMissions + " OPS"],
      ["> hazard model ………………… ", nHazards + " TAGS"],
      ["> stratagem resolver ……… ", "ONLINE"],
      ["> awaiting squad designation", ""],
    ];
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let i = 0;
    function add() {
      if (!term.isConnected) return;
      const [head, tail] = lines[i];
      const ln = el("div", { class: "ln" }, [head]);
      if (tail) ln.appendChild(el("span", { class: "ok" }, [tail]));
      if (i === lines.length - 1) ln.appendChild(el("span", { class: "cursor" }));
      term.appendChild(ln);
      i++;
      if (i < lines.length) reduce ? add() : setTimeout(add, 190);
    }
    add();
  }

  // ---------- polling ----------
  function startPolling() { tick(); pollT = setInterval(tick, 3500); }
  async function tick() {
    if (busy) return;
    let s;
    try { s = await api("/api/lobby/" + LID); }
    catch (e) { if (String(e.message).match(/not found/i)) { clearInterval(pollT); app.innerHTML = ""; app.appendChild(el("div", { class: "card center" }, ["Lobby not found. It may have expired.", el("div", { style: "margin-top:12px" }, [el("a", { href: "/", class: "btn" }, ["Start a new one"])])])); } return; }
    STATE = s;
    // render errors must not be swallowed — a half-built page with no error is the worst failure
    try { liveEl ? renderLive() : render(); } catch (e) { console.error("WARMIND render failed:", e); }
  }

  // ---------- render lobby ----------
  // Full render builds the control panels (share / mission / join) ONCE; the poll
  // only refreshes the live section, so it never clobbers a form you're editing.
  let liveEl = null;

  function render() {
    const scrollY = window.scrollY;
    app.innerHTML = "";
    const isCreator = !!store.creator(LID);
    const me = store.me(LID);
    const joined = me && STATE.players.some(p => p.id === me.id);

    app.appendChild(shareCard(isCreator));
    if (isCreator) app.appendChild(missionCard());
    if (!joined) app.appendChild(joinCard());
    liveEl = el("div", { class: "stack" });
    app.appendChild(liveEl);
    renderLive();
    app.appendChild(glossaryCard());
    window.scrollTo(0, scrollY);
  }

  function glossaryCard() {
    const d = el("details", { class: "card gloss" });
    d.appendChild(el("summary", {}, ["What the roles & play-styles mean"]));
    const body = el("div", { class: "glossbody" });
    body.appendChild(el("div", { class: "section-title" }, ["Roles — assigned per drop"]));
    (META.roles || []).forEach(r => body.appendChild(el("div", { class: "glossrow" }, [
      el("span", { class: "gk" }, [r.name]),
      el("span", { class: "gv" }, [r.blurb + (r.reactive ? " Holds the squad's reactive-stratagem call." : "")]),
    ])));
    body.appendChild(el("div", { class: "section-title", style: "margin-top:16px" }, ["Play-styles — read from your career stats"]));
    (META.play_styles || []).forEach(p => body.appendChild(el("div", { class: "glossrow" }, [
      el("span", { class: "gk" }, [p.label]), el("span", { class: "gv" }, [p.desc]),
    ])));
    body.appendChild(el("div", { class: "section-title", style: "margin-top:16px" }, ["On a card"]));
    body.appendChild(el("div", { class: "glossrow" }, [el("span", { class: "gk gold" }, ["Growth"]),
      el("span", { class: "gv" }, ["One pick deliberately outside your comfort zone that this mission rewards — how the coach stretches you, not a handicap."])]));
    body.appendChild(el("div", { class: "glossrow" }, [el("span", { class: "gk thin" }, ["Thin"]),
      el("span", { class: "gv" }, ["A capability you're light on this drop — always covered by a named teammate. Check the capability matrix to see who."])]));
    d.appendChild(body);
    return d;
  }

  function renderLive() {
    if (!liveEl) return render();
    const scrollY = window.scrollY;
    liveEl.innerHTML = "";
    liveEl.appendChild(rosterSection(store.me(LID)));
    if (STATE.directive) liveEl.appendChild(squadBlocks());
    if (META.vision && META.vision.mock)
      liveEl.appendChild(el("div", { class: "mockbanner" }, ["Vision in mock mode — screenshot reads return sample data until ANTHROPIC_API_KEY is set on the server."]));
    window.scrollTo(0, scrollY);
  }

  function shareCard(isCreator) {
    const link = location.origin + "/?l=" + LID;
    const copyBtn = el("button", { class: "btn primary" }, ["Copy invite link"]);
    copyBtn.onclick = () => copy(link, "Invite link copied");
    return el("section", { class: "card" }, [
      el("div", { class: "sharebar" }, [
        el("div", {}, [el("div", { class: "section-title", style: "margin:0" }, ["Lobby"]), el("div", { class: "big" }, [STATE.name || "Squad"])]),
        el("div", { class: "spacer", style: "flex:1" }), copyBtn,
      ]),
      el("div", { class: "hint" }, [isCreator ? "You're the creator — set the mission below. Share the link so friends can join." : "Share this link with your squad."]),
    ]);
  }

  // ---------- mission (creator) ----------
  function missionCard() {
    // merge over defaults: a mission saved without every field (API, older lobby) must not break the card
    const m = Object.assign({ mode: "challenge", faction: "automatons", difficulty: 7, mission_id: "", operation_modifiers: [], planet_hazards: [], tactical_objectives: [], is_city_map: false, oath: null }, STATE.mission || {});
    const draft = JSON.parse(JSON.stringify(m));
    ["operation_modifiers", "planet_hazards", "tactical_objectives"].forEach(k => { if (!Array.isArray(draft[k])) draft[k] = []; });
    const wrap = el("section", { class: "card" }, [el("div", { class: "section-title" }, ["Mission"])]);

    const modes = el("div", { class: "modes" });
    [["fun", "Fun", "new tools"], ["challenge", "Challenge", "out of comfort"], ["improvement", "Improve", "one stretch"], ["d100", "D100", "Helldive∞ — brutal"]].forEach(([k, lbl, sub]) => {
      const b = el("button", { class: k === "d100" ? "d100" : "", "aria-pressed": draft.mode === k ? "true" : "false" }, [el("span", { class: "k stencil" }, [lbl]), el("span", { class: "sub" }, [sub])]);
      b.onclick = () => { draft.mode = k; modes.querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", "false")); b.setAttribute("aria-pressed", "true"); };
      modes.appendChild(b);
    });
    wrap.appendChild(modes);
    wrap.appendChild(el("div", { class: "hint", style: "margin-top:6px" }, ["D100 ignores the difficulty dial: stretch roles, off-meta kit, amplified mission pressure, and standing orders."]));

    // optional oath — checked against each diver's scoreboard when they submit results
    const oathRow = el("div", { class: "chips", style: "margin-top:12px" });
    const oathHint = el("div", { class: "hint" });
    const setOathHint = () => { const o = (META.oaths || []).find(x => x.key === draft.oath); oathHint.textContent = o ? "Oath: " + o.rule + " Keep it → " + o.medal + ". Break it → WARMIND has words." : "No oath — swear one for a shot at a medal (or a dressing-down)."; };
    [{ key: null, name: "No oath" }].concat(META.oaths || []).forEach(o => {
      const c = el("span", { class: "chip", "aria-pressed": (draft.oath || null) === o.key ? "true" : "false" }, [o.name]);
      c.onclick = () => { draft.oath = o.key; oathRow.querySelectorAll(".chip").forEach(x => x.setAttribute("aria-pressed", "false")); c.setAttribute("aria-pressed", "true"); setOathHint(); };
      oathRow.appendChild(c);
    });
    setOathHint();
    wrap.appendChild(el("span", { class: "label", style: "display:block;margin-top:12px" }, ["Oath (optional)"]));
    wrap.appendChild(oathRow); wrap.appendChild(oathHint);

    const facSel = el("select", {}, ["automatons", "terminids", "illuminate"].map(f => el("option", { value: f }, [f[0].toUpperCase() + f.slice(1)])));
    facSel.value = draft.faction;
    const diffSel = el("select", {}, Array.from({ length: 10 }, (_, i) => el("option", { value: i + 1 }, ["D" + (i + 1) + (i === 9 ? " · Super Helldive" : "")])));
    diffSel.value = draft.difficulty;
    const misSel = el("select", {});
    function fillMissions() {
      misSel.innerHTML = "";
      const list = META.missions.filter(x => x.factions.indexOf(facSel.value) >= 0 && diffSel.value >= x.dmin && diffSel.value <= x.dmax);
      if (!list.length) { misSel.appendChild(el("option", { value: "" }, ["— none at this faction/difficulty —"])); draft.mission_id = ""; }
      else { if (!list.some(x => x.id === draft.mission_id)) draft.mission_id = list[0].id; list.forEach(x => misSel.appendChild(el("option", { value: x.id }, [x.name]))); misSel.value = draft.mission_id; }
    }
    fillMissions();
    facSel.onchange = () => { draft.faction = facSel.value; fillMissions(); };
    diffSel.onchange = () => { draft.difficulty = parseInt(diffSel.value, 10); fillMissions(); };
    misSel.onchange = () => { draft.mission_id = misSel.value; };
    wrap.appendChild(el("div", { class: "controls", style: "margin-top:12px" }, [
      el("div", { class: "field" }, [el("span", { class: "label" }, ["Faction"]), facSel]),
      el("div", { class: "field" }, [el("span", { class: "label" }, ["Difficulty"]), diffSel]),
      el("div", { class: "field", style: "grid-column:1/-1" }, [el("span", { class: "label" }, ["Mission"]), misSel]),
    ]));

    const ops = el("div", { class: "chips" });
    [["complex_stratagem_plotting", "Complex Stratagem Plotting"], ["poor_intel", "Poor Intel"], ["__city", "City map"]].forEach(([id, lbl]) => {
      const on = id === "__city" ? draft.is_city_map : draft.operation_modifiers.indexOf(id) >= 0;
      const c = el("span", { class: "chip", "aria-pressed": on ? "true" : "false" }, [lbl]);
      c.onclick = () => {
        if (id === "__city") draft.is_city_map = !draft.is_city_map;
        else { const i = draft.operation_modifiers.indexOf(id); i >= 0 ? draft.operation_modifiers.splice(i, 1) : draft.operation_modifiers.push(id); }
        c.setAttribute("aria-pressed", c.getAttribute("aria-pressed") === "true" ? "false" : "true");
      };
      ops.appendChild(c);
    });
    wrap.appendChild(ops);

    const save = el("button", { class: "btn primary" }, ["Set mission"]);
    save.onclick = async () => {
      save.disabled = true; busy = true;
      try { STATE = await jpost("/api/lobby/" + LID + "/mission", { mission: draft }, store.creator(LID)); renderLive(); toast("Mission set — loadouts rebuilt"); }
      catch (e) { toast(e.message); } finally { busy = false; save.disabled = false; }
    };
    const prefill = el("label", { class: "btn filebtn" }, ["Read from screenshot", el("input", { type: "file", accept: "image/*" })]);
    prefill.querySelector("input").onchange = async ev => {
      const f = ev.target.files[0]; if (!f) return; busy = true; prefill.textContent = "Reading…";
      try {
        const r = await fpost("/api/lobby/" + LID + "/mission/prefill", f, store.creator(LID));
        const s = r.suggestion || {};
        if (s.faction) { facSel.value = s.faction; draft.faction = s.faction; fillMissions(); }
        if (s.difficulty) { diffSel.value = s.difficulty; draft.difficulty = s.difficulty; fillMissions(); }
        toast(s.note ? s.note : "Prefilled — confirm and set");
      } catch (e) { toast(e.message); } finally { busy = false; }
    };
    wrap.appendChild(el("div", { style: "display:flex;gap:8px;flex-wrap:wrap;margin-top:12px" }, [save, prefill]));
    wrap.appendChild(el("div", { class: "hint" }, ["Optional: upload a mission-select screenshot to prefill faction & difficulty, then confirm."]));
    return wrap;
  }

  // ---------- join ----------
  function joinCard() {
    const wrap = el("section", { class: "card" }, [el("div", { class: "section-title" }, ["Join this drop"])]);
    const name = el("input", { type: "text", placeholder: "Your callsign (optional if it's in your screenshot)" });
    const status = el("div", { class: "upstatus" });
    const upload = el("label", { class: "btn primary filebtn" }, ["Upload career stats", el("input", { type: "file", accept: "image/*", multiple: "" })]);
    const skip = el("button", { class: "btn" }, ["Join without stats"]);
    const controls = [upload, skip, name];
    upload.querySelector("input").onchange = ev => doJoin(name.value, ev.target.files, status, controls);
    skip.onclick = () => doJoin(name.value, null, status, controls);
    wrap.appendChild(el("div", { class: "field" }, [name]));
    wrap.appendChild(el("div", { style: "display:flex;gap:8px;flex-wrap:wrap;margin-top:10px" }, [upload, skip]));
    wrap.appendChild(status);
    wrap.appendChild(el("div", { class: "hint" }, ["Open your in-game Career screen and screenshot it. The list scrolls — take a few shots and select them all; WARMIND merges them. You can override the read anytime."]));
    wrap.appendChild(el("div", { class: "hint" }, ["Dropped with WARMIND before? Enter the same callsign and tap “Join without stats” — your last read comes back. (Callsigns aren't passwords: anyone using yours gets your stats.)"]));
    return wrap;
  }
  async function doJoin(callsign, files, status, controls) {
    if (busy) return;
    busy = true;
    const list = files ? Array.from(files) : [];
    lockControls(controls || [], true);
    const stop = list.length ? workTicker(status, READ_LINES) : (setStatus(status, "working", "Joining the drop…"), () => {});
    try {
      const fd = new FormData(); fd.append("callsign", callsign || "");
      list.forEach(f => fd.append("images", f));
      const r = await api("/api/lobby/" + LID + "/join", { method: "POST", body: fd });
      store.setMe(LID, { id: r.player_id, token: r.player_token });
      // Success paths rebuild the whole page (join card goes away); a toast carries
      // the result. A hard failure keeps the join card, so the inline status shows it.
      STATE = await api("/api/lobby/" + LID); render();
      if (r.vision_error) toast("Joined — couldn't read that screenshot, pick your style or re-read below.");
      else if (r.restored) toast("Welcome back — restored your last stat read (" + label(r.play_style) + ").");
      else toast(list.length ? "Read as " + label(r.play_style) + (list.length > 1 ? " (" + list.length + " shots)" : "") : "Joined — pick your style");
    } catch (e) {
      stop(); lockControls(controls || [], false);
      setStatus(status, "err", "Upload failed: " + e.message + " — try again.");
    } finally { stop(); busy = false; }
  }

  // ---------- roster ----------
  function label(k) { return ({ siege_anchor: "Siege Anchor", danger_close: "Danger Close", fire_for_effect: "Fire for Effect", forward_eye: "Forward Eye", by_the_book: "By the Book" })[k] || k; }

  function readinessCard() {
    const r = STATE.readiness; if (!r) return null;
    const isCreator = !!store.creator(LID);
    const item = (ok, txt) => el("div", { class: "rdy" + (ok ? " ok" : "") }, [el("span", { class: "rdot" }, [ok ? "✓" : "·"]), txt]);
    const mi = STATE.mission || {};
    const oath = mi.oath && (META.oaths || []).find(x => x.key === mi.oath);
    const card = el("section", { class: "card readiness" + (r.final ? " final" : "") }, [
      el("div", { class: "section-title" }, [r.final ? "Squad briefed" : "Briefing readiness",
        mi.mode === "d100" ? el("span", { class: "d100tag" }, ["D100 · Helldive∞"]) : null]),
      oath ? el("div", { class: "oathline" }, ["Oath sworn: ", el("b", {}, [oath.name]), " — " + oath.rule]) : null,
      el("div", { class: "rdylist" }, [
        item(r.mission_set, "Mission set"),
        item(r.joined >= r.expected, "Divers " + r.joined + " / " + r.expected),
        item(r.joined > 0 && r.read >= r.joined, "Stat reads " + r.read + " / " + r.joined),
        item(r.joined > 0 && r.gear >= r.joined, "Gear set " + r.gear + " / " + r.joined),
      ]),
    ]);
    if (r.final) {
      card.appendChild(el("div", { class: "hint" }, [r.ready
        ? "Everyone's in with a read and gear — the loadouts below are the holistic call for this squad and mission."
        : "Briefed early by the creator — loadouts below are final for the divers present."]));
    } else {
      card.appendChild(el("div", { class: "hint" }, ["Loadouts are provisional — they rebalance as divers join, read their stats, and set their gear."]));
      if (isCreator && r.mission_set && r.joined > 0) {
        const b = el("button", { class: "btn" }, ["Brief squad now"]);
        b.onclick = async () => {
          if (busy) return; busy = true;
          try { STATE = await jpost("/api/lobby/" + LID + "/brief", {}, store.creator(LID)); renderLive(); toast("Squad briefed"); }
          catch (e) { toast(e.message); } finally { busy = false; }
        };
        card.appendChild(el("div", { style: "margin-top:10px" }, [b]));
      }
    }
    return card;
  }

  function rosterSection(me) {
    const wrap = el("section", { class: "stack" });
    const rdy = readinessCard(); if (rdy) wrap.appendChild(rdy);
    if (STATE.directive) {
      const d = STATE.directive, top = d.pressure.top || [];
      const read = el("div", { class: "read" });
      top.forEach(([k, v]) => read.appendChild(el("span", { class: "k" + (v < 0 ? " neg" : ""), html: k.replace(/_/g, " ") + " <b>" + (v >= 0 ? "+" : "") + v.toFixed(2) + "</b>" })));
      const rc = el("section", { class: "card" }, [el("div", { class: "section-title" }, ["The read"]), read]);
      if (d.pressure.driver) rc.appendChild(el("div", { class: "constraint", html: "The constraint that decides it: <b>" + d.pressure.driver + "</b>." }));
      if (STATE.squad_readout) rc.appendChild(el("div", { class: "squadread" }, [STATE.squad_readout]));
      wrap.appendChild(rc);
    } else {
      if (STATE.squad_readout) wrap.appendChild(el("section", { class: "card" }, [el("div", { class: "section-title" }, ["Squad read"]), el("div", { class: "squadread" }, [STATE.squad_readout])]));
      wrap.appendChild(el("section", { class: "card" }, [el("div", { class: "muted" }, [STATE.players.length ? "Waiting on the mission — the creator sets it and every loadout builds at once." : "Waiting for divers to join…"])]));
    }
    const roster = el("div", { class: "roster" });
    STATE.players.forEach(p => roster.appendChild(diverCard(p, me)));
    wrap.appendChild(roster);
    return wrap;
  }

  function diverCard(p, me) {
    const mine = me && me.id === p.id;
    const card = el("div", { class: "dcard" }); card.style.setProperty("--acc", p.accent);
    const a = p.assignment;
    const badge = !p.has_stats ? el("span", { class: "badge pending" }, ["no stats"])
      : p.style_source === "remembered" ? el("span", { class: "badge stats", title: "Restored from your last read by callsign" }, ["stats remembered"])
      : el("span", { class: "badge stats" }, ["stats read"]);
    const provisional = a && STATE.readiness && !STATE.readiness.final;
    card.appendChild(el("div", { class: "top" }, [
      el("div", { class: "role stencil" }, [a ? a.role : "AWAITING MISSION", provisional ? el("span", { class: "provtag" }, ["provisional"]) : null]),
      el("div", { class: "who", html: '<span class="cs">' + esc(p.callsign) + "</span> · " + label(p.play_style) }),
      badge, mine ? el("span", { class: "badge" }, ["you"]) : null,
      p.aar && p.aar.verdict && p.aar.verdict.medal ? el("span", { class: "badge medalbadge", title: p.aar.verdict.medal.name + " · " + p.aar.verdict.medal.id }, ["🎖 " + p.aar.verdict.medal.id]) : null,
    ]));
    if (p.style_note) card.appendChild(el("div", { class: "hint", style: "padding:2px 20px 0" }, [p.style_note]));
    // gear-first: until a diver has told us what they own, the checklist sits above
    // the loadout (open) so the build is based on gear they can actually equip
    const gearFirst = mine && !p.gear_confirmed;
    if (gearFirst) { const g = gearCard(p); if (g) card.appendChild(g); }
    if (p.stats) card.appendChild(statRead(p));
    if (a) {
      const kit = el("ul", { class: "kit" });
      const row = (sl, v, mono) => el("li", {}, [el("span", { class: "sl" }, [sl]), el("span", { class: "vv" + (mono ? " mono" : "") }, [v])]);
      kit.appendChild(row("Primary", a.primary, true));
      kit.appendChild(row("Secondary", a.secondary, true));
      kit.appendChild(row("Grenade", a.grenade, true));
      kit.appendChild(row("Armor", a.armor + " · " + a.armor_weight + ", " + a.armor_passive));
      kit.appendChild(row("Booster", a.booster));
      a.stratagems.forEach((s, i) => {
        const vv = el("span", { class: "vv mono" }, [s]); if (s === a.growth_slot) vv.appendChild(el("span", { class: "growth" }, ["GROWTH"]));
        kit.appendChild(el("li", {}, [el("span", { class: "sl" }, [i === 0 ? "Stratagems" : ""]), vv]));
      });
      card.appendChild(kit);
      if (a.thin && a.thin.length) card.appendChild(el("div", { class: "thin" }, ["Thin: " + a.thin.join(", ") + " — covered by the squad."]));
      card.appendChild(el("div", { class: "why" }, [a.rationale]));
    }
    if (p.aar) card.appendChild(aarBlock(p));
    if (mine) card.appendChild(myActions(p));
    if (mine && !gearFirst) { const g = gearCard(p); if (g) card.appendChild(g); }
    return card;
  }

  const fmt = n => (n == null ? "—" : Number(n).toLocaleString());

  function statRead(p) {
    const s = p.stats || {}, card = p.scorecard || [], conf = p.confidence || null;
    const ver = conf ? new Set(conf.verified || []) : null;
    const unc = conf ? new Set(conf.uncertain || []) : null;
    const d = el("details", { class: "statread" });
    d.appendChild(el("summary", {}, ["Career read — from your screenshots"]));
    const body = el("div", { class: "statbody" });
    const grid = () => el("div", { class: "statgrid" });

    // derived "cool stats" scorecard
    if (card.length) {
      const g = grid();
      card.forEach(row => {
        g.appendChild(el("span", { class: "sk" }, [row.label]));
        const v = el("span", { class: "sv mono" }, [row.value]); if (row.hint) v.title = row.hint;
        g.appendChild(v);
      });
      body.appendChild(el("div", { class: "statsub" }, ["The read"])); body.appendChild(g);
    }

    // raw values, with a double-read confidence mark per field
    const rg = grid();
    const mark = field => {
      if (unc && unc.has(field)) return el("span", { class: "cmark warn", title: "the two reads disagreed — check this one" }, [" ⚠"]);
      if (ver && ver.has(field)) return el("span", { class: "cmark ok", title: "confirmed by the double read" }, [" ✓"]);
      return null;
    };
    const raw = (label, field, v) => {
      if (v == null || v === "") return;
      rg.appendChild(el("span", { class: "sk" }, [label]));
      rg.appendChild(el("span", { class: "sv mono" }, [v, mark(field)]));
    };
    raw("Enemy kills", "enemy_kills", fmt(s.enemy_kills));
    raw("Deaths", "deaths", fmt(s.deaths));
    raw("Shots hit / fired", "shots_hit", fmt(s.shots_hit) + " / " + fmt(s.shots_fired));
    raw("Missions won / played", "missions_won", fmt(s.missions_won) + " / " + fmt(s.missions_played));
    raw("Extractions", "extractions", fmt(s.extractions));
    raw("Samples", "samples", fmt(s.samples));
    raw("Total stratagems", "total_stratagems", fmt(s.total_stratagems));
    raw("Friendly kills", "friendly_kills", fmt(s.friendly_kills));
    if (rg.children.length) {
      body.appendChild(el("div", { class: "statsub" }, ["Raw — verify against your screen"])); body.appendChild(rg);
      if (unc && unc.size) body.appendChild(el("div", { class: "hint" }, ["⚠ the two reads disagreed on this number — double-check it."]));
    }
    d.appendChild(body);
    return d;
  }

  function verdictBlock(v) {
    if (!v) return null;
    if (v.passed === true && v.medal) {
      return el("div", { class: "medal" }, [
        el("div", { class: "medal-icon", "aria-hidden": "true" }, ["🎖"]),
        el("div", {}, [
          el("div", { class: "medal-name" }, [v.medal.name]),
          el("div", { class: "medal-id mono" }, ["Medal ID " + v.medal.id]),
          el("div", { class: "medal-why" }, ["Oath kept — " + v.name + ": " + v.reason]),
        ]),
      ]);
    }
    if (v.passed === false) return el("div", { class: "oathbroken" }, [el("b", {}, ["OATH BROKEN — " + v.name]), el("div", {}, [v.reason])]);
    return el("div", { class: "oathunv" }, ["Oath unverified — " + v.reason]);
  }

  function aarBlock(p) {
    const box = el("div", { class: "aar" }, [el("div", { class: "h" }, ["After-action"])]);
    const vb = verdictBlock(p.aar.verdict); if (vb) box.appendChild(vb);
    const r = p.aar.result || {};
    const chips = [["Kills", r.kills], ["Accuracy", r.accuracy_pct != null ? r.accuracy_pct + "%" : null],
      ["Deaths", r.deaths], ["Accidentals", r.accidentals], ["Reinforces", r.times_reinforcing],
      ["Samples", r.samples_extracted]].filter(x => x[1] != null);
    if (chips.length) {
      const g = el("div", { class: "statgrid" });
      chips.forEach(([k, v]) => { g.appendChild(el("span", { class: "sk" }, [k])); g.appendChild(el("span", { class: "sv mono" }, [String(v)])); });
      box.appendChild(el("div", { class: "statsub" }, ["Scoreboard — as read"]));
      box.appendChild(g);
    }
    box.appendChild(el("div", { class: "aartext" }, [p.aar.text]));
    return box;
  }

  function myActions(p) {
    const box = el("div", { class: "actions" });
    // One status line shared by the re-read and result uploads (both are model
    // calls that take a few seconds); given full width so it sits below the row.
    const actstatus = el("div", { class: "upstatus", style: "width:100%" });
    const restat = el("label", { class: "btn filebtn" }, ["Re-read stats", el("input", { type: "file", accept: "image/*", multiple: "" })]);
    const result = el("label", { class: "btn filebtn" }, ["Submit result", el("input", { type: "file", accept: "image/*" })]);
    const uploads = [restat, result];  // both are model calls — lock both while either runs
    restat.querySelector("input").onchange = async ev => {
      const list = Array.from(ev.target.files || []); if (!list.length || busy) return;
      busy = true; lockControls(uploads, true);
      const stop = workTicker(actstatus, READ_LINES);
      try {
        const fd = new FormData(); list.forEach(f => fd.append("images", f));
        const r = await api("/api/lobby/" + LID + "/player/" + p.id + "/career", { method: "POST", headers: { "x-token": store.me(LID).token }, body: fd });
        stop();
        if (r.ok === false) { setStatus(actstatus, "warn", "Couldn't read that one — try a clearer or less-cropped shot."); }
        else { STATE = await api("/api/lobby/" + LID); renderLive(); toast("Read as " + label(r.play_style)); }
      } catch (e) { stop(); setStatus(actstatus, "err", "Upload failed: " + e.message + " — try again."); }
      finally { stop(); lockControls(uploads, false); busy = false; }
    };
    const styleSel = el("select", { style: "width:auto;padding:6px 8px;font-size:12.5px" }, META.archetypes.map(k => el("option", { value: k }, [label(k)])));
    styleSel.value = p.play_style;
    styleSel.onchange = async () => { busy = true; try { await jpost("/api/lobby/" + LID + "/player/" + p.id + "/style", { play_style: styleSel.value }, store.me(LID).token); STATE = await api("/api/lobby/" + LID); renderLive(); } catch (e) { toast(e.message); } finally { busy = false; } };
    result.querySelector("input").onchange = async ev => {
      const f = ev.target.files[0]; if (!f || busy) return;
      busy = true; lockControls(uploads, true);
      const stop = workTicker(actstatus, REVIEW_LINES);
      try {
        const rr = await fpost("/api/lobby/" + LID + "/player/" + p.id + "/result", f, store.me(LID).token, "image");
        stop(); STATE = await api("/api/lobby/" + LID); renderLive();
        const v = rr.verdict;
        toast(v && v.passed === true && v.medal ? "🎖 Medal earned — " + v.medal.name : v && v.passed === false ? "Oath broken. WARMIND has notes." : "After-action ready");
      }
      catch (e) { stop(); setStatus(actstatus, "err", "Review failed: " + e.message + " — try again."); }
      finally { stop(); lockControls(uploads, false); busy = false; }
    };
    box.appendChild(restat); box.appendChild(styleSel);
    if (p.assignment) box.appendChild(result);
    box.appendChild(actstatus);
    return box;
  }

  function squadBlocks() {
    const d = STATE.directive, wrap = el("section", { class: "stack" });
    if (d.doctrine) {
      const ol = el("ol", { class: "doctrine" }); d.doctrine.orders.forEach(o => ol.appendChild(el("li", {}, [o])));
      wrap.appendChild(el("section", { class: "card doctrinecard" }, [el("div", { class: "section-title" }, [d.doctrine.title]), ol]));
    }
    if (d.swaps && d.swaps.length) {
      const sw = el("div", { class: "swaps" });
      d.swaps.forEach(s => sw.appendChild(el("div", { class: "swaprow" }, [
        el("div", { class: "swapmove", html: esc(s.callsign) + ": <b>" + esc(s.from_role) + "</b> → <b>" + esc(s.to_role) + "</b>" }),
        el("div", { class: "swapwhy" }, [s.why]),
      ])));
      const card = el("section", { class: "card" }, [
        el("div", { class: "section-title" }, ["Mission coverage — suggested swaps"]),
        el("div", { class: "hint", style: "margin-bottom:8px" }, ["Everyone's on the role that fits them. For this mission, these optional swaps close the gaps — the squad decides."]),
        sw,
      ]);
      wrap.appendChild(card);
    }
    const mtx = el("div", { class: "matrix" });
    [["at", "heavy armour"], ["st", "structures"], ["ch", "chaff"], ["bc", "break contact"]].forEach(([ax, lbl]) => {
      mtx.appendChild(el("div", { class: "ax" }, [lbl]));
      const h = (d.matrix[ax] || []); mtx.appendChild(el("div", { class: h.length ? "" : "none" }, [h.length ? h.join(", ") : "NOBODY — add coverage"]));
    });
    wrap.appendChild(el("section", { class: "card" }, [el("div", { class: "section-title" }, ["Capability matrix"]), mtx]));
    if (d.loop && d.loop.length) {
      const loop = el("div", { class: "loop" }); const order = d.loop.map(x => x[0]);
      order.forEach(r => { loop.appendChild(el("span", {}, [r])); loop.appendChild(el("span", { class: "arw" }, ["→"])); });
      loop.appendChild(el("span", {}, [order[0]]));
      wrap.appendChild(el("section", { class: "card" }, [el("div", { class: "section-title" }, ["Interlock loop"]), loop]));
    }
    if (d.cadence && d.cadence.length) {
      const cad = el("div", { class: "cadence" });
      d.cadence.forEach(([b, r]) => { cad.appendChild(el("div", { class: "b" }, [b])); cad.appendChild(el("div", {}, [r])); });
      const c = el("section", { class: "card" }, [el("div", { class: "section-title" }, ["Cadence"]), cad]);
      if (d.reactive) c.appendChild(el("div", { class: "hint" }, ["Reactive calls: " + d.reactive + " only. Everyone else pre-plans."]));
      wrap.appendChild(c);
    }
    const notes = el("ul", { class: "notes" }); (d.notes || []).forEach(n => notes.appendChild(el("li", {}, [n])));
    wrap.appendChild(el("section", { class: "card" }, [el("div", { class: "section-title" }, ["Field notes"]), notes]));
    return wrap;
  }

  // ---------- warbond ownership checklist ----------
  let gearOpen = {};  // pid -> details open state, kept across poll re-renders
  function gearCard(p) {
    const wbs = META.warbonds || [];
    if (!wbs.length) return null;
    const allNames = []; wbs.forEach(w => w.items.forEach(i => allNames.push(i.name)));
    // p.owned null/undefined means "owns everything"; seed the local set accordingly
    const owned = new Set(p.owned == null ? allNames : p.owned);

    const unset = !p.gear_confirmed;
    const wrap = el("details", { class: "gearcard" + (unset ? " unset" : "") });
    wrap.open = gearOpen[p.id] !== undefined ? gearOpen[p.id] : unset;
    wrap.ontoggle = () => { gearOpen[p.id] = wrap.open; };
    wrap.appendChild(el("summary", {}, [unset ? "Step 1 — set your gear (warbonds you own)" : "My gear — warbonds I own"]));
    const body = el("div", { class: "gearbody" });
    body.appendChild(el("div", { class: "hint", style: "margin-bottom:10px" }, ["Tell WARMIND which warbonds you own and it only builds loadouts you can actually equip. Requisition stratagems are always available; warbond stratagems (like the AMW-20 Apex) are listed under their warbond."]));
    wrap.appendChild(body);

    async function save() {
      if (busy) return; busy = true;
      try {
        const payload = owned.size >= allNames.length ? { owned: null } : { owned: [...owned] };
        await jpost("/api/lobby/" + LID + "/player/" + p.id + "/owned", payload, store.me(LID).token);
        STATE = await api("/api/lobby/" + LID); renderLive(); toast("Gear updated");
      } catch (e) { toast(e.message); } finally { busy = false; }
    }

    wbs.forEach(w => {
      const names = w.items.map(i => i.name);
      const have = names.filter(n => owned.has(n)).length;
      const state = have === names.length ? "all" : have === 0 ? "none" : "some";
      const seg = el("div", { class: "seg" });
      const btns = {};
      ["all", "some", "none"].forEach(v => {
        const b = el("button", { class: "segbtn" + (state === v ? " on" : "") }, [{ all: "Have all", some: "Some", none: "None" }[v]]);
        btns[v] = b; seg.appendChild(b);
      });
      const items = el("div", { class: "gearitems" }); items.style.display = state === "some" ? "grid" : "none";
      w.items.forEach(i => {
        const cb = el("input", { type: "checkbox" }); if (owned.has(i.name)) cb.setAttribute("checked", "");
        cb.onchange = () => { cb.checked ? owned.add(i.name) : owned.delete(i.name); save(); };
        items.appendChild(el("label", { class: "gearitem" }, [cb, el("span", {}, [i.name]), el("span", { class: "gslot" }, [i.slot])]));
      });
      const setSeg = v => { ["all", "some", "none"].forEach(k => btns[k].classList.toggle("on", k === v)); items.style.display = v === "some" ? "grid" : "none"; };
      btns.all.onclick = () => { names.forEach(n => owned.add(n)); setSeg("all"); save(); };
      btns.none.onclick = () => { names.forEach(n => owned.delete(n)); setSeg("none"); save(); };
      btns.some.onclick = () => setSeg("some");
      body.appendChild(el("div", { class: "gearrow" }, [
        el("div", { class: "gearhead" }, [el("span", { class: "wbname" }, [w.name]), seg]), items,
      ]));
    });
    // one-tap confirm for divers who own it all (or as-shown)
    const confirm = el("button", { class: "btn primary" }, [unset ? "Confirm — this is my gear" : "I own everything"]);
    confirm.onclick = () => { if (!unset) allNames.forEach(n => owned.add(n)); delete gearOpen[p.id]; save(); };
    body.appendChild(el("div", { style: "margin-top:12px" }, [confirm]));
    return wrap;
  }

  function esc(s) { return (s || "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
})();
