"""Picture cards (1200x630 PNG) for link previews and the Discord app.

A WARMIND link pasted in Discord (or anywhere that reads Open Graph tags) unfurls into one of
these: a war table (mission, squad, Go / No-Go, debriefs), a war room (stats, tonight's mission,
standing orders) or a diver's public profile (rates, medals). The server gathers plain dicts and
this module only draws them, in the app's Mission Control look.
"""

from __future__ import annotations

import io
import pathlib
from functools import lru_cache

from PIL import Image, ImageDraw, ImageFont

W, H = 1200, 630
FONTS = pathlib.Path(__file__).parent / "fonts"
BG, PANEL, LINE, LINE2 = (4, 6, 4), (9, 14, 10), (34, 64, 44), (64, 120, 84)
INK, INK2, MUTED = (223, 245, 223), (165, 195, 166), (110, 140, 112)
GREEN, AMBER, RED, LIME, VIOLET = (120, 255, 170), (255, 154, 60), (255, 56, 100), (184, 255, 107), (180, 140, 255)
STATUS = {"open": GREEN, "debriefing": AMBER, "done": LIME, "folded": MUTED}


@lru_cache(maxsize=32)
def _font(size: int, weight: str = "Regular"):
    try:
        return ImageFont.truetype(str(FONTS / f"JetBrainsMono-{weight}.ttf"), size)
    except Exception:
        return ImageFont.load_default(size)


def _fit(d, text, size, weight, width):
    """The text, cut with an ellipsis to fit `width` px."""
    text = str(text or "")
    f = _font(size, weight)
    if d.textlength(text, font=f) <= width:
        return text
    while text and d.textlength(text + "…", font=f) > width:
        text = text[:-1]
    return text.rstrip() + "…"


def _txt(d, xy, text, size=28, weight="Regular", fill=INK, width=None, anchor="la"):
    if width:
        text = _fit(d, text, size, weight, width)
    d.text(xy, str(text), font=_font(size, weight), fill=fill, anchor=anchor)
    return d.textlength(str(text), font=_font(size, weight))


def _frame(kicker, kcolor=GREEN):
    im = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(im)
    for y in range(0, H, 4):   # faint scanlines
        d.line([(0, y), (W, y)], fill=(6, 10, 7))
    c = 22   # cut-corner frame
    d.polygon([(24 + c, 24), (W - 24, 24), (W - 24, H - 24 - c), (W - 24 - c, H - 24), (24, H - 24), (24, 24 + c)],
              outline=LINE2, width=2)
    _txt(d, (56, 50), "WARMIND", 22, "ExtraBold", GREEN)
    _txt(d, (W - 56, 50), kicker, 22, "Bold", kcolor, anchor="ra")
    d.line([(56, 86), (W - 56, 86)], fill=LINE, width=1)
    return im, d


def _star(d, cx, cy, r, color=AMBER):
    import math
    pts = []
    for i in range(10):
        a = -math.pi / 2 + i * math.pi / 5
        rr = r if i % 2 == 0 else r * 0.45
        pts.append((cx + rr * math.cos(a), cy + rr * math.sin(a)))
    d.polygon(pts, fill=color)


def _compact(v):
    if not isinstance(v, (int, float)) or isinstance(v, bool):
        return v
    if abs(v) >= 1_000_000:
        return f"{v / 1_000_000:.1f}M".replace(".0M", "M")
    if abs(v) >= 10_000:
        return f"{v / 1000:.1f}k".replace(".0k", "k")
    return f"{v:,}" if isinstance(v, int) else f"{v:g}"


def _stat(d, x, y, label, value, color=AMBER, w=180):
    _txt(d, (x, y), value if value not in (None, "") else "—", 54, "ExtraBold", color, width=w)
    _txt(d, (x, y + 66), label.upper(), 18, "Bold", MUTED, width=w)


def _bar(d, x, y, w, frac, color=GREEN):
    d.rectangle([x, y, x + w, y + 10], outline=LINE2, fill=PANEL)
    frac = max(0.0, min(1.0, frac))
    if frac:
        d.rectangle([x + 1, y + 1, x + 1 + int((w - 2) * frac), y + 9], fill=color)


def _footer(d, url):
    d.line([(56, H - 92), (W - 56, H - 92)], fill=LINE, width=1)
    _txt(d, (56, H - 76), url, 22, "Regular", INK2, width=W - 112)


def _png(im) -> bytes:
    b = io.BytesIO()
    im.save(b, "PNG", optimize=True)
    return b.getvalue()


def _mission_line(m):
    if not m:
        return "No mission set yet"
    bits = [m.get("name"), f"D{m['difficulty']}" if m.get("difficulty") else None,
            (m.get("faction") or "").capitalize() or None, (m.get("mode") or "").upper() or None]
    return " · ".join(b for b in bits if b)


