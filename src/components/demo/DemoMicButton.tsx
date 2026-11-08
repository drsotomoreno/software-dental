import { Mic, MicOff } from 'lucide-react'

interface DemoMicButtonProps {
  listening: boolean
  supported: boolean
  disabled?: boolean
  errorMessage?: string
  onToggle: () => void
  label?: string
}

/** Botón de micrófono con pulso rojo e indicador “Escuchando…”. */
export function DemoMicButton({
  listening,
  supported,
  disabled = false,
  errorMessage = '',
  onToggle,
  label = 'Dictar por voz',
}: DemoMicButtonProps) {
  if (!supported) {
    return (
      <p className="text-xs text-slate-500">
        Dictado por voz no disponible en este navegador. Use Chrome o Edge.
      </p>
    )
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        {listening && (
          <span className="flex items-center gap-1.5 text-xs font-semibold text-red-600">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
            </span>
            Escuchando...
          </span>
        )}
        <button
          type="button"
          onClick={onToggle}
          disabled={disabled}
          aria-pressed={listening}
          aria-label={listening ? 'Detener dictado' : label}
          title={listening ? 'Detener dictado' : label}
          className={[
            'relative inline-flex h-10 w-10 items-center justify-center rounded-full border transition focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50',
            listening
              ? 'border-red-500 bg-red-500 text-white shadow-md shadow-red-200 focus:ring-red-400'
              : 'border-dental-200 bg-dental-50 text-dental-700 hover:bg-dental-100 focus:ring-dental-400',
          ].join(' ')}
        >
          {listening && (
            <span
              className="absolute inset-0 animate-ping rounded-full bg-red-400 opacity-40"
              aria-hidden
            />
          )}
          {listening ? (
            <MicOff className="relative h-5 w-5" aria-hidden />
          ) : (
            <Mic className="relative h-5 w-5" aria-hidden />
          )}
        </button>
      </div>
      {errorMessage ? (
        <p className="max-w-[14rem] text-right text-xs text-red-600">{errorMessage}</p>
      ) : null}
    </div>
  )
}
