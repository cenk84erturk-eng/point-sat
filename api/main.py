from __future__ import annotations
import json
import math
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

import numpy as np
from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from skyfield.api import load, wgs84, EarthSatellite

# ── Init ──────────────────────────────────────────────────────────────────────
app = FastAPI(title="Point-Sat API", version="0.2.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET"],
    allow_headers=["*"],
)

ts = load.timescale()
DATA_DIR = Path(os.getenv("DATA_DIR", Path(__file__).parent.parent / "web/public/data"))

# ── Pre-configured stations (editable) ───────────────────────────────────────
STATIONS: list[dict] = [
    {"id": "ankara",    "name": "Ankara, Turkey",      "lat": 39.9208, "lon": 32.8541,  "alt": 938},
    {"id": "istanbul",  "name": "Istanbul, Turkey",    "lat": 41.0082, "lon": 28.9784,  "alt": 40},
    {"id": "london",    "name": "London, UK",           "lat": 51.5074, "lon": -0.1278, "alt": 11},
    {"id": "new-york",  "name": "New York, USA",        "lat": 40.7128, "lon": -74.006,  "alt": 10},
    {"id": "singapore", "name": "Singapore",            "lat": 1.3521,  "lon": 103.8198, "alt": 15},
]

FREQ_DEFAULTS: dict[str, float] = {
    "starlink": 11.7,
    "oneweb":   11.5,
    "kuiper":   19.5,
}

C_KM_S = 299_792.458


# ── TLE helpers ───────────────────────────────────────────────────────────────
def load_group(group: str) -> list[dict]:
    fp = DATA_DIR / f"{group}.json"
    if not fp.exists():
        return []
    return json.loads(fp.read_text())


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371.0
    φ1, φ2 = math.radians(lat1), math.radians(lat2)
    Δφ = math.radians(lat2 - lat1)
    Δλ = math.radians(lon2 - lon1)
    a = math.sin(Δφ / 2) ** 2 + math.cos(φ1) * math.cos(φ2) * math.sin(Δλ / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


# ── Routes ────────────────────────────────────────────────────────────────────
@app.get("/health")
def health():
    groups = {g: len(load_group(g)) for g in ("starlink", "oneweb", "kuiper")}
    return {"status": "ok", "satellites": groups, "data_dir": str(DATA_DIR)}


@app.get("/api/stations")
def get_stations():
    return {"stations": STATIONS}


@app.get("/api/passes")
def get_passes(
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
    alt: float = Query(0, ge=0),
    min_el: float = Query(10.0, ge=0, le=90),
    window_min: int = Query(90, ge=10, le=480),
    groups: str = Query("starlink,oneweb,kuiper"),
):
    t0 = ts.now()
    t1 = ts.tt_jd(t0.tt + window_min / 1440.0)
    observer = wgs84.latlon(lat, lon, elevation_m=alt)

    result: list[dict] = []

    for group in [g.strip() for g in groups.split(",")]:
        tles = load_group(group)
        if not tles:
            continue

        for tle in tles:
            # Coarse filter: current subpoint
            try:
                sat = EarthSatellite(tle["line1"], tle["line2"], tle["name"], ts)
                gc = sat.at(t0)
                sub = wgs84.subpoint(gc)
                if haversine_km(lat, lon, sub.latitude.degrees, sub.longitude.degrees) > 3_500:
                    continue

                times, events = sat.find_events(observer, t0, t1, altitude_degrees=min_el)
                if not len(times):
                    continue

                # Group events into passes: 0=rise, 1=culminate, 2=set
                i = 0
                while i < len(events):
                    if events[i] == 0:
                        aos_t = times[i]
                        tca_t = times[i + 1] if i + 1 < len(events) and events[i + 1] == 1 else times[i]
                        los_t = times[i + 2] if i + 2 < len(events) and events[i + 2] == 2 else t1

                        diff_tca = sat - observer
                        top = diff_tca.at(tca_t)
                        alt_tca, _, _ = top.altaz()

                        result.append({
                            "id": f"{tle['noradId']}-{int(aos_t.tt * 86400)}",
                            "name": tle["name"],
                            "noradId": tle["noradId"],
                            "constellation": group,
                            "aos": aos_t.utc_datetime().isoformat(),
                            "los": los_t.utc_datetime().isoformat(),
                            "tca": tca_t.utc_datetime().isoformat(),
                            "maxElDeg": round(alt_tca.degrees, 2),
                            "durationSec": round((los_t - aos_t) * 86400),
                        })
                        i += 3
                    else:
                        i += 1

            except Exception:
                continue

    result.sort(key=lambda x: x["aos"])
    return {"passes": result[:50], "station": {"lat": lat, "lon": lon, "alt": alt}}


@app.get("/api/pass/timeseries")
def get_pass_timeseries(
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
    alt: float = Query(0, ge=0),
    freq_ghz: float = Query(12.0, gt=0),
    norad_id: str = Query(...),
    aos: str = Query(..., description="ISO UTC datetime"),
    los: str = Query(..., description="ISO UTC datetime"),
    step_sec: float = Query(1.0, ge=0.5, le=60),
):
    # Find the TLE for this NORAD ID
    tle_record: Optional[dict] = None
    for group in ("starlink", "oneweb", "kuiper"):
        for tle in load_group(group):
            if str(tle.get("noradId")) == str(norad_id):
                tle_record = tle
                break
        if tle_record:
            break

    if tle_record is None:
        raise HTTPException(404, f"Satellite {norad_id} not found in TLE data")

    try:
        aos_dt = datetime.fromisoformat(aos.replace("Z", "+00:00")).replace(tzinfo=timezone.utc)
        los_dt = datetime.fromisoformat(los.replace("Z", "+00:00")).replace(tzinfo=timezone.utc)
    except ValueError as exc:
        raise HTTPException(422, f"Invalid datetime: {exc}") from exc

    duration_s = (los_dt - aos_dt).total_seconds()
    if duration_s <= 0 or duration_s > 3600:
        raise HTTPException(422, "Pass duration must be 0–3600 s")

    n_steps = max(2, int(duration_s / step_sec) + 1)

    sat = EarthSatellite(tle_record["line1"], tle_record["line2"], tle_record["name"], ts)
    observer = wgs84.latlon(lat, lon, elevation_m=alt)

    t_aos = ts.from_datetime(aos_dt)
    t_los = ts.from_datetime(los_dt)
    times = ts.linspace(t_aos, t_los, n_steps)

    diff = sat - observer
    topo = diff.at(times)
    alt_angles, az_angles, dists = topo.altaz()

    ranges_km = np.array(dists.km)
    dt = duration_s / (n_steps - 1)
    range_rates = np.gradient(ranges_km, dt)  # km/s

    samples = []
    for i in range(n_steps):
        rng = float(ranges_km[i])
        rr = float(range_rates[i])
        samples.append({
            "t":              int(times[i].utc_datetime().timestamp() * 1000),
            "az":             round(float(az_angles.degrees[i]), 2),
            "el":             round(float(alt_angles.degrees[i]), 2),
            "range_km":       round(rng, 3),
            "delay_ms":       round(rng / C_KM_S * 1000, 4),
            "range_rate_kms": round(rr, 4),
            "doppler_khz":    round(-(freq_ghz * 1e6 * rr) / C_KM_S, 3),
        })

    return {
        "noradId":    norad_id,
        "name":       tle_record["name"],
        "station":    {"lat": lat, "lon": lon, "alt": alt},
        "freq_ghz":   freq_ghz,
        "columns":    ["t", "az", "el", "range_km", "delay_ms", "range_rate_kms", "doppler_khz"],
        "data":       samples,
    }
