import { useEffect } from 'react'
import { MapContainer, TileLayer, Marker, Polyline, CircleMarker, useMapEvents, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { Pass, Station } from '../types'
import { livePosition } from '../utils/interpolate'

// Fix Leaflet marker icons in Vite
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

const CONSTELLATION_COLORS: Record<string, string> = {
  starlink: '#4c9eff',
  oneweb:   '#ff8c42',
  kuiper:   '#a855f7',
}

// Geodesic coverage ring: all ground points that see a satellite at exactly
// minElDeg elevation for the given orbit altitude. Uses the spherical
// destination formula so the ring is geometrically correct in all directions.
// Returns multiple segments already split at the antimeridian.
function elevationFootprint(lat: number, lon: number, minElDeg: number, altKm = 550): [number, number][][] {
  const Re = 6371
  const ε = minElDeg * Math.PI / 180
  const η = Math.asin((Re * Math.cos(ε)) / (Re + altKm))
  const ρ = Math.PI / 2 - ε - η          // Earth central angle, radians
  const φ = lat * Math.PI / 180
  const λ = lon * Math.PI / 180
  const pts: [number, number][] = []
  for (let i = 0; i <= 360; i++) {
    const θ = (i * Math.PI) / 180
    const lat2 = Math.asin(
      Math.sin(φ) * Math.cos(ρ) + Math.cos(φ) * Math.sin(ρ) * Math.cos(θ)
    )
    const lon2 =
      λ + Math.atan2(
        Math.sin(θ) * Math.sin(ρ) * Math.cos(φ),
        Math.cos(ρ) - Math.sin(φ) * Math.sin(lat2)
      )
    pts.push([lat2 * 180 / Math.PI, (lon2 * 180 / Math.PI + 540) % 360 - 180])
  }
  // split at antimeridian
  const segs: [number, number][][] = []
  let cur: [number, number][] = [pts[0]]
  for (let i = 1; i < pts.length; i++) {
    if (Math.abs(pts[i][1] - pts[i - 1][1]) > 180) {
      segs.push(cur)
      cur = []
    }
    cur.push(pts[i])
  }
  segs.push(cur)
  return segs.filter(s => s.length > 1)
}

function splitAtAntimeridian(pts: [number, number][]): [number, number][][] {
  const segs: [number, number][][] = []
  let cur: [number, number][] = []
  for (let i = 0; i < pts.length; i++) {
    if (i > 0 && Math.abs(pts[i][1] - pts[i - 1][1]) > 180) {
      if (cur.length > 1) segs.push(cur)
      cur = []
    }
    cur.push(pts[i])
  }
  if (cur.length > 1) segs.push(cur)
  return segs
}

function StationPlacer({ onPlace }: { onPlace: (lat: number, lon: number) => void }) {
  useMapEvents({ click(e) { onPlace(e.latlng.lat, e.latlng.lng) } })
  return null
}

function FlyToStation({ station }: { station: Station | null }) {
  const map = useMap()
  useEffect(() => {
    if (station) map.flyTo([station.lat, station.lon], Math.max(map.getZoom(), 5), { duration: 0.8 })
  }, [station, map])
  return null
}

interface Props {
  station: Station | null
  onStationChange: (s: Station) => void
  passes: Pass[]
  selectedPassId: string | null
  onSelectPass: (id: string) => void
  selectedPass: Pass | null
  nowMs: number
  minElDeg: number
}

export function MapView({ station, onStationChange, passes, selectedPassId, onSelectPass, selectedPass, nowMs, minElDeg }: Props) {
  const handlePlace = (lat: number, lon: number) => {
    onStationChange({ lat: parseFloat(lat.toFixed(4)), lon: parseFloat(lon.toFixed(4)), alt: 0 })
  }

  return (
    <div className="map-wrapper">
      {!station && (
        <div className="map-hint">Click anywhere on the map to drop your ground station</div>
      )}
      <MapContainer
        center={[20, 10]}
        zoom={2}
        style={{ height: '100%', width: '100%', background: '#080c18' }}
        zoomControl={true}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://carto.com/attributions">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
          maxZoom={19}
        />

        <StationPlacer onPlace={handlePlace} />
        <FlyToStation station={station} />

        {station && (
          <>
            <Marker position={[station.lat, station.lon]} />
            {elevationFootprint(station.lat, station.lon, minElDeg).map((seg, si) => (
              <Polyline
                key={`fp-${station.lat}-${station.lon}-${minElDeg}-${si}`}
                positions={seg}
                pathOptions={{ color: '#4c9eff', weight: 1.5, opacity: 0.55, dashArray: '6 5' }}
              />
            ))}
          </>
        )}

        {/* Live satellite position */}
        {selectedPass && (() => {
          const pos = livePosition(selectedPass.samples, nowMs)
          const color = CONSTELLATION_COLORS[selectedPass.constellation] ?? '#fff'
          return pos ? (
            <CircleMarker
              center={[pos.satLat, pos.satLon]}
              radius={6}
              pathOptions={{ color: '#fff', fillColor: color, fillOpacity: 1, weight: 2 }}
            />
          ) : null
        })()}

        {passes.slice(0, 30).map(pass => {
          const color = CONSTELLATION_COLORS[pass.constellation] ?? '#888'
          const isSelected = pass.id === selectedPassId
          const trackPts: [number, number][] = pass.samples.map(s => [s.satLat, s.satLon])
          const segments = splitAtAntimeridian(trackPts)

          return segments.map((seg, si) => (
            <Polyline
              key={`${pass.id}-${si}`}
              positions={seg}
              pathOptions={{
                color,
                weight: isSelected ? 2.5 : 1.2,
                opacity: isSelected ? 0.9 : 0.45,
              }}
              eventHandlers={{ click: () => onSelectPass(pass.id) }}
            />
          ))
        })}
      </MapContainer>
    </div>
  )
}
