import { useCallback, useEffect, useRef, useState } from 'react'
import {
  activarDictadoVoz,
  isVoiceDictationSupported,
  type VoiceDictationController,
  type VoiceDictationOptions,
  type VoiceDictationState,
} from '@/utils/voiceDictation'

export function useVoiceDictation(
  targetInputId: string | null,
  options?: VoiceDictationOptions,
) {
  const controllerRef = useRef<VoiceDictationController | null>(null)
  const optionsRef = useRef(options)
  optionsRef.current = options
  const [state, setState] = useState<VoiceDictationState>({
    status: 'idle',
    interimText: '',
  })
  const supported = isVoiceDictationSupported()

  useEffect(() => {
    if (!targetInputId) return

    controllerRef.current = activarDictadoVoz(targetInputId, setState, {
      getValue: () => optionsRef.current?.getValue?.() ?? '',
      onValueChange: (value) => optionsRef.current?.onValueChange?.(value),
    })

    return () => {
      controllerRef.current?.destroy()
      controllerRef.current = null
    }
  }, [targetInputId])

  const toggle = useCallback(() => {
    controllerRef.current?.toggle()
  }, [])

  const start = useCallback(() => {
    controllerRef.current?.start()
  }, [])

  const stop = useCallback(() => {
    controllerRef.current?.stop()
  }, [])

  return {
    supported,
    isListening: state.status === 'listening',
    state,
    toggle,
    start,
    stop,
  }
}
