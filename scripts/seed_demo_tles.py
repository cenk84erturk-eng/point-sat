#!/usr/bin/env python3
"""
Generate realistic demo TLEs for each constellation.
Used for local dev when CelesTrak is rate-limited.
Real orbits: correct inclination/altitude/format.
"""
import json, math, random
from datetime import datetime, timezone
from pathlib import Path

DATA_DIR = Path(__file__).parent.parent / "web/public/data"
random.seed(42)

# WGS-84 / SGP4 constants
MU = 398600.4418   # km^3/s^2
RE = 6378.137      # km

def mean_motion(alt_km: float) -> float:
    """Mean motion in rev/day for circular orbit at given altitude."""
    a = RE + alt_km
    n_rad_s = math.sqrt(MU / a**3)
    return n_rad_s * 86400 / (2 * math.pi)

def tle_checksum(line: str) -> int:
    total = 0
    for ch in line[:68]:
        if ch.isdigit():
            total += int(ch)
        elif ch == '-':
            total += 1
    return total % 10

def fmt_ndot(v: float) -> str:
    s = f"{v:+.8f}"  # "+.00001234"
    return s[1:3] + s[3:]  # " .00001234"

def fmt_exp(v: float) -> str:
    """Format a float in TLE ±NNNNN±E notation (8 chars, implied 0.NNNNN × 10^±E)."""
    if v == 0:
        return " 00000-0"
    exp = math.floor(math.log10(abs(v))) + 1
    mant = abs(v) / 10**exp          # 0.NNNNN in [0.1, 1.0)
    sign = '-' if v < 0 else ' '
    exp_sign = '-' if exp < 0 else '+'
    mantissa = f"{mant * 100000:05.0f}"  # "15000" for mant=0.15
    return f"{sign}{mantissa}{exp_sign}{abs(exp)}"

def make_tle(name: str, norad: int, incl_deg: float, alt_km: float,
             raan_deg: float, ma_deg: float, ecc: float = 0.0001,
             bstar: float = 0.00015) -> tuple[str, str, str]:
    now = datetime.now(timezone.utc)
    yr2 = now.year % 100
    doy = now.timetuple().tm_yday + (now.hour * 3600 + now.minute * 60 + now.second) / 86400
    epoch = f"{yr2:02d}{doy:012.8f}"

    mm = mean_motion(alt_km)
    intl = f"24{norad:03d}A"

    # Line 1
    bstar_s = fmt_exp(bstar)
    ndot_s = " .00001408"
    l1 = f"1 {norad:05d}U {intl:<8s} {epoch} {ndot_s}  00000-0 {bstar_s} 0  999"
    l1 += str(tle_checksum(l1))

    # Line 2  (ecc without leading "0.")
    ecc_s = f"{ecc:.7f}"[2:]
    # Cols 64-68 = rev at epoch (5 chars); col 69 = checksum
    l2 = (f"2 {norad:05d} {incl_deg:8.4f} {raan_deg:8.4f} {ecc_s} "
          f"{0.0:8.4f} {ma_deg:8.4f} {mm:11.8f}   12")
    l2 += str(tle_checksum(l2))

    return name, l1, l2

def gen_constellation(name_prefix: str, norad_start: int,
                      incl: float, alt: float, count: int) -> list[dict]:
    sats = []
    for i in range(count):
        raan = (i * 360 / count + random.uniform(-5, 5)) % 360
        ma   = random.uniform(0, 360)
        norad = norad_start + i
        n, l1, l2 = make_tle(f"{name_prefix}-{i+1:04d}", norad, incl, alt, raan, ma)
        sats.append({"name": n, "noradId": str(norad), "line1": l1, "line2": l2})
    return sats

def main():
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    consts = {
        "starlink": gen_constellation("STARLINK", 48000, 53.0,  550, 30),
        "oneweb":   gen_constellation("ONEWEB",   47000, 87.4, 1200, 15),
        "kuiper":   gen_constellation("KUIPER",   58000, 51.9,  630, 10),
    }

    for key, sats in consts.items():
        (DATA_DIR / f"{key}.json").write_text(json.dumps(sats, indent=2))
        print(f"  {key:10s}: {len(sats)} demo satellites seeded")

    print("Demo TLEs written. Run scripts/fetch_tles.py for real data.")

if __name__ == "__main__":
    main()
