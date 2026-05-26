import { useEffect } from 'react'
import { MapContainer, TileLayer, Marker, Polyline, Circle, useMapEvents, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { Pass, Station } from '../types'

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
}

export function MapView({ station, onStationChange, passes, selectedPassId, onSelectPass }: Props) {
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
            <Circle
              center={[station.lat, station.lon]}
              radius={2_700_000}
              pathOptions={{ color: '#4c9eff', fillColor: 'transparent', weight: 1, opacity: 0.25 }}
            />
          </>
        )}

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
