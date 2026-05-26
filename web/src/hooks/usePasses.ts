import { useEffect, useRef, useState } from 'react'
import type { Pass, Station, TLEData, PassSettings, WorkerOutMessage, ConstellationKey } from '../types'

const DEBOUNCE_MS = 600

export function usePasses(
  station: Station | null,
  tles: TLEData | null,
  settings: PassSettings
) {
  const [passes, setPasses] = useState<Pass[]>([])
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState<string | null>(null)
  const workerRef = useRef<Worker | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const worker = new Worker(
      new URL('../workers/propagation.worker.ts', import.meta.url),
      { type: 'module' }
    )
    workerRef.current = worker

    worker.onmessage = (e: MessageEvent<WorkerOutMessage>) => {
      const msg = e.data
      if (msg.type === 'PROGRESS') {
        const label: Record<ConstellationKey, string> = {
          starlink: 'Starlink',
          oneweb: 'OneWeb',
          kuiper: 'Kuiper',
        }
        setProgress(label[msg.constellation])
      } else if (msg.type === 'PASSES_RESULT') {
        setPasses(msg.passes)
        setLoading(false)
        setProgress(null)
      }
    }

    return () => worker.terminate()
  }, [])

  useEffect(() => {
    if (!station || !tles) return

    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      if (!workerRef.current) return
      setLoading(true)
      setPasses([])
      workerRef.current.postMessage({
        type: 'FIND_PASSES',
        tles,
        station,
        settings,
        startTime: Date.now(),
      })
    }, DEBOUNCE_MS)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [station, tles, settings])

  return { passes, loading, progress }
}
