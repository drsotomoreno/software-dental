import { useEffect, useId, useRef, useState } from 'react'
import {
  activarDictadoVoz,
  isVoiceDictationSupported,
  type VoiceDictationController,
} from '@/utils/voiceDictation'

interface UseDemoVoiceFieldOptions {
  value: string
  onChange: (value: string) => void
}

/**
 * Dictado por Web Speech API para campos controlados de la demo.
 * Reutiliza el motor clínico (es-CO) sin límites de prueba ni bridge global.
 */
export function useDemoVoiceField({ value, onChange }: UseDemoVoiceFieldOptions) {
  const reactId = useId().replace(/:/g, '')
  const targetId = `demo-voice-${reactId}`
  const [listening, setListening] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const valueRef = useRef(value)
  const onChangeRef = useRef(onChange)
  const controllerRef = useRef<VoiceDictationController | null>(null)

  valueRef.current = value
  onChangeRef.current = onChange

  useEffect(() => {
    if (!isVoiceDictationSupported()) {
      controllerRef.current = null
      return
    }

    const controller = activarDictadoVoz(
      targetId,
      (state) => {
        setListening(state.status === 'listening')
        setErrorMessage(state.status === 'error' ? (state.errorMessage ?? '') : '')
      },
      {
        getValue: () => valueRef.current,
        onValueChange: (next) => onChangeRef.current(next),
      },
    )
    controllerRef.current = controller
    return () => {
      controller?.destroy()
      controllerRef.current = null
      setListening(false)
    }
  }, [targetId])

  return {
    targetId,
    listening,
    errorMessage,
    supported: isVoiceDictationSupported(),
    toggle: () => controllerRef.current?.toggle(),
    stop: () => controllerRef.current?.stop(),
  }
}
