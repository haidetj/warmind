"""Load a warmind-squad-state JSON file into resolver inputs.

The JSON mirrors schema_sessions.sql field-for-field (players, snapshots, sessions,
assignments, results). This reads the parts the resolver needs: players (with their
read play-style), stored sessions to replay, and per-player item history for novelty.
"""

from __future__ import annotations

import json
import pathlib

from .resolve import Player, Session


class SquadState:
    def __init__(self, doc: dict):
        self.doc = doc
        self.players = [
            Player(
                id=p["id"], callsign=p["callsign"],
                play_style=p.get("archetype", "by_the_book"),
                unlocked_warbonds=p.get("unlocked_warbonds", []),
                excluded_items=p.get("excluded_items", []),
                accent_hex=p.get("accent_hex", "#D9CBA3"),
            )
            for p in doc.get("players", [])
        ]
        self._players_by_id = {p.id: p for p in self.players}

    @classmethod
    def load(cls, path) -> "SquadState":
        return cls(json.loads(pathlib.Path(path).read_text()))

    def player_ids(self) -> list[str]:
        return [p.id for p in self.players]

    def history(self) -> dict[str, list[str]]:
        """player_id -> every item ever assigned to them (for fun-mode novelty)."""
        hist: dict[str, list[str]] = {p.id: [] for p in self.players}
        for a in self.doc.get("assignments", []):
            pid = a.get("player_id")
            if pid not in hist:
                continue
            for key in ("primary_item", "secondary_item", "throwable_item", "armor_item"):
                if a.get(key):
                    hist[pid].append(a[key])
            hist[pid].extend(a.get("stratagems", []))
        return hist

    def session(self, session_id: str, mode: str | None = None) -> tuple[Session, list[Player]]:
        raw = next((s for s in self.doc.get("sessions", []) if s["id"] == session_id), None)
        if raw is None:
            raise KeyError(f"no session {session_id!r} in squad state")
        players_in = {a["player_id"] for a in self.doc.get("assignments", [])
                      if a["session_id"] == session_id}
        players = [self._players_by_id[pid] for pid in players_in
                   if pid in self._players_by_id] or self.players
        sess = Session(
            planet_name=raw.get("planet_name", ""),
            planet_hazards=raw.get("planet_hazards", []),
            mission_id=raw.get("mission_id", ""),
            faction=raw.get("faction", "automatons"),
            difficulty=raw.get("difficulty", 7),
            mode=mode or raw.get("mode", "improvement"),
            operation_modifiers=raw.get("operation_modifiers", []),
            tactical_objectives=raw.get("tactical_objectives", []),
            is_city_map=raw.get("is_city_map", False),
        )
        return sess, players
