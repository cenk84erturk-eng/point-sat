import type { Pass } from '../types'

const R = 150          // SVG radius for el=0 (horizon)
const CX = 170         // SVG center X
const CY = 170         // SVG center Y
const SIZE = 340

const CONSTELLATION_COLORS: Record<string, string> = {
  starlink: '#4c9eff',
  oneweb:   '#ff8c42',
  kuiper:   '#a855f7',
}

function elToR(el: number): number {
  return R * (1 - el / 90)
}

function toXY(az: number, el: number): [number, number] {
  const r = elToR(el)
  const azRad = (az - 90) * Math.PI / 180  // rotate so 0°N = top
  return [CX + r * Math.cos(azRad), CY + r * Math.sin(azRad)]
}

function passPath(pass: Pass): string {
  const pts = pass.samples.map(s => toXY(s.az, s.el))
  return pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')
}

interface Props {
  passes: Pass[]
  selectedPass: Pass | null
  onSelectPass: (id: string) => void
}

export function SkyView({ passes, selectedPass, onSelectPass }: Props) {
  const elevRings = [0, 30, 60]
  const cardinals = [
    { az: 0,   label: 'N' },
    { az: 90,  label: 'E' },
    { az: 180, label: 'S' },
    { az: 270, label: 'W' },
  ]

  return (
    <div className="sky-view">
      <div className="sky-title">Sky View</div>
      {passes.length === 0 && (
        <div className="sky-empty">Drop a station to see upcoming passes</div>
      )}
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} style={{ width: '100%', maxHeight: 'calc(100% - 24px)' }}>
        {/* Background */}
        <circle cx={CX} cy={CY} r={R + 2} fill="#080c18" stroke="#1e2d4a" strokeWidth="1" />

        {/* Elevation rings */}
        {elevRings.map(el => (
          <circle
            key={el}
            cx={CX} cy={CY}
            r={elToR(el)}
            fill="none"
            stroke={el === 0 ? '#2a3d5a' : '#1a2a40'}
            strokeWidth={el === 0 ? 1.2 : 0.8}
            strokeDasharray={el === 0 ? undefined : '3 4'}
          />
        ))}

        {/* Elevation labels */}
        {[30, 60].map(el => (
          <text
            key={el}
            x={CX + 3}
            y={CY - elToR(el) + 9}
            fill="#2d4060"
            fontSize="8"
            fontFamily="monospace"
          >
            {el}°
          </text>
        ))}

        {/* Cardinal crosshairs */}
        {cardinals.map(({ az, label }) => {
          const [x, y] = toXY(az, 0)
          const [xi, yi] = toXY(az, 88)
          return (
            <g key={az}>
              <line x1={CX} y1={CY} x2={x} y2={y} stroke="#1a2a40" strokeWidth="0.6" />
              <text
                x={x + (x < CX ? -12 : x > CX ? 4 : -4)}
                y={y + (y < CY ? -4 : y > CY ? 10 : 4)}
                fill="#3a5070"
                fontSize="9"
                fontWeight="700"
                fontFamily="sans-serif"
              >
                {label}
              </text>
              <circle cx={xi} cy={yi} r={0} /> {/* suppress unused warning */}
            </g>
          )
        })}

        {/* Pass arcs */}
        {passes.slice(0, 20).map(pass => {
          const color = CONSTELLATION_COLORS[pass.constellation] ?? '#888'
          const isSelected = selectedPass?.id === pass.id
          const d = passPath(pass)
          const [aosX, aosY] = toXY(pass.aosAz, pass.samples[0]?.el ?? 0)
          const [losX, losY] = toXY(pass.losAz, pass.samples[pass.samples.length - 1]?.el ?? 0)
          const [tcaX, tcaY] = toXY(
            pass.samples.find(s => s.t === pass.tca)?.az ?? 0,
            pass.maxEl
          )

          return (
            <g
              key={pass.id}
              onClick={() => onSelectPass(pass.id)}
              style={{ cursor: 'pointer' }}
            >
              <path
                d={d}
                fill="none"
                stroke={color}
                strokeWidth={isSelected ? 2.2 : 1.0}
                opacity={isSelected ? 0.9 : 0.5}
              />
              <circle cx={aosX} cy={aosY} r={isSelected ? 3.5 : 2.5} fill={color} opacity={0.8} />
              <circle cx={losX} cy={losY} r={isSelected ? 3.5 : 2} fill="none" stroke={color} strokeWidth={1} opacity={0.6} />
              {isSelected && (
                <>
                  <circle cx={tcaX} cy={tcaY} r={4} fill={color} opacity={0.9} />
                  <text
                    x={tcaX + 5}
                    y={tcaY - 5}
                    fill={color}
                    fontSize="8"
                    fontFamily="monospace"
                    fontWeight="600"
                  >
                    {pass.maxEl.toFixed(1)}°
                  </text>
                </>
              )}
            </g>
          )
        })}

        {/* Zenith dot */}
        <circle cx={CX} cy={CY} r={2} fill="#1e2d4a" />
      </svg>
    </div>
  )
}
