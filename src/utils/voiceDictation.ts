export type VoiceDictationStatus = 'idle' | 'listening' | 'error'

export interface VoiceDictationState {
  status: VoiceDictationStatus
  interimText: string
  errorMessage?: string
}

export type VoiceDictationCallback = (state: VoiceDictationState) => void

export interface VoiceDictationOptions {
  /** Para campos controlados por React */
  getValue?: () => string
  onValueChange?: (value: string) => void
}

export interface VoiceDictationController {
  start: () => void
  stop: () => void
  toggle: () => void
  isListening: () => boolean
  destroy: () => void
}

const ERROR_MESSAGES: Record<string, string> = {
  'not-allowed':
    'Permiso de micrófono denegado. Habilite el micrófono en la configuración del navegador.',
  'service-not-allowed': 'El servicio de reconocimiento de voz no está permitido en este contexto.',
  'audio-capture': 'No se detectó un micrófono disponible.',
  'network': 'Se requiere conexión a internet para el reconocimiento de voz en este navegador.',
  'no-speech': 'No se detectó voz. Intente hablar más cerca del micrófono.',
  'aborted': 'Dictado detenido.',
  'language-not-supported': 'El idioma configurado no es compatible con este navegador.',
}

function getSpeechRecognitionCtor(): SpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') return null
  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null
}

function isTextInput(
  element: HTMLElement | null,
): element is HTMLInputElement | HTMLTextAreaElement {
  if (!element) return false
  return element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement
}

function dispatchInputEvent(element: HTMLInputElement | HTMLTextAreaElement): void {
  element.dispatchEvent(new Event('input', { bubbles: true }))
  element.dispatchEvent(new Event('change', { bubbles: true }))
}

function joinTranscript(base: string, addition: string): string {
  const trimmed = addition.trim()
  if (!trimmed) return base
  if (!base) return trimmed
  const needsSpace = !base.endsWith(' ') && !trimmed.startsWith(' ')
  return `${base}${needsSpace ? ' ' : ''}${trimmed}`
}

/**
 * Motor base de dictado por voz (Web Speech API).
 * Escribe la transcripción en tiempo real en el campo cuyo id sea `targetInputId`.
 *
 * @returns Controlador con start/stop/toggle o null si el navegador no es compatible.
 */
