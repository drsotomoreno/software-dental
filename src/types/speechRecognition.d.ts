/** Web Speech API — tipos para navegadores Chromium / Safari */
interface SpeechRecognitionAlternative {
  transcript: string
  confidence: number
}

interface SpeechRecognitionResult {
  readonly isFinal: boolean
  readonly length: number
  item(index: number): SpeechRecognitionAlternative
  [index: number]: SpeechRecognitionAlternative
}

interface SpeechRecognitionResultList {
  readonly length: number
  item(index: number): SpeechRecognitionResult
  [index: number]: SpeechRecognitionResult
}

interface SpeechRecognitionEvent extends Event {
  readonly resultIndex: number
  readonly results: SpeechRecognitionResultList
}

interface SpeechRecognitionErrorEvent extends Event {
  readonly error: string
  readonly message: string
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean
  interimResults: boolean
  lang: string
  maxAlternatives: number
  onaudiostart: ((this: SpeechRecognition, ev: Event) => void) | null
  onaudioend: ((this: SpeechRecognition, ev: Event) => void) | null
  onend: ((this: SpeechRecognition, ev: Event) => void) | null
  onerror: ((this: SpeechRecognition, ev: SpeechRecognitionErrorEvent) => void) | null
  onnomatch: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => void) | null
  onresult: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => void) | null
  onsoundstart: ((this: SpeechRecognition, ev: Event) => void) | null
  onsoundend: ((this: SpeechRecognition, ev: Event) => void) | null
  onspeechstart: ((this: SpeechRecognition, ev: Event) => void) | null
  onspeechend: ((this: SpeechRecognition, ev: Event) => void) | null
  onstart: ((this: SpeechRecognition, ev: Event) => void) | null
  abort(): void
  start(): void
  stop(): void
}

interface SpeechRecognitionConstructor {
  new (): SpeechRecognition
}

interface Window {
  SpeechRecognition?: SpeechRecognitionConstructor
  webkitSpeechRecognition?: SpeechRecognitionConstructor
  activarDictadoVoz?: (
    targetInputId: string,
    onCommandCallback?: import('@/utils/voiceDictation').VoiceDictationCallback,
    options?: import('@/utils/voiceDictation').VoiceDictationOptions,
  ) => import('@/utils/voiceDictation').VoiceDictationController | null
  activarAsistenteVozClinico?: (
    onResult: (result: import('@/utils/clinicalVoiceExecutor').ClinicalVoiceExecutionResult) => void,
    onState?: import('@/utils/voiceDictation').VoiceDictationCallback,
  ) => import('@/utils/voiceDictation').VoiceDictationController | null
  parseComandoVozClinico?: typeof import('@/utils/voiceCommandParser').parseClinicalVoiceCommand
  ejecutarComandoVozClinico?: typeof import('@/utils/clinicalVoiceExecutor').processClinicalVoiceTranscript
  eliminarCita?: (idOrIndex: string | number) => Promise<boolean>
  reasignarCita?: (idOrIndex: string | number) => void
  renderCitas?: () => void
  getCitasDental?: () => import('@/types/appointment').Appointment[]
  cortarCita?: typeof import('@/utils/agendaClipboard').cortarCita
  copiarCita?: typeof import('@/utils/agendaClipboard').copiarCita
  pegarCita?: typeof import('@/utils/agendaClipboard').pegarCita
  getCitaPortapapeles?: typeof import('@/utils/agendaClipboard').getAgendaClipboard
  limpiarCitaPortapapeles?: typeof import('@/utils/agendaClipboard').clearAgendaClipboard
}
