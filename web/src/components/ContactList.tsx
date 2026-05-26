import { useEffect, useState } from 'react'
import type { Pass } from '../types'

function formatTime(ms: number): string {
  return new Date(ms).toUTCString().slice(17, 25) + ' UTC'
}

function formatCountdown(ms: number): string {
  const diff = ms - Date.now()
  if (diff < 0) return 'In progress'
  const s = Math.floor(diff / 1000)
  const m = Math.floor(s / 60)
  const h = Math.floor(m / 60)
  if (h > 0) return `${h}h ${m % 60}m`
  if (m > 0) return `${m}m ${s % 60}s`
  return `${s}s`
}

function formatDuration(aosMs: number, losMs: number): string {
  const s = Math.round((losMs - aosMs) / 1000)
  const m = Math.floor(s / 60)
  return `${m}m ${s % 60}s`
}

function formatAz(deg: number): string {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
  return dirs[Math.round(deg / 45) % 8]
}

interface Props {
  passes: Pass[]
  selectedPassId: string | null
  onSelectPass: (id: string) => void
}

export function ContactList({ passes, selectedPassId, onSelectPass }: Props) {
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick(n => n + 1), 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="contact-list">
      <div className="contact-list-header">
        <span className="contact-list-title">Upcoming Contacts</span>
        {passes.length > 0 && (
          <span className="badge ok">{passes.length} passes in window</span>
        )}
      </div>

      <div className="contact-table-wrap">
        {passes.length === 0 ? (
          <div className="no-passes">
            {passes.length === 0 ? 'Drop a station on the map to compute contacts.' : 'No passes in window.'}
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Satellite</th>
                <th>Const</th>
                <th>In</th>
                <th>AOS (UTC)</th>
                <th>LOS (UTC)</th>
                <th>Duration</th>
                <th>Max El</th>
                <th>Rise</th>
                <th>Set</th>
                <th>AOS Delay</th>
                <th>TCA Delay</th>
                <th>Peak Doppler</th>
              </tr>
            </thead>
            <tbody>
              {passes.map(pass => {
                const tcaSample = pass.samples.find(s => s.t === pass.tca)
                const peakDoppler = Math.max(...pass.samples.map(s => Math.abs(s.dopplerKhz)))
                const signAtTca = tcaSample ? Math.sign(tcaSample.dopplerKhz) : 1
                return (
                  <tr
                    key={pass.id}
                    className={pass.id === selectedPassId ? 'selected' : ''}
                    onClick={() => onSelectPass(pass.id)}
                  >
                    <td className="col-name">{pass.sat.name}</td>
                    <td className="col-const">
                      <span className={`const-${pass.constellation}`}>
                        {pass.constellation.toUpperCase()}
                      </span>
                    </td>
                    <td className="col-countdown">{formatCountdown(pass.aos)}</td>
                    <td className="col-time">{formatTime(pass.aos)}</td>
                    <td className="col-time">{formatTime(pass.los)}</td>
                    <td className="col-num">{formatDuration(pass.aos, pass.los)}</td>
                    <td className="col-num col-deg">{pass.maxEl.toFixed(1)}</td>
                    <td className="col-num">{formatAz(pass.aosAz)} {pass.aosAz.toFixed(0)}°</td>
                    <td className="col-num">{formatAz(pass.losAz)} {pass.losAz.toFixed(0)}°</td>
                    <td className="col-ms">
                      {pass.samples[0]?.delayMs.toFixed(1)} ms
                    </td>
                    <td className="col-ms">
                      {tcaSample?.delayMs.toFixed(1) ?? '—'} ms
                    </td>
                    <td className="col-khz">
                      {(signAtTca * peakDoppler).toFixed(1)} kHz
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
