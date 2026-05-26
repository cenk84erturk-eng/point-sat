#!/usr/bin/env python3
"""Fetch current TLEs from CelesTrak and write to web/public/data/ as JSON."""
import json
import sys
import time
from pathlib import Path

try:
    import requests
except ImportError:
    print("requests not installed — run: pip install requests", file=sys.stderr)
    sys.exit(1)

BASE_URL = "https://celestrak.org/NORAD/elements/gp.php"
DATA_DIR = Path(__file__).parent.parent / "web/public/data"

# CelesTrak GROUP identifiers  (kuiper: verify/update as fleet grows)
GROUPS: dict[str, str] = {
    "starlink": "starlink",
    "oneweb":   "oneweb",
    "kuiper":   "kuiper",
}


def parse_tle_text(text: str) -> list[dict]:
    """Parse 3-line TLE text format into list of dicts."""
    sats = []
    lines = [ln.rstrip() for ln in text.splitlines() if ln.strip()]
    i = 0
    while i + 2 < len(lines):
        name = lines[i].strip()
        l1   = lines[i + 1].strip()
        l2   = lines[i + 2].strip()
        if l1.startswith('1 ') and l2.startswith('2 '):
            norad = l1[2:7].strip()
            sats.append({"name": name, "noradId": norad, "line1": l1, "line2": l2})
            i += 3
        else:
            i += 1
    return sats


def fetch_group(group_key: str, celestrak_group: str) -> int:
    params = {"GROUP": celestrak_group, "FORMAT": "tle"}
    resp = requests.get(
        BASE_URL, params=params, timeout=30,
        headers={"Accept": "text/plain", "User-Agent": "point-sat/0.2 (research)"}
    )

    # CelesTrak returns 403 when data hasn't changed — treat as cache-hit
    if resp.status_code == 403 and "has not updated" in resp.text:
        print(f"  {group_key:10s}: CelesTrak says no new data (cached copy is current)")
        return -1   # signal: existing file is already up to date

    resp.raise_for_status()
    sats = parse_tle_text(resp.text)

    out_path = DATA_DIR / f"{group_key}.json"
    out_path.write_text(json.dumps(sats, indent=2))
    print(f"  {group_key:10s}: {len(sats):5d} satellites  → {out_path}")
    return len(sats)


def main() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    print(f"Fetching TLEs from CelesTrak → {DATA_DIR}")
    total = 0
    for key, grp in GROUPS.items():
        try:
            n = fetch_group(key, grp)
            total += n
        except requests.HTTPError as e:
            print(f"  {key}: HTTP error {e.response.status_code} — skipping", file=sys.stderr)
        except Exception as e:
            print(f"  {key}: error — {e}", file=sys.stderr)
        time.sleep(0.5)  # be polite to CelesTrak
    print(f"Done. {total} total satellites.")


if __name__ == "__main__":
    main()
