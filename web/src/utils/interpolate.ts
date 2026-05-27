import type { PassSample } from '../types'

export interface LivePosition {
  az: number; el: number; satLat: number; satLon: number
}

export function livePosition(samples: PassSample[], nowMs: number): LivePosition | null {
  if (!samples.length) return null
  if (nowMs < samples[0].t || nowMs > samples[samples.length - 1].t) return null
  const idx = samples.findIndex(s => s.t > nowMs)
  if (idx <= 0) return { az: samples[0].az, el: samples[0].el, satLat: samples[0].satLat, satLon: samples[0].satLon }
  const s0 = samples[idx - 1]
  const s1 = samples[idx]
  const f = (nowMs - s0.t) / (s1.t - s0.t)
  return {
    az:     s0.az     + f * (s1.az     - s0.az),
    el:     s0.el     + f * (s1.el     - s0.el),
    satLat: s0.satLat + f * (s1.satLat - s0.satLat),
    satLon: s0.satLon + f * (s1.satLon - s0.satLon),
  }
}
