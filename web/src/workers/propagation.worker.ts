import * as satellite from 'satellite.js'
import type { TLERecord, Station, Pass, PassSample, ConstellationKey, WorkerInMessage } from '../types'

const C_KM_S = 299792.458
const COARSE_FILTER_KM = 3500
const COARSE_STEP_MS = 30_000   // 30 s scan step
const SERIES_STEP_MS = 10_000   // 10 s time-series resolution

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371
  const φ1 = lat1 * Math.PI / 180
  const φ2 = lat2 * Math.PI / 180
  const Δφ = (lat2 - lat1) * Math.PI / 180
  const Δλ = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

type ObserverGd = { longitude: number; latitude: number; height: number }

const r2d = (r: number) => r * 180 / Math.PI

function getLook(satrec: satellite.SatRec, t: Date, obs: ObserverGd) {
  const pv = satellite.propagate(satrec, t)
  if (!pv.position || typeof pv.position === 'boolean') return null
  const gmst = satellite.gstime(t)
  const pos = pv.position as satellite.EciVec3<satellite.Kilometer>
  const posEcf = satellite.eciToEcf(pos, gmst)
  const look = satellite.ecfToLookAngles(obs, posEcf)
  const gd = satellite.eciToGeodetic(pos, gmst)
  return {
    az: r2d(look.azimuth),
    el: r2d(look.elevation),
    range: look.rangeSat,
    satLat: satellite.degreesLat(gd.latitude),
    satLon: satellite.degreesLong(gd.longitude),
    pos,
    gmst,
  }
}

function bisectCrossing(
  satrec: satellite.SatRec,
  t0ms: number, t1ms: number,
  obs: ObserverGd,
  minElDeg: number,
  iters = 9
): number {
  let lo = t0ms, hi = t1ms
  for (let i = 0; i < iters; i++) {
    const mid = (lo + hi) / 2
    const look = getLook(satrec, new Date(mid), obs)
    if (!look) break
    if (look.el > minElDeg) hi = mid
    else lo = mid
  }
  return (lo + hi) / 2
}

function buildSamples(
  satrec: satellite.SatRec,
  obs: ObserverGd,
  aosMs: number,
  losMs: number,
  freqGHz: number
): PassSample[] {
  const samples: PassSample[] = []
  for (let tms = aosMs; tms <= losMs + SERIES_STEP_MS; tms += SERIES_STEP_MS) {
    const clampedT = Math.min(tms, losMs)
    const t = new Date(clampedT)
    const t1 = new Date(clampedT + 1000) // 1 s forward for range rate

    const look = getLook(satrec, t, obs)
    if (!look || look.el < -5) break

    const look1 = getLook(satrec, t1, obs)
    const rangeRate = look1 ? (look1.range - look.range) / 1.0 : 0 // km/s

    samples.push({
      t: clampedT,
      az: look.az,
      el: look.el,
      rangeKm: look.range,
      delayMs: look.range / C_KM_S * 1000,
      rangeRateKms: rangeRate,
      dopplerKhz: -(freqGHz * 1e6 * rangeRate) / C_KM_S,
      satLat: look.satLat,
      satLon: look.satLon,
    })

    if (clampedT === losMs) break
  }
  return samples
}

