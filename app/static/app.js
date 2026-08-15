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
    const r = await fetch(path, opts);
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
    const name = el("input", { type: "text", placeholder: "Squad name (e.g. Fist of Family Values)", "aria-label": "Squad name" });
    const create = el("button", { class: "btn primary wide" }, ["Create lobby"]);
    create.onclick = async () => {
      create.disabled = true;
      try {
        const fd = new FormData(); fd.append("name", name.value || "Squad");
        const r = await api("/api/lobby", { method: "POST", body: fd });
        store.setCreator(r.lobby_id, r.creator_token);
        location.search = "?l=" + r.lobby_id;
      } catch (e) { toast(e.message); create.disabled = false; }
    };
    app.appendChild(el("section", { class: "card center" }, [
      el("div", { class: "big stencil", style: "margin-bottom:6px" }, ["Brief a squad"]),
      el("div", { class: "muted", style: "margin-bottom:16px" }, ["Make a lobby, share the link. Friends upload a career screenshot and get a loadout with a reason."]),
      el("div", { class: "field", style: "max-width:420px;margin:0 auto" }, [name]),
      el("div", { style: "max-width:420px;margin:12px auto 0" }, [create]),
    ]));
    if (META.vision && META.vision.mock)
      app.appendChild(el("div", { class: "mockbanner" }, ["Vision is in mock mode — set ANTHROPIC_API_KEY to read real screenshots. Screenshot uploads will return sample data until then."]));
  }

  // ---------- polling ----------
  function startPolling() { tick(); pollT = setInterval(tick, 3500); }
  async function tick() {
    if (busy) return;
    try { STATE = await api("/api/lobby/" + LID); render(); }
    catch (e) { if (String(e.message).match(/not found/i)) { clearInterval(pollT); app.innerHTML = ""; app.appendChild(el("div", { class: "card center" }, ["Lobby not found. It may have expired.", el("div", { style: "margin-top:12px" }, [el("a", { href: "/", class: "btn" }, ["Start a new one"])])])); } }
  }

  // ---------- render lobby ----------
  function render() {
    const scrollY = window.scrollY;
    app.innerHTML = "";
    const isCreator = !!store.creator(LID);
    const me = store.me(LID);
    const joined = me && STATE.players.some(p => p.id === me.id);

    app.appendChild(shareCard(isCreator));
    if (isCreator) app.appendChild(missionCard());
    if (!joined) app.appendChild(joinCard());
    app.appendChild(rosterSection(me));
    if (STATE.directive) app.appendChild(squadBlocks());
    if (META.vision && META.vision.mock)
      app.appendChild(el("div", { class: "mockbanner" }, ["Vision in mock mode — screenshot reads return sample data until ANTHROPIC_API_KEY is set on the server."]));
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
    const m = STATE.mission || { mode: "challenge", faction: "automatons", difficulty: 7, mission_id: "", operation_modifiers: [], planet_hazards: [], tactical_objectives: [], is_city_map: false };
    const draft = JSON.parse(JSON.stringify(m));
    const wrap = el("section", { class: "card" }, [el("div", { class: "section-title" }, ["Mission"])]);

    const modes = el("div", { class: "modes" });
    [["fun", "Fun", "new tools"], ["challenge", "Challenge", "out of comfort"], ["improvement", "Improve", "one stretch"]].forEach(([k, lbl, sub]) => {
      const b = el("button", { "aria-pressed": draft.mode === k ? "true" : "false" }, [el("span", { class: "k stencil" }, [lbl]), el("span", { class: "sub" }, [sub])]);
      b.onclick = () => { draft.mode = k; modes.querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", "false")); b.setAttribute("aria-pressed", "true"); };
      modes.appendChild(b);
    });
    wrap.appendChild(modes);

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
      try { STATE = await jpost("/api/lobby/" + LID + "/mission", { mission: draft }, store.creator(LID)); render(); toast("Mission set — loadouts rebuilt"); }
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
      } catch (e) { toast(e.message); } finally { busy = false; render(); }
    };
    wrap.appendChild(el("div", { style: "display:flex;gap:8px;flex-wrap:wrap;margin-top:12px" }, [save, prefill]));
    wrap.appendChild(el("div", { class: "hint" }, ["Optional: upload a mission-select screenshot to prefill faction & difficulty, then confirm."]));
    return wrap;
  }

  // ---------- join ----------
  function joinCard() {
    const wrap = el("section", { class: "card" }, [el("div", { class: "section-title" }, ["Join this drop"])]);
    const name = el("input", { type: "text", placeholder: "Your callsign (optional if it's in your screenshot)" });
    const upload = el("label", { class: "btn primary filebtn" }, ["Upload career stats", el("input", { type: "file", accept: "image/*" })]);
    upload.querySelector("input").onchange = ev => doJoin(name.value, ev.target.files[0]);
    const skip = el("button", { class: "btn" }, ["Join without stats"]);
    skip.onclick = () => doJoin(name.value, null);
    wrap.appendChild(el("div", { class: "field" }, [name]));
    wrap.appendChild(el("div", { style: "display:flex;gap:8px;flex-wrap:wrap;margin-top:10px" }, [upload, skip]));
    wrap.appendChild(el("div", { class: "hint" }, ["Open your in-game Career screen and screenshot it. WARMIND reads it to learn how you play — you can override the read anytime."]));
    return wrap;
  }
  async function doJoin(callsign, file) {
    busy = true;
    try {
      const fd = new FormData(); fd.append("callsign", callsign || ""); if (file) fd.append("image", file);
      const r = await api("/api/lobby/" + LID + "/join", { method: "POST", body: fd });
      store.setMe(LID, { id: r.player_id, token: r.player_token });
      STATE = await api("/api/lobby/" + LID); render();
      toast(file ? "Read as " + label(r.play_style) : "Joined — pick your style");
    } catch (e) { toast(e.message); } finally { busy = false; }
  }

  // ---------- roster ----------
  function label(k) { return ({ siege_anchor: "Siege Anchor", danger_close: "Danger Close", fire_for_effect: "Fire for Effect", forward_eye: "Forward Eye", by_the_book: "By the Book" })[k] || k; }

  function rosterSection(me) {
    const wrap = el("section", { class: "stack" });
    if (STATE.directive) {
      const d = STATE.directive, top = d.pressure.top || [];
      const read = el("div", { class: "read" });
      top.forEach(([k, v]) => read.appendChild(el("span", { class: "k" + (v < 0 ? " neg" : ""), html: k.replace(/_/g, " ") + " <b>" + (v >= 0 ? "+" : "") + v.toFixed(2) + "</b>" })));
      const rc = el("section", { class: "card" }, [el("div", { class: "section-title" }, ["The read"]), read]);
      if (d.pressure.driver) rc.appendChild(el("div", { class: "constraint", html: "The constraint that decides it: <b>" + d.pressure.driver + "</b>." }));
      wrap.appendChild(rc);
    } else {
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
    const badge = p.has_stats ? el("span", { class: "badge stats" }, ["stats read"]) : el("span", { class: "badge pending" }, ["no stats"]);
    card.appendChild(el("div", { class: "top" }, [
      el("div", { class: "role stencil" }, [a ? a.role : "AWAITING MISSION"]),
      el("div", { class: "who", html: '<span class="cs">' + esc(p.callsign) + "</span> · " + label(p.play_style) }),
      badge, mine ? el("span", { class: "badge" }, ["you"]) : null,
    ]));
    if (p.style_note) card.appendChild(el("div", { class: "hint", style: "padding:0 14px" }, [p.style_note]));
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
    if (p.aar) card.appendChild(el("div", { class: "aar" }, [el("div", { class: "h" }, ["After-action"]), p.aar.text]));
    if (mine) card.appendChild(myActions(p));
    return card;
  }

  function myActions(p) {
    const box = el("div", { class: "actions" });
    const restat = el("label", { class: "btn filebtn" }, ["Re-read stats", el("input", { type: "file", accept: "image/*" })]);
    restat.querySelector("input").onchange = async ev => {
      const f = ev.target.files[0]; if (!f) return; busy = true; toast("Reading…");
      try { const r = await fpost("/api/lobby/" + LID + "/player/" + p.id + "/career", f, store.me(LID).token, "image"); STATE = await api("/api/lobby/" + LID); render(); toast("Read as " + label(r.play_style)); }
      catch (e) { toast(e.message); } finally { busy = false; }
    };
    const styleSel = el("select", { style: "width:auto;padding:6px 8px;font-size:12.5px" }, META.archetypes.map(k => el("option", { value: k }, [label(k)])));
    styleSel.value = p.play_style;
    styleSel.onchange = async () => { busy = true; try { await jpost("/api/lobby/" + LID + "/player/" + p.id + "/style", { play_style: styleSel.value }, store.me(LID).token); STATE = await api("/api/lobby/" + LID); render(); } catch (e) { toast(e.message); } finally { busy = false; } };
    const result = el("label", { class: "btn filebtn" }, ["Submit result", el("input", { type: "file", accept: "image/*" })]);
    result.querySelector("input").onchange = async ev => {
      const f = ev.target.files[0]; if (!f) return; busy = true; toast("Reviewing drop…");
      try { await fpost("/api/lobby/" + LID + "/player/" + p.id + "/result", f, store.me(LID).token, "image"); STATE = await api("/api/lobby/" + LID); render(); toast("After-action ready"); }
      catch (e) { toast(e.message); } finally { busy = false; }
    };
    box.appendChild(restat); box.appendChild(styleSel);
    if (p.assignment) box.appendChild(result);
    return box;
  }

  function squadBlocks() {
    const d = STATE.directive, wrap = el("section", { class: "stack" });
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

  function esc(s) { return (s || "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
})();
