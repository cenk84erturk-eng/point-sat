import { useCallback } from 'react'
import type { Station, PassSettings, ConstellationKey } from '../types'

interface Props {
  station: Station | null
  settings: PassSettings
  onSettingsChange: (s: PassSettings) => void
  onStationChange: (s: Station) => void
}

const CONSTELLATIONS: { key: ConstellationKey; label: string }[] = [
  { key: 'starlink', label: 'Starlink' },
  { key: 'oneweb',   label: 'OneWeb' },
  { key: 'kuiper',   label: 'Kuiper' },
]

export function ControlPanel({ station, settings, onSettingsChange, onStationChange }: Props) {
  const toggleConstellation = useCallback((key: ConstellationKey) => {
    const active = settings.activeConstellations
    const next = active.includes(key) ? active.filter(k => k !== key) : [...active, key]
    if (next.length === 0) return
    onSettingsChange({ ...settings, activeConstellations: next })
  }, [settings, onSettingsChange])

  const setLat = (v: string) => {
    const n = parseFloat(v)
    if (!isNaN(n) && n >= -90 && n <= 90) {
      onStationChange({ lat: n, lon: station?.lon ?? 0, alt: station?.alt ?? 0 })
    }
  }

  const setLon = (v: string) => {
    const n = parseFloat(v)
    if (!isNaN(n) && n >= -180 && n <= 180) {
      onStationChange({ lat: station?.lat ?? 0, lon: n, alt: station?.alt ?? 0 })
    }
  }

  return (
    <div className="control-panel">
      <div className="control-group">
        <span className="control-label">Station</span>
        <input
          className="control-input"
          type="number"
          placeholder="Lat"
          value={station?.lat ?? ''}
          onChange={e => setLat(e.target.value)}
          step="0.001"
          min="-90"
          max="90"
        />
        <input
          className="control-input"
          type="number"
          placeholder="Lon"
          value={station?.lon ?? ''}
          onChange={e => setLon(e.target.value)}
          step="0.001"
          min="-180"
          max="180"
        />
      </div>

      <div className="divider" />

      <div className="control-group">
        <span className="control-label">Window</span>
        <input
          className="control-input"
          type="number"
          value={settings.windowMin}
          onChange={e => {
            const v = parseInt(e.target.value)
            if (!isNaN(v) && v >= 10 && v <= 480) onSettingsChange({ ...settings, windowMin: v })
          }}
          min="10" max="480" step="10"
        />
        <span className="control-label">min</span>
      </div>

      <div className="control-group">
        <span className="control-label">Min El</span>
        <input
          className="control-input"
          type="number"
          value={settings.minElDeg}
          onChange={e => {
            const v = parseFloat(e.target.value)
            if (!isNaN(v) && v >= 0 && v <= 60) onSettingsChange({ ...settings, minElDeg: v })
          }}
          min="0" max="60" step="1"
        />
        <span className="control-label">°</span>
      </div>

      <div className="divider" />

      <div className="control-group">
        <span className="control-label">Constellations</span>
        {CONSTELLATIONS.map(({ key, label }) => (
          <button
            key={key}
            className={`toggle-btn ${settings.activeConstellations.includes(key) ? `active-${key}` : ''}`}
            onClick={() => toggleConstellation(key)}
          >
            <span className={`dot dot-${key}`} />
            {label}
          </button>
        ))}
      </div>

      <div className="divider" />

      <div className="control-group">
        <span className="control-label">Freq (GHz)</span>
        {CONSTELLATIONS.map(({ key }) => (
          <input
            key={key}
            className="control-input"
            type="number"
            style={{ width: 60 }}
            value={settings.freqGHz[key]}
            onChange={e => {
              const v = parseFloat(e.target.value)
              if (!isNaN(v) && v > 0)
                onSettingsChange({ ...settings, freqGHz: { ...settings.freqGHz, [key]: v } })
            }}
            step="0.1" min="0.1" max="100"
            title={`${key} carrier frequency`}
          />
        ))}
      </div>
    </div>
  )
}
