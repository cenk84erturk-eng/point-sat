import { useState, useMemo } from 'react'
import './App.css'
import { useTLEs } from './hooks/useTLEs'
import { usePasses } from './hooks/usePasses'
import { MapView } from './components/MapView'
import { SkyView } from './components/SkyView'
import { ContactList } from './components/ContactList'
import { ControlPanel } from './components/ControlPanel'
import { PassCharts } from './components/PassCharts'
import type { Station, PassSettings, Pass } from './types'

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

  const { tles, loading: tlesLoading, error: tlesError, counts } = useTLEs()
  const { passes, loading: passesLoading, progress } = usePasses(station, tles, settings)

  const selectedPass: Pass | null = useMemo(
    () => passes.find(p => p.id === selectedPassId) ?? null,
    [passes, selectedPassId]
  )

  const totalSats = counts.starlink + counts.oneweb + counts.kuiper

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-left">
          <span className="logo">&#9650;</span>
          <h1>Point-Sat</h1>
          <span className="subtitle">LEO Constellation Pass Predictor</span>
        </div>
        <div className="header-status">
          {tlesLoading && <span className="badge loading">Loading TLEs…</span>}
          {tlesError && <span className="badge error">TLE error</span>}
          {!tlesLoading && !tlesError && totalSats > 0 && (
            <span className="badge ok">{totalSats.toLocaleString()} satellites loaded</span>
          )}
          {!tlesLoading && !tlesError && totalSats === 0 && (
            <span className="badge warn">No TLE data — run scripts/fetch_tles.py</span>
          )}
          {passesLoading && (
            <span className="badge loading">Computing {progress ?? 'passes'}…</span>
          )}
          {!passesLoading && station && passes.length > 0 && (
            <span className="badge ok">{passes.length} upcoming contact{passes.length !== 1 ? 's' : ''}</span>
          )}
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