function processConstellation(
  tles: TLERecord[],
  constellation: ConstellationKey,
  station: Station,
  startMs: number,
  windowMs: number,
  minElDeg: number,
  freqGHz: number
): Pass[] {
  const passes: Pass[] = []
  const obs: ObserverGd = {
    longitude: satellite.degreesToRadians(station.lon),
    latitude: satellite.degreesToRadians(station.lat),
    height: station.alt / 1000,
  }
  const startDate = new Date(startMs)

  for (const tle of tles) {
    const satrec = satellite.twoline2satrec(tle.line1, tle.line2)
    if (satrec.error !== 0) continue

    // Coarse filter: skip only if satellite is never near the station during the window.
    // Check at 5 evenly spaced times (one LEO orbit ≈ 90 min, so this covers the period).
    // Only apply when constellation is large enough to justify it.
    if (tles.length > 200) {
      const checkStep = Math.max(windowMs / 5, 10 * 60_000)
      let everNear = false
      for (let dt = 0; dt <= windowMs; dt += checkStep) {
        const tc = new Date(startMs + dt)
        const pvc = satellite.propagate(satrec, tc)
        if (!pvc.position || typeof pvc.position === 'boolean') continue
        const gmc = satellite.gstime(tc)
        const gdc = satellite.eciToGeodetic(pvc.position as satellite.EciVec3<satellite.Kilometer>, gmc)
        if (haversineKm(station.lat, station.lon,
              satellite.degreesLat(gdc.latitude), satellite.degreesLong(gdc.longitude)) <= COARSE_FILTER_KM) {
          everNear = true
          break
        }
      }
      if (!everNear) continue
    }

    // Coarse scan for elevation crossings
    let wasAbove = false
    let passStartMs = 0

    for (let dt = 0; dt <= windowMs; dt += COARSE_STEP_MS) {
      const tms = startMs + dt
      const look = getLook(satrec, new Date(tms), obs)
      if (!look) continue
      const isAbove = look.el >= minElDeg

      if (!wasAbove && isAbove) {
        passStartMs = dt > 0
          ? bisectCrossing(satrec, tms - COARSE_STEP_MS, tms, obs, minElDeg)
          : startMs
        wasAbove = true
      } else if (wasAbove && !isAbove) {
        const losMs = bisectCrossing(satrec, tms - COARSE_STEP_MS, tms, obs, minElDeg)
        const pass = makePass(satrec, tle, constellation, obs, passStartMs, losMs, freqGHz, minElDeg)
        if (pass) passes.push(pass)
        wasAbove = false
      }
    }

    if (wasAbove) {
      const losMs = startMs + windowMs
      const pass = makePass(satrec, tle, constellation, obs, passStartMs, losMs, freqGHz, minElDeg)
      if (pass) passes.push(pass)
    }
  }

  return passes
}

function makePass(
  satrec: satellite.SatRec,
  tle: TLERecord,
  constellation: ConstellationKey,
  obs: ObserverGd,
  aosMs: number,
  losMs: number,
  freqGHz: number,
  _minElDeg: number
): Pass | null {
  const samples = buildSamples(satrec, obs, aosMs, losMs, freqGHz)
  if (samples.length < 2) return null

  let tcaSample = samples[0]
  for (const s of samples) {
    if (s.el > tcaSample.el) tcaSample = s
  }

  return {
    id: `${tle.noradId}-${aosMs}`,
    sat: { name: tle.name, noradId: String(tle.noradId) },
    constellation,
    aos: aosMs,
    los: losMs,
    tca: tcaSample.t,
    maxEl: tcaSample.el,
    aosAz: samples[0].az,
    losAz: samples[samples.length - 1].az,
    samples,
  }
}

addEventListener('message', (e: MessageEvent<WorkerInMessage>) => {
  const msg = e.data
  if (msg.type !== 'FIND_PASSES') return

  const { tles, station, settings, startTime } = msg
  const { windowMin, minElDeg, activeConstellations, freqGHz } = settings
  const windowMs = windowMin * 60_000
  const allPasses: Pass[] = []

  for (const constellation of activeConstellations) {
    const consTles = tles[constellation]
    if (!consTles?.length) continue

    postMessage({ type: 'PROGRESS', constellation, found: 0 })

    const passes = processConstellation(
      consTles, constellation, station,
      startTime, windowMs, minElDeg, freqGHz[constellation]
    )
    allPasses.push(...passes)
    postMessage({ type: 'PROGRESS', constellation, found: passes.length })
  }

  allPasses.sort((a, b) => a.aos - b.aos)
  postMessage({ type: 'PASSES_RESULT', passes: allPasses })
})
