import { useState, useMemo, useEffect } from 'react'
import './App.css'
import { useTLEs } from './hooks/useTLEs'
import { usePasses } from './hooks/usePasses'
import { MapView } from './components/MapView'
import { SkyView } from './components/SkyView'
import { ContactList } from './components/ContactList'
import { ControlPanel } from './components/ControlPanel'
import { PassCharts } from './components/PassCharts'
import type { Station, PassSettings, Pass } from './types'

function useAge(date: Date | null): string {
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick(n => n + 1), 30_000)
    return () => clearInterval(id)
  }, [])
  if (!date) return ''
  const s = Math.floor((Date.now() - date.getTime()) / 1000)
  if (s < 60)  return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m ago`
}

const DEFAULT_SETTINGS: PassSettings = {
  windowMin: 90,
  minElDeg: 10,
  activeConstellations: ['starlink', 'oneweb', 'kuiper'],
  freqGHz: { starlink: 11.7, oneweb: 11.5, kuiper: 19.5 },
}

export default function App() {
  const [station, setStation] = useState<Station | null>(null)
  const [settings, setSettings] = useState<PassSettings>(DEFAULT_SETTINGS)
  const [selectedPassId, setSelectedPassId] = useState<string | null>(null)

  const { tles, loading: tlesLoading, error: tlesError, counts, fetchedAt } = useTLEs()
  const { passes, loading: passesLoading, progress } = usePasses(station, tles, settings)

  const selectedPass: Pass | null = useMemo(
    () => passes.find(p => p.id === selectedPassId) ?? null,
    [passes, selectedPassId]
  )

  const totalSats = counts.starlink + counts.oneweb + counts.kuiper
  const tleAge = useAge(fetchedAt)

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-left">
          <span className="logo">&#9650;</span>
          <h1>Point-Sat</h1>
          <span className="subtitle">LEO Constellation Pass Predictor</span>
        </div>
        <div className="header-status">
          {tlesError && <span className="status-chip status-chip--error">TLE error</span>}

          {tlesLoading
            ? <span className="status-chip status-chip--loading">Loading TLEs…</span>
            : totalSats > 0
              ? <span className="status-chip" title={fetchedAt?.toUTCString()}>
                  <span className="status-icon">&#9670;</span>
                  {totalSats.toLocaleString()} sats
                  {tleAge && <span className="status-age"> · {tleAge}</span>}
                </span>
              : <span className="status-chip status-chip--warn">No TLE data</span>
          }

          {passesLoading
            ? <span className="status-chip status-chip--loading">
                Computing {progress ?? 'passes'}…
              </span>
            : station
              ? <span className="status-chip">
                  <span className="status-icon">&#9711;</span>
                  {passes.length} contact{passes.length !== 1 ? 's' : ''}
                </span>
              : null
          }
        </div>
      </header>

      <ControlPanel
        station={station}
        settings={settings}
        onSettingsChange={setSettings}
        onStationChange={setStation}
      />

      <main className="main-view">
        <MapView
          station={station}
          onStationChange={setStation}
          passes={passes}
          selectedPassId={selectedPassId}
          onSelectPass={setSelectedPassId}
        />
        <SkyView
          passes={passes}
          selectedPass={selectedPass}
          onSelectPass={setSelectedPassId}
        />
      </main>

      {selectedPass && (
        <PassCharts
          pass={selectedPass}
          freqGHz={settings.freqGHz[selectedPass.constellation]}
        />
      )}

      <ContactList
        passes={passes}
        selectedPassId={selectedPassId}
        onSelectPass={setSelectedPassId}
      />
    </div>
  )
}