export function activarDictadoVoz(
  targetInputId: string,
  onCommandCallback?: VoiceDictationCallback,
  options?: VoiceDictationOptions,
): VoiceDictationController | null {
  const Ctor = getSpeechRecognitionCtor()
  if (!Ctor) {
    const message =
      'Su navegador no soporta dictado por voz. Use Chrome, Edge o Safari reciente.'
    console.error('[DictadoVoz]', message)
    onCommandCallback?.({ status: 'error', interimText: '', errorMessage: message })
    if (typeof window !== 'undefined') {
      window.alert(message)
    }
    return null
  }

  const recognition = new Ctor()
  recognition.continuous = true
  recognition.interimResults = true
  recognition.lang = 'es-CO'
  recognition.maxAlternatives = 1

  let listening = false
  let baseValue = ''
  let finalTranscript = ''
  let destroyed = false

  const notify = (state: VoiceDictationState) => {
    onCommandCallback?.(state)
  }

  const getTarget = () => {
    if (options?.onValueChange) return null
    const element = document.getElementById(targetInputId)
    if (!isTextInput(element)) {
      const message = `No se encontró un campo de texto con id "${targetInputId}".`
      console.error('[DictadoVoz]', message)
      notify({ status: 'error', interimText: '', errorMessage: message })
      return null
    }
    return element
  }

  const readBaseValue = () => options?.getValue?.() ?? getTarget()?.value ?? ''

  const writeValue = (value: string) => {
    if (options?.onValueChange) {
      options.onValueChange(value)
      return
    }
    const target = getTarget()
    if (!target) return
    target.value = value
    dispatchInputEvent(target)
  }

  const applyTranscript = (interim: string) => {
    const composed = joinTranscript(
      joinTranscript(baseValue, finalTranscript),
      interim,
    )
    writeValue(composed)
    notify({ status: 'listening', interimText: interim })
  }

  recognition.onstart = () => {
    listening = true
    baseValue = readBaseValue()
    finalTranscript = ''
    notify({ status: 'listening', interimText: '' })
  }

  recognition.onresult = (event: SpeechRecognitionEvent) => {
    let interim = ''
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i]
      const text = result[0]?.transcript ?? ''
      if (result.isFinal) {
        finalTranscript = joinTranscript(finalTranscript, text)
      } else {
        interim = joinTranscript(interim, text)
      }
    }
    applyTranscript(interim)
  }

  recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
    const friendly =
      ERROR_MESSAGES[event.error] ??
      `Error de dictado (${event.error}). ${event.message || ''}`.trim()
    console.error('[DictadoVoz]', event.error, event.message)
    listening = false
    notify({ status: 'error', interimText: '', errorMessage: friendly })
    if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
      window.alert(friendly)
    }
  }

  recognition.onend = () => {
    if (destroyed) return
    listening = false
    applyTranscript('')
    notify({ status: 'idle', interimText: '' })
  }

  const start = () => {
    if (destroyed || listening) return
    if (!options?.onValueChange && !getTarget()) return
    try {
      recognition.start()
    } catch (error) {
      const message = 'No se pudo iniciar el dictado. Intente nuevamente.'
      console.error('[DictadoVoz] start failed', error)
      notify({ status: 'error', interimText: '', errorMessage: message })
    }
  }

  const stop = () => {
    if (destroyed || !listening) return
    try {
      recognition.stop()
    } catch (error) {
      console.error('[DictadoVoz] stop failed', error)
    }
  }

  const toggle = () => {
    if (listening) stop()
    else start()
  }

  return {
    start,
    stop,
    toggle,
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

export function isVoiceDictationSupported(): boolean {
  return getSpeechRecognitionCtor() !== null
}

const SPANISH_UNITS: Record<string, number> = {
  cero: 0,
  un: 1,
  uno: 1,
  una: 1,
  dos: 2,
  tres: 3,
  cuatro: 4,
  cinco: 5,
  seis: 6,
  siete: 7,
  ocho: 8,
  nueve: 9,
  diez: 10,
  once: 11,
  doce: 12,
  trece: 13,
  catorce: 14,
  quince: 15,
  dieciseis: 16,
  diecisiete: 17,
  dieciocho: 18,
  diecinueve: 19,
  veinte: 20,
  veintiun: 21,
  veintiuno: 21,
  veintidos: 22,
  veintitres: 23,
  veinticuatro: 24,
  veinticinco: 25,
  veintiseis: 26,
  veintisiete: 27,
  veintiocho: 28,
  veintinueve: 29,
  treinta: 30,
  cuarenta: 40,
  cincuenta: 50,
  sesenta: 60,
  setenta: 70,
  ochenta: 80,
  noventa: 90,
}

const SPANISH_HUNDREDS: Record<string, number> = {
  cien: 100,
  ciento: 100,
  doscientos: 200,
  trescientos: 300,
  cuatrocientos: 400,
  quinientos: 500,
  seiscientos: 600,
  setecientos: 700,
  ochocientos: 800,
  novecientos: 900,
}

function stripDiacritics(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function parseSpanishCardinal(text: string): number | null {
  const tokens = stripDiacritics(text.toLowerCase())
    .replace(/\by\b/g, ' ')
    .split(/[^a-z]+/)
    .filter((token) => token && token !== 'de' && token !== 'pesos' && token !== 'cop')

  if (tokens.length === 0) return null

  let total = 0
  let current = 0
  let matched = false

  for (const token of tokens) {
    if (token === 'mil') {
      current = (current || 1) * 1000
      total += current
      current = 0
      matched = true
      continue
    }
    if (token === 'millon' || token === 'millones') {
      current = (current || 1) * 1_000_000
      total += current
      current = 0
      matched = true
      continue
    }
    const hundreds = SPANISH_HUNDREDS[token]
    if (hundreds != null) {
      current += hundreds
      matched = true
      continue
    }
    const unit = SPANISH_UNITS[token]
    if (unit != null) {
      current += unit
      matched = true
    }
  }

  total += current
  return matched ? total : null
}

/**
 * Extrae el último número de un dictado (PA, precios, cantidades).
 * Acepta dígitos con punto o coma, o cardinales en español (ej. "ciento veinte").
 */
export function parseDictatedNumber(text: string): number | null {
  const trimmed = text.trim()
  if (!trimmed) return null

  const digitMatches = trimmed.match(/\d+(?:[.,]\d+)?/g)
  if (digitMatches && digitMatches.length > 0) {
    const parsed = Number(digitMatches[digitMatches.length - 1].replace(',', '.'))
    return Number.isFinite(parsed) ? parsed : null
  }

  return parseSpanishCardinal(trimmed)
}

export function parseDictatedInteger(text: string): number | null {
  const parsed = parseDictatedNumber(text)
  return parsed == null ? null : Math.round(parsed)
}
