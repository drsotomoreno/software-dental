import type { VoiceDictationCallback, VoiceDictationController } from './voiceDictation'
import { isVoiceDictationSupported } from './voiceDictation'
import {
  processClinicalVoiceTranscript,
  type ClinicalVoiceExecutionResult,
} from './clinicalVoiceExecutor'

function getSpeechRecognitionCtor(): SpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') return null
  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null
}

/**
 * Asistente de voz clínico: escucha frases estructuradas y ejecuta comandos
 * (odontograma, plan de tratamiento, presupuesto).
 */
export function activarAsistenteVozClinico(
  onResult: (result: ClinicalVoiceExecutionResult) => void,
  onState?: VoiceDictationCallback,
): VoiceDictationController | null {
  const Ctor = getSpeechRecognitionCtor()
  if (!Ctor) {
    const message =
      'Su navegador no soporta reconocimiento de voz. Use Chrome, Edge o Safari reciente.'
    onState?.({ status: 'error', interimText: '', errorMessage: message })
    return null
  }

  const recognition = new Ctor()
  recognition.continuous = true
  recognition.interimResults = true
  recognition.lang = 'es-CO'
  recognition.maxAlternatives = 1

  let listening = false
  let destroyed = false
  let pendingFinal = ''

  const notify = onState ?? (() => {})

  recognition.onstart = () => {
    listening = true
    pendingFinal = ''
    notify({ status: 'listening', interimText: '' })
  }

  recognition.onresult = (event: SpeechRecognitionEvent) => {
    let interim = ''
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i]
      const text = result[0]?.transcript ?? ''
      if (result.isFinal) {
        pendingFinal = `${pendingFinal} ${text}`.trim()
        const execution = processClinicalVoiceTranscript(pendingFinal)
        onResult(execution)
        pendingFinal = ''
        interim = ''
      } else {
        interim = `${interim} ${text}`.trim()
      }
    }
    notify({ status: 'listening', interimText: interim })
  }

  recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
    listening = false
    notify({
      status: 'error',
      interimText: '',
      errorMessage: event.message || `Error de voz (${event.error})`,
    })
  }

  recognition.onend = () => {
    if (destroyed) return
    listening = false
    notify({ status: 'idle', interimText: '' })
  }

  const start = () => {
    if (destroyed || listening) return
    try {
      recognition.start()
    } catch {
      notify({
        status: 'error',
        interimText: '',
        errorMessage: 'No se pudo iniciar el asistente de voz.',
      })
    }
  }

  const stop = () => {
    if (destroyed || !listening) return
    try {
      recognition.stop()
    } catch {
      // ignore
    }
  }

  return {
    start,
    stop,
    toggle: () => (listening ? stop() : start()),
    isListening: () => listening,
    destroy: () => {
      destroyed = true
      stop()
      recognition.onstart = null
      recognition.onresult = null
      recognition.onerror = null
      recognition.onend = null
      try {
        recognition.abort()
      } catch {
        // ignore
      }
    },
  }
}

export { isVoiceDictationSupported }
