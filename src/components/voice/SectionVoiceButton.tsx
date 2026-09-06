import { useEffect, useRef, useState } from 'react'

import { activarAsistenteVozClinico } from '@/utils/clinicalVoiceAssistant'
import type { ClinicalVoiceScope } from '@/utils/voiceCommandParser'
import { isVoiceDictationSupported } from '@/utils/voiceDictation'
import type { ClinicalVoiceExecutionResult } from '@/utils/clinicalVoiceExecutor'

interface SectionVoiceButtonProps {
  scope: ClinicalVoiceScope
  disabled?: boolean
  label?: string
  className?: string
}

export function SectionVoiceButton({
  scope,
  disabled = false,
  label = 'Dictar sección por voz',
  className = '',
}: SectionVoiceButtonProps) {
  const [listening, setListening] = useState(false)
  const [message, setMessage] = useState('')
  const [ok, setOk] = useState<boolean | null>(null)
  const controllerRef = useRef<ReturnType<typeof activarAsistenteVozClinico>>(null)

  useEffect(() => {
    return () => {
      controllerRef.current?.destroy()
      controllerRef.current = null
    }
  }, [])

  if (!isVoiceDictationSupported()) return null

  const toggle = () => {
    if (disabled) return

    if (!controllerRef.current) {
      controllerRef.current = activarAsistenteVozClinico(
        (result: ClinicalVoiceExecutionResult) => {
          setOk(result.ok)
          setMessage(result.message)
        },
        (state) => {
          setListening(state.status === 'listening')
          if (state.status === 'error') {
            setOk(false)
            setMessage(state.errorMessage ?? 'Error de voz')
          }
        },
        { scope },
      )
    }

    controllerRef.current?.toggle()
  }

  return (
    <div className={`inline-flex flex-col items-end gap-0.5 ${className}`}>
      <button
        type="button"
        onClick={toggle}
        disabled={disabled}
        title={label}
        aria-label={label}
        aria-pressed={listening}
        className={`btn-voice-mic ${listening ? 'voice-mic--listening' : ''}`}
      >
        <span aria-hidden>{listening ? 'Escuchando…' : '🎙️'}</span>
      </button>
      {message && (
        <span
          className={`max-w-[14rem] text-right text-[10px] ${
            ok === false ? 'text-amber-700' : 'text-green-700'
          }`}
        >
          {message}
        </span>
      )}
    </div>
  )
}