def table(t: dict) -> bytes:
    """t: name, status, mission{name,difficulty,faction,mode}, planet, room, code, url,
    squad_size, divers[{callsign, style, go, debriefed, medal}]"""
    st = t.get("status") or "open"
    im, d = _frame("WAR TABLE · " + st.upper(), STATUS.get(st, GREEN))
    _txt(d, (56, 112), t.get("name") or "War table", 60, "ExtraBold", INK, width=W - 112)
    _txt(d, (56, 192), _mission_line(t.get("mission")), 28, "Bold", AMBER, width=W - 112)
    sub = " · ".join(x for x in [t.get("planet"), ("War room: " + t["room"]) if t.get("room") else None] if x)
    if sub:
        _txt(d, (56, 232), sub, 24, "Regular", INK2, width=W - 112)
    divers = t.get("divers") or []
    n_go = sum(1 for x in divers if x.get("go"))
    y = 280
    if not divers:
        _txt(d, (56, y + 20), "No divers yet. Join with the code below.", 28, "Regular", MUTED)
    for x in divers[:4]:
        d.rectangle([56, y, W - 56, y + 52], outline=LINE, fill=PANEL)
        go = x.get("go")
        d.ellipse([74, y + 16, 94, y + 36], fill=GREEN if go else None, outline=GREEN if go else MUTED, width=2)
        _txt(d, (112, y + 9), x.get("callsign") or "?", 30, "Bold", INK, width=430)
        _txt(d, (560, y + 14), x.get("style") or "", 22, "Regular", INK2, width=300)
        right = x["medal"] if x.get("medal") else ("DEBRIEFED" if x.get("debriefed") else ("GO" if go else "NO-GO"))
        tw = _txt(d, (W - 74, y + 14), right, 22, "Bold", AMBER if x.get("medal") else (LIME if x.get("debriefed") or go else MUTED),
                  anchor="ra", width=290)
        if x.get("medal"):
            _star(d, W - 74 - tw - 18, y + 27, 10)
        y += 58
    size = t.get("squad_size") or 4
    tail = f"{len(divers)}/{size} divers" + (f" · {n_go} GO" if divers else "")
    if divers and n_go == len(divers) and st == "open":
        tail += " · ALL GO"
    _txt(d, (W - 56, H - 76), tail, 22, "Bold", GREEN, anchor="ra")
    _footer(d, f"Code {t.get('code')} · {t.get('url')}")
    return _png(im)


def room(r: dict) -> bytes:
    """r: name, ship, mission{...}, planet, stats{nights,tables,drops,medals,kills}, orders[{title, progress,
    target, done}], crew, ribbons, url"""
    im, d = _frame("WAR ROOM", GREEN)
    _txt(d, (56, 112), r.get("name") or "War room", 60, "ExtraBold", INK, width=W - 112)
    _txt(d, (56, 190), r.get("ship") or "", 26, "Bold", GREEN, width=W - 112)
    s = r.get("stats") or {}
    for i, (k, lab) in enumerate([("nights", "nights"), ("drops", "drops"), ("medals", "medals"), ("kills", "kills")]):
        v = s.get(k)
        _stat(d, 56 + i * 200, 232, lab, _compact(v))
    _txt(d, (900, 240), f"{r.get('crew') or 0} crew", 26, "Bold", INK2)
    _txt(d, (900, 278), f"{r.get('ribbons') or 0} ribbons", 26, "Bold", INK2)
    _txt(d, (56, 336), "TONIGHT", 18, "Bold", MUTED)
    _txt(d, (56, 358), _mission_line(r.get("mission")) + (f" · {r['planet']}" if r.get("planet") else ""), 26, "Bold", AMBER,
         width=W - 112)
    orders = [o for o in (r.get("orders") or []) if not o.get("done")][:3]
    y = 404
    if orders:
        _txt(d, (56, y), "STANDING ORDERS", 18, "Bold", MUTED)
        y += 28
    for o in orders:
        tgt = o.get("target") or 1
        _txt(d, (56, y), o.get("title") or "", 22, "Regular", INK, width=700)
        _txt(d, (W - 56, y), f"{o.get('progress', 0)}/{tgt}", 22, "Bold", GREEN, anchor="ra")
        _bar(d, 790, y + 8, 200, (o.get("progress") or 0) / tgt)
        y += 33
    _footer(d, r.get("url") or "")
    return _png(im)


def diver(p: dict) -> bytes:
    """p: callsign, style, rates{accuracy, kd, kills_pm, win_rate, missions}, medals[str], n_medals, url"""
    im, d = _frame("DIVER PROFILE", GREEN)
    _txt(d, (56, 112), p.get("callsign") or "Diver", 72, "ExtraBold", INK, width=W - 112)
    if p.get("style"):
        _txt(d, (56, 206), "Plays as " + p["style"], 28, "Bold", GREEN, width=W - 112)
    r = p.get("rates") or {}
    pct = lambda v: f"{v * 100:.0f}%" if isinstance(v, (int, float)) else None
    cells = [("accuracy", pct(r.get("accuracy"))), ("K/D", r.get("kd")), ("kills / mission", r.get("kills_pm")),
             ("missions won", pct(r.get("win_rate"))), ("missions", r.get("missions"))]
    for i, (lab, v) in enumerate(cells):
        _stat(d, 56 + i * 220, 270, lab, _compact(v), w=200)
    _txt(d, (56, 410), f"MEDALS · {p.get('n_medals') or 0}", 18, "Bold", MUTED)
    medals = p.get("medals") or []
    if not medals:
        _txt(d, (56, 440), "None yet. Swear an oath at the next war table.", 24, "Regular", MUTED)
    x, y = 56, 440
    for m in medals[:6]:
        label = _fit(d, m, 22, "Bold", W - 112 - 60)
        w = d.textlength(label, font=_font(22, "Bold")) + 56
        if x + w > W - 56:
            x, y = 56, y + 46
            if y > 490:
                break
        d.rectangle([x, y, x + w, y + 36], outline=AMBER, fill=PANEL)
        _star(d, x + 22, y + 18, 10)
        _txt(d, (x + 42, y + 6), label, 22, "Bold", AMBER)
        x += w + 12
    _footer(d, p.get("url") or "")
    return _png(im)
