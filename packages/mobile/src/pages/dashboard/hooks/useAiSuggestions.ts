import { useCallback, useEffect, useState } from 'react'
import { aiApi } from '@/api/ai'
import type { AiSuggestion } from '@/types'

export function useAiSuggestions() {
  const [enabled, setEnabled] = useState(false)
  const [suggestions, setSuggestions] = useState<AiSuggestion[]>([])
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const result = await aiApi.suggestions()
      const nextSuggestions = result.enabled ? result.suggestions : []
      setEnabled(result.enabled && nextSuggestions.length > 0)
      setSuggestions(nextSuggestions)
    } catch {
      setEnabled(false)
      setSuggestions([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return {
    enabled,
    suggestions,
    loading,
    refresh: load,
  }
}
