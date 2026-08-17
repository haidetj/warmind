#!/usr/bin/env python3
"""Verify your ANTHROPIC_API_KEY + a real career screenshot end to end.

    ANTHROPIC_API_KEY=sk-ant-... python vision_smoke.py career.png

Prints the parsed stats, the doctrine validity checks, and the play-style read.
Exits non-zero if the key is missing (mock mode) so you know it wasn't a live call.
"""

import json
import mimetypes
import pathlib
import sys

import vision


def main():
    if len(sys.argv) < 2:
        print("usage: python vision_smoke.py <screenshot.png> [more.png ...]")
        raise SystemExit(2)
    if vision.MOCK:
        print("ANTHROPIC_API_KEY is not set — this would run in MOCK mode, not a live call.")
        raise SystemExit(1)
    images = []
    for arg in sys.argv[1:]:
        p = pathlib.Path(arg)
        images.append((p.read_bytes(), mimetypes.guess_type(str(p))[0] or "image/png"))
    print(f"reading {len(images)} screenshot(s)…")
    parsed = vision.parse_career(images)
    print("callsign :", parsed["callsign"])
    print("play_style:", parsed["play_style"], "—", parsed["style_note"])
    if parsed["validity"]:
        print("validity  :", parsed["validity"])
    print("snapshot  :", json.dumps(parsed["snapshot"], indent=2))


if __name__ == "__main__":
    main()
