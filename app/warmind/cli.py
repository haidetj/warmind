"""Render a directive to the terminal — the loadout list people read at the ship.

    python -m warmind.cli --session se_martale_01 --mode challenge
    python -m warmind.cli --planet Martale --mission neutralize_ground_to_orbit \
        --faction automatons --difficulty 10 --mode challenge \
        --modifiers complex_stratagem_plotting,poor_intel
"""

from __future__ import annotations

import argparse
import pathlib

from .resolve import Session, resolve_squad
from .squad import SquadState

DEFAULT_SQUAD = pathlib.Path(__file__).resolve().parent.parent / "squad.json"


def render(directive) -> str:
    s = directive.session
    out = []
    title = s.planet_name or "operation"
    out.append(f"\nDIRECTIVE — {title} · {s.faction} · D{s.difficulty} · {s.mode.upper()}")
    out.append("=" * 66)

    top = ", ".join(f"{k} {v:+.2f}" for k, v in directive.pressure.top(5))
    out.append(f"Read: {top}")
    if directive.pressure.driver():
        out.append(f"The constraint that decides it: {directive.pressure.driver()}.")
    out.append("")

    for a in directive.assignments:
        out.append(f"{a.role} — {a.callsign}")
        out.append(f"- Primary:   {a.primary}")
        out.append(f"- Secondary: {a.secondary}")
        out.append(f"- Grenade:   {a.grenade}")
        out.append(f"- Armor:     {a.armor} ({a.armor_weight}, {a.armor_passive})")
        out.append(f"- Booster:   {a.booster}")
        for st in a.stratagems:
            tag = "  ← growth" if st == a.growth_slot else ""
            out.append(f"- {st}{tag}")
        if a.thin:
            out.append(f"  thin: {', '.join(a.thin)}")
        out.append(f"  » {a.rationale}")
        out.append("")

    out.append("-" * 66)
    out.append("CAPABILITY MATRIX")
    from .coverage import AXIS_LABEL
    for axis, label in AXIS_LABEL.items():
        holders = directive.capability_matrix.get(axis, [])
        out.append(f"  {label:<14} {', '.join(holders) if holders else 'NOBODY — reroll'}")
    out.append("")

    if directive.loop:
        out.append("INTERLOCK LOOP  (remove any link and the other roles degrade)")
        out.append("  " + "  →  ".join(a for a, _ in directive.loop) + f"  →  {directive.loop[0][0]}")
        out.append("")

    if directive.cadence:
        out.append("CADENCE")
        for beat, role in directive.cadence:
            out.append(f"  {beat:<6} {role}")
        if directive.reactive_role:
            out.append(f"  Reactive calls: {directive.reactive_role} only. Everyone else pre-plans.")
        out.append("")

    if directive.notes:
        out.append("NOTES")
        for n in directive.notes:
            out.append(f"  • {n}")
    out.append("")
    return "\n".join(out)


def main(argv=None):
    ap = argparse.ArgumentParser(prog="warmind")
    ap.add_argument("--squad", default=str(DEFAULT_SQUAD), help="path to squad-state JSON")
    ap.add_argument("--session", help="replay a stored session id (e.g. se_martale_01)")
    ap.add_argument("--mode", choices=["fun", "challenge", "improvement"])
    ap.add_argument("--planet", default="")
    ap.add_argument("--hazards", default="", help="comma-separated hazard ids")
    ap.add_argument("--mission", default="")
    ap.add_argument("--faction", default="automatons")
    ap.add_argument("--difficulty", type=int, default=7)
    ap.add_argument("--modifiers", default="", help="comma-separated operation modifiers")
    ap.add_argument("--tactical", default="", help="comma-separated tactical objective ids")
    ap.add_argument("--city", action="store_true")
    args = ap.parse_args(argv)

    state = SquadState.load(args.squad)

    if args.session:
        session, players = state.session(args.session, mode=args.mode)
    else:
        session = Session(
            planet_name=args.planet,
            planet_hazards=[h for h in args.hazards.split(",") if h],
            mission_id=args.mission, faction=args.faction, difficulty=args.difficulty,
            mode=args.mode or "improvement",
            operation_modifiers=[m for m in args.modifiers.split(",") if m],
            tactical_objectives=[t for t in args.tactical.split(",") if t],
            is_city_map=args.city,
        )
        players = state.players

    directive = resolve_squad(session, players, history=state.history())
    print(render(directive))


if __name__ == "__main__":
    main()
