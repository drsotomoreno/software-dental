import {
  activarDictadoVoz,
  type VoiceDictationCallback,
  type VoiceDictationController,
  type VoiceDictationState,
} from '@/utils/voiceDictation'

export interface VoiceTargetHandlers {
  getValue?: () => string
  onValueChange?: (value: string) => void
  onStateChange?: (state: VoiceDictationState) => void
}

const targetHandlers = new Map<string, VoiceTargetHandlers>()
const activeControllers = new Map<string, VoiceDictationController>()

export function registerVoiceTarget(targetId: string, handlers: VoiceTargetHandlers): void {
  targetHandlers.set(targetId, handlers)
}

export function unregisterVoiceTarget(targetId: string): void {
  targetHandlers.delete(targetId)
  const controller = activeControllers.get(targetId)
  controller?.destroy()
  activeControllers.delete(targetId)
}

function updateMicButton(button: HTMLButtonElement, state: VoiceDictationState): void {
  const listening = state.status === 'listening'
  button.classList.toggle('voice-mic--listening', listening)
  button.setAttribute('aria-pressed', String(listening))
  button.title = listening ? 'Detener dictado' : 'Dictar por voz'

  const label = button.querySelector('[data-voice-label]')
  if (label) {
    label.textContent = listening ? 'Escuchando…' : '🎙️'
  }

  const status = button.parentElement?.querySelector('[data-voice-status]')
  if (status) {
    status.textContent =
      state.status === 'error' && state.errorMessage
        ? state.errorMessage
        : listening
          ? 'Micrófono activo'
          : ''
  }
}

function getOrCreateController(
  targetId: string,
  button: HTMLButtonElement,
): VoiceDictationController | null {
  const existing = activeControllers.get(targetId)
  if (existing) return existing

  const handlers = targetHandlers.get(targetId)
  const onState: VoiceDictationCallback = (state) => {
    updateMicButton(button, state)
    handlers?.onStateChange?.(state)
  }

  const controller = activarDictadoVoz(targetId, onState, {
    getValue: () => handlers?.getValue?.() ?? '',
    onValueChange: (value) => handlers?.onValueChange?.(value),
  })

  if (!controller) return null
  activeControllers.set(targetId, controller)
  return controller
}

export function initVoiceDictationBridge(): void {
  document.body.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
      '[data-target], [data-voice-target]',
    )
    if (!button || button.disabled) return

    event.preventDefault()
    const targetId =
      button.getAttribute('data-target') ?? button.getAttribute('data-voice-target')
    if (!targetId) return

    const controller = getOrCreateController(targetId, button)
    controller?.toggle()
  })
}

export function setupVoiceDictationGlobal(): void {
  if (typeof window === 'undefined') return
  ;(window as Window & { activarDictadoVoz?: typeof activarDictadoVoz }).activarDictadoVoz =
    activarDictadoVoz
  initVoiceDictationBridge()
}
