import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  registerVoiceTarget,
  unregisterVoiceTarget,
} from '@/bootstrap/voiceDictationBridge'
import { isVoiceDictationSupported } from '@/utils/voiceDictation'
import type { VoiceDictationOptions } from '@/utils/voiceDictation'
import { assertTrialVoiceAllowed, isTrialVoiceFieldUsed } from '@/utils/trialLimits'
import { getStoredApiAuth } from '@/services/apiAuthService'

interface VoiceDictationButtonProps extends VoiceDictationOptions {
  /** ID del campo destino — se refleja en data-target */
  targetInputId: string
  disabled?: boolean
  className?: string
}

export function VoiceDictationButton({
  targetInputId,
  disabled = false,
  className = '',
  getValue,
  onValueChange,
}: VoiceDictationButtonProps) {
  const [errorMessage, setErrorMessage] = useState('')
  const handlersRef = useRef({ getValue, onValueChange })
  handlersRef.current = { getValue, onValueChange }

  useEffect(() => {
    registerVoiceTarget(targetInputId, {
      getValue: () => handlersRef.current.getValue?.() ?? '',
      onValueChange: (value) => handlersRef.current.onValueChange?.(value),
      onStateChange: (state) => {
        setErrorMessage(state.status === 'error' ? state.errorMessage ?? '' : '')
      },
    })
    return () => unregisterVoiceTarget(targetInputId)
  }, [targetInputId])

  const trialUserId = getStoredApiAuth()?.user?.id
  const trialUsed = Boolean(trialUserId && isTrialVoiceFieldUsed(trialUserId, targetInputId))
  const trialBlocked = trialUsed || assertTrialVoiceAllowed(targetInputId).ok === false

  if (!isVoiceDictationSupported()) return null

  return (
    <div className={`inline-flex flex-col items-end gap-0.5 ${className}`}>
      <button
        type="button"
        data-target={targetInputId}
        disabled={disabled || trialBlocked}
        title={trialBlocked ? 'Prueba: una sola nota de voz por casilla' : 'Dictar por voz'}
        aria-label="Dictar por voz"
        aria-pressed={false}
        className="btn-voice-mic"
      >
        <span data-voice-label aria-hidden>
          🎙️
        </span>
      </button>
      <span data-voice-status className="max-w-[10rem] text-right text-[10px] text-red-600">
        {trialBlocked ? 'Casilla ya dictada en prueba' : errorMessage}
      </span>
    </div>
  )
}

interface FieldVoiceHeaderProps {
  label: ReactNode
  targetInputId: string
  getValue: () => string
  onValueChange: (value: string) => void
  disabled?: boolean
  htmlFor?: string
  labelClassName?: string
  className?: string
}

/** Etiqueta + micrófono de dictado, mismo patrón que motivo de consulta. */
export function FieldVoiceHeader({
  label,
  targetInputId,
  getValue,
  onValueChange,
  disabled = false,
  htmlFor,
  labelClassName = 'label-field mb-0',
  className = 'mb-1 flex items-center justify-between gap-2',
}: FieldVoiceHeaderProps) {
  return (
    <div className={className}>
      <label className={labelClassName} htmlFor={htmlFor ?? targetInputId}>
        {label}
      </label>
      {!disabled && (
        <VoiceDictationButton
          targetInputId={targetInputId}
          getValue={getValue}
          onValueChange={onValueChange}
        />
      )}
    </div>
  )
}
