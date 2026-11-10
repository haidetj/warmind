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
  // ======================================================================= icons
  // One line-icon set in the app's own style replaces every emoji / pictograph in the UI:
  // a pass over the DOM swaps each mapped character in text for its SVG (currentColor), as
  // things render. Dropdown options and titles can't hold SVG, so there the character is dropped.
  const ICON_SVG = {
    medal: '<path d="M7 2l4 7M17 2l-4 7"/><circle cx="12" cy="15" r="5.5"/><path d="M12 12.5l.9 1.8 2 .3-1.4 1.4.3 2-1.8-1-1.8 1 .3-2-1.4-1.4 2-.3z"/>',
    locker: '<rect x="5" y="3" width="14" height="18" rx="1"/><path d="M12 3v18M9.5 11v2M14.5 11v2M5 7h14"/>',
    star: '<path d="M12 3l2.6 6.1 6.4.5-4.9 4.2 1.5 6.4L12 16.8l-5.6 3.4 1.5-6.4L3 9.6l6.4-.5z"/>',
    roster: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1.2"/><circle cx="4.5" cy="12" r="1.2"/><circle cx="4.5" cy="18" r="1.2"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    pin: '<path d="M12 21v-6M8 3h8l-1 6 3 3.5H6L9 9z"/>',
    anchor: '<circle cx="12" cy="5" r="2"/><path d="M12 7v14M5 13a7 7 0 0 0 14 0M8.5 10.5h7M3.5 13.5H6M18 13.5h2.5"/>',
    home: '<path d="M4 11l8-7 8 7v9h-5v-6H9v6H4z"/>',
    swap: '<path d="M4 8h15l-3.5-3.5M20 16H5l3.5 3.5"/>',
    diamond: '<path d="M12 3l9 9-9 9-9-9z"/>',
    play: '<path d="M7 4.5l12 7.5-12 7.5z"/>',
    edit: '<path d="M4 20h4L19.5 8.5l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
    refresh: '<path d="M20 12a8 8 0 1 1-2.35-5.65"/><path d="M20 4v4.5h-4.5"/>',
    go: '<path d="M4 12h15M13 6l6 6-6 6"/>',
    grid: '<rect x="4" y="4" width="7" height="7"/><rect x="13" y="4" width="7" height="7"/><rect x="4" y="13" width="7" height="7"/><rect x="13" y="13" width="7" height="7"/>',
    planet: '<circle cx="12" cy="12" r="5.5"/><ellipse cx="12" cy="12" rx="10.5" ry="3.2" transform="rotate(-20 12 12)"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
    cross: '<path d="M6 6l12 12M18 6L6 18"/>',
    external: '<path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6"/>',
    flag: '<path d="M5 21V3.5M5 4h12.5l-2.5 4.5 2.5 4.5H5"/>',
    hex: '<path d="M12 2.5l8.2 4.75v9.5L12 21.5l-8.2-4.75v-9.5z"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4.2 4-6.2 8-6.2s7 2 8 6.2"/>',
    book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5z"/><path d="M8 7.5h8M8 11h6"/>',
    marker: '<path d="M12 21.5s-7-6.3-7-11.5a7 7 0 0 1 14 0c0 5.2-7 11.5-7 11.5z"/><circle cx="12" cy="10" r="2.5"/>',
    up: '<path d="M6 16l6-8 6 8z" class="f"/>',
    down: '<path d="M6 8l6 8 6-8z" class="f"/>',
    alert: '<path d="M12 3.5l9.5 17h-19z"/><path d="M12 10v5M12 17.6v.1"/>',
    shield: '<path d="M12 3l8 3v6c0 5-3.5 8.2-8 9.5C7.5 20.2 4 17 4 12V6z"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    gauge: '<path d="M3.5 18a8.5 8.5 0 1 1 17 0"/><path d="M12 18l4.5-6.5M7 18h.1M17 18h.1"/>',
    copy: '<rect x="8.5" y="8.5" width="12" height="12"/><path d="M15.5 8.5V3.5h-12v12h5"/>',
    skull: '<path d="M5 11a7 7 0 1 1 14 0v4h-2.5v4h-9v-4H5z"/><circle cx="9.2" cy="11.2" r="1.5"/><circle cx="14.8" cy="11.2" r="1.5"/><path d="M11 19v-2.5M13 19v-2.5"/>',
    satellite: '<path d="M10 10l4 4"/><path d="M4.5 9.5l3-3 4 4-3 3zM12.5 17.5l3-3 4 4-3 3z"/><path d="M15 4.5a4.5 4.5 0 0 1 4.5 4.5M15 1.5a7.5 7.5 0 0 1 7.5 7.5"/>',
    burst: '<path d="M12 2v5M12 17v5M2 12h5M17 12h5M5 5l3.5 3.5M15.5 15.5L19 19M19 5l-3.5 3.5M8.5 15.5L5 19"/>',
    waves: '<path d="M3 8.5c3-3 6 3 9 0s6 3 9 0M3 15.5c3-3 6 3 9 0s6 3 9 0"/>',
    mind: '<path d="M12 2.5l9.5 9.5-9.5 9.5L2.5 12z"/><circle cx="12" cy="12" r="2.8"/>',
    ring: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/>',
    crosshair: '<circle cx="12" cy="12" r="7"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.6v.1"/>',
    swords: '<path d="M4 3l11 11M20 3L9 14M3.5 15.5l5 5M20.5 15.5l-5 5M6 18l2.5-2.5M18 18l-2.5-2.5"/>',
    lock: '<rect x="5" y="11" width="14" height="10"/><path d="M8 11V7.5a4 4 0 0 1 8 0V11"/>',
    share: '<path d="M12 15V3.5M7 8l5-5 5 5M5 14v7h14v-7"/>',
    tri: '<path d="M9 6l6 6-6 6"/>',
    search: '<circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5.5 5.5"/>',
    bolt: '<path d="M13 2L5 13h6l-1 9 8-11h-6z"/>',
  };
  const ICON_CHARS = { "🎖": "medal", "🗄": "locker", "★": "star", "☰": "roster", "＋": "plus", "📌": "pin", "⚓": "anchor", "⌂": "home",
    "⇄": "swap", "◇": "diamond", "▶": "play", "✎": "edit", "⟳": "refresh", "↺": "refresh", "➤": "go", "▦": "grid", "✦": "planet",
    "✓": "check", "✗": "cross", "✕": "close", "↗": "external", "⚑": "flag", "⬡": "hex", "◉": "user", "▤": "book", "📍": "marker",
    "▲": "up", "▼": "down", "⚠": "alert", "⛨": "shield", "🔗": "link", "⛽": "gauge", "⧉": "copy", "☠": "skull", "🛰": "satellite",
    "✹": "burst", "≋": "waves", "◈": "mind", "◆": "diamond", "◎": "ring", "⌖": "crosshair", "ⓘ": "info", "⚔": "swords", "🔒": "lock",
    "⇪": "share", "▸": "tri", "⚲": "search", "🏴": "flag" };
  ICON_SVG.close = ICON_SVG.cross;
  const ICON_RE = new RegExp("(" + Object.keys(ICON_CHARS).map(c => c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")️?", "u");
  const ICON_RE_G = new RegExp(ICON_RE.source, "gu");
  const STRIP_RE = new RegExp("(" + Object.keys(ICON_CHARS).join("|") + "|‍|️)\\s?", "gu");
  function ico(name) {
    const sp = document.createElement("span"); sp.className = "ico ico-" + name; sp.setAttribute("aria-hidden", "true");
    sp.innerHTML = '<svg viewBox="0 0 24 24" focusable="false">' + (ICON_SVG[name] || ICON_SVG.diamond) + "</svg>";
    return sp;
  }
  function iconize(root) {
    if (!root) return;
    if (root.nodeType === 3) { swapText(root); return; }
    if (root.nodeType !== 1) return;
    const tag = root.tagName;
    if (tag === "OPTION" || tag === "TITLE" || tag === "OPTGROUP") { if (ICON_RE.test(root.textContent)) root.textContent = root.textContent.replace(STRIP_RE, ""); if (tag !== "OPTGROUP") return; }
    if (tag === "SCRIPT" || tag === "STYLE" || tag === "TEXTAREA" || tag === "svg" || tag === "SVG" || root.closest && root.closest("svg")) return;
    for (const a of ["aria-label", "title", "placeholder"]) { const v = root.getAttribute && root.getAttribute(a); if (v && ICON_RE.test(v)) root.setAttribute(a, v.replace(STRIP_RE, "")); }
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: n => ICON_RE.test(n.nodeValue) ? 1 : 3 });
    const hits = []; let n; while ((n = w.nextNode())) hits.push(n);
    hits.forEach(swapText);
    root.querySelectorAll && root.querySelectorAll("option, optgroup, [title], [aria-label]").forEach(x => {
      if ((x.tagName === "OPTION") && ICON_RE.test(x.textContent)) x.textContent = x.textContent.replace(STRIP_RE, "");
      for (const a of ["aria-label", "title", "label"]) { const v = x.getAttribute(a); if (v && ICON_RE.test(v)) x.setAttribute(a, v.replace(STRIP_RE, "")); }
    });
  }
  function swapText(t) {
    const p = t.parentNode; if (!p || !ICON_RE.test(t.nodeValue)) return;
    const ptag = p.nodeName;
    if (ptag === "OPTION" || ptag === "TITLE" || ptag === "TEXTAREA" || ptag === "SCRIPT" || ptag === "STYLE" || (p.closest && p.closest("svg"))) {
      if (ptag === "OPTION" || ptag === "TITLE") t.nodeValue = t.nodeValue.replace(STRIP_RE, ""); return;
    }
    const frag = document.createDocumentFragment(); let last = 0; const v = t.nodeValue;
    v.replace(ICON_RE_G, (m, ch, off) => { if (off > last) frag.appendChild(document.createTextNode(v.slice(last, off))); frag.appendChild(ico(ICON_CHARS[ch])); last = off + m.length; return m; });
    if (last < v.length) frag.appendChild(document.createTextNode(v.slice(last)));
    p.replaceChild(frag, t);
  }
  new MutationObserver(ms => ms.forEach(m => {
    if (m.type === "characterData") swapText(m.target);
    else m.addedNodes.forEach(iconize);
  })).observe(document.documentElement, { subtree: true, childList: true, characterData: true });
  document.addEventListener("DOMContentLoaded", () => iconize(document.body));
  if (document.body) iconize(document.body);

  const app = $("#app");
  const LID = new URLSearchParams(location.search).get("l");
  const LOCKER_PAGE = !LID && new URLSearchParams(location.search).has("locker");
  const ROSTER_PAGE = !LID && !LOCKER_PAGE && new URLSearchParams(location.search).has("roster");
  const ROOM_ID = !LID && !LOCKER_PAGE && !ROSTER_PAGE ? new URLSearchParams(location.search).get("room") : null;
  const COSTS_PAGE = !LID && new URLSearchParams(location.search).has("costs");
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
      if (LOCKER_PAGE) renderLocker(); else if (ROSTER_PAGE) renderRoster(); else if (ROOM_ID) renderRoom(); else if (COSTS_PAGE) renderCosts(); else if (!LID) renderHome(); else if (STATE) { lastSig = ""; render(); }
    };
  }

  // ======================================================================= storage
  const store = {
    creator: lid => { try { return localStorage.getItem("wm_creator_" + lid); } catch (e) { return null; } },
    setCreator: (lid, tk) => { try { localStorage.setItem("wm_creator_" + lid, tk); } catch (e) {} },
    me: lid => { try { return JSON.parse(localStorage.getItem("wm_me_" + lid)); } catch (e) { return null; } },
    setMe: (lid, o) => { try { localStorage.setItem("wm_me_" + lid, JSON.stringify(o)); } catch (e) {} },
    locker: () => { try { const v = JSON.parse(localStorage.getItem("wm_locker")); return v && v.id && v.key ? v : null; } catch (e) { return null; } },
    setLocker: o => { try { localStorage.setItem("wm_locker", JSON.stringify(o)); } catch (e) {} },
    rooms: () => { try { return JSON.parse(localStorage.getItem("wm_rooms")) || []; } catch (e) { return []; } },
    addRoom: id => { try { const r = store.rooms().filter(x => x !== id); r.unshift(id); localStorage.setItem("wm_rooms", JSON.stringify(r.slice(0, 30))); } catch (e) {} },
    lastRoom: () => { try { return localStorage.getItem("wm_lastroom") || ""; } catch (e) { return ""; } },
    setLastRoom: id => { try { localStorage.setItem("wm_lastroom", id || ""); } catch (e) {} },
    roomFounder: id => { try { return localStorage.getItem("wm_roomc_" + id); } catch (e) { return null; } },
  };
  // war-room calls say who's asking (the locker's callsign goes in the log), when the device has a locker
  const rhead = () => { const L = store.locker(); return L ? { "x-locker-id": L.id, "x-locker": L.key } : {}; };
  const rpost = (path, body, token) => api(path, { method: "POST", headers: Object.assign({ "content-type": "application/json" }, rhead(), token ? { "x-token": token } : {}), body: JSON.stringify(body || {}) });
  let ROOMS = null;   // the rooms this device / profile knows, for the pickers
  async function loadRooms() {
    try { ROOMS = (await rpost("/api/rooms/summary", { ids: store.rooms() })).rooms || []; } catch (e) { ROOMS = ROOMS || []; }
    return ROOMS;
  }
  // the locker's own calls carry its key
  const lget = path => { const L = store.locker(); return api(path, { headers: { "x-locker": L ? L.key : "" } }); };
  const lpost = (path, body) => { const L = store.locker(); return api(path, { method: "POST", headers: { "content-type": "application/json", "x-locker": L ? L.key : "" }, body: JSON.stringify(body || {}) }); };
  const lfd = (path, fd) => { const L = store.locker(); return api(path, { method: "POST", headers: { "x-locker": L ? L.key : "" }, body: fd }); };
  // every diver gets a locker: link this device's (or make one, adopting the diver) — once per war table
  async function ensureLocker(pid, ptoken) {
    const L = store.locker();
    if (L) { await lpost("/api/locker/" + L.id + "/link", { player_id: pid, player_token: ptoken }); return L; }
    const r = await jpost("/api/locker", { player_id: pid, player_token: ptoken });
    const nl = { id: r.locker_id, key: r.locker_key }; store.setLocker(nl); return nl;
  }

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
  // nixie tubes: each character in its own glowing glass cell
  const nixie = str => el("span", { class: "nixie", "aria-label": String(str) }, String(str).split("").map(c => el("span", { class: "nx" + (/[0-9A-Za-z]/.test(c) ? "" : " sep"), "aria-hidden": "true" }, [c])));
  const metText = t0 => { const s = Math.max(0, Math.floor(Date.now() / 1000 - t0)), h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60;
    return (h > 99 ? Math.floor(h / 24) + "d" : String(h).padStart(2, "0")) + ":" + String(m).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0"); };
  let metTimer = null;
  // falling code behind the hero: slow, faint, stops when the hero leaves the page
  function rain(cv) {
    if (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const ctx = cv.getContext("2d"), G = "01ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄ⊕△▽◇Ж§¥".split("");
    let cols = [], w = 0, h = 0, fs = 14, last = 0;
    const size = () => { w = cv.width = cv.offsetWidth; h = cv.height = cv.offsetHeight; cols = Array.from({ length: Math.ceil(w / fs) }, () => Math.random() * -h / fs); };
    size();
    const step = ts => {
      if (!cv.isConnected) return;
      if (ts - last > 80) { last = ts;
        if (cv.offsetWidth !== w) size();
        ctx.fillStyle = "rgba(4,6,4,.18)"; ctx.fillRect(0, 0, w, h);
        ctx.font = fs + "px monospace";
        cols.forEach((y, i) => { ctx.fillStyle = Math.random() < .04 ? "#e8ffef" : "#5dff95"; ctx.fillText(G[(Math.random() * G.length) | 0], i * fs, y * fs);
          cols[i] = y * fs > h && Math.random() > .975 ? 0 : y + 1; });
      }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
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
  function warPanel(full) {
    const body = el("div", { class: "stack", style: "gap:10px" }, [el("div", { class: "hint", style: "margin:0" }, [t("home.loading")])]);
    const card = panel("SYS-00", t("war.title"), { status: t("war.live"), statusKind: "ok" }, [body]);
    loadWar().then(w => {
      if (!w || (!w.orders.length && !w.planets.length)) { card.remove(); return; }
      body.innerHTML = "";
      w.orders.forEach(o => body.appendChild(moStrip(o)));
      const top = full ? w.planets : w.planets.slice(0, 8);
      if (top.length) body.appendChild(el("div", { class: "fronts" }, [el("span", { class: "label" }, [t("war.fronts")])].concat(top.map(p =>
        el("div", { class: "front f-" + p.enemy }, [
          el("div", { class: "fn" }, [(p.mo ? "★ " : "") + p.name, el("span", { class: "fs" }, [[t("faction." + p.enemy), p.defense ? t("war.defense") : null, p.biome].filter(Boolean).join(" · ")])]),
          el("div", { class: "fp" }, [t("war.divers", { n: nf(p.players) })]),
          p.progress != null ? meter(p.progress) : null,
          p.hazard_names.length ? el("div", { class: "fh" }, [p.hazard_names.join(" · ")]) : null,
          full ? (() => { const b = el("button", { class: "btn sm", type: "button" }, ["⚑ " + t("war.here")]);
            b.onclick = async () => { b.disabled = true; try { await startTable(p.name, 4, p.name); } catch (e) { toast(e.message); b.disabled = false; } }; return b; })() : null,
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
    const lk = location.hash.match(/^#locker=([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/);   // a locker opened on another device
    if (lk) { store.setLocker({ id: lk[1], key: lk[2] }); history.replaceState(null, "", location.pathname + location.search); return; }
    if (!m || !LID) return;
    store.setMe(LID, { id: m[1], token: m[2] });
    history.replaceState(null, "", location.pathname + location.search);   // don't leave the token in the address bar
  })();
  (async function boot() {
    META = await api("/api/meta");
    // you are your callsign: home, war tables and the locker need it; roster, rooms and costs are open to look at
    if (!store.locker() && !ROSTER_PAGE && !ROOM_ID && !COSTS_PAGE) return renderGate();
    if (store.locker()) await syncTables();
    if (LOCKER_PAGE) return renderLocker();
    if (ROSTER_PAGE) return renderRoster();
    if (ROOM_ID) return renderRoom();
    if (COSTS_PAGE) return renderCosts();
    if (!LID) return renderHome();
    startPolling();
    loadWar().then(w => { if (w && STATE && !busy) { lastSig = ""; tick(); } });
  })().catch(e => { app.innerHTML = ""; app.appendChild(el("div", { class: "alert red" }, [el("b", {}, ["ERR"]), t("err.start", { msg: e.message })])); });

  // ======================================================================= who you are
  // the profile's war tables (made or joined) come back to any device it signs in on
  async function syncTables() {
    const L = store.locker(); if (!L) return;
    try {
      const r = await lget("/api/locker/" + L.id + "/tables");
      (r.tables || []).forEach(x => {
        if (x.creator_token && !store.creator(x.lobby_id)) store.setCreator(x.lobby_id, x.creator_token);
        if (x.player_id && !store.me(x.lobby_id)) store.setMe(x.lobby_id, { id: x.player_id, token: x.player_token });
      });
    } catch (e) { if (/not your locker/i.test(e.message)) { try { localStorage.removeItem("wm_locker"); } catch (e2) {} } }
  }
  function signOut() {
    if (!confirm(t("prof.signout.q"))) return;
    try {
      const drop = [];
      for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (/^wm_(locker|creator_|me_|rooms|lastroom|roomc_|gear|tab_|last_lobby)/.test(k)) drop.push(k); }
      drop.forEach(k => localStorage.removeItem(k));
    } catch (e) {}
    location.href = "/";
  }
  async function renderGate() {
    app.innerHTML = ""; app.className = "stack";
    const cs = el("input", { type: "text", id: "gate-cs", maxlength: "24", autocomplete: "username", placeholder: t("lk.callsign.ph"), autocapitalize: "off", spellcheck: "false" });
    const pin = el("input", { type: "password", id: "gate-pin", maxlength: "8", inputmode: "numeric", autocomplete: "current-password", placeholder: "••••", pattern: "[0-9]*" });
    const go = el("button", { class: "btn primary wide", type: "button" }, ["➤ " + t("gate.go")]);
    const status = el("div", { class: "upstatus", role: "status", "aria-live": "polite" });
    const extra = el("div", { class: "stack", style: "gap:8px" });
    const done = (r, created) => {
      store.setLocker({ id: r.locker_id, key: r.locker_key });
      try { if (created) sessionStorage.setItem("wm_chat_new", r.callsign || cs.value.trim()); } catch (e) {}
      toast(created ? t("prof.done", { name: r.callsign || cs.value.trim() }) : t("gate.welcome", { name: r.callsign }));
      setTimeout(() => location.reload(), 600);
    };
    go.onclick = async () => {
      const v = cs.value.trim(), p = pin.value.trim();
      extra.innerHTML = "";
      if (!v) { cs.focus(); toast(t("prof.need")); return; }
      if (!/^[0-9]{4,8}$/.test(p)) { pin.focus(); toast(t("gate.pin.need")); return; }
      go.disabled = true; setStatus(status, "working", t("gate.checking"));
      try {
        const r = await jpost("/api/signin", { callsign: v, pin: p });
        if (r.new) {   // nobody has this callsign: it becomes yours, unless it looks like a typo of one that exists
          const create = async () => { setStatus(status, "working", t("gate.creating"));
            try { const c = await jpost("/api/locker", { callsign: v, pin: p }); done(Object.assign({ callsign: v }, c), true); }
            catch (e) { setStatus(status, "err", e.message); go.disabled = false; } };
          if ((r.similar || []).length) {
            status.style.display = "none";
            const row = el("div", { class: "btnrow", style: "margin:0" }, r.similar.map(n => { const b = el("button", { class: "btn sm primary", type: "button" }, [n]);
              b.onclick = () => { cs.value = n; extra.innerHTML = ""; go.click(); }; return b; }));
            const mine = el("button", { class: "btn sm", type: "button" }, ["＋ " + t("gate.create", { name: v })]); mine.onclick = () => { extra.innerHTML = ""; create(); };
            row.appendChild(mine);
            extra.append(el("div", { class: "hint", style: "margin:0" }, [t("gate.didyou")]), row);
            go.disabled = false; return;
          }
          return create();
        }
        done(r, false);
      } catch (e) { setStatus(status, "err", e.message); go.disabled = false; }
    };
    [cs, pin].forEach(x => x.addEventListener("keydown", e => { if (e.key === "Enter") go.click(); }));
    let ctx = null;
    if (LID) { try { const l = await api("/api/lobby/" + LID); ctx = t("gate.join", { name: l.name || "Squad" }); } catch (e) {} }
    app.appendChild(el("section", { class: "hero gatehero" }, [el("div", { class: "hero-body" }, [
      el("div", { class: "eyebrow" }, [t("app.eyebrow")]),
      el("div", { class: "wordmark", style: "font-size:clamp(40px,11vw,72px)" }, ["WARMIND"]),
      el("div", { class: "tag-line" }, [t("app.tagline")])])]));
    app.appendChild(panel("ID-01", ctx || t("gate.title"), { tone: "amber" }, [
      el("div", { class: "hint", style: "margin:0 0 12px" }, [t("gate.hint")]),
      el("div", { class: "field" }, [el("label", { class: "label", for: "gate-cs" }, [t("me.callsign")]), cs]),
      el("div", { class: "field" }, [el("label", { class: "label", for: "gate-pin" }, [t("gate.pin")]), pin]),
      go, status, extra,
      el("div", { class: "hint" }, [t("gate.pin.hint")]),
      el("div", { class: "btnrow", style: "justify-content:center" }, [el("a", { class: "btn sm", href: "/?roster" }, ["☰ " + t("ros.open")])]),
    ]));
    setTimeout(() => cs.focus(), 50);
  }

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
        await startTable(name.value.trim() || "Squad", size, null, roomSel.value || null);
      } catch (e) { toast(e.message); deploy.disabled = false; deploy.textContent = "▶ " + t("home.deploy"); }
    };
    name.addEventListener("keydown", e => { if (e.key === "Enter") deploy.click(); });
    // attribute the new table to one of your war rooms (it opens on the room's mission)
    const roomSel = el("select", { id: "sq-room" }, [el("option", { value: "" }, [t("room.none")])]);
    const roomHint = el("div", { class: "hint", style: "margin:6px 0 0" });
    const roomFld = el("div", { class: "field", hidden: true }, [el("label", { class: "label", for: "sq-room" }, ["> " + t("room.pick")]), roomSel, roomHint]);
    const paintRoomHint = () => { const r = (ROOMS || []).find(x => x.id === roomSel.value);
      roomHint.textContent = r ? (r.mission_name ? t("room.opens", { m: r.mission_name.name + (r.planet ? " · " + r.planet : "") }) : r.planet ? t("room.opens", { m: r.planet }) : t("room.nomission")) : ""; };
    roomSel.onchange = paintRoomHint;
    loadRooms().then(rs => { if (!rs.length) return; rs.forEach(r => roomSel.appendChild(el("option", { value: r.id }, [r.name + " · " + r.ship])));
      if (rs.some(r => r.id === store.lastRoom())) roomSel.value = store.lastRoom(); roomFld.hidden = false; paintRoomHint(); });

    const term = el("div", { class: "term", "aria-hidden": "true" });
    // Home in three tabs: Welcome (who you are, how it works) / Front (the live war) / War tables
    // you land on your profile; the war, your rooms, your tables and the welcome sit beside it
    const HT = [["me", "◉ " + t("ht.me")], ["front", "✦ " + t("ht.front")], ["rooms", "⚓ " + t("ht.rooms")], ["tables", "▦ " + t("ht.tables")], ["home", "⌂ " + t("ht.home")]];
    let ht = new URLSearchParams(location.search).get("tab") || "me";
    if (!HT.some(x => x[0] === ht)) ht = "me";
    const tabs = el("div", { class: "seg hometabs", role: "tablist" });
    const panes = {};
    HT.forEach(([k, label]) => {
      const b = el("button", { type: "button", role: "tab", "data-k": k }, [label]);
      b.onclick = () => show(k); tabs.appendChild(b);
      panes[k] = el("div", { class: "stack homepane", "data-k": k });
    });
    const show = k => { ht = k; try { localStorage.setItem("wm_hometab", k); } catch (e) {}
      tabs.querySelectorAll("button").forEach(b => b.setAttribute("aria-selected", String(b.dataset.k === k)));
      Object.keys(panes).forEach(x => { panes[x].hidden = x !== k; }); };
    app.appendChild(tabs); HT.forEach(([k]) => app.appendChild(panes[k]));

    // --- Welcome
    const how = el("button", { class: "btn sm", type: "button" }, ["? " + t("home.how")]);
    how.onclick = howModal;
    const cv = el("canvas", { class: "rain", "aria-hidden": "true" });
    panes.home.appendChild(el("section", { class: "hero" }, [cv,
      el("div", { class: "fx rings" }), el("div", { class: "fx radar" }),
      el("div", { class: "hero-body" }, [
        el("div", { class: "eyebrow" }, [t("app.eyebrow")]),
        el("h1", { class: "wordmark", style: "font-size:inherit;margin:0" }, [el("div", { class: "wordmark" }, ["WARMIND"])]),
        el("div", { class: "tag-line" }, [t("app.tagline")]),
        term,
        el("div", { class: "btnrow", style: "justify-content:center" }, [
          el("button", { class: "btn primary", type: "button", onclick: null, "data-go": "tables" }, ["▶ " + t("ht.go.tables")]),
          el("button", { class: "btn", type: "button", "data-go": "front" }, ["✦ " + t("ht.go.front")]), how]),
      ]),
    ]));
    panes.home.querySelectorAll("[data-go]").forEach(b => { b.onclick = () => { show(b.dataset.go); window.scrollTo(0, 0); }; });
    profilePane(panes.me);
    const fmFold = el("details", { class: "fold panel fmfold", style: "padding:0" }, [el("summary", {}, ["▤ " + t("gl.title") + " — " + t("gl.teaser")])]);
    fmFold.addEventListener("toggle", () => { if (fmFold.open && fmFold.children.length < 2) fmFold.appendChild(manualBody()); });
    panes.home.appendChild(fmFold);
    panes.home.appendChild(el("div", { class: "btnrow", style: "justify-content:center" }, [feedbackBtn(), el("a", { class: "btn sm", href: "/?costs" }, ["⛽ " + t("cost.title")])]));
    if (META.vision && META.vision.mock) panes.home.appendChild(el("div", { class: "alert" }, [el("b", {}, [t("alert.mock.t")]), t("alert.mock")]));

    // --- Front: the live war, each planet one tap from a war table
    panes.front.appendChild(warPanel(true));

    // --- War rooms: the squad's lasting homes
    roomsPane(panes.rooms);

    // --- War tables: start one, join one, yours
    panes.tables.appendChild(panel("SYS-T", t("home.new"), { tone: "amber" }, [el("div", { class: "console" }, [
      el("div", { class: "field" }, [el("label", { class: "label", for: "sq-name" }, ["> " + t("home.name.label")]), name]),
      el("div", { class: "field" }, [el("span", { class: "label" }, ["> " + t("home.size.label")]), sizeSeg]),
      roomFld, deploy])]));
    const codeIn = el("input", { type: "text", id: "join-code", placeholder: t("home.code.ph"), maxlength: "200", autocomplete: "off",
      autocapitalize: "off", spellcheck: "false" });
    const codeGo = el("button", { class: "btn primary", type: "button" }, ["➤ " + t("home.code.go")]);
    codeGo.onclick = async () => {
      const raw = codeIn.value.trim(), m = raw.match(/[?&]l=([A-Za-z0-9_-]+)/);
      const code = (m ? m[1] : raw).replace(/[^A-Za-z0-9_-]/g, "").toLowerCase();
      if (!code) { codeIn.focus(); toast(t("home.code.need")); return; }
      codeGo.disabled = true;
      try { await api("/api/lobby/" + code); location.search = "?l=" + code; }
      catch (e) {
        try { await api("/api/room/" + code); location.search = "?room=" + code; }   // a war room's code works here too
        catch (e2) { toast(t("home.code.bad")); codeGo.disabled = false; }
      }
    };
    codeIn.addEventListener("keydown", e => { if (e.key === "Enter") codeGo.click(); });
    panes.tables.appendChild(panel("SYS-00", t("home.code.title"), {}, [el("div", { class: "joincode" }, [codeIn, codeGo])]));
    const tablesSlot = el("div", { class: "slot" }); panes.tables.appendChild(tablesSlot);
    renderMyLobbies(tablesSlot);
    panes.tables.appendChild(el("div", { class: "btnrow", style: "justify-content:center" }, [el("a", { class: "btn sm", href: "/?roster" }, ["☰ " + t("ros.open")])]));
    show(ht);
    rain(cv);
    bootSequence(term);
  }

  // a new war table; `planet` (a war-feed planet name) pre-picks the mission's planet in the editor
  async function startTable(nm, size, planet, roomId) {
    const fd = new FormData(); fd.append("name", nm); fd.append("squad_size", String(size || 4));
    if (roomId) { fd.append("room_id", roomId); store.addRoom(roomId); store.setLastRoom(roomId); }
    const L = store.locker(); if (L) { fd.append("locker_id", L.id); fd.append("locker_key", L.key);
      try { const lk = await lget("/api/locker/" + L.id); if (lk && lk.callsign) fd.append("callsign", lk.callsign); } catch (e) {} }
    const r = await fdpost("/api/lobby", fd);
    store.setCreator(r.lobby_id, r.creator_token);
    if (planet) try { localStorage.setItem("wm_preplanet_" + r.lobby_id, planet); localStorage.setItem("wm_tab_" + r.lobby_id, "2"); } catch (e) {}
    location.search = "?l=" + r.lobby_id;
  }
  function howModal() {
    const dlg = el("dialog", { class: "modal", "aria-label": t("home.j.title") });
    const x = el("button", { type: "button", class: "btn sm", "aria-label": t("gf.done") }, ["×"]); x.onclick = () => dlg.close();
    dlg.append(el("div", { class: "mhead" }, [el("b", {}, [t("home.j.title")]), x]),
      el("div", { class: "mbody" }, [el("div", { class: "journey" }, [1, 2, 3].map(i =>
        el("div", { class: "st" }, [el("div", { class: "n" }, ["0" + i]), el("div", { class: "t" }, [t("home.j" + i + ".t")]), el("div", { class: "d" }, [t("home.j" + i + ".d")])])))]));
    dlg.addEventListener("close", () => dlg.remove());
    dlg.addEventListener("click", e => { if (e.target === dlg) dlg.close(); });
    document.body.appendChild(dlg);
    dlg.showModal ? dlg.showModal() : dlg.setAttribute("open", "");
  }

  // ======================================================================= war rooms
  function roomsPane(pane) {
    const nm = el("input", { type: "text", id: "room-name", maxlength: "40", placeholder: t("room.name.ph"), autocomplete: "off" });
    const mk = el("button", { class: "btn primary", type: "button" }, ["＋ " + t("room.create2")]);
    mk.onclick = async () => {
      mk.disabled = true;
      try { const r = await rpost("/api/room", { name: nm.value.trim() });
        try { localStorage.setItem("wm_roomc_" + r.room_id, r.creator_token); } catch (e) {}
        store.addRoom(r.room_id); store.setLastRoom(r.room_id); location.href = "/?room=" + r.room_id; }
      catch (e) { toast(e.message); mk.disabled = false; }
    };
    nm.addEventListener("keydown", e => { if (e.key === "Enter") mk.click(); });
    const list = el("div", { class: "stack", style: "gap:8px" }, [el("div", { class: "hint", style: "margin:0" }, [t("home.loading")])]);
    pane.appendChild(panel("RM-01", t("room.yours"), {}, [el("div", { class: "hint", style: "margin:0 0 10px" }, [t("room.what")]), list]));
    // join one by its code (or a pasted room link)
    const code = el("input", { type: "text", id: "room-code", maxlength: "200", placeholder: t("room.code.ph"), autocomplete: "off", autocapitalize: "off", spellcheck: "false" });
    const jn = el("button", { class: "btn primary", type: "button" }, ["➤ " + t("room.join")]);
    jn.onclick = async () => {
      const raw = code.value.trim(), m = raw.match(/[?&]room=([A-Za-z0-9_-]+)/), c = (m ? m[1] : raw).replace(/[^A-Za-z0-9_-]/g, "").toLowerCase();
      if (!c) { code.focus(); toast(t("home.code.need")); return; }
      jn.disabled = true;
      try { await api("/api/room/" + c); store.addRoom(c); location.href = "/?room=" + c; } catch (e) { toast(t("room.gone")); jn.disabled = false; }
    };
    code.addEventListener("keydown", e => { if (e.key === "Enter") jn.click(); });
    pane.appendChild(panel("RM-02", t("ht.rooms"), { tone: "amber" }, [
      el("div", { class: "field" }, [el("label", { class: "label", for: "room-name" }, ["> " + t("room.name")]), nm]),
      el("div", { class: "btnrow" }, [mk]), el("div", { class: "hint" }, [t("room.new.hint")]),
      el("div", { class: "field", style: "margin-top:16px" }, [el("label", { class: "label", for: "room-code" }, ["> " + t("room.joincode")]), el("div", { class: "joincode" }, [code, jn])])]));
    loadRooms().then(rs => {
      list.innerHTML = "";
      if (!rs.length) { list.appendChild(el("div", { class: "hint", style: "margin:0" }, [t("room.noneyet")])); return; }
      rs.forEach(r => list.appendChild(el("a", { class: "roomrow", href: "/?room=" + r.id }, [
        el("div", {}, [el("b", {}, [r.name]), el("small", {}, [r.ship])]),
        el("div", { class: "rm" }, [r.mission_name ? r.mission_name.name + (r.planet ? " · " + r.planet : "") : r.planet || t("room.nomission"),
          el("span", { class: "nixie-s" }, [" · " + t("room.ntables", { n: r.tables })])])])));
    });
  }

  let ROOM = null;
  const rget = id => api("/api/room/" + encodeURIComponent(id), { headers: Object.assign({}, rhead(), store.roomFounder(id) ? { "x-token": store.roomFounder(id) } : {}) });
  const fpost = (path, body) => rpost(path, body, ROOM && store.roomFounder(ROOM.id));   // founder actions
  const setRoom = r => { if (r.founder == null && ROOM) r.founder = ROOM.founder; ROOM = r; return r; };
  const logLine = e => {
    const p = Object.assign({}, e.p || {});
    if (e.k === "log.drop") {
      const bits = [p.kills != null ? t("lk.r.kills", { n: nf(p.kills) }) : null, p.deaths != null ? t("lk.r.deaths", { n: nf(p.deaths) }) : null].filter(Boolean).join(", ");
      return t("log.drop", { who: p.who || "?", mission: p.mission || "—", bits: bits || "—" }) + ((p.medals || []).length ? " 🎖 " + p.medals.join(", ") : "");
    }
    if (e.k === "log.neworder" || e.k === "log.order") p.title = p.title || orderTitle({ kind: p.kind, target: p.n, params: p.params || {} });
    p.who = p.who || t("room.someone"); p.ship = (ROOM && ROOM.ship) || "";
    return has(e.k) ? t(e.k, p) : (e.t || "");
  };
  const orderTitle = o => o.title || t("ord.k." + o.kind, { n: nf(o.target), planet: (o.params || {}).planet || "", min: (o.params || {}).min || "" });
  async function renderRoom() {
    app.innerHTML = ""; app.className = "stack";
    const nav = el("div", { class: "lknav" }, [backLink(), el("a", { class: "btn sm", href: "/?tab=rooms" }, ["⌂ " + t("lk.homepage")]),
      store.locker() ? el("a", { class: "btn sm", href: "/?locker" }, ["🗄 " + t("lk.open")]) : null, el("a", { class: "btn sm", href: "/?roster" }, ["☰ " + t("ros.open")])]);
    app.appendChild(nav);
    const body = el("div", { class: "stack" }, [el("div", { class: "hint" }, [t("home.loading")])]);
    app.appendChild(body);
    try { ROOM = await rget(ROOM_ID); }
    catch (e) { body.innerHTML = ""; body.appendChild(panel("ERR", t("room.title"), { tone: "red" }, [el("div", { class: "hint" }, [t("room.gone")])])); return; }
    store.addRoom(ROOM.id);
    const L = store.locker();   // visiting the room's link brings your profile aboard
    if (L && !ROOM.members.some(m => m.id === L.id)) { try { await rpost("/api/room/" + ROOM.id + "/join", {}); ROOM = await rget(ROOM.id); } catch (e) {} }
    loadWar();
    paintRoom(body);
    let sig = JSON.stringify(ROOM);
    const poll = setInterval(async () => {   // the room is shared: pick up what others change
      if (!document.body.contains(body)) return clearInterval(poll);
      if (document.hidden || body.querySelector("details.fold[open]") || document.activeElement && /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) return;
      try { const r = await rget(ROOM.id); const s2 = JSON.stringify(r); if (s2 !== sig) { sig = s2; ROOM = r; paintRoom(body); } } catch (e) {}
    }, 15000);
  }
  function paintRoom(body) {
    const R0 = ROOM; body.innerHTML = "";
    const founder = store.roomFounder(R0.id);
    // the plaque
    const st = R0.stats;
    const statCell = (k, v) => el("div", { class: "rstat" }, [nixie(String(v)), el("small", {}, [t(k)])]);
    const share = el("button", { class: "btn sm", type: "button" }, ["⧉ " + t("room.copy")]); share.onclick = () => copy(location.origin + "/?room=" + R0.id, t("common.copied"));
    let rename = null;
    if (founder) { rename = el("button", { class: "btn sm", type: "button" }, ["✎ " + t("room.rename")]);
      rename.onclick = async () => { const n = prompt(t("room.name"), R0.name); if (n == null) return; const sh = prompt(t("room.ship"), R0.ship); if (sh == null) return;
        try { ROOM = await rpost("/api/room/" + R0.id + "/name", { name: n, ship: sh }, founder); paintRoom(body); } catch (e) { toast(e.message); } }; }
    body.appendChild(panel("RM-00", t("room.title"), { tone: "amber", status: "⚓ " + t("room.code") + " " + R0.id, statusKind: "warn" }, [
      el("div", { class: "plaque" }, [el("div", { class: "big" }, [R0.name]), el("div", { class: "ship" }, [R0.ship]),
        el("div", { class: "hint", style: "margin:4px 0 0" }, [t("room.since", { d: dt(R0.created_at) })])]),
      el("div", { class: "rstats" }, [statCell("room.s.nights", st.nights), statCell("room.s.tables", st.tables), statCell("room.s.drops", st.drops),
        statCell("room.s.medals", st.medals), statCell("room.s.kills", nf(st.kills))]),
      R0.ribbons.length ? el("div", { class: "ribbons" }, R0.ribbons.map(k => el("span", { class: "ribbon r-" + k, title: t("rib." + k + ".d") }, [t("rib." + k)]))) : null,
      el("div", { class: "btnrow" }, [share, rename, (() => { const L = store.locker(); if (!L || !R0.members.some(m => m.id === L.id)) return null;
        const lv = el("button", { class: "btn sm red", type: "button" }, [t("room.leave")]);
        lv.onclick = async () => { if (!confirm(t("room.leave.q", { name: R0.name }))) return;
          try { await rpost("/api/room/" + R0.id + "/leave", {});
            try { localStorage.setItem("wm_rooms", JSON.stringify(store.rooms().filter(x => x !== R0.id))); if (store.lastRoom() === R0.id) store.setLastRoom(""); } catch (e) {}
            toast(t("room.left")); location.href = "/?tab=rooms"; } catch (e) { toast(e.message); } };
        return lv; })()])]));
    // the founder's pinned message to the crew
    if (R0.message || R0.founder) {
      const mk = [];
      if (R0.message) mk.push(el("div", { class: "rmsg" }, [R0.message]), el("div", { class: "hint", style: "margin:4px 0 0" }, [t("room.msg.at", { d: dt(R0.message_at) })]));
      else mk.push(el("div", { class: "hint", style: "margin:0" }, [t("room.msg.none")]));
      if (R0.founder) {
        const ta = el("textarea", { rows: "3", maxlength: "500", placeholder: t("room.msg.ph") }); ta.value = R0.message || "";
        const sv = el("button", { class: "btn sm primary", type: "button" }, [t("room.msg.save")]);
        sv.onclick = async () => { sv.disabled = true; try { setRoom(await fpost("/api/room/" + R0.id + "/message", { message: ta.value })); toast(t("room.msg.saved")); paintRoom(body); } catch (e) { toast(e.message); sv.disabled = false; } };
        mk.push(el("details", { class: "fold" }, [el("summary", {}, ["✎ " + t(R0.message ? "room.msg.edit" : "room.msg.set")]), el("div", { class: "body" }, [ta, el("div", { class: "btnrow" }, [sv])])]));
      }
      body.appendChild(panel("RM-01", t("room.msg"), { tone: "amber" }, mk));
    }
    // tonight: the room's mission and a table on it
    body.appendChild(roomMissionPanel(body));
    body.appendChild(roomOrdersPanel(body));
    // tables
    const row = x => el("a", { class: "roomrow st-" + x.status, href: "/?l=" + x.id + fromHere() }, [
      el("div", {}, [el("b", {}, [x.name]), el("small", {}, [dt(x.at)])]),
      el("div", { class: "rm" }, [statusTag(x.status), " " + (x.mission ? x.mission.name + " · D" + x.mission.difficulty : t("home.meta.nomission")) + " · " + x.players + "/" + (x.squad_size || 4)])]);
    const groups = [["open", R0.tables.filter(x => x.status === "open" || x.status === "debriefing")], ["done", R0.tables.filter(x => x.status === "done")],
      ["folded", R0.tables.filter(x => x.status === "folded")]];
    const tk = [];
    if (!R0.tables.length) tk.push(el("div", { class: "hint", style: "margin:0" }, [t("room.notables")]));
    groups.forEach(([k, list]) => { if (!list.length) return;
      const items = el("div", { class: "stack", style: "gap:6px" }, list.slice(0, k === "open" ? 20 : 8).map(row));
      tk.push(el("div", { class: "sub-h" + (tk.length ? "" : " first") }, [t("tbl.group." + k) + " · " + list.length]), k === "open" ? items : el("details", { class: "fold" }, [el("summary", {}, [t("tbl.show", { n: list.length })]), el("div", { class: "body" }, [items])])); });
    const nOpen = groups[0][1].length, nDone = groups[1][1].length;
    body.appendChild(panel("RM-04", t("room.tables"), { status: t("tbl.counts", { o: nOpen, d: nDone }), statusKind: "info" }, tk));
    // crew
    if (R0.members.length) body.appendChild(panel("RM-05", t("room.crew"), { status: String(R0.members.length), statusKind: "info" }, [el("div", { class: "chips" },
      R0.members.map(m => m.public ? el("a", { class: "chip", href: "/?roster=" + m.id + fromHere() }, [m.callsign]) : el("span", { class: "chip" }, [m.callsign])))]));
    // planets fought
    const pl = Object.entries(st.planets || {}).sort((a, b) => b[1] - a[1]);
    if (pl.length) body.appendChild(panel("RM-06", t("room.planets"), {}, [el("div", { class: "chips" }, pl.map(([n, c]) => el("span", { class: "chip" }, ["📍 " + n + " ×" + c])))]));
    // ship's log
    body.appendChild(panel("RM-07", t("room.log"), {}, [el("ol", { class: "shiplog" }, R0.log.map(e => el("li", {}, [
      el("span", { class: "ts" }, [dt(e.at) + " " + new Date(e.at * 1000).toISOString().slice(11, 16)]), el("span", {}, [logLine(e)])])))]));
  }
  function roomMissionPanel(body) {
    const R0 = ROOM, m = R0.mission;
    const kids = [];
    if (m) kids.push(el("div", { class: "rmis" }, [
      el("b", {}, [(R0.mission_name && R0.mission_name.name) || t("room.anymission")]),
      el("div", { class: "hint", style: "margin:2px 0 0" }, [[t("faction." + m.faction), "D" + m.difficulty, t("mode." + m.mode), m.planet_name ? "📍 " + m.planet_name : null].filter(Boolean).join(" · ")]),
      R0.mission_by ? el("div", { class: "hint", style: "margin:2px 0 0" }, [t("room.setby", { who: R0.mission_by })]) : null]));
    else kids.push(el("div", { class: "hint", style: "margin:0" }, [t("room.nomission.long")]));
    // open tonight's table
    const nm = el("input", { type: "text", maxlength: "40", value: t("room.night", { n: (R0.stats.nights || 0) + 1 }), "aria-label": t("home.name.label") });
    let size = 4; const sz = el("div", { class: "seg", role: "group", "aria-label": t("home.size.label") });
    [1, 2, 3, 4].forEach(n => { const b = el("button", { type: "button", "aria-pressed": String(n === size) }, [String(n)]); b.onclick = () => { size = n; sz.querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", String(x === b))); }; sz.appendChild(b); });
    const go = el("button", { class: "btn primary", type: "button" }, ["▶ " + t("room.open.table")]);
    go.onclick = async () => { go.disabled = true; try { await startTable(nm.value.trim() || R0.name, size, null, R0.id); } catch (e) { toast(e.message); go.disabled = false; } };
    kids.push(el("div", { class: "field", style: "margin-top:12px" }, [el("span", { class: "label" }, ["> " + t("home.name.label")]), nm]),
      el("div", { class: "field" }, [el("span", { class: "label" }, ["> " + t("home.size.label")]), sz]), el("div", { class: "btnrow" }, [go]));
    // set the room's mission (anyone in the room can)
    const f = el("details", { class: "fold" }, [el("summary", {}, ["✎ " + t(m ? "room.mission.change" : "room.mission.set")])]);
    const draft = Object.assign({ mode: "optimize", faction: "automatons", difficulty: 7, mission_id: "", planet_name: "", planet_hazards: [], operation_modifiers: [] }, m || {});
    const planet = el("select", {}, [el("option", { value: "" }, [t("war.pick.none")])]);
    const fac = el("select", {}, ["automatons", "terminids", "illuminate"].map(x => el("option", { value: x }, [t("faction." + x)]))); fac.value = draft.faction;
    const mis = el("select", {});
    const fillMis = () => { mis.innerHTML = ""; mis.appendChild(el("option", { value: "" }, [t("room.anymission")]));
      (META.missions || []).filter(x => !x.factions || x.factions.indexOf(fac.value) >= 0).forEach(x => mis.appendChild(el("option", { value: x.id }, [x.display_name || x.name || x.id])));
      mis.value = (META.missions || []).some(x => x.id === draft.mission_id) ? draft.mission_id : ""; };
    fillMis(); fac.onchange = () => { draft.faction = fac.value; fillMis(); };
    const diff = el("select", {}, Array.from({ length: 10 }, (_, i) => el("option", { value: i + 1 }, ["D" + (i + 1)]))); diff.value = draft.difficulty;
    const mode = el("select", {}, ["optimize", "fun", "challenge", "improvement", "d100"].map(x => el("option", { value: x }, [t("mode." + x) + (has("mode." + x + ".s") ? " — " + t("mode." + x + ".s") : "")]))); mode.value = draft.mode;
    loadWar().then(w => { (w && w.planets || []).forEach(p => planet.appendChild(el("option", { value: p.name }, [planetLabel(p)]))); planet.value = draft.planet_name || ""; });
    planet.onchange = () => { const p = ((WAR && WAR.planets) || []).find(x => x.name === planet.value);
      draft.planet_name = planet.value; if (p) { draft.faction = p.enemy; fac.value = p.enemy; draft.planet_hazards = p.hazards.slice(); draft.operation_modifiers = (p.effects || []).slice(); fillMis(); } else draft.planet_hazards = []; };
    const save = el("button", { class: "btn primary", type: "button" }, ["✓ " + t("room.mission.save")]);
    save.onclick = async () => { save.disabled = true;
      Object.assign(draft, { faction: fac.value, mission_id: mis.value, difficulty: +diff.value, mode: mode.value, lang: LANG });
      try { setRoom(await rpost("/api/room/" + R0.id + "/mission", { mission: draft })); toast(ROOM.pushed ? t("room.mission.pushed", { n: ROOM.pushed }) : t("room.mission.saved")); paintRoom(body); } catch (e) { toast(e.message); save.disabled = false; } };
    const lab = (k, n) => el("div", { class: "field" }, [el("span", { class: "label" }, [t(k)]), n]);
    f.appendChild(el("div", { class: "body" }, [lab("war.pick", planet), lab("mis.faction", fac), lab("mis.mission", mis), lab("mis.difficulty", diff), lab("mis.mode", mode),
      el("div", { class: "btnrow" }, [save, m ? (() => { const c = el("button", { class: "btn sm", type: "button" }, [t("room.mission.clear")]);
        c.onclick = async () => { try { setRoom(await rpost("/api/room/" + R0.id + "/mission", { clear: true })); paintRoom(body); } catch (e) { toast(e.message); } }; return c; })() : null]),
      el("div", { class: "hint" }, [t("room.mission.hint")])]));
    kids.push(f);
    return panel("RM-02", t("room.tonight"), { tone: "amber" }, kids);
  }
  function roomOrdersPanel(body) {
    const R0 = ROOM;
    const kids = [];
    if (!R0.orders.length) kids.push(el("div", { class: "hint", style: "margin:0" }, [t("room.noorders")]));
    R0.orders.forEach(o => {
      const done = !!o.done_at;
      const acts = [];
      if (R0.founder && o.kind === "custom") { const b = el("button", { class: "btn sm", type: "button" }, [done ? t("ord.undo") : "✓ " + t("ord.done")]);
        b.onclick = async () => { try { setRoom(await fpost("/api/room/" + R0.id + "/orders/" + o.id, { done: !done })); paintRoom(body); } catch (e) { toast(e.message); } }; acts.push(b); }
      if (R0.founder) { const x = el("button", { class: "btn sm", type: "button", title: t("ord.retire"), "aria-label": t("ord.retire") }, ["×"]);
        x.onclick = async () => { if (!confirm(t("ord.retire.q"))) return; try { setRoom(await fpost("/api/room/" + R0.id + "/orders/" + o.id, { retire: true })); paintRoom(body); } catch (e) { toast(e.message); } };
        acts.push(x); }
      kids.push(el("div", { class: "order" + (done ? " done" : "") }, [
        el("div", { class: "ot" }, [el("b", {}, [(done ? "✓ " : "") + orderTitle(o)]), el("small", {}, [[o.set_by ? t("room.setby", { who: o.set_by }) : null, dt(o.at)].filter(Boolean).join(" · ")])]),
        el("div", { class: "op" }, [o.kind === "custom" ? null : nixie(nf(o.progress) + "/" + nf(o.target)), ...acts]),
        o.kind === "custom" ? null : meter(Math.round(100 * o.progress / Math.max(1, o.target)))]));
    });
    // new order
    const f = el("details", { class: "fold" }, [el("summary", {}, ["＋ " + t("ord.new")])]);
    const kind = el("select", {}, ["drops", "medals", "oaths", "kills", "planet", "difficulty", "d100", "custom"].map(k => el("option", { value: k }, [t("ord.kind." + k)])));
    const target = el("input", { type: "number", min: "1", max: "100000", value: "5", inputmode: "numeric" });
    const planet = el("select", {}); const minD = el("select", {}, Array.from({ length: 10 }, (_, i) => el("option", { value: i + 1 }, ["D" + (i + 1)]))); minD.value = "10";
    const title = el("input", { type: "text", maxlength: "80", placeholder: t("ord.title.ph") });
    loadWar().then(w => (w && w.planets || []).forEach(p => planet.appendChild(el("option", { value: p.name }, [p.name]))));
    const fT = el("div", { class: "field" }, [el("span", { class: "label" }, [t("ord.target")]), target]);
    const fP = el("div", { class: "field" }, [el("span", { class: "label" }, [t("war.pick")]), planet]);
    const fD = el("div", { class: "field" }, [el("span", { class: "label" }, [t("ord.min")]), minD]);
    const fTi = el("div", { class: "field" }, [el("span", { class: "label" }, [t("ord.title")]), title]);
    const paint = () => { const k = kind.value; fT.hidden = k === "custom"; fP.hidden = k !== "planet"; fD.hidden = k !== "difficulty"; title.placeholder = k === "custom" ? t("ord.title.ph.custom") : t("ord.title.ph"); };
    kind.onchange = paint; paint();
    const add = el("button", { class: "btn primary", type: "button" }, ["＋ " + t("ord.add")]);
    add.onclick = async () => { add.disabled = true;
      try { setRoom(await fpost("/api/room/" + R0.id + "/orders", { kind: kind.value, target: +target.value || 1, title: title.value.trim(), params: { planet: planet.value, min: +minD.value } }));
        toast(t("ord.added")); paintRoom(body); } catch (e) { toast(e.message); add.disabled = false; } };
    f.appendChild(el("div", { class: "body" }, [el("div", { class: "field" }, [el("span", { class: "label" }, [t("ord.kind")]), kind]), fT, fP, fD, fTi, el("div", { class: "btnrow" }, [add]),
      el("div", { class: "hint" }, [t("ord.hint")])]));
    if (R0.founder) kids.push(f); else kids.push(el("div", { class: "hint" }, [t("room.orders.founder")]));
    return panel("RM-03", t("room.orders"), { status: R0.orders.filter(o => o.done_at).length + "/" + R0.orders.length, statusKind: "info" }, kids);
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

  async function renderMyLobbies(slot) {
    const mine = storedLobbies();
    if (!mine.length) return;
    const list = el("div", {}, [el("div", { class: "hint", style: "margin:0" }, [t("home.loading")])]);
    const card = panel("SYS-02", t("home.tables"), {}, [list]);
    (slot || app).appendChild(card);
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
        statusTag(l.status), tag(owned.has(l.id) ? "amber" : "cyan", owned.has(l.id) ? t("common.creator") : t("common.diver")), resume, forget,
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
    if (sig === lastSig && STATE) return;
    const mWas = STATE && STATE.directive && STATE.directive.mind, mNow = s.directive && s.directive.mind;
    if (mWas && mNow && mWas.status === "thinking" && mNow.status !== "thinking") toast(t("mind.toast"));   // nothing changed: leave the page (and any open folds) alone
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
    if (next.players.length && next.players.every(p => p.go) && !(prev.players.length && prev.players.every(p => p.go))) msgs.push(t("go.all.toast"));
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
    if (!myPlayer() && STATE.status !== "folded") R.views[1].appendChild(joinPanel());
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
    // fresh loadouts land on the Briefing; the Debrief takes over once someone has played
    if (active === 3 && !STATE.players.some(p => p.aar || p.result)) active = 2;
    return { done: done, active: active };
  }

  const linkTried = {};
  function maybeLinkLocker() {
    const me = meRec(), p = me && STATE && myPlayer();
    if (!p || p.locker || linkTried[p.id]) return;
    linkTried[p.id] = true;
    ensureLocker(p.id, me.token).then(() => tick()).catch(() => {});
  }
  function renderLive() {
    maybeLinkLocker();
    try { if (LID) localStorage.setItem("wm_last_lobby", JSON.stringify({ id: LID, name: STATE.name || "" })); } catch (e) {}
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
    if (!STATE.directive || isBuilding()) return nodes;
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
          el("div", { class: "code" }, [t("cmd.code") + ": ", (() => { const b = el("button", { type: "button", class: "codebtn", title: t("common.copy") }, [LID]);
            b.onclick = () => copy(LID, t("cmd.code.copied")); return b; })()])]),
        el("div", { class: "acts" }, [backLink(), role, inv, fm, feedbackBtn(), homeLink()]),
      ])]),
      el("div", { class: "uplink", "aria-hidden": "true" }, [
        el("span", { class: "ok" }, ["● " + t("cmd.uplink")]),
        el("span", {}, ["SEC-" + LID.slice(0, 4).toUpperCase()]),
        el("span", {}, [STATE.players.length + "/" + ((STATE.readiness || {}).expected || STATE.players.length) + " " + t("cmd.divers")]),
        STATE.created_at ? (() => { const n = el("span", { class: "met", title: t("cmd.met") }, ["MET T+", nixie(metText(STATE.created_at))]);
          clearInterval(metTimer); metTimer = setInterval(() => { if (!n.isConnected) return clearInterval(metTimer); n.lastChild.replaceWith(nixie(metText(STATE.created_at))); }, 1000);
          return n; })() : el("span", { class: "clock" }, [new Date().toISOString().slice(11, 16) + " UTC"]),
      ]),
      foldRow(), roomChip(), STATE.status === "folded" ? null : goStrip(),
      ...((WAR && WAR.orders) || []).slice(0, 2).map(moStrip),
    ]);
  }

  const statusTag = st => tag(st === "done" ? "green" : st === "folded" ? "" : st === "debriefing" ? "amber" : "cyan", t("tbl." + (st || "open")));
  function foldRow() {
    const st = STATE.status || "open", kids = [statusTag(st)];
    if (isCreator()) {
      const b = el("button", { class: "btn sm" + (st === "folded" ? " primary" : ""), type: "button" }, [st === "folded" ? t("tbl.unfold") : t("tbl.fold")]);
      b.onclick = async () => { if (st !== "folded" && !confirm(t("tbl.fold.q"))) return; b.disabled = true;
        try { STATE = await jpost("/api/lobby/" + LID + "/fold", { fold: st !== "folded" }, store.creator(LID)); lastSig = JSON.stringify(STATE); render(); toast(t(st === "folded" ? "tbl.unfolded" : "tbl.folded.toast")); }
        catch (e) { toast(e.message); b.disabled = false; } };
      kids.push(b);
    }
    if (st === "folded") kids.push(el("span", { class: "hint", style: "margin:0" }, [t("tbl.folded.hint")]));
    else if (st === "done") kids.push(el("span", { class: "hint", style: "margin:0" }, [t("tbl.done.hint")]));
    return el("div", { class: "foldrow" }, kids);
  }

  // which war room this table belongs to; the creator can attribute it (or move it)
  function roomChip() {
    const r = STATE.room;
    const kids = [];
    if (r) kids.push(el("a", { class: "roomchip", href: "/?room=" + r.id + fromHere() }, ["⚓ ", el("b", {}, [r.name]), el("span", {}, [" · " + r.ship])]));
    if (isCreator()) {
      const b = el("button", { class: "btn sm", type: "button" }, [r ? "⇄ " + t("room.move") : "⚓ " + t("room.attach")]);
      b.onclick = () => roomPickDialog(r ? r.id : "");
      kids.push(b);
      if (r && STATE.mission && STATE.mission.mission_id) {
        const mk = el("button", { class: "btn sm", type: "button", title: t("room.adopt.hint") }, ["★ " + t("room.adopt")]);
        mk.onclick = async () => { mk.disabled = true; try { await rpost("/api/room/" + r.id + "/mission", { mission: STATE.mission }); toast(t("room.adopted", { room: r.name })); } catch (e) { toast(e.message); } mk.disabled = false; };
        kids.push(mk);
      }
    }
    return kids.length ? el("div", { class: "roomline" }, kids) : null;
  }
  async function roomPickDialog(cur) {
    const rs = await loadRooms();
    const dlg = el("dialog", { class: "modal", "aria-label": t("room.pick") });
    const x = el("button", { type: "button", class: "btn sm", "aria-label": t("gf.done") }, ["×"]); x.onclick = () => dlg.close();
    const list = el("div", { class: "stack", style: "gap:8px" });
    const pick = async rid => { try { STATE = await jpost("/api/lobby/" + LID + "/room", { room_id: rid }, store.creator(LID)); if (rid) { store.addRoom(rid); store.setLastRoom(rid); }
      lastSig = JSON.stringify(STATE); dlg.close(); renderLive(); toast(rid ? t("room.attached") : t("room.detached")); } catch (e) { toast(e.message); } };
    rs.forEach(r => { const b = el("button", { type: "button", class: "btn" + (r.id === cur ? " primary" : ""), style: "justify-content:flex-start;text-align:left" }, ["⚓ " + r.name + " · " + r.ship]); b.onclick = () => pick(r.id); list.appendChild(b); });
    if (!rs.length) list.appendChild(el("div", { class: "hint" }, [t("room.noneyet")]));
    if (cur) { const d = el("button", { type: "button", class: "btn sm red" }, [t("room.detach")]); d.onclick = () => pick(""); list.appendChild(d); }
    list.appendChild(el("a", { class: "btn sm", href: "/?tab=rooms" }, ["＋ " + t("room.new")]));
    dlg.append(el("div", { class: "mhead" }, [el("b", {}, [t("room.pick")]), x]), el("div", { class: "mbody" }, [list]));
    dlg.addEventListener("close", () => dlg.remove());
    dlg.addEventListener("click", e => { if (e.target === dlg) dlg.close(); });
    document.body.appendChild(dlg); dlg.showModal ? dlg.showModal() : dlg.setAttribute("open", "");
  }
  // Go / No-Go before the drop: every diver calls it, the board lights up
  function goStrip() {
    if (!STATE.players.length) return null;
    const me = myPlayer(), meR = meRec();
    const n = STATE.players.filter(p => p.go).length, all = n === STATE.players.length;
    const lights = el("span", { class: "golights", "aria-label": n + "/" + STATE.players.length }, STATE.players.map(p =>
      el("span", { class: "gol" + (p.go ? " on" : ""), title: p.callsign + ": " + (p.go ? "GO" : "NO-GO") }, [p.callsign.slice(0, 2).toUpperCase()])));
    const kids = [el("span", { class: "label", style: "margin:0" }, [t("go.title")]), lights, el("b", { class: all ? "allgo" : "" }, [all ? t("go.all") : n + "/" + STATE.players.length + " GO"])];
    if (me && meR) {
      const b = el("button", { class: "btn sm" + (me.go ? "" : " primary"), type: "button" }, [me.go ? t("go.hold") : "▲ " + t("go.go")]);
      b.onclick = async () => { b.disabled = true; try { STATE = await jpost("/api/lobby/" + LID + "/player/" + me.id + "/go", { go: !me.go }, meR.token); lastSig = JSON.stringify(STATE); renderLive();
        if (STATE.players.every(p => p.go)) toast(t("go.all.toast")); } catch (e) { toast(e.message); b.disabled = false; } };
      kids.push(b);
    }
    return el("div", { class: "gostrip" + (all ? " all" : "") }, kids);
  }

  // ----------------------------------------------------------------- 01: join
  function joinPanel() {
    const nP = STATE ? STATE.players.length : 0, exp = STATE ? ((STATE.readiness || {}).expected || 4) : 4;
    if (nP >= 4) return panel(t("join.pid"), t("join.title"), { tone: "red", status: "4/4", statusKind: "warn" }, [
      el("div", { class: "hint", style: "margin:0" }, [t("join.full")]), el("a", { class: "btn sm", href: "/" }, ["⌂ " + t("lk.homepage")])]);
    const name = el("input", { type: "text", id: "cs", placeholder: t("join.cs.ph"), maxlength: "32", autocomplete: "off" });
    const status = el("div", { class: "upstatus", role: "status", "aria-live": "polite" });
    // a device with a locker joins with it: gear + latest stats come along, no screenshot needed
    const L = store.locker();
    const upload = fileBtn(L ? "" : "primary", t(L ? "join.upload.new" : "join.upload"), true);
    const skip = el("button", { class: "btn" + (L ? " primary" : ""), type: "button" }, [t(L ? "join.locker" : "join.skip")]);
    const lockerHint = L ? el("div", { class: "hint" }, [t("join.locker.hint")]) : null;
    if (L) lget("/api/locker/" + L.id).then(lk => { if (lk && lk.callsign && !name.value) name.value = lk.callsign; }).catch(() => {});
    const controls = [upload, skip, name];
    // returning diver on a new device: pick your callsign from the roster (your last read and gear come back)
    let picker = null;
    if (!L) {
      const sel = el("select", { id: "cs-pick", "aria-label": t("join.pick") }, [el("option", { value: "" }, [t("join.pick.ph")])]);
      picker = el("div", { class: "field", hidden: true }, [el("label", { class: "label", for: "cs-pick" }, [t("join.pick")]), sel, el("div", { class: "hint", style: "margin:4px 0 0" }, [t("join.pick.hint")])]);
      api("/api/roster").then(r => { const names = [...new Set((r.divers || []).map(d => d.callsign).filter(Boolean))].sort((a, b) => a.localeCompare(b));
        if (!names.length) return; names.forEach(n => sel.appendChild(el("option", { value: n }, [n]))); picker.hidden = false; }).catch(() => {});
      sel.onchange = () => { if (!sel.value) return; name.value = sel.value; skip.textContent = t("join.as", { name: sel.value }); skip.classList.add("primary"); };
      name.addEventListener("input", () => { if (name.value !== sel.value) { sel.value = ""; skip.textContent = t("join.skip"); } });
    }
    upload.querySelector("input").onchange = ev => { if (ev.target.files && ev.target.files.length) doJoin(name.value, ev.target.files, status, controls); };
    skip.onclick = () => { if (!name.value.trim()) { name.focus(); toast(t("prof.need")); return; } doJoin(name.value, null, status, controls); };
    name.addEventListener("keydown", e => { if (e.key === "Enter") skip.click(); });
    return panel(t("join.pid"), t("join.title"), { tone: "amber", status: t("common.diver"), statusKind: "warn" }, [
      nP >= exp ? el("div", { class: "upstatus err", style: "margin:0 0 10px" }, [t("join.extra", { n: exp, m: nP + 1 })]) : null,
      picker,
      el("div", { class: "field" }, [el("label", { class: "label", for: "cs" }, [t("join.cs.label")]), name]),
      el("div", { class: "btnrow" }, L ? [skip, upload] : [upload, skip]),
      status,
      lockerHint,
      el("div", { class: "hint" }, [t("join.hint")]),
      L ? null : el("div", { class: "hint" }, [t("join.hint.return")]),
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
      const L0 = store.locker(); if (L0) { fd.append("locker_id", L0.id); fd.append("locker_key", L0.key); }
      const r = await fdpost("/api/lobby/" + LID + "/join", fd);
      store.setMe(LID, { id: r.player_id, token: r.player_token });
      if (!L0) { try { await ensureLocker(r.player_id, r.player_token); } catch (e) {} }   // first war table: their locker starts here
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
      const sub = [t("card.style", { style: styleLabel(p.play_style) }), p.assignment ? t("card.role", { role: p.assignment.role }) : null].filter(Boolean).join(" · ");
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
    // rename after joining
    const nameIn = el("input", { id: "my-callsign", type: "text", maxlength: "24", value: p.callsign || "", autocomplete: "off" });
    const nameBtn = el("button", { class: "btn sm", type: "button" }, ["✎ " + t("me.rename")]);
    nameBtn.onclick = async () => {
      const v = nameIn.value.trim(); if (!v || v === p.callsign || busy) return;
      busy = true; nameBtn.disabled = true;
      try { await jpost("/api/lobby/" + LID + "/player/" + p.id + "/callsign", { callsign: v }, meRec().token); await refresh(); toast(t("toast.renamed")); }
      catch (e) { toast(e.message); } finally { busy = false; nameBtn.disabled = false; }
    };
    nameIn.onkeydown = e => { if (e.key === "Enter") nameBtn.click(); };
    kids.push(el("div", { class: "grid2", style: "margin-top:14px;align-items:end" }, [
      el("div", { class: "field" }, [el("label", { class: "label", for: "my-callsign" }, [t("me.callsign")]), nameIn]),
      el("div", { class: "field" }, [nameBtn])]));
    const dev = el("button", { class: "btn sm", type: "button" }, ["⇄ " + t("me.device")]);
    dev.onclick = () => copy(location.origin + "/?l=" + LID + "#me=" + p.id + "." + meRec().token, t("me.device.copied"));
    const leaveB = el("button", { class: "btn sm red", type: "button" }, [t("tbl.leave")]);
    leaveB.onclick = async () => { if (!confirm(t("tbl.leave.q"))) return;
      try { await api("/api/lobby/" + LID + "/player/" + p.id, { method: "DELETE", headers: { "x-token": meRec().token } });
        try { localStorage.removeItem("wm_me_" + LID); } catch (e) {}
        toast(t("tbl.left")); setTimeout(() => { location.href = "/?tab=tables"; }, 500); } catch (e) { toast(e.message); } };
    kids.push(el("div", { class: "btnrow" }, [dev, leaveB]));
    if (gear && p.gear_confirmed) {
      if (p.locker && store.locker()) kids.push(lockerLine());   // the checklist lives in the locker now
      else kids.push(gear);
    }
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
  const gearDirty = () => { if (LOCKER_PAGE) return !!gearDraft.__locker; const me = meRec(); return !!(me && gearDraft[me.id]); };
  async function saveGearDraft(pid) {
    const d = gearDraft[pid]; if (!d) return true;
    const payload = d.owned.size >= d.total ? { owned: null, v: 2 } : { owned: Array.from(d.owned), v: 2 };
    if (busy) { toast(t("gf.wait")); return false; }
    busy = true;
    try {
      if (pid === "__locker") await lpost("/api/locker/" + store.locker().id + "/gear", payload);
      else await jpost("/api/lobby/" + LID + "/player/" + pid + "/owned", payload, meRec().token);
      try { localStorage.setItem("wm_gear", JSON.stringify(payload)); } catch (e) {}   // this device remembers too
      delete gearDraft[pid];
      busy = false; if (pid === "__locker") await loadLocker(); else await refresh(); toast(t("gear.saved"));
      return true;
    } catch (e) { toast(e.message); return false; } finally { busy = false; }
  }
  function guardGear(go) {
    if (!gearDirty()) return go();
    const me = LOCKER_PAGE ? { id: "__locker" } : meRec();
    const dlg = el("dialog", { class: "modal confirm", "aria-label": t("unsaved.title") });
    const save = el("button", { type: "button", class: "btn primary" }, ["✓ " + t("unsaved.save")]);
    const drop = el("button", { type: "button", class: "btn red" }, [t("unsaved.discard")]);
    const stay = el("button", { type: "button", class: "btn" }, [t("unsaved.stay")]);
    save.onclick = async () => { save.disabled = true; if (await saveGearDraft(me.id)) { dlg.close(); go(); } else save.disabled = false; };
    drop.onclick = () => { delete gearDraft[me.id]; dlg.close(); if (!LOCKER_PAGE) renderLive(); go(); };   // the locker re-renders the tab it goes to
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
          // tapping the name ticks the box; the wiki is a separate small ↗ so nobody leaves the app by accident
          const wu = META && META.wiki && META.wiki[i.name];
          grid.appendChild(el("label", { class: "tile" }, [cb, el("span", { class: "ti" }, [icon]), el("span", { class: "tn" }, [
            el("span", { class: "nm" }, [i.name]), el("small", {}, [srcLabel(i.source)]), sl ? el("small", { class: "ts" }, [sl]) : null]),
            wu ? el("a", { class: "wkx", href: wu, target: "_blank", rel: "noopener", title: t("gear.wiki"), "aria-label": t("gear.wiki") + ": " + i.name }, ["↗"]) : null]));
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
    const base = { mode: "optimize", faction: "automatons", difficulty: 7, mission_id: "", operation_modifiers: [], planet_hazards: [], tactical_objectives: [], is_city_map: false, oath: null, oaths: [] };
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
    body.appendChild(el("div", { class: "blk", style: "margin-top:4px" }, [el("span", { class: "label" }, [t("mis.mode")]), modes, el("div", { class: "hint" }, [t("mis.d100.hint")]), el("div", { class: "hint", style: "margin-top:4px" }, ["☠ " + t("mis.d100.kit")])]));

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
      let pre = null; try { pre = localStorage.getItem("wm_preplanet_" + LID); } catch (e) {}
      const pp = pre && !draft.planet_name && w.planets.find(p => p.name === pre);
      if (pp) { planetSel.value = String(pp.index); planetSel.onchange(); try { localStorage.removeItem("wm_preplanet_" + LID); } catch (e) {} }
    });
    planetSel.onchange = () => {
      const p = ((WAR && WAR.planets) || []).find(x => String(x.index) === planetSel.value);
      if (!p) { draft.planet_name = ""; planetInfo.textContent = t("war.pick.hint"); return; }
      draft.planet_name = p.name; draft.faction = p.enemy; facSel.value = p.enemy;
      draft.planet_hazards = p.hazards.slice();
      (p.effects || []).forEach(id => { if (draft.operation_modifiers.indexOf(id) < 0) draft.operation_modifiers.push(id); });   // Hive World -> Gloom Source
      draft.dss_actions = (p.dss && p.dss.details) || [];   // the Democracy Space Station's active actions, for the briefing
      paintHaz(); fillMissions(); fillTacticals(); fillOps();
      toast(t("war.filled", { faction: t("faction." + p.enemy), n: p.hazards.length + (p.effects || []).length }));
      planetInfo.textContent = [p.biome, p.sector, p.hazard_names.length ? p.hazard_names.join(", ") : t("war.nohaz"), p.progress != null ? t("war.liberation", { n: p.progress }) : null,
        p.dss ? "🛰 " + t("war.dss") + (p.dss.actions && p.dss.actions.length ? ": " + p.dss.actions.join(", ") : "") : null].filter(Boolean).join(" · ");
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
      const GROUPS = ["operation", "forces", "planet", "effect"];
      const ordered = [];
      GROUPS.forEach(g => {
        const ids = list.filter(x => (x.group || "operation") === g).map(x => x.id).concat(g === "operation" ? ["__city", "__stealth"] : []);
        if (ids.length) ordered.push("@" + g), ids.forEach(id => ordered.push(id));
      });
      ordered.forEach(id => {
        if (id[0] === "@") { ops.appendChild(el("div", { class: "chiphead" }, [t("mis.grp." + id.slice(1))])); return; }
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

    // Weapons Experimentation: a stratagem handed to everyone, outside the four slots
    draft.free_stratagems = draft.free_stratagems || [];
    const stratNames = []; (META.armory || []).forEach(tb => { if (tb.slot === "Stratagem") tb.groups.forEach(g => g.items.forEach(i => stratNames.push(i.name))); });
    const freeSel = el("select", { id: "m-free" }, [el("option", { value: "" }, ["— " + t("mis.free.none")])].concat(stratNames.sort().map(n => el("option", { value: n }, [n]))));
    freeSel.value = draft.free_stratagems[0] || "";
    freeSel.onchange = () => { draft.free_stratagems = freeSel.value ? [freeSel.value] : []; };
    body.appendChild(el("div", { class: "blk field" }, [el("label", { class: "label", for: "m-free" }, [t("mis.free.label")]), freeSel,
      el("div", { class: "hint" }, [t("mis.free.hint")])]));

    // WARMIND thinks: the AI planner on top of the engine (on unless turned off)
    if (draft.think === undefined) draft.think = true;
    const thinkSeg = el("div", { class: "seg", role: "group", "aria-label": t("mis.think.label") });
    [[true, t("mis.think.on")], [false, t("mis.think.off")]].forEach(([v, label]) => {
      const b = el("button", { type: "button", "aria-pressed": String(draft.think === v) }, [label]);
      b.onclick = () => { draft.think = v; thinkSeg.querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", String(x === b))); };
      thinkSeg.appendChild(b);
    });
    body.appendChild(el("div", { class: "blk" }, [el("span", { class: "label" }, ["◈ " + t("mis.think.label")]), thinkSeg,
      el("div", { class: "hint" }, [t("mis.think.hint")])]));

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
        draft.lang = LANG;   // the planner writes its reasons in the creator's language
        const req = jpost("/api/lobby/" + LID + "/mission", { mission: draft }, store.creator(LID));
        STATE = STATE && STATE.directive ? await regenScreen(req, 1500) : await req;
        lastSig = JSON.stringify(STATE); renderLive(); d.open = false;
        d.querySelector("summary").textContent = t("mis.edit"); d.classList.remove("attn");
        toast(STATE.directive ? t("toast.mission_changed") : t("mis.saved.wait"));
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
  // suggested swaps: a callout on the loadouts, a confirm dialog to apply, a way back
  function lockedRoles() {
    const r = (STATE.mission && STATE.mission.roles) || {};
    const rows = Object.keys(r).map(pid => { const p = STATE.players.find(x => x.id === pid); return p ? p.callsign + " → " + r[pid].replace(/_/g, " ") : null; }).filter(Boolean);
    return rows.length ? rows : null;
  }
  function lockedLine(rows) {
    const kids = [el("span", {}, [t("swap.locked", { list: rows.join(", ") })])];
    if (isCreator()) {
      const b = el("button", { class: "btn sm", type: "button" }, ["↺ " + t("swap.reset")]);
      b.onclick = () => applyRoles({ reset: true });
      kids.push(" ", b);
    }
    return el("div", { class: "hint swaplock" }, kids);
  }
  function swapCallout(d) {
    if (!isCreator() || !d.swaps || !d.swaps.length) return null;
    const b = el("button", { class: "btn sm primary", type: "button" }, ["⇄ " + t("swap.review")]);
    b.onclick = () => openSwaps(d.swaps);
    return el("div", { class: "mind swapcall" }, [el("span", {}, [t("swap.callout", { n: d.swaps.length })]), " ", b]);
  }
  async function applyRoles(body) {
    if (busy) return; busy = true;
    try { STATE = await regenScreen(jpost("/api/lobby/" + LID + "/roles", body, store.creator(LID)), 1200); lastSig = JSON.stringify(STATE); renderLive(); toast(t("toast.swapped")); }
    catch (e) { toast(e.message); } finally { busy = false; }
  }
  function openSwaps(list) {
    const dlg = el("dialog", { class: "modal swapmodal", "aria-label": t("swap.modal.t") });
    const boxes = list.map(s => {
      const cb = el("input", { type: "checkbox", checked: "" }); cb.checked = true;
      return [s, cb, el("label", { class: "swaprow" }, [cb, el("span", {}, [el("b", {}, [s.callsign]), ": " + s.from_role + " → ", el("b", {}, [s.to_role]),
        el("small", {}, [t("swap.why", { to: s.to_role, callsign: s.callsign, from: s.from_role })])])])];
    });
    const go = el("button", { type: "button", class: "btn primary" }, ["⇄ " + t("swap.modal.go")]);
    const keep = el("button", { type: "button", class: "btn" }, [t("swap.modal.keep")]);
    go.onclick = () => {
      const roles = {}; boxes.forEach(([s, cb]) => { if (cb.checked) roles[s.player_id] = s.to_role.replace(/ /g, "_"); });
      dlg.close(); if (Object.keys(roles).length) applyRoles({ roles: roles });
    };
    keep.onclick = () => dlg.close();
    dlg.append(el("div", { class: "mhead" }, [el("b", {}, [t("swap.modal.t")])]),
      el("div", { class: "mbody" }, [el("div", { class: "hint", style: "margin:0 0 10px" }, [t("swap.modal.d")])].concat(boxes.map(x => x[2]))),
      el("div", { class: "mfoot" }, [el("div", { class: "btnrow", style: "margin:0" }, [go, keep])]));
    dlg.addEventListener("close", () => dlg.remove());
    document.body.appendChild(dlg);
    dlg.showModal ? dlg.showModal() : dlg.setAttribute("open", "");
  }

  // WARMIND's planner: thinking → its plan (checked by the engine) → or why it didn't land
  function mindBanner(m) {
    if (!m || m.status === "off") return null;
    if (m.status === "ready") return el("details", { class: "mind ready fold" }, [
      el("summary", {}, ["◈ " + t("mind.ready.short")]),
      el("div", { class: "body" }, [m.summary ? el("div", {}, [m.summary]) : null,
        el("div", { class: "hint", style: "margin:4px 0 0" }, [t("mind.ready.checked", { a: m.kept || 0, b: m.total || 0 })])])]);
    if (m.status === "engine") return el("div", { class: "mind off" }, [el("b", {}, ["◈ "]), t("mind.engine")]);
    if (m.status === "thinking") {
      const clock = el("span", { class: "met" }, ["T+", nixie(metText(m.since || Date.now() / 1000).slice(3))]);
      const tm = setInterval(() => { if (!clock.isConnected) return clearInterval(tm); clock.lastChild.replaceWith(nixie(metText(m.since || Date.now() / 1000).slice(3))); }, 1000);
      return el("div", { class: "mind thinking", role: "status" }, [
        el("span", { class: "spin", "aria-hidden": "true" }), el("b", {}, ["◈ " + t("mind.thinking.t")]), " ", clock, el("div", {}, [t("mind.thinking")]),
        el("div", { class: "hint", style: "margin:4px 0 0" }, [t("mind.thinking.eta")])]);
    }
    if (m.status === "ready") return el("div", { class: "mind ready" }, [
      el("div", {}, [el("b", {}, ["◈ " + t("mind.ready.t")]), " ", m.summary || ""]),
      el("div", { class: "hint", style: "margin:4px 0 0" }, [t("mind.ready.checked", { a: m.kept || 0, b: m.total || 0 })])]);
    return el("div", { class: "mind off" }, [el("b", {}, ["◈ "]), t(m.status === "budget" ? "mind.budget" : "mind.failed")]);
  }

  const isBuilding = () => !!(STATE && STATE.directive && STATE.directive.mind && STATE.directive.mind.status === "thinking");
  function buildingPanel(m) {
    const clock = el("span", { class: "met" }, ["T+", nixie(metText(m.since || Date.now() / 1000).slice(3))]);
    const line = el("div", { class: "upstatus working", style: "display:flex" });
    const stop = workTicker(line, lines("tick.gen.", 6));
    const tm = setInterval(() => { if (!clock.isConnected) { clearInterval(tm); stop(); return; } clock.lastChild.replaceWith(nixie(metText(m.since || Date.now() / 1000).slice(3))); }, 1000);
    return panel(t("roster.pid"), t("mind.build.t"), { status: "◈", statusKind: "warn", tone: "amber" }, [
      el("div", { class: "building" }, [el("div", { class: "hex", "aria-hidden": "true" }, ["⬡"]), clock]),
      el("div", { class: "hint", style: "margin:10px 0" }, [t("mind.build")]), line,
      el("div", { class: "hint" }, [t("mind.build.eta")])]);
  }
  function briefing() {
    const d = STATE.directive, r = STATE.readiness || {};
    if (d && isBuilding()) return [buildingPanel(d.mind)];   // one good set per diver, shown once it's ready
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

    // the front: how this faction's spawners die, and who in the squad kills them / the heavies / the chaff
    if (d.front) {
      const f = d.front, who = list => list.length ? list.join(", ") : t("front.nobody");
      const row = (ic, label, val, bad) => el("div", { class: "frow" + (bad ? " gap" : "") }, [el("span", { class: "ic" }, [ic]), el("b", {}, [label]), el("span", {}, [val])]);
      out.push(sub("plan", panel(t("front.pid"), t("front.title", { name: t("front.name." + f.structure) }), {}, [
        el("div", { class: "hint", style: "margin:0 0 8px" }, [t("front.how." + f.faction)]),
        el("div", { class: "hint", style: "margin:0 0 12px" }, [t("front.ranged." + f.faction)]),
        row("✹", t("front.closers"), f.closers.length ? f.closers.map(c => c.callsign + " (" + c.item + ")").join(", ") : t("front.nobody"), f.closers.length < Math.min(2, STATE.players.length)),
        row("⛨", t("front.at") + " · " + f.heavies, who(f.at), !f.at.length),
        row("≋", t("front.chaff") + " · " + f.chaff_names, who(f.chaff), !f.chaff.length),
      ])));
    }

    // doctrine (e.g. Commando)
    if (d.doctrine) {
      const k = d.doctrine.kind, orders = d.doctrine.orders || [];
      const ol = el("ol", { class: "orders" }, orders.map((o, i) => el("li", {}, [has("doctrine." + k + "." + (i + 1)) ? t("doctrine." + k + "." + (i + 1)) : o])));
      out.push(sub("plan", panel(t("doc.pid"), has("doctrine." + k + ".title") ? t("doctrine." + k + ".title") : d.doctrine.title, { status: k, statusKind: "info" }, [ol])));
    }

    // mission-coverage swaps: the creator can apply them (one, or several through a confirm dialog)
    const locked = lockedRoles();
    if ((d.swaps && d.swaps.length) || locked) {
      const kids = [el("div", { class: "hint", style: "margin:0 0 10px" }, [t("swap.hint")])].concat(
        (d.swaps || []).map(s => el("div", { class: "swap" }, [
          el("div", { class: "mv" }, [s.callsign + ": ", el("b", {}, [s.from_role]), " → ", el("b", {}, [s.to_role])]),
          el("div", { class: "why" }, [t("swap.why", { to: s.to_role, callsign: s.callsign, from: s.from_role })]),
          isCreator() ? el("div", { class: "btnrow", style: "margin:6px 0 0" }, [(() => {
            const b = el("button", { class: "btn sm", type: "button" }, ["⇄ " + t("swap.apply")]); b.onclick = () => openSwaps([s]); return b; })()]) : null,
        ])));
      if (isCreator() && d.swaps && d.swaps.length > 1) {
        const all = el("button", { class: "btn primary sm", type: "button" }, ["⇄ " + t("swap.apply_all")]); all.onclick = () => openSwaps(d.swaps);
        kids.push(el("div", { class: "btnrow" }, [all]));
      }
      if (locked) kids.push(lockedLine(locked));
      out.push(sub("review", panel(t("swap.pid"), t("swap.title"), { tone: "amber" }, kids)));
    }

    // loadouts
    const roster = el("div", { class: "roster" }); const me = meRec();
    const fillRoster = () => { roster.innerHTML = ""; STATE.players.slice().sort((a, b) => (me && b.id === me.id) - (me && a.id === me.id)).forEach(p => roster.appendChild(diverCard(p, me && me.id === p.id, false))); };   // your own kit first
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
    // reroll sits up top beside the view switch (no scrolling past four cards to find it)
    let rb = null;
    if (isCreator()) {
      rb = el("button", { class: "btn sm", type: "button", title: t("roster.reroll.hint") }, ["⟳ " + t("roster.reroll")]);
      rb.onclick = async () => {
        if (busy) return; busy = true; rb.disabled = true;
        try { STATE = await regenScreen(jpost("/api/lobby/" + LID + "/reroll", {}, store.creator(LID)), 1200); lastSig = JSON.stringify(STATE); renderLive(); toast(t("toast.rerolled"));
          const r0 = document.querySelector(".roster"); if (r0) r0.scrollIntoView({ block: "start" }); }
        catch (e) { toast(e.message); } finally { busy = false; rb.disabled = false; }
      };
    }
    const n = STATE.reroll || 0;
    const rkids = [swapCallout(d), mindBanner(d.mind), el("div", { class: "kvrow" }, [viewSeg, rb]),
      n ? el("div", { class: "hint rerolln" }, ["⟳ " + t("why.reroll", { n: n })]) : (rb ? el("div", { class: "hint" }, [t("roster.reroll.hint")]) : null),
      roster].filter(Boolean);
    out.push(sub("loadouts", panel(t("roster.pid"), t("roster.title"), { status: t("rdy.briefed"), statusKind: "ok" }, rkids)));

    // squad review: redundancy + impact, each line with its research sources
    if (d.review && d.review.length) {
      const host = u => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch (e) { return u; } };
      const lines = el("ul", { class: "review" }, d.review.map(r => el("li", { class: r.status }, [
        el("span", { class: "st" }, [r.status === "ok" ? "✓" : r.status === "fixed" ? "⟳" : "!"]),
        el("span", { class: "tx" }, [
          has(r.k) ? t(r.k, r.k === "rev.chk.closers" ? Object.assign({}, r.p, { s: t("front.name." + r.p.s) }) : r.p) : r.k,
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
    if (d.compass) {
      const pts = STATE.players.filter(p => p.assignment && p.assignment.compass).map(p => Object.assign({ label: p.callsign, color: p.accent }, p.assignment.compass));
      pts.push(Object.assign({ squad: true }, d.compass));
      blocks.push(el("div", {}, [el("div", { class: "sub-h" }, [t("cmp.title")]), el("div", { class: "cbig" }, [compassSvg(pts, 220, true)]),
        el("div", { class: "hint" }, [t("cmp.squad", { w: compassWord(d.compass) }) + " " + t("cmp.hint")])]));
    }
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
    const eff = !a.armor_passive ? null : has(pkey) ? t(pkey) : META.passives && META.passives[a.armor_passive];
    const armor = el("div", { class: "armorfig" }, [
      el("span", { class: "lab" }, [t("card.armor")]), el("div", { class: "pv" }, [pic(a.armor, "img")]),
      el("div", { class: "nm" }, [wk(a.armor)]),
      a.armor_weight || a.armor_passive ? el("div", { class: "ps", title: eff || "" }, [[has("w." + a.armor_weight) ? t("w." + a.armor_weight) : a.armor_weight, a.armor_passive].filter(Boolean).join(" · ")]) : null,
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
                     growth: "↗", thin: "⚠", nostats: "ⓘ", reroll: "⟳", mind: "◈", ask: "⚑", drill: "⚔" };
  function whyLine(w) {
    const p = Object.assign({}, w.p || {});
    if (w.k === "why.mind") return p.t || "";   // WARMIND's planner, already in the squad's language
    if (w.k === "why.worn") return t(p.why && has(p.why) ? "why.worn.pays" : "why.worn", { armor: p.armor, passive: p.passive, why: p.why && has(p.why) ? t(p.why) : "" });
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
    a.why.forEach(w => { if (w.kind === "reroll") return;   // said once above the cards
      const line = whyLine(w); if (line) rows.push([w.kind, line]); });
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
      el("div", { class: "meta" }, [el("span", { class: "cs" }, [p.callsign]), "·", t("card.style", { style: styleLabel(p.play_style) }),
        mine ? tag("amber", t("common.you")) : null, medal ? tag("amber", "🎖 " + medal.id) : null]),
      a && a.compass ? el("div", { class: "cmini", title: t("cmp.title") }, [compassSvg([Object.assign({ color: p.accent }, a.compass)], 44, false), el("small", {}, [compassWord(a.compass)])]) : null,
      a && mine && store.locker() ? (() => {   // "I want to wear my armour": keep this set from now on, or let WARMIND pick again
        const worn = (a.why || []).some(w => w.k === "why.worn");
        const b = el("button", { class: "btn sm", type: "button" }, [worn ? "📌 " + t("arm.wearing", { armor: a.armor }) + " · " + t("arm.release") : "📌 " + t("arm.keep", { armor: a.armor })]);
        b.onclick = async () => { b.disabled = true; try { await setWorn(worn ? "" : a.armor); STATE = await api("/api/lobby/" + LID); lastSig = JSON.stringify(STATE); renderLive();
          toast(worn ? t("arm.cleared") : t("arm.saved", { armor: a.armor })); } catch (e) { toast(e.message); b.disabled = false; } };
        return el("div", { class: "wornrow" }, [b]); })() : null,
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
    // a thin axis is fine only if a teammate holds it: say which, and flag the ones nobody does
    const mtx = (STATE.directive && STATE.directive.matrix) || {};
    if (a.thin_axes && a.thin_axes.length) {
      const held = a.thin_axes.filter(x => (mtx[x] || []).some(r => r !== a.role)), open = a.thin_axes.filter(x => !held.includes(x));
      if (held.length) card.appendChild(el("div", { class: "thin" }, [t("card.thin", { list: held.map(x => t("axis." + x)).join(", ") })]));
      if (open.length) card.appendChild(el("div", { class: "thin open" }, [t("card.thin.open", { list: open.map(x => t("axis." + x)).join(", ") })]));
    } else if (a.thin && a.thin.length) card.appendChild(el("div", { class: "thin" }, [t("card.thin", { list: a.thin.join(", ") })]));
    card.appendChild(a.why && a.why.length ? whyKit(p, a) : el("div", { class: "why" }, [
      (a.rationale_parts || []).map(x => tp(x, "")).filter(Boolean).join(" ") || a.rationale]));
    if (mine && store.locker()) {   // keep this kit for reference
      const sv = el("button", { class: "btn sm", type: "button" }, ["🗄 " + t("lk.save")]);
      sv.onclick = () => saveKitDialog(a);
      card.appendChild(el("div", { class: "btnrow" }, [sv]));
    }
    return card;
  }

  // ======================================================================= locker
  // A diver's own page across war tables: stat history, record + medals, saved loadouts, gear.
  function missionLabel() {
    const m = STATE && STATE.mission, md = m && (META.missions || []).find(x => x.id === m.mission_id);
    return md ? (md.name || md.display_name || "") : "";
  }
  function saveKitDialog(a) {
    const def = [missionLabel(), a.role].filter(Boolean).join(" · ") || t("lk.loadout");
    const name = el("input", { type: "text", maxlength: "40", value: def });
    const note = el("textarea", { rows: "3", maxlength: "400", placeholder: t("lk.note.ph") });
    const go = el("button", { type: "button", class: "btn primary" }, ["🗄 " + t("lk.save")]);
    const no = el("button", { type: "button", class: "btn" }, [t("fb.cancel")]);
    const dlg = el("dialog", { class: "modal", "aria-label": t("lk.save") });
    go.onclick = async () => {
      go.disabled = true;
      const m = (STATE && STATE.mission) || {};
      try {
        await lpost("/api/locker/" + store.locker().id + "/loadouts", { name: name.value, note: note.value,
          kit: { role: a.role, primary: a.primary, secondary: a.secondary, grenade: a.grenade, armor: a.armor, booster: a.booster, stratagems: a.stratagems },
          source: { lobby_id: LID || "", mission: missionLabel(), mode: m.mode || "", faction: m.faction || "", difficulty: String(m.difficulty || "") } });
        dlg.close(); toast(t("lk.saved"));
      } catch (e) { toast(e.message); go.disabled = false; }
    };
    no.onclick = () => dlg.close();
    dlg.append(el("div", { class: "mhead" }, [el("b", {}, [t("lk.save")])]),
      el("div", { class: "mbody" }, [el("span", { class: "label" }, [t("lk.name")]), name, el("span", { class: "label" }, [t("lk.note")]), note]),
      el("div", { class: "mfoot" }, [el("div", { class: "btnrow", style: "margin:0" }, [go, no])]));
    dlg.addEventListener("close", () => dlg.remove());
    document.body.appendChild(dlg); dlg.showModal ? dlg.showModal() : dlg.setAttribute("open", ""); name.select();
  }
  function lockerLine() {
    const href = "/?locker&from=" + encodeURIComponent(LID || "");
    const a = el("a", { class: "btn sm primary", href: href }, ["🗄 " + t("lk.open")]);
    a.onclick = e => { if (!gearDirty()) return; e.preventDefault(); guardGear(() => { location.href = href; }); };
    return el("div", { class: "lkline" }, [el("span", {}, [t("lk.line")]), a]);
  }
  // Home, first thing: set your profile (callsign → locker), or a welcome back with it
  function profilePanel() {
    const L = store.locker();
    if (L) {
      const box = el("div", { class: "welcome" }, [el("span", { class: "hint", style: "margin:0" }, [t("home.loading")])]);
      lget("/api/locker/" + L.id).then(lk => {
        box.innerHTML = "";
        box.append(el("div", {}, [el("div", { class: "label", style: "margin:0" }, [t("prof.welcome")]), el("div", { class: "big" }, [lk.callsign || "—"]),
          lk.play_style ? el("div", { class: "hint", style: "margin:2px 0 0" }, [styleLabel(lk.play_style)]) : null]),
          el("div", { class: "btnrow", style: "margin:0" }, [el("a", { class: "btn sm primary", href: "/?locker" }, ["🗄 " + t("lk.open")]),
            el("a", { class: "btn sm", href: "/?roster" }, ["☰ " + t("ros.open")]),
            (() => { const b = el("button", { class: "btn sm", type: "button" }, [t("prof.signout")]); b.onclick = signOut; return b; })()]));
        if (!lk.has_pin) box.appendChild(pinSetter(L));
        try { const nw = sessionStorage.getItem("wm_chat_new"); if (nw) { sessionStorage.removeItem("wm_chat_new"); profileChat(nw, {}, null); } } catch (e) {}
      }).catch(() => { box.innerHTML = ""; box.appendChild(el("a", { class: "btn sm", href: "/?locker" }, ["🗄 " + t("lk.open")])); });
      return panel("SYS-P", t("prof.title"), {}, [box]);
    }
    const cs = el("input", { type: "text", maxlength: "24", placeholder: t("lk.callsign.ph"), autocomplete: "off", id: "prof-cs" });
    const up = fileBtn("", t("prof.upload"), true);
    let files = [];
    const picked = el("span", { class: "hint", style: "margin:0" });
    up.querySelector("input").onchange = ev => { files = Array.from(ev.target.files || []); picked.textContent = files.length ? "✓ " + t("prof.picked", { n: files.length }) : ""; };
    const go = el("button", { class: "btn primary", type: "button" }, ["➤ " + t("prof.go")]);
    const status = el("div", { class: "upstatus", role: "status", "aria-live": "polite" });
    go.onclick = async () => {
      const v = cs.value.trim(); if (!v) { cs.focus(); toast(t("prof.need")); return; }
      go.disabled = true;
      try {
        const r = await jpost("/api/locker", { callsign: v }); store.setLocker({ id: r.locker_id, key: r.locker_key });
        if (files.length) { const stop = workTicker(status, lines("tick.read.", 10)); try { const fd = new FormData(); files.forEach(f => fd.append("images", f)); await lfd("/api/locker/" + r.locker_id + "/career", fd); } finally { stop(); } }
        toast(t("prof.done", { name: v })); renderHome(); profileChat(v, {}, null);
      } catch (e) { toast(e.message); go.disabled = false; }
    };
    cs.addEventListener("keydown", e => { if (e.key === "Enter") go.click(); });
    return panel("SYS-P", t("prof.title"), { tone: "amber" }, [
      el("div", { class: "hint", style: "margin:0 0 10px" }, [t("prof.hint")]),
      el("div", { class: "field" }, [el("label", { class: "label", for: "prof-cs" }, [t("me.callsign")]), cs]),
      el("div", { class: "btnrow" }, [go, up]), picked, status,
      el("div", { class: "hint" }, [t("prof.later")]),
    ]);
  }

  // ---- the Profile tab: whoever is signed in on this device
  async function profilePane(pane) {
    const L = store.locker(); if (!L) return;
    const body = el("div", { class: "stack" }, [el("div", { class: "hint" }, [t("home.loading")])]);
    pane.appendChild(body);
    try { LK = await lget("/api/locker/" + L.id); } catch (e) { body.innerHTML = ""; body.appendChild(el("div", { class: "alert" }, [e.message])); return; }
    body.innerHTML = "";
    const out = el("button", { class: "btn sm", type: "button" }, [t("prof.signout")]); out.onclick = signOut;
    const link = el("button", { class: "btn sm", type: "button" }, ["🔗 " + t("lk.copylink")]); link.onclick = () => copy(location.origin + "/?locker#locker=" + L.id + "." + L.key, t("lk.device.copied"));
    const tune = el("button", { class: "btn sm", type: "button" }, ["◈ " + t("pq.tune")]); tune.onclick = () => profileChat(LK.callsign, LK.prefs, () => renderHome());
    const arm = armorSelect((LK.prefs || {}).armor_set, null, null);
    arm.onchange = async () => { try { await setWorn(arm.value); toast(arm.value ? t("arm.saved", { armor: arm.value }) : t("arm.cleared")); } catch (e) { toast(e.message); } };
    body.appendChild(panel("ME-01", t("prof.title"), { status: LK.medals.length ? "🎖 " + LK.medals.length : "", statusKind: "warn", tone: "amber" }, [
      el("div", { class: "lkhead" }, [el("div", {}, [el("div", { class: "big" }, [LK.callsign || "—"]),
        el("div", { class: "hint", style: "margin:4px 0 0" }, [LK.play_style ? t("lk.style", { style: styleLabel(LK.play_style) }) : t("me.noread")])])]),
      LK.has_pin ? null : pinSetter(L),
      el("div", { class: "prefline" }, [el("span", { class: "label", style: "margin:0" }, ["◈ " + t("pq.told")]), el("span", {}, [prefSummary(LK.prefs) || t("pq.nothing")]), tune]),
      el("div", { class: "field", style: "margin-top:10px" }, [el("span", { class: "label" }, ["📌 " + t("arm.pick")]), arm]),
      el("div", { class: "btnrow" }, [el("a", { class: "btn sm primary", href: "/?locker" }, ["🗄 " + t("lk.open")]), link, out]),
    ]));
    const car = lkCarousel(LK.loadouts, { editable: true, after: async () => { const y = window.scrollY; await renderHome(); window.scrollTo(0, y); } }); if (car) body.appendChild(car);
    body.appendChild(lkStats());
    body.appendChild(lkRecord());
    try { const nw = sessionStorage.getItem("wm_chat_new"); if (nw) { sessionStorage.removeItem("wm_chat_new"); profileChat(nw, {}, null); } } catch (e) {}
  }

  function pinSetter(L) {
    const pin = el("input", { type: "password", maxlength: "8", inputmode: "numeric", placeholder: "••••", "aria-label": t("gate.pin") });
    const b = el("button", { class: "btn sm primary", type: "button" }, ["🔒 " + t("prof.setpin")]);
    b.onclick = async () => { if (!/^[0-9]{4,8}$/.test(pin.value)) { pin.focus(); toast(t("gate.pin.need")); return; }
      try { await lpost("/api/locker/" + L.id + "/pin", { pin: pin.value }); toast(t("prof.pin.saved")); wrap.remove(); } catch (e) { toast(e.message); } };
    const wrap = el("div", { class: "pinset" }, [el("div", { class: "hint", style: "margin:0 0 6px" }, [t("prof.nopin")]), el("div", { class: "joincode pinrow" }, [pin, b])]);
    return wrap;
  }

  function lockerHomePanel() {
    const L = store.locker();
    const b = el("a", { class: "btn primary", href: "/?locker" }, ["🗄 " + t(L ? "lk.open" : "lk.create")]);
    if (!L) b.onclick = async e => { e.preventDefault(); try { const r = await jpost("/api/locker", {}); store.setLocker({ id: r.locker_id, key: r.locker_key }); location.href = "/?locker"; } catch (er) { toast(er.message); } };
    return panel("SYS-L", t("lk.title"), {}, [el("div", { class: "hint", style: "margin:0 0 10px" }, [t("lk.home.hint")]), el("div", { class: "btnrow", style: "margin:0" }, [b])]);
  }

  let lkEdit = false;
  let LK = null, lkTab = (() => { try { return localStorage.getItem("wm_lktab") || "stats"; } catch (e) { return "stats"; } })();
  async function loadLocker() {
    const L = store.locker();
    LK = await lget("/api/locker/" + L.id);
    paintLocker();
  }
  async function renderLocker() {
    app.innerHTML = ""; app.className = "stack";
    const L = store.locker();
    if (!L) {
      app.appendChild(lockerHomePanel());
      app.appendChild(el("div", { class: "btnrow", style: "justify-content:center" }, [el("a", { class: "btn sm", href: "/" }, [t("cmd.home")])]));
      return;
    }
    app.appendChild(el("div", { class: "hint" }, [t("home.loading")]));
    try { await loadLocker(); }
    catch (e) {
      app.innerHTML = "";
      app.appendChild(panel("ERR", t("lk.title"), { tone: "red" }, [el("div", { class: "hint" }, [t("lk.missing")]),
        el("div", { class: "btnrow" }, [(() => { const b = el("button", { class: "btn", type: "button" }, [t("lk.create")]);
          b.onclick = async () => { const r = await jpost("/api/locker", {}); store.setLocker({ id: r.locker_id, key: r.locker_key }); renderLocker(); }; return b; })()])]));
    }
  }
  const dt = ts => new Date(ts * 1000).toLocaleDateString(LANG, { month: "short", day: "numeric", year: "numeric" });
  function paintLocker() {
    if (!LK) return;
    const y = window.scrollY;
    app.innerHTML = ""; app.className = "stack";
    const L = store.locker();
    // header: the callsign as the title; the name field only in edit mode (or while there's no name yet)
    const editing = lkEdit || !LK.callsign;
    const nameIn = el("input", { type: "text", maxlength: "24", value: LK.callsign || "", placeholder: t("lk.callsign.ph"), autocomplete: "off" });
    const nameBtn = el("button", { class: "btn sm primary", type: "button" }, ["✓ " + t("lk.savename")]);
    nameBtn.onclick = async () => { const v = nameIn.value.trim(); if (!v) { nameIn.focus(); return; } try { await lpost("/api/locker/" + L.id + "/callsign", { callsign: v }); lkEdit = false; toast(t("toast.renamed")); await loadLocker(); } catch (e) { toast(e.message); } };
    nameIn.onkeydown = e => { if (e.key === "Enter") nameBtn.click(); if (e.key === "Escape" && LK.callsign) { lkEdit = false; paintLocker(); } };
    const cancel = el("button", { class: "btn sm", type: "button" }, [t("fb.cancel")]);
    cancel.onclick = () => { lkEdit = false; paintLocker(); };
    const editBtn = el("button", { class: "btn sm", type: "button" }, ["✎ " + t("lk.edit")]);
    editBtn.onclick = () => { lkEdit = true; paintLocker(); };
    const up = fileBtn("", t("me.upload_new"), true);
    const status = el("div", { class: "upstatus", role: "status", "aria-live": "polite" });
    up.querySelector("input").onchange = async ev => {
      const list = Array.from(ev.target.files || []); if (!list.length || busy) return;
      busy = true; const stop = workTicker(status, lines("tick.read.", 10));
      try { const fd = new FormData(); list.forEach(f => fd.append("images", f)); const r = await lfd("/api/locker/" + L.id + "/career", fd); stop();
        if (r.ok === false) setStatus(status, "warn", r.over_budget ? r.vision_error : t("me.reread.bad")); else { toast(t("lk.stats.saved")); busy = false; await loadLocker(); } }
      catch (e) { stop(); setStatus(status, "err", e.message); } finally { stop(); busy = false; }
    };
    const dev = el("button", { class: "btn sm", type: "button" }, ["🔗 " + t("lk.copylink")]);
    dev.onclick = () => copy(location.origin + "/?locker#locker=" + L.id + "." + L.key, t("lk.device.copied"));
    // way out: back to the war table you came from, or the home page
    const go = href => e => { if (!gearDirty()) return; e.preventDefault(); guardGear(() => { location.href = href; }); };
    let last = null; try { last = JSON.parse(localStorage.getItem("wm_last_lobby")); } catch (e) {}
    const from = new URLSearchParams(location.search).get("from") || (last && last.id);
    const nav = el("div", { class: "lknav" });
    if (from) { const a = el("a", { class: "btn primary sm", href: "/?l=" + from }, ["← " + t("lk.back", { name: (last && last.id === from && last.name) || from })]); a.onclick = go("/?l=" + from); nav.appendChild(a); }
    const hm = el("a", { class: "btn sm", href: "/" }, ["⌂ " + t("lk.homepage")]); hm.onclick = go("/"); nav.appendChild(hm);
    app.appendChild(nav);
    const home = el("a", { class: "btn sm", href: "/" }, [t("cmd.home")]);
    home.onclick = go("/");
    const head = editing
      ? el("div", { class: "grid2", style: "align-items:end" }, [el("div", { class: "field" }, [el("span", { class: "label" }, [t("me.callsign")]), nameIn]),
          el("div", { class: "field" }, [el("div", { class: "btnrow", style: "margin:0" }, LK.callsign ? [nameBtn, cancel] : [nameBtn])])])
      : el("div", { class: "lkhead" }, [el("div", {}, [el("div", { class: "big" }, [LK.callsign]),
          el("div", { class: "hint", style: "margin:4px 0 0" }, [LK.play_style ? t("lk.style", { style: styleLabel(LK.play_style) }) : t("me.noread")])]), editBtn]);
    app.appendChild(panel("LKR-01", t("lk.title"), { status: LK.medals.length ? "🎖 " + LK.medals.length : "", statusKind: "warn", tone: "amber" }, [
      head,
      el("div", { class: "btnrow" }, [up, dev]), status,
      el("div", { class: "prefline" }, [el("span", { class: "label", style: "margin:0" }, ["◈ " + t("pq.told")]),
        el("span", {}, [prefSummary(LK.prefs) || t("pq.nothing")]),
        (() => { const sel = armorSelect((LK.prefs || {}).armor_set, null, null);
          sel.onchange = async () => { try { await setWorn(sel.value); LK.prefs = Object.assign({}, LK.prefs, { armor_set: sel.value || undefined }); toast(sel.value ? t("arm.saved", { armor: sel.value }) : t("arm.cleared")); } catch (e) { toast(e.message); } };
          return el("div", { class: "field", style: "flex:1 1 100%;margin:6px 0 0" }, [el("span", { class: "label" }, ["📌 " + t("arm.pick")]), sel, el("div", { class: "hint", style: "margin:4px 0 0" }, [t("arm.hint")])]); })(),
        (() => { const b = el("button", { class: "btn sm", type: "button" }, ["◈ " + t("pq.tune")]); b.onclick = () => profileChat(LK.callsign, LK.prefs, p => { LK.prefs = p; paintLocker(); }); return b; })()]),
      el("div", { class: "hint" }, [t("lk.private")]),
      (() => {   // the open roster: listed unless you opt out
        const seg = el("div", { class: "seg", role: "group", "aria-label": t("ros.show") });
        [[true, t("mis.think.on")], [false, t("mis.think.off")]].forEach(([v, label]) => {
          const b = el("button", { type: "button", "aria-pressed": String(LK.public === v) }, [label]);
          b.onclick = async () => { try { await lpost("/api/locker/" + L.id + "/visibility", { public: v }); LK.public = v; seg.querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", String(x === b))); toast(t(v ? "ros.shown" : "ros.hidden")); } catch (e) { toast(e.message); } };
          seg.appendChild(b);
        });
        return el("div", { class: "field", style: "margin-top:12px" }, [el("span", { class: "label" }, ["☰ " + t("ros.show")]), seg,
          el("div", { class: "hint" }, [t("ros.show.hint")]), el("a", { class: "btn sm", href: "/?roster", style: "margin-top:8px" }, ["☰ " + t("ros.open")])]);
      })(),
    ]));
    if (editing && !LK.callsign) setTimeout(() => nameIn.focus(), 0);
    // up top: a carousel of saved loadouts, then the stats
    app.appendChild(lkCarousel(null, { editable: true }));
    app.appendChild(lkStats());
    // sub-tabs
    const tabs = [["record", t("lk.tab.record") + (LK.medals.length ? " 🎖" + LK.medals.length : "")],
      ["loadouts", t("lk.tab.loadouts") + " " + LK.loadouts.length], ["gear", t("lk.tab.gear")]];
    const bar = el("div", { class: "seg subtabs", role: "tablist" });
    const body = el("div");
    const show = k => {
      lkTab = k; try { localStorage.setItem("wm_lktab", k); } catch (e) {}
      bar.querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.k === k)));
      body.innerHTML = ""; body.appendChild(({ record: lkRecord, loadouts: lkLoadouts, gear: lkGear })[k]());
    };
    tabs.forEach(([k, label]) => { const b = el("button", { type: "button", "data-k": k }, [label]); b.onclick = () => guardGear(() => show(k)); bar.appendChild(b); });
    app.appendChild(bar); app.appendChild(body);
    show(tabs.some(x => x[0] === lkTab) ? lkTab : "record");
    window.scrollTo(0, y);
  }
  function lkCarousel(list, opts) {
    opts = opts || {};
    const L = list || LK.loadouts || [];
    if (!L.length && opts.readonly) return null;
    if (!L.length) {
      const b = el("button", { class: "btn primary sm", type: "button" }, ["＋ " + t("lk.new")]); b.onclick = () => buildKitDialog(null, opts.after);
      return panel("LKR-00", t("lk.tab.loadouts"), {}, [el("div", { class: "hint", style: "margin:0 0 10px" }, [t("lk.loadouts.none")]), el("div", { class: "btnrow", style: "margin:0" }, [b])]);
    }
    const track = el("div", { class: "lkcar", tabindex: "0", "aria-label": t("lk.tab.loadouts") });
    L.forEach(o => {
      const src = o.source || {};
      const card = el("article", { class: "dcard lkslide" }); card.style.setProperty("--acc", "#ff9a3c");
      card.appendChild(el("div", { class: "hd" }, [el("div", { class: "role" }, [o.kit.role || o.name]),
        el("div", { class: "meta" }, [o.kit.role && o.name !== o.kit.role ? el("span", { class: "cs" }, [o.name]) : null,
          [src.mission, src.mode ? t("mode." + src.mode) : ""].filter(Boolean).map(x => " · " + x).join("")])]));
      card.appendChild(locker(o.kit));
      if (o.note) card.appendChild(el("div", { class: "why" }, [o.note]));
      if (opts.editable) {
        const after = opts.after || loadLocker;
        const ed = el("button", { class: "btn sm", type: "button" }, [t("lk.edit")]); ed.onclick = () => buildKitDialog(o, after);
        const del = el("button", { class: "btn sm red", type: "button" }, [t("lk.delete")]);
        del.onclick = async () => { if (!confirm(t("lk.delete.confirm", { name: o.name }))) return;
          try { await lpost("/api/locker/" + store.locker().id + "/loadouts/" + o.id + "/delete", {}); toast(t("lk.deleted")); await after(); } catch (e) { toast(e.message); } };
        card.appendChild(el("div", { class: "btnrow lkacts" }, [ed, del]));
      }
      track.appendChild(card);
    });
    const count = el("span", { class: "lkcount" }, ["1 / " + L.length]);
    const step = d => { const w = (track.firstElementChild || {}).offsetWidth || 300; track.scrollBy({ left: d * (w + 12), behavior: "smooth" }); };
    const prev = el("button", { class: "btn sm", type: "button", "aria-label": "‹" }, ["‹"]); prev.onclick = () => step(-1);
    const next = el("button", { class: "btn sm", type: "button", "aria-label": "›" }, ["›"]); next.onclick = () => step(1);
    track.addEventListener("scroll", () => { const w = ((track.firstElementChild || {}).offsetWidth || 300) + 12; count.textContent = (Math.round(track.scrollLeft / w) + 1) + " / " + L.length; }, { passive: true });
    track.addEventListener("keydown", e => { if (e.key === "ArrowRight") step(1); if (e.key === "ArrowLeft") step(-1); });
    const neu = opts.readonly ? null : el("button", { class: "btn sm", type: "button" }, ["＋ " + t("lk.new")]); if (neu) neu.onclick = () => buildKitDialog(null, opts.after);
    return panel("LKR-00", t("lk.tab.loadouts"), { status: String(L.length), statusKind: "info" }, [track,
      el("div", { class: "lkcarnav" }, [prev, count, next, el("span", { style: "flex:1" }), neu])]);
  }
  // ======================================================================= profile chat
  // WARMIND asks a few questions; the answers lean the kits in Optimize / Fun / Improvement
  const PREF_Q = [
    ["vibe", ["boom", "precision", "stealth", "hold", "any"]],
    ["focus", ["at", "ch", "st", "support", "scout", "any"]],
    ["armor", ["Light", "Medium", "Heavy", "any"]],
    ["front", ["terminids", "automatons", "illuminate", "any"]],
  ];
  const prefLabel = (k, v) => t("pq." + k + "." + v);
  // every armour set, by weight, with its passive ("the armour I wear")
  function armorSets(owned) {
    const tb = (META.armory || []).find(x => x.slot === "Armor"); if (!tb) return [];
    const own = owned ? new Set(owned) : null;
    return tb.groups.map(g => ({ weight: g.group, items: g.items.filter(i => !own || own.has(i.name) || i.source === "Helldivers Mobilize") }));
  }
  function armorSelect(cur, owned, weight) {
    const sel = el("select", { "aria-label": t("arm.pick") }, [el("option", { value: "" }, [t("arm.auto")])]);
    armorSets(owned).forEach(g => { if (weight && weight !== "any" && g.weight !== weight) return;
      const og = el("optgroup", { label: has("w." + g.weight) ? t("w." + g.weight) : g.weight });
      g.items.forEach(i => og.appendChild(el("option", { value: i.name }, [i.name + (i.passive ? " · " + i.passive : "")]))); sel.appendChild(og); });
    sel.value = cur || ""; return sel;
  }
  async function setWorn(name) {
    const L = store.locker(); if (!L) return false;
    await lpost("/api/locker/" + L.id + "/prefs", { armor_set: name || "" }); return true;
  }
  const prefSummary = p => PREF_Q.map(([k]) => p && p[k] && p[k] !== "any" ? prefLabel(k, p[k]) : null).concat(p && p.armor_set ? ["📌 " + p.armor_set] : []).filter(Boolean).join(" · ");
  function profileChat(callsign, prefs, done) {
    const L = store.locker(); if (!L) return;
    const ans = Object.assign({}, prefs || {});
    const dlg = el("dialog", { class: "modal chat", "aria-label": t("pq.title") });
    const x = el("button", { type: "button", class: "btn sm", "aria-label": t("gf.done") }, ["×"]); x.onclick = () => dlg.close();
    const log = el("div", { class: "chatlog", role: "log", "aria-live": "polite" });
    const choices = el("div", { class: "chatpick" });
    const say = (who, text) => { log.appendChild(el("div", { class: "bub " + who }, [text])); log.scrollTop = log.scrollHeight; };
    let i = 0;
    const ask = () => {
      choices.innerHTML = "";
      if (i >= PREF_Q.length) {
        say("wm", t("pq.done", { name: callsign || "" }));
        const out = Object.assign({}, ans); delete out.__setAsked;
        lpost("/api/locker/" + L.id + "/prefs", out).then(r => { if (done) done(r.prefs || out); }).catch(e => toast(e.message));
        const ok = el("button", { class: "btn primary", type: "button" }, ["✓ " + t("pq.close")]); ok.onclick = () => dlg.close(); choices.appendChild(ok);
        return;
      }
      const [k, opts] = PREF_Q[i];
      if (k === "front" && !ans.__setAsked) {   // between armour and front: the exact set they wear
        ans.__setAsked = true;
        say("wm", t("arm.q"));
        const sel = armorSelect(ans.armor_set, null, ans.armor); sel.style.flex = "1 1 100%";
        const yes = el("button", { type: "button", class: "btn sm primary" }, ["📌 " + t("arm.wear")]);
        const no = el("button", { type: "button", class: "btn sm" }, [t("arm.auto")]);
        yes.onclick = () => { if (!sel.value) { sel.focus(); return; } ans.armor_set = sel.value; say("me", "📌 " + sel.value); setTimeout(ask, 280); };
        no.onclick = () => { ans.armor_set = ""; say("me", t("arm.auto")); setTimeout(ask, 280); };
        choices.append(sel, yes, no);
        return;
      }
      say("wm", t("pq." + k + ".q", { name: callsign || "" }));
      opts.forEach(v => { const b = el("button", { type: "button", class: "btn sm" + (ans[k] === v ? " primary" : "") }, [prefLabel(k, v)]);
        b.onclick = () => { ans[k] = v; say("me", prefLabel(k, v)); i++; setTimeout(ask, 280); }; choices.appendChild(b); });
    };
    dlg.append(el("div", { class: "mhead" }, [el("b", {}, ["◈ " + t("pq.title")]), x]), el("div", { class: "mbody" }, [log, choices]));
    dlg.addEventListener("close", () => dlg.remove());
    document.body.appendChild(dlg); dlg.showModal ? dlg.showModal() : dlg.setAttribute("open", "");
    say("wm", t("pq.hello", { name: callsign || "" })); setTimeout(ask, 350);
  }

  // ======================================================================= compass (#30)
  // quiet <-> loud across, hold <-> push up; one dot per diver, a ring for the squad
  function compassSvg(points, size, labels) {
    const S = size, c = S / 2, r = S / 2 - (labels ? 18 : 4);
    const ns = "http://www.w3.org/2000/svg";
    const mk = (tag, a) => { const n = document.createElementNS(ns, tag); for (const k in a) if (a[k] != null) n.setAttribute(k, a[k]); return n; };
    const svg = mk("svg", { viewBox: labels ? "-64 -18 " + (S + 128) + " " + (S + 36) : "0 0 " + S + " " + S, width: labels ? "100%" : S, height: labels ? null : S, class: "compass", role: "img",
      "aria-label": t("cmp.title") + ": " + points.map(p => (p.label || "") + " " + t("cmp.say", { loud: Math.round(p.loud * 100), push: Math.round(p.push * 100) })).join("; ") });
    svg.appendChild(mk("circle", { cx: c, cy: c, r: r, class: "cring" }));
    svg.appendChild(mk("circle", { cx: c, cy: c, r: r / 2, class: "cring2" }));
    svg.appendChild(mk("line", { x1: c - r, y1: c, x2: c + r, y2: c, class: "caxis" }));
    svg.appendChild(mk("line", { x1: c, y1: c - r, x2: c, y2: c + r, class: "caxis" }));
    if (labels) [["cmp.loud", c + r + 2, c + 4, "start"], ["cmp.quiet", c - r - 2, c + 4, "end"], ["cmp.push", c, c - r - 6, "middle"], ["cmp.hold", c, c + r + 14, "middle"]].forEach(([k, x, y, a]) => {
      const tx = mk("text", { x: x, y: y, "text-anchor": a, class: "clab" }); tx.textContent = t(k); svg.appendChild(tx); });
    points.forEach(p => {
      const x = c + p.loud * r * 0.92, y = c - p.push * r * 0.92;
      if (p.squad) { svg.appendChild(mk("circle", { cx: x, cy: y, r: labels ? 9 : 5, class: "csq" })); return; }
      const d = mk("circle", { cx: x, cy: y, r: labels ? 6 : 4, class: "cdot", fill: p.color || "#ffb469" }); svg.appendChild(d);
      if (labels && p.label) { const tx = mk("text", { x: x + 9, y: y + 4, class: "cname" }); tx.textContent = p.label; svg.appendChild(tx); }
    });
    return svg;
  }
  const compassWord = p => t("cmp.w." + (p.loud > 0.2 ? "loud" : p.loud < -0.2 ? "quiet" : "mid") + "." + (p.push > 0.2 ? "push" : p.push < -0.2 ? "hold" : "mid"));

  // ======================================================================= costs (what Claude costs to run WARMIND)
  let costTimer = null;
  const usd = v => v == null ? "—" : "$" + (v < 1 ? v.toFixed(v < 0.1 ? 3 : 2) : v.toFixed(2));
  async function renderCosts() {
    app.innerHTML = ""; app.className = "stack";
    app.appendChild(el("div", { class: "lknav" }, [el("a", { class: "btn sm", href: "/" }, ["⌂ " + t("lk.homepage")])]));
    const body = el("div", { class: "stack" }, [el("div", { class: "hint" }, [t("home.loading")])]);
    app.appendChild(body);
    const load = async () => { try { paintCosts(body, await api("/api/costs")); } catch (e) { body.innerHTML = ""; body.appendChild(el("div", { class: "alert" }, [e.message])); } };
    await load();
    clearInterval(costTimer);   // poll while the page is open
    costTimer = setInterval(() => { if (!document.body.contains(body)) return clearInterval(costTimer); if (!document.hidden) load(); }, 60000);
  }
  function paintCosts(body, c) {
    body.innerHTML = "";
    const tile = (k, v, sub) => el("div", { class: "rstat" }, [nixie(usd(v)), el("small", {}, [t(k)]), sub ? el("small", { class: "sub" }, [sub]) : null]);
    const bill = c.bill;
    body.appendChild(panel("OPS-01", t("cost.title"), { status: c.mock ? t("cost.mock") : t("war.live"), statusKind: c.mock ? "warn" : "ok", tone: "amber" }, [
      el("div", { class: "hint", style: "margin:0 0 10px" }, [t("cost.what")]),
      el("div", { class: "rstats ctiles" }, [tile("cost.today", c.app.today), tile("cost.7d", c.app["7d"]), tile("cost.30d", c.app["30d"]),
        tile("cost.mtd", c.app.mtd), tile("cost.proj", c.projected_month, c.hosting_month != null ? t("cost.inclhost", { h: usd(c.hosting_month) }) : null)]),
      el("div", { class: "hint" }, [t("cost.tracked")]),
    ]));
    // Anthropic's own bill
    const bk = [];
    if (bill) {
      bk.push(el("div", { class: "rstats ctiles" }, [tile("cost.bill.today", bill.today), tile("cost.bill.mtd", bill.mtd), tile("cost.bill.30d", bill["30d"])]));
      const by = Object.entries(bill.by || {}).sort((a, b) => b[1] - a[1]);
      if (by.length) bk.push(el("div", { class: "chips" }, by.map(([k, v]) => el("span", { class: "chip" }, [k + " · " + usd(v)]))));
      bk.push(el("div", { class: "hint" }, [t("cost.bill.note", { at: c.admin.at ? new Date(c.admin.at * 1000).toLocaleString(LANG) : "—" })]));
    } else bk.push(el("div", { class: "hint", style: "margin:0" }, [c.admin.enabled ? (c.admin.status === "failed" ? t("cost.bill.err", { e: c.admin.error || "" }) : t("cost.bill.wait")) : t("cost.bill.off")]));
    if (c.admin.var) bk.push(el("div", { class: "hint" }, [t("cost.bill.var", { v: c.admin.var }) + (c.admin.looks_admin === false ? " " + t("cost.bill.notadmin") : "")]));
    if (c.admin.enabled) { const b = el("button", { class: "btn sm", type: "button" }, ["⟳ " + t("cost.refresh")]);
      b.onclick = async () => { b.disabled = true; try { paintCosts(body, await api("/api/costs/poll", { method: "POST" })); toast(t("cost.refreshed")); } catch (e) { toast(e.message); b.disabled = false; } }; bk.push(el("div", { class: "btnrow" }, [b])); }
    body.appendChild(panel("OPS-02", t("cost.bill"), {}, bk));
    // last 30 days: one bar per day (the bill when we have it, else what the app tracked)
    const series = bill ? bill.daily : c.daily, max = Math.max(0.0001, ...series);
    const W = 300, H = 120, n = series.length, gap = 2, bw = (W - gap * (n - 1)) / n;
    const ns = "http://www.w3.org/2000/svg", mk = (tg, a) => { const e = document.createElementNS(ns, tg); for (const k in a) e.setAttribute(k, a[k]); return e; };
    const readout = el("div", { class: "hint costread", "aria-live": "polite", style: "margin:0 0 6px" }, [t("cost.tap") + " · " + t("cost.peak", { v: usd(series.length ? Math.max(...series) : 0) })]);
    const svg = mk("svg", { viewBox: "0 0 " + W + " " + (H + 16), width: "100%", class: "costbars", role: "img", "aria-label": t(bill ? "cost.chart.bill" : "cost.chart.app") });
    svg.appendChild(mk("line", { x1: 0, y1: H, x2: W, y2: H, class: "base" }));
    series.forEach((v, i) => {
      const h = v > 0 ? Math.max(2, v / max * (H - 6)) : 0, x = i * (bw + gap), y = H - h;
      const g = mk("g", { class: "bar", tabindex: "0" });
      g.appendChild(mk("rect", { x: x, y: 0, width: bw, height: H, class: "hit" }));   // hover target bigger than the bar
      if (h) g.appendChild(mk("path", { d: `M${x},${H} V${y + Math.min(4, h)} Q${x},${y} ${x + Math.min(4, bw / 2)},${y} H${x + bw - Math.min(4, bw / 2)} Q${x + bw},${y} ${x + bw},${y + Math.min(4, h)} V${H} Z`, class: "fill" }));
      const tt = mk("title", {}); tt.textContent = c.days[i] + ": " + usd(v); g.appendChild(tt);
      const show = () => { readout.textContent = c.days[i] + " · " + usd(v); };   // phones: tap a bar to read it
      g.addEventListener("pointerenter", show); g.addEventListener("focus", show); g.addEventListener("click", show);
      svg.appendChild(g);
    });
    [[0, c.days[0]], [n - 1, c.days[n - 1]]].forEach(([i, d], j) => { const tx = mk("text", { x: j ? W : 0, y: H + 13, "text-anchor": j ? "end" : "start", class: "ax" }); tx.textContent = d.slice(5); svg.appendChild(tx); });
    const tbl = el("details", { class: "fold" }, [el("summary", {}, [t("cost.table")]), el("div", { class: "body" }, [el("div", { class: "tblwrap" }, [el("table", { class: "lktable" }, [
      el("thead", {}, [el("tr", {}, [el("th", {}, [t("lk.h.date")]), el("th", {}, [t("cost.col.usd")])])]),
      el("tbody", {}, c.days.map((d, i) => el("tr", {}, [el("td", {}, [d]), el("td", {}, [usd(series[i])])])).reverse())])])])]);
    body.appendChild(panel("OPS-03", t(bill ? "cost.chart.bill" : "cost.chart.app"), {}, [readout, svg, tbl]));
    // by kind of call
    const kinds = Object.entries(c.by_kind || {}).sort((a, b) => b[1].usd - a[1].usd);
    const ktable = kinds.length ? el("div", { class: "tblwrap" }, [el("table", { class: "lktable" }, [
      el("thead", {}, [el("tr", {}, ["cost.col.kind", "cost.col.calls", "cost.col.avg", "cost.col.usd", "cost.col.tok"].map(k => el("th", {}, [t(k)])))]),
      el("tbody", {}, kinds.map(([k, v]) => el("tr", {}, [el("td", {}, [has("cost.k." + k) ? t("cost.k." + k) : k]), el("td", {}, [nf(v.calls)]), el("td", {}, [usd(v.avg)]),
        el("td", {}, [usd(v.usd)]), el("td", {}, [nf(v.in) + " / " + nf(v.out) + (v.cache_read ? " · ↺" + nf(v.cache_read) : "")])])))])])
      : el("div", { class: "hint", style: "margin:0" }, [t("cost.none")]);
    body.appendChild(panel("OPS-04", t("cost.bykind"), {}, [ktable, c.unpriced_calls ? el("div", { class: "hint" }, [t("cost.unpriced", { n: c.unpriced_calls })]) : null]));
    // guard rails
    const cp = c.caps || {};
    body.appendChild(panel("OPS-05", t("cost.caps"), {}, [
      el("div", { class: "rstats ctiles" }, [
        el("div", { class: "rstat" }, [nixie((cp.calls_today || 0) + "/" + (cp.per_day_cap || 0)), el("small", {}, [t("cost.cap.reads")])]),
        el("div", { class: "rstat" }, [nixie((cp.plans_today || 0) + "/" + (cp.plans_per_day_cap || 0)), el("small", {}, [t("cost.cap.plans")])])]),
      el("div", { class: "hint" }, [t("cost.models", { v: c.vision_model, p: c.planner.model, e: c.planner.effort })]),
      el("div", { class: "hint" }, [Object.entries(c.prices || {}).map(([m, r]) => m + ": $" + r.in + " in / $" + r.out + " out / $" + (r.cache_read != null ? r.cache_read : "—") + " cached per M").join(" · ")])]));
  }

  // ======================================================================= roster + leaderboard
  const ROS_SORT = [["accuracy", "sc.accuracy"], ["kd", "sc.kd"], ["kills_pm", "sc.kills_pm"], ["win_rate", "sc.success"], ["medals", "lk.medals"], ["active", "ros.recent"]];
  let rosSort = (() => { try { return localStorage.getItem("wm_rossort") || "accuracy"; } catch (e) { return "accuracy"; } })();
  const rosVal = (d, k) => k === "medals" ? d.medals : k === "active" ? d.active : (d.rates || {})[k];
  const rosFmt = (d, k) => { const v = rosVal(d, k); if (v == null) return "—";
    return k === "accuracy" || k === "win_rate" ? (v * 100).toFixed(1) + "%" : k === "active" ? dt(v) : k === "medals" ? "🎖 " + v : String(v); };
  // routes remember where you came from, so Back goes there (a war room, a war table, the roster)
  const fromHere = () => "&from=" + encodeURIComponent(location.pathname + location.search.replace(/[?&]from=[^&]*/g, ""));
  function backLink() {
    const f = new URLSearchParams(location.search).get("from");
    if (!f || !/^\/\?(room|l|roster|locker|tab)=?/.test(f)) return null;
    const k = /\?room=/.test(f) ? "nav.back.room" : /\?l=/.test(f) ? "nav.back.table" : /\?locker/.test(f) ? "nav.back.locker" : /\?roster/.test(f) ? "nav.back.roster" : "nav.back";
    return el("a", { class: "btn primary sm", href: f }, ["← " + t(k)]);
  }
  function rosNav(back) {
    const nav = el("div", { class: "lknav" });
    const bl = back ? backLink() : null;
    if (bl) nav.appendChild(bl);
    else if (back) nav.appendChild(el("a", { class: "btn primary sm", href: "/?roster" }, ["← " + t("ros.title")]));
    nav.appendChild(el("a", { class: "btn sm", href: "/" }, ["⌂ " + t("lk.homepage")]));
    if (store.locker()) nav.appendChild(el("a", { class: "btn sm", href: "/?locker" }, ["🗄 " + t("lk.open")]));
    return nav;
  }
  async function renderRoster() {
    app.innerHTML = ""; app.className = "stack";
    const id = new URLSearchParams(location.search).get("roster");
    if (id) return renderProfile(id);
    app.appendChild(rosNav(false));
    const body = el("div", {}, [el("div", { class: "hint" }, [t("home.loading")])]);
    app.appendChild(panel("ROS-01", t("ros.title"), {}, [el("div", { class: "hint", style: "margin:0 0 10px" }, [t("ros.hint")]), body]));
    let data; try { data = await api("/api/roster"); } catch (e) { body.innerHTML = ""; body.appendChild(el("div", { class: "hint" }, [e.message])); return; }
    const me = store.locker();
    const paint = () => {
      body.innerHTML = "";
      const seg = el("div", { class: "seg rossort", role: "group", "aria-label": t("ros.sort") });
      ROS_SORT.forEach(([k, lab]) => { const b = el("button", { type: "button", "aria-pressed": String(rosSort === k) }, [t(lab)]);
        b.onclick = () => { rosSort = k; try { localStorage.setItem("wm_rossort", k); } catch (e) {} paint(); }; seg.appendChild(b); });
      body.appendChild(seg);
      const rows = data.divers.slice().sort((a, b) => { const x = rosVal(a, rosSort), y = rosVal(b, rosSort);
        if (x == null && y == null) return 0; if (x == null) return 1; if (y == null) return -1; return y - x; });
      if (!rows.length) body.appendChild(el("div", { class: "hint" }, [t("ros.none")]));
      body.appendChild(el("ol", { class: "roslist" }, rows.map((d, i) => el("li", { class: me && me.id === d.id ? "me" : null }, [
        el("a", { href: "/?roster=" + d.id }, [
          el("span", { class: "rk" }, [rosVal(d, rosSort) == null ? "·" : String(i + 1)]),
          el("span", { class: "who" }, [el("b", {}, [d.callsign]), el("small", {}, [[d.play_style ? styleLabel(d.play_style) : null,
            d.rates && d.rates.missions ? t("ros.missions", { n: nf(d.rates.missions) }) : null, d.medals ? "🎖 " + d.medals : null].filter(Boolean).join(" · ")])]),
          el("span", { class: "val" }, [rosFmt(d, rosSort)]),
        ])]))));
    };
    paint();
  }
  async function renderProfile(id) {
    app.appendChild(rosNav(true));
    let d; try { d = await api("/api/roster/" + encodeURIComponent(id)); }
    catch (e) { app.appendChild(panel("ERR", t("ros.title"), { tone: "red" }, [el("div", { class: "hint" }, [t("ros.gone")])])); return; }
    app.appendChild(panel("ROS-02", t("ros.profile"), { status: d.medals.length ? "🎖 " + d.medals.length : "", statusKind: "warn", tone: "amber" }, [
      el("div", { class: "lkhead" }, [el("div", {}, [el("div", { class: "big" }, [d.callsign]),
        el("div", { class: "hint", style: "margin:4px 0 0" }, [d.play_style ? t("lk.style", { style: styleLabel(d.play_style) }) : t("me.noread")])])])]));
    const car = lkCarousel(d.loadouts, { readonly: true }); if (car) app.appendChild(car);
    const kids = [];
    if (d.scorecard && d.scorecard.length) kids.push(el("div", { class: "statgrid rosstats" }, d.scorecard.map(row => el("div", { class: "stat" }, [
      el("div", { class: "k" }, [has("sc." + row.key) ? t("sc." + row.key) : row.label]), el("div", { class: "v" }, [row.value])]))));
    else kids.push(el("div", { class: "hint" }, [t("lk.stats.none")]));
    if (d.medals.length) kids.push(el("div", { class: "sub-h" }, [t("lk.medals")]), el("div", { class: "lkmedals" }, d.medals.map(m =>
      el("div", { class: "lkmedal" }, [el("b", {}, ["🎖 " + m.medal.name]), el("small", {}, [(m.mission || "") + " · " + dt(m.at)])]))));
    if (d.recent.length) kids.push(el("div", { class: "sub-h" }, [t("ros.recentdrops")]), el("ul", { class: "rosrecent" }, d.recent.map(r => el("li", {}, [
      el("b", {}, [(r.mission && r.mission.name) || "—"]), " · " + dt(r.at),
      r.kills != null ? " · " + t("lk.r.kills", { n: nf(r.kills) }) : "", r.deaths != null ? " · " + t("lk.r.deaths", { n: nf(r.deaths) }) : "",
      " ", ...(r.oaths || []).map(o => tag(o.passed ? "green" : o.passed === false ? "red" : "", (o.passed ? "✓ " : o.passed === false ? "✗ " : "? ") + o.name))]))));
    app.appendChild(panel("ROS-03", t("lk.tab.stats"), {}, kids));
  }

  function lkStats() {
    const kids = [];
    if (LK.stats) kids.push(statBlock({ scorecard: LK.scorecard, stats: LK.stats, confidence: null }));
    else kids.push(el("div", { class: "hint" }, [t("lk.stats.none")]));
    const h = (LK.history || []).slice();
    if (h.length) {
      const pct = v => v == null ? "—" : (v * 100).toFixed(1) + "%", num = (v, d) => v == null ? "—" : Number(v).toFixed(d);
      const arrow = (a, b, better) => { if (a == null || b == null || a === b) return ""; return (a > b) === better ? " ▲" : " ▼"; };
      const rows = h.map((r, i) => { const prev = h[i + 1] && h[i + 1].rates, x = r.rates || {};
        return el("tr", {}, [el("td", {}, [dt(r.at)]), el("td", {}, [nf(r.missions)]),
          el("td", {}, [pct(x.accuracy) + arrow(x.accuracy, prev && prev.accuracy, true)]),
          el("td", {}, [num(x.kills_per_min, 2) + arrow(x.kills_per_min, prev && prev.kills_per_min, true)]),
          el("td", {}, [num(x.deaths_per_mission, 2) + arrow(x.deaths_per_mission, prev && prev.deaths_per_mission, false)]),
          el("td", {}, [pct(x.win_rate) + arrow(x.win_rate, prev && prev.win_rate, true)])]); });
      kids.push(el("details", { class: "fold" }, [el("summary", {}, [t("lk.history") + " · " + h.length]), el("div", { class: "body" }, [
        el("div", { class: "tblwrap" }, [el("table", { class: "lktable" }, [el("thead", {}, [el("tr", {}, [t("lk.h.date"), t("lk.h.missions"), t("sc.accuracy"), t("lk.h.kpm"), t("sc.deaths_pm"), t("sc.success")].map(x => el("th", {}, [x])))]), el("tbody", {}, rows)])]),
        el("div", { class: "hint" }, [t("lk.history.hint")])])]));
    }
    return panel("LKR-02", t("lk.tab.stats"), {}, kids);
  }
  function lkRecord() {
    const kids = [];
    if (LK.medals.length) kids.push(el("div", { class: "sub-h" }, [t("lk.medals")]), el("div", { class: "lkmedals" }, LK.medals.map(m =>
      el("div", { class: "lkmedal", title: m.medal.id }, [el("b", {}, ["🎖 " + m.medal.name]), el("small", {}, [(m.mission || "") + " · " + dt(m.at)])]))));
    if (!LK.record.length) kids.push(el("div", { class: "hint" }, [t("lk.record.none")]));
    LK.record.forEach(r => {
      const res = r.result || {}, mi = r.mission || {};
      const bits = [res.kills != null ? t("lk.r.kills", { n: nf(res.kills) }) : null, res.deaths != null ? t("lk.r.deaths", { n: nf(res.deaths) }) : null,
        res.accuracy_pct != null ? t("lk.r.acc", { n: res.accuracy_pct }) : null].filter(Boolean).join(" · ");
      const vs = (r.verdicts || []).filter(Boolean).map(v => el("span", { class: "tag " + (v.passed ? "green" : v.passed === false ? "red" : "") }, [(v.passed ? "✓ " : v.passed === false ? "✗ " : "? ") + (v.name || v.oath)]));
      kids.push(el("details", { class: "fold lkrec" }, [el("summary", {}, [el("b", {}, [mi.name || r.lobby || "—"]), " · " + dt(r.at) + (mi.mode ? " · " + t("mode." + mi.mode) : "") + (mi.difficulty ? " · D" + mi.difficulty : "")]),
        el("div", { class: "body" }, [bits ? el("div", {}, [bits]) : null, vs.length ? el("div", { class: "chips" }, vs) : null,
          r.aar ? el("div", { class: "hint" }, [r.aar]) : null,
          r.lobby_id ? el("a", { class: "btn sm", href: "/?l=" + r.lobby_id }, [t("lk.r.open")]) : null])]));
    });
    return panel("LKR-03", t("lk.tab.record"), {}, kids);
  }
  function kitLines(k) {
    const row = (lab, v) => v ? el("li", {}, [el("span", { class: "sl" }, [t(lab)]), el("span", { class: "vv" }, [wk(v)])]) : null;
    return el("ul", { class: "kit" }, [row("card.primary", k.primary), row("card.secondary", k.secondary), row("card.grenade", k.grenade),
      row("card.armor", k.armor), row("card.booster", k.booster),
      (k.stratagems || []).length ? el("li", {}, [el("span", { class: "sl" }, [t("card.strats")]), el("span", { class: "vv" }, k.stratagems.map((n, i) => el("span", {}, [i ? ", " : "", wk(n)])))]) : null]);
  }
  function lkLoadouts() {
    const L = store.locker();
    const neu = el("button", { class: "btn primary sm", type: "button" }, ["＋ " + t("lk.new")]);
    neu.onclick = () => buildKitDialog();
    const viewSeg = el("div", { class: "seg kitview", role: "group", "aria-label": t("kv.label") });
    [["screen", "▦ " + t("kv.screen")], ["list", "☰ " + t("kv.list")]].forEach(([k, label]) => {
      const b = el("button", { type: "button", "aria-pressed": String(kitView === k) }, [label]);
      b.onclick = () => { kitView = k; try { localStorage.setItem("wm_kitview", k); } catch (e) {} paintLocker(); };
      viewSeg.appendChild(b);
    });
    const kids = [el("div", { class: "hint", style: "margin:0 0 10px" }, [t("lk.loadouts.hint")]), el("div", { class: "btnrow" }, [neu]), viewSeg];
    if (!LK.loadouts.length) kids.push(el("div", { class: "hint" }, [t("lk.loadouts.none")]));
    const grid = el("div", { class: "roster" }); kids.push(grid);
    LK.loadouts.forEach(o => {
      const del = el("button", { class: "btn sm red", type: "button" }, ["✕ " + t("lk.delete")]);
      del.onclick = async () => { if (!window.confirm(t("lk.delete.confirm", { name: o.name }))) return; await lpost("/api/locker/" + L.id + "/loadouts/" + o.id + "/delete"); await loadLocker(); };
      const src = o.source || {};
      const card = el("article", { class: "dcard lkcard" }); card.style.setProperty("--acc", "#ff9a3c");
      card.appendChild(el("div", { class: "hd" }, [
        el("div", { class: "role" }, [o.kit.role || o.name]),
        el("div", { class: "meta" }, [o.kit.role && o.name !== o.kit.role ? el("span", { class: "cs" }, [o.name]) : null,
          [src.mission, src.mode ? t("mode." + src.mode) : "", src.difficulty ? "D" + src.difficulty : "", dt(o.created_at)].filter(Boolean).map(x => " · " + x).join("")]),
      ]));
      card.appendChild(kitView === "list" ? kitLines(o.kit) : locker(o.kit));
      if (o.note) card.appendChild(el("div", { class: "why" }, [o.note]));
      card.appendChild(el("div", { class: "btnrow" }, [del]));
      grid.appendChild(card);
    });
    return panel("LKR-04", t("lk.tab.loadouts"), {}, kids);
  }
  function buildKitDialog(existing, after) {   // existing: a saved loadout to edit; after: what to refresh when saved
    after = after || loadLocker;
    const tabs = META.armory || [], by = {};
    tabs.forEach(tb => { by[tb.slot] = []; tb.groups.forEach(g => g.items.forEach(i => by[tb.slot].push(i.name))); });
    const ownedSet = LK.owned ? new Set(LK.owned) : null;
    let onlyMine = !!ownedSet;
    const sel = slot => { const s = el("select", {}); return s; };
    const fill = (s, slot) => { const cur = s.value; s.innerHTML = ""; s.appendChild(el("option", { value: "" }, ["—"]));
      (by[slot] || []).filter(n => !onlyMine || !ownedSet || ownedSet.has(n)).forEach(n => s.appendChild(el("option", { value: n }, [n]))); s.value = cur; };
    const slots = [["primary", "Primary", "card.primary"], ["secondary", "Secondary", "card.secondary"], ["grenade", "Grenade", "card.grenade"],
      ["armor", "Armor", "card.armor"], ["booster", "Booster", "card.booster"]];
    const S = {}; slots.forEach(([k, slot]) => { S[k] = sel(); fill(S[k], slot); });
    const strat = [0, 1, 2, 3].map(() => { const s = sel(); fill(s, "Stratagem"); return s; });
    const mine = el("input", { type: "checkbox" }); mine.checked = onlyMine; mine.disabled = !ownedSet;
    mine.onchange = () => { onlyMine = mine.checked; slots.forEach(([k, slot]) => fill(S[k], slot)); strat.forEach(s => fill(s, "Stratagem")); };
    const name = el("input", { type: "text", maxlength: "40", placeholder: t("lk.name") });
    const note = el("textarea", { rows: "2", maxlength: "400", placeholder: t("lk.note.ph") });
    if (existing) {   // editing: start from the saved kit (whether or not it's in the owned list)
      onlyMine = false; mine.checked = false; slots.forEach(([k, slot]) => fill(S[k], slot)); strat.forEach(s => fill(s, "Stratagem"));
      name.value = existing.name || ""; note.value = existing.note || "";
      slots.forEach(([k]) => { if (existing.kit[k]) S[k].value = existing.kit[k]; });
      (existing.kit.stratagems || []).forEach((n, i) => { if (strat[i]) strat[i].value = n; });
    }
    const go = el("button", { type: "button", class: "btn primary" }, [t("lk.save")]);
    const no = el("button", { type: "button", class: "btn" }, [t("fb.cancel")]);
    const dlg = el("dialog", { class: "modal", "aria-label": t(existing ? "lk.edit.kit" : "lk.new") });
    go.onclick = async () => {
      const kit = existing && existing.kit.role ? { role: existing.kit.role } : {};
      slots.forEach(([k]) => { if (S[k].value) kit[k] = S[k].value; }); kit.stratagems = strat.map(s => s.value).filter(Boolean);
      go.disabled = true;
      const L = store.locker(), body = { name: name.value || t("lk.loadout"), note: note.value, kit: kit };
      try { await lpost("/api/locker/" + L.id + "/loadouts" + (existing ? "/" + existing.id : ""), body); dlg.close(); toast(t(existing ? "lk.edited" : "lk.saved")); await after(); }
      catch (e) { toast(e.message); go.disabled = false; }
    };
    no.onclick = () => dlg.close();
    const field = (lab, ctl) => el("div", { class: "field" }, [el("span", { class: "label" }, [lab]), ctl]);
    dlg.append(el("div", { class: "mhead" }, [el("b", {}, [t(existing ? "lk.edit.kit" : "lk.new")])]),
      el("div", { class: "mbody" }, [field(t("lk.name"), name),
        el("label", { class: "lkmine" }, [mine, " " + t("lk.onlymine")])]
        .concat(slots.map(([k, , lab]) => field(t(lab), S[k])))
        .concat([field(t("card.strats"), el("div", { class: "lkstrats" }, strat)), field(t("lk.note"), note)])),
      el("div", { class: "mfoot" }, [el("div", { class: "btnrow", style: "margin:0" }, [go, no])]));
    dlg.addEventListener("close", () => dlg.remove());
    document.body.appendChild(dlg); dlg.showModal ? dlg.showModal() : dlg.setAttribute("open", "");
  }
  function lkGear() {
    const g = gearFold({ id: "__locker", owned: LK.owned, gear_confirmed: LK.gear_set });
    if (g) g.open = true;
    return panel("LKR-05", t("lk.tab.gear"), {}, [el("div", { class: "hint", style: "margin:0 0 10px" }, [t("lk.gear.hint")]), g]);
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
    g.strokeStyle = "#ff9a3c"; g.lineWidth = 6; g.shadowColor = "#ff9a3c"; g.shadowBlur = 24;   // medal hex
    g.beginPath(); for (let i = 0; i < 6; i++) { const a = Math.PI / 3 * i - Math.PI / 2; g.lineTo(300 + 150 * Math.cos(a), 315 + 150 * Math.sin(a)); } g.closePath(); g.stroke();
    g.fillStyle = "#ff9a3c"; g.textAlign = "center"; g.textBaseline = "middle";
    g.beginPath(); for (let i = 0; i < 10; i++) { const r = i % 2 ? 26 : 62, a2 = -Math.PI / 2 + i * Math.PI / 5; g.lineTo(300 + r * Math.cos(a2), 322 + r * Math.sin(a2)); } g.closePath(); g.fill();   // the medal star, drawn
    g.shadowBlur = 0; g.textAlign = "left"; g.textBaseline = "alphabetic";
    const fit = (txt, font, max) => { let sz = font; g.font = `700 ${sz}px 'Chakra Petch', sans-serif`; while (g.measureText(txt).width > max && sz > 22) { sz -= 2; g.font = `700 ${sz}px 'Chakra Petch', sans-serif`; } };
    g.fillStyle = "#78ffaa"; g.font = "500 22px 'JetBrains Mono', monospace"; g.fillText(t("share.eyebrow").toUpperCase(), 500, 150);
    g.fillStyle = "#ffffff"; fit(mname.toUpperCase(), 58, 650); g.fillText(mname.toUpperCase(), 500, 222);
    g.fillStyle = "#ff9a3c"; fit(callsign, 44, 650); g.fillText(callsign, 500, 290);
    g.fillStyle = "#9fb3c2"; g.font = "400 26px 'JetBrains Mono', monospace";
    g.fillText(t("oath." + v.oath + ".name") + " · " + (mm ? mm.name : ""), 500, 345);
    g.fillText((STATE.name || "Squad") + (mission.difficulty ? " · D" + mission.difficulty : ""), 500, 385);
    g.fillStyle = "#4dffa1"; g.font = "500 24px 'JetBrains Mono', monospace"; g.fillText("ID " + v.medal.id, 500, 450);
    g.fillStyle = "#78ffaa"; g.font = "700 34px 'Chakra Petch', sans-serif"; g.fillText("WARMIND", 500, 560);
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

  // an oath no scoreboard shows: the other divers at the table vouch for it
  function endorseRow(v, subject) {
    const me = myPlayer(), meR = meRec(), got = v.endorsers || [], need = v.needed || 1;
    const kids = [el("span", {}, [got.length ? t("end.by", { names: got.join(", "), n: got.length, m: need }) : t("end.none", { m: need })])];
    if (me && meR && subject && me.id !== subject.id && !(v.endorser_ids || []).includes(me.id)) {
      const b = el("button", { class: "btn sm primary", type: "button" }, [t("end.vouch", { name: subject.callsign })]);
      b.onclick = async () => { b.disabled = true;
        try { STATE = await jpost("/api/lobby/" + LID + "/player/" + subject.id + "/endorse", { oath: v.oath, by: me.id }, meR.token); lastSig = JSON.stringify(STATE); renderLive(); toast(t("end.done")); }
        catch (e) { toast(e.message); b.disabled = false; } };
      kids.push(b);
    } else if (me && subject && me.id === subject.id) kids.push(el("span", { class: "hint", style: "margin:0" }, [t("end.ask")]));
    return el("div", { class: "endorse" }, kids);
  }
  function verdictBlock(v, callsign, subject) {
    if (!v) return null;
    const name = t("oath." + v.oath + ".name"), reason = tp({ k: v.reason_key, p: v.reason_params }, v.reason);
    if (v.passed === true && v.medal) {
      const base = t("oath." + v.oath + ".medal"), mname = v.medal.d100 ? t("medal.d100", { name: base }) : base;
      const shareBtn = el("button", { class: "btn sm share", type: "button" }, ["⇪ " + t("share.btn")]);
      shareBtn.onclick = () => shareMedal(v, mname, callsign || "");
      return el("div", { class: "medal" }, [el("div", { class: "hex", "aria-hidden": "true" }, ["★"]), el("div", {}, [
        el("div", { class: "mn" }, [mname]), el("div", { class: "mid" }, [t("deb.medal", { id: v.medal.id })]),
        el("div", { class: "mw" }, [t("deb.kept", { name: name, reason: reason })]),
        v.endorsed_by ? el("div", { class: "mid" }, [t("end.medal", { names: v.endorsed_by.join(", ") })]) : null,
        el("div", { class: "btnrow", style: "margin:8px 0 0" }, [shareBtn])])]);
    }
    if (v.passed === false) return el("div", { class: "broken" }, [el("div", { class: "bt" }, [t("deb.broken", { name: name })]), el("div", { class: "bw" }, [reason])]);
    return el("div", { class: "unver" }, [el("div", {}, [t("deb.unver", { reason: reason })]), subject ? endorseRow(v, subject) : null]);
  }

  // Squad scoreboard: confirm which column is which diver (prefilled from the names), then
  // every matched diver's result, oath verdicts, medals and review are recorded at once.
  function squadConfirm(r, token) {
    const dlg = el("dialog", { class: "modal squadmatch", "aria-label": t("deb.squad.title") });
    const sels = [];
    const rows = r.rows.map(row => {
      const sel = el("select", {}, [el("option", { value: "" }, [t("deb.squad.skip")])].concat(
        STATE.players.map(p => el("option", { value: p.id }, [p.callsign]))));
      sel.value = r.match[String(row.i)] || "";
      sels.push([row.i, sel]);
      const nums = [row.kills != null ? t("sb.kills") + " " + row.kills : null, row.deaths != null ? t("sb.deaths") + " " + row.deaths : null,
        row.accuracy_pct != null ? t("sb.accuracy") + " " + row.accuracy_pct + "%" : null].filter(Boolean).join(" · ");
      return el("div", { class: "sqrow" }, [el("div", {}, [el("b", {}, [row.name]), el("div", { class: "hint", style: "margin:0" }, [nums])]), sel]);
    });
    const err = el("div", { class: "hint", style: "margin:0;color:var(--red)" });
    const ok = el("button", { type: "button", class: "btn primary" }, ["✓ " + t("deb.squad.record")]);
    const cancel = el("button", { type: "button", class: "btn" }, [t("fb.cancel")]);
    ok.onclick = async () => {
      const assign = {}, seen = new Set();
      for (const [i, sel] of sels) {
        if (!sel.value) continue;
        if (seen.has(sel.value)) { err.textContent = t("deb.squad.dupe"); return; }
        seen.add(sel.value); assign[i] = sel.value;
      }
      if (!seen.size) { err.textContent = t("deb.squad.none"); return; }
      ok.disabled = true; busy = true; ok.textContent = t("deb.squad.writing");
      try {
        const res = await jpost("/api/lobby/" + LID + "/results/squad/" + r.read_id, { assign: assign, lang: LANG }, token);
        dlg.close(); busy = false; await refresh();
        const won = res.recorded.reduce((n, x) => n + x.verdicts.filter(v => v.passed === true && v.medal).length, 0);
        toast(t("deb.squad.done", { n: res.recorded.length }) + (won ? " · 🎖 " + won : ""));
      } catch (e) { err.textContent = e.message; ok.disabled = false; ok.textContent = "✓ " + t("deb.squad.record"); }
      finally { busy = false; }
    };
    cancel.onclick = () => dlg.close();
    dlg.append(
      el("div", { class: "mhead" }, [el("b", {}, [t("deb.squad.title")])]),
      el("div", { class: "mbody" }, [el("div", { class: "hint", style: "margin:0" }, [t("deb.squad.confirm")])].concat(rows, [err])),
      el("div", { class: "mfoot" }, [el("div", { class: "btnrow", style: "margin:0" }, [ok, cancel])]));
    dlg.addEventListener("close", () => dlg.remove());
    document.body.appendChild(dlg);
    dlg.showModal ? dlg.showModal() : dlg.setAttribute("open", "");
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
    // whole squad from one scoreboard (any member), or just yourself
    if (me || isCreator()) {
      const sq = fileBtn("primary", "▦ " + t("deb.squad"), false), sqStatus = el("div", { class: "upstatus", role: "status", "aria-live": "polite" });
      sq.querySelector("input").onchange = async ev => {
        const f = ev.target.files[0]; ev.target.value = ""; if (!f || busy) return;
        busy = true; lockControls([sq], true);
        const stop = workTicker(sqStatus, lines("tick.review.", 5));
        try {
          const fd = new FormData(); fd.append("image", f);
          const r = await fdpost("/api/lobby/" + LID + "/results/squad", fd, me ? meRec().token : store.creator(LID));
          stop(); sqStatus.style.display = "none"; busy = false;
          squadConfirm(r, me ? meRec().token : store.creator(LID));
        } catch (e) { stop(); setStatus(sqStatus, "err", t("deb.failed", { msg: e.message })); }
        finally { stop(); lockControls([sq], false); busy = false; }
      };
      kids.push(el("div", { class: "btnrow", style: "margin-top:0" }, [sq]), sqStatus, el("div", { class: "hint" }, [t("deb.squad.hint")]));
    }
    if (me) {
      const [up, status] = uploader(me, t("deb.submit.solo"), false);
      kids.push(el("div", { class: "btnrow" }, [up]), status, el("div", { class: "hint" }, [t("deb.submit.hint")]));
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
        (aar.verdicts || (aar.verdict ? [aar.verdict] : [])).forEach(v => { const vb = verdictBlock(v, p.callsign, p); if (vb) inner.push(vb); });
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
