import { useEffect, useState } from 'react'
import type { TLEData, ConstellationKey } from '../types'

type Counts = Record<ConstellationKey, number>

export function useTLEs() {
  const [tles, setTles] = useState<TLEData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [counts, setCounts] = useState<Counts>({ starlink: 0, oneweb: 0, kuiper: 0 })

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const bust = `?v=${__BUILD_TIME__}`
        const [starlink, oneweb, kuiper] = await Promise.all([
          fetch(`/data/starlink.json${bust}`, { cache: 'no-cache' }).then(r => r.json()),
          fetch(`/data/oneweb.json${bust}`, { cache: 'no-cache' }).then(r => r.json()),
          fetch(`/data/kuiper.json${bust}`, { cache: 'no-cache' }).then(r => r.json()),
        ])
        if (cancelled) return
        setTles({ starlink, oneweb, kuiper })
        setCounts({ starlink: starlink.length, oneweb: oneweb.length, kuiper: kuiper.length })
      } catch (err) {
        if (!cancelled) setError(String(err))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  return { tles, loading, error, counts }
}
