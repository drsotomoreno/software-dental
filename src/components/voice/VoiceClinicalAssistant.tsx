import { useEffect, useRef, useState } from 'react'

import { activarAsistenteVozClinico } from '@/utils/clinicalVoiceAssistant'
import { isVoiceDictationSupported } from '@/utils/voiceDictation'
import type { ClinicalVoiceExecutionResult } from '@/utils/clinicalVoiceExecutor'

export type ClinicalVoiceContext =
  | 'general'
  | 'anamnesis'
  | 'examen'
  | 'odontograma'
  | 'diagnosticos'

const VOICE_CONTEXT_COPY: Record<
  ClinicalVoiceContext,
  { title: string; hint: string; examples: string }
> = {
  general: {
    title: 'Asistente odontológico por voz',
    hint: 'Comandos estructurados para anamnesis, examen, odontograma, diagnósticos y plan. Use el micrófono junto a cada sección o campo.',
    examples:
      '"Alergia a penicilina", "hipertensión y diabetes", "clics a la derecha", "pieza 16 caries en oclusal"',
  },
  anamnesis: {
    title: 'Dictado — Anamnesis',
    hint: 'Dicte alergias, enfermedades sistémicas y medicaciones críticas. También puede usar el micrófono de cada sección.',
    examples:
      '"No reporta alergias", "alergia a lidocaína", "hipertensión y diabetes", "anticoagulantes"',
  },
  examen: {
    title: 'Dictado — Examen estomatológico',
    hint: 'Dicte ATM, oclusión, placa y cálculo, inflamación, sangrado y movilidad. Las notas de cada hallazgo también tienen micrófono.',
    examples:
      '"Clics a la derecha", "oclusión clase II molar derecha", "higiene deficiente", "sangrado al cepillado"',
  },
  odontograma: {
    title: 'Asistente — Odontograma FDI',
    hint: 'Comandos estructurados para marcar piezas y caras en el odontograma ISO 3950.',
    examples:
      '"Pieza 16 caries en oclusal", "diente 24 ausente", "pieza 36 endodoncia", "pieza 11 sano"',
  },
  diagnosticos: {
    title: 'Asistente — Diagnósticos CIE-10',
    hint: 'Asigne diagnósticos por pieza o agregue diagnósticos adicionales. También puede dictar en los campos de búsqueda CIE-10.',
    examples:
      '"Pieza 16 diagnostico caries", "pieza 36 diagnostico K05.1", "diagnostico gingivitis adicional"',
  },
}

interface VoiceClinicalAssistantProps {
  disabled?: boolean
  className?: string
  context?: ClinicalVoiceContext
}

export function VoiceClinicalAssistant({
  disabled = false,
  className = '',
  context = 'general',
}: VoiceClinicalAssistantProps) {
  const [listening, setListening] = useState(false)
  const [interimText, setInterimText] = useState('')
  const [lastResult, setLastResult] = useState<ClinicalVoiceExecutionResult | null>(null)
  const controllerRef = useRef<ReturnType<typeof activarAsistenteVozClinico>>(null)
  const copy = VOICE_CONTEXT_COPY[context]

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
        (result) => {
          setLastResult(result)
        },
        (state) => {
          setListening(state.status === 'listening')
          setInterimText(state.interimText)
        },
      )
    }

    controllerRef.current?.toggle()
  }

  return (
    <div
      className={`rounded-xl border border-dental-200 bg-gradient-to-r from-dental-50 to-white p-4 ${className}`}
    >
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={toggle}
          disabled={disabled}
          data-clinical-voice-assistant
          title="Asistente de voz clínico"
          aria-label="Asistente de voz clínico"
          aria-pressed={listening}
          className={`btn-voice-mic !h-10 !w-10 !text-lg ${listening ? 'voice-mic--listening' : ''}`}
        >
          <span aria-hidden>🎙️</span>
        </button>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-dental-800">{copy.title}</p>
          <p className="text-xs text-slate-600">{copy.hint}</p>
          <p className="mt-0.5 text-xs text-slate-500">{copy.examples}</p>
          {listening && interimText && (
            <p className="mt-1 text-xs italic text-slate-500">Escuchando: {interimText}</p>
          )}
          {lastResult && (
            <p
              className={`mt-1 text-xs font-medium ${lastResult.ok ? 'text-green-700' : 'text-amber-700'}`}
            >
              {lastResult.message}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
