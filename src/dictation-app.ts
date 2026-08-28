/**
 * Motor de dictado por voz (app.js en arquitectura SPA).
 * Expone activarDictadoVoz, parser y ejecutor de comandos clínicos.
 */
import { setupVoiceDictationGlobal } from './bootstrap/voiceDictationBridge'
import { activarAsistenteVozClinico } from './utils/clinicalVoiceAssistant'
import { processClinicalVoiceTranscript } from './utils/clinicalVoiceExecutor'
import { activarDictadoVoz } from './utils/voiceDictation'
import { parseClinicalVoiceCommand } from './utils/voiceCommandParser'

setupVoiceDictationGlobal()

if (typeof window !== 'undefined') {
  const win = window as Window & {
    activarDictadoVoz?: typeof activarDictadoVoz
    activarAsistenteVozClinico?: typeof activarAsistenteVozClinico
    parseComandoVozClinico?: typeof parseClinicalVoiceCommand
    ejecutarComandoVozClinico?: typeof processClinicalVoiceTranscript
  }
  win.activarDictadoVoz = activarDictadoVoz
  win.activarAsistenteVozClinico = activarAsistenteVozClinico
  win.parseComandoVozClinico = parseClinicalVoiceCommand
  win.ejecutarComandoVozClinico = processClinicalVoiceTranscript
}
