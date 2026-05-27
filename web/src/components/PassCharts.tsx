import type { Pass } from '../types'

const COLORS: Record<string, string> = {
  starlink: '#4c9eff',
  oneweb:   '#ff8c42',
  kuiper:   '#a855f7',
}

const W = 420
const H = 110
const PAD = { top: 8, right: 16, bottom: 26, left: 46 }
const PW = W - PAD.left - PAD.right
const PH = H - PAD.top - PAD.bottom

function minmax(vals: number[]): [number, number] {
  return [Math.min(...vals), Math.max(...vals)]
}

function niceStep(range: number, ticks = 4): number {
  const raw = range / ticks
  const mag = Math.pow(10, Math.floor(Math.log10(raw)))
  const candidates = [1, 2, 5, 10].map(c => c * mag)
  return candidates.find(c => range / c <= ticks + 1) ?? candidates[candidates.length - 1]
}

function makeTicks(lo: number, hi: number): number[] {
  const step = niceStep(hi - lo)
  const first = Math.ceil(lo / step) * step
  const ticks: number[] = []
  for (let v = first; v <= hi + 1e-9; v = +(v + step).toFixed(10)) ticks.push(v)
  return ticks
}

interface ChartProps {
  label: string
  unit: string
  values: number[]
  times: number[]   // seconds from AOS
  color: string
}

function LineChart({ label, unit, values, times, color }: ChartProps) {
  const [tMin, tMax] = minmax(times)
  const [vMin, vMax] = minmax(values)
  const vPad = (vMax - vMin) * 0.1 || 1
  const yLo = vMin - vPad
  const yHi = vMax + vPad

  const xScale = (t: number) => PAD.left + ((t - tMin) / (tMax - tMin || 1)) * PW
  const yScale = (v: number) => PAD.top + PH - ((v - yLo) / (yHi - yLo)) * PH

  const pts = times.map((t, i) => `${xScale(t).toFixed(1)},${yScale(values[i]).toFixed(1)}`).join(' ')

  const tTicks = makeTicks(tMin, tMax)
  const vTicks = makeTicks(yLo, yHi)

  const zero = yLo < 0 && yHi > 0 ? yScale(0) : null

  return (
    <svg width={W} height={H} style={{ display: 'block', width: '100%', height: H }}>
      {/* background */}
      <rect x={PAD.left} y={PAD.top} width={PW} height={PH} fill="#0a0f1e" rx="2" />

      {/* zero line */}
      {zero !== null && (
        <line x1={PAD.left} y1={zero} x2={PAD.left + PW} y2={zero}
          stroke="#1e2d4a" strokeWidth="1" strokeDasharray="3 3" />
      )}

      {/* horizontal grid + y-axis ticks */}
      {vTicks.map(v => {
        const y = yScale(v)
        if (y < PAD.top - 1 || y > PAD.top + PH + 1) return null
        return (
          <g key={v}>
            <line x1={PAD.left} y1={y} x2={PAD.left + PW} y2={y}
              stroke="#1e2d4a" strokeWidth="0.5" />
            <text x={PAD.left - 4} y={y + 4} textAnchor="end"
              fontSize="9" fill="#4a5a7a">{v.toFixed(Math.abs(v) < 10 ? 1 : 0)}</text>
          </g>
        )
      })}

      {/* x-axis ticks */}
      {tTicks.map(t => {
        const x = xScale(t)
        return (
          <g key={t}>
            <line x1={x} y1={PAD.top + PH} x2={x} y2={PAD.top + PH + 4}
              stroke="#4a5a7a" strokeWidth="0.5" />
            <text x={x} y={PAD.top + PH + 14} textAnchor="middle"
              fontSize="9" fill="#4a5a7a">{t.toFixed(0)}s</text>
          </g>
        )
      })}

      {/* axes */}
      <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={PAD.top + PH}
        stroke="#1e2d4a" strokeWidth="1" />
      <line x1={PAD.left} y1={PAD.top + PH} x2={PAD.left + PW} y2={PAD.top + PH}
        stroke="#1e2d4a" strokeWidth="1" />

      {/* data line */}
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5"
        strokeLinejoin="round" strokeLinecap="round" />

      {/* label */}
      <text x={PAD.left + 4} y={PAD.top + 12} fontSize="9" fontWeight="600"
        fill="#8899b8" letterSpacing="0.05em">
        {label} ({unit})
      </text>
    </svg>
  )
}

interface Props {
  pass: Pass
  freqGHz: number
}

export function PassCharts({ pass, freqGHz }: Props) {
  const { samples, constellation, sat, aos } = pass
  if (samples.length < 2) return null

  const color = COLORS[constellation] ?? '#4c9eff'
  const C_KM_S = 299792.458
  const times = samples.map(s => (s.t - aos) / 1000)
  const delays = samples.map(s => s.delayMs)
  // delay rate of change: d(delay_ms)/dt = rangeRate_km/s / c * 1000  (ms/s)
  const delayRoc = samples.map(s => (s.rangeRateKms / C_KM_S) * 1000)
  // Doppler in ppm = -(rangeRate / c) × 1e6
  const dopplerPpm = samples.map(s => -(s.rangeRateKms / C_KM_S) * 1e6)
  // Doppler rate of change: finite difference of ppm series (ppm/s)
  const dopplerRoc = dopplerPpm.map((_v, i) => {
    if (i === 0) return (dopplerPpm[1] - dopplerPpm[0]) / ((times[1] - times[0]) || 1)
    if (i === dopplerPpm.length - 1) {
      const n = dopplerPpm.length
      return (dopplerPpm[n - 1] - dopplerPpm[n - 2]) / ((times[n - 1] - times[n - 2]) || 1)
    }
    return (dopplerPpm[i + 1] - dopplerPpm[i - 1]) / ((times[i + 1] - times[i - 1]) || 1)
  })

  const elevations = samples.map(s => s.el)
  const azimuths   = samples.map(s => s.az)

  return (
    <div className="pass-charts">
      <div className="pass-charts-header">
        <span className="pass-charts-title">
          <span className={`const-dot const-${constellation}`} />
          {sat.name}
        </span>
        <span className="pass-charts-sub">
          Pass time series · freq {freqGHz} GHz
        </span>
      </div>
      <div className="pass-charts-grid">
        {/* Row 1 */}
        <div className="pass-chart-wrap">
          <LineChart label="Delay" unit="ms"
            values={delays} times={times} color={color} />
        </div>
        <div className="pass-chart-wrap">
          <LineChart label="Doppler" unit="ppm"
            values={dopplerPpm} times={times} color={color} />
        </div>
        <div className="pass-chart-wrap">
          <LineChart label="Elevation" unit="°"
            values={elevations} times={times} color={color} />
        </div>
        {/* Row 2 */}
        <div className="pass-chart-wrap pass-chart-wrap--last pass-chart-wrap--roc">
          <LineChart label="Delay rate" unit="ms/s"
            values={delayRoc} times={times} color={color} />
        </div>
        <div className="pass-chart-wrap pass-chart-wrap--last pass-chart-wrap--roc">
          <LineChart label="Doppler rate" unit="ppm/s"
            values={dopplerRoc} times={times} color={color} />
        </div>
        <div className="pass-chart-wrap pass-chart-wrap--last">
          <LineChart label="Azimuth" unit="°"
            values={azimuths} times={times} color={color} />
        </div>
      </div>
    </div>
  )
}
