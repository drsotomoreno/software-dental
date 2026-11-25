import { Component, type ErrorInfo, type ReactNode } from 'react'
import {
  APP_BUILD_VERSION,
  canAttemptSilentErrorRecovery,
  recoverFromRuntimeErrorAndReload,
  purgeStaleClientState,
  MHD_BUILD_VERSION_KEY,
} from '@/bootstrap/clientRecovery'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
  recovering: boolean
}

/**
 * Boundary global: 1 intento silencioso de purga+reload; si falla, UI de restauración.
 */
export class GlobalErrorBoundary extends Component<Props, State> {
  state: State = { error: null, recovering: false }
  private silentRecoveryStarted = false

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[GlobalErrorBoundary]', error, info.componentStack)

    if (this.silentRecoveryStarted) return
    if (!canAttemptSilentErrorRecovery()) return

    this.silentRecoveryStarted = true
    this.setState({ recovering: true })
    void recoverFromRuntimeErrorAndReload()
  }

  private handleManualRestore = () => {
    this.setState({ recovering: true })
    void (async () => {
      try {
        await purgeStaleClientState('manual-restore-button')
        try {
          localStorage.setItem(MHD_BUILD_VERSION_KEY, APP_BUILD_VERSION)
        } catch {
          /* ignore */
        }
      } finally {
        window.location.reload()
      }
    })()
  }

  render() {
    const { error, recovering } = this.state
    if (!error) return this.props.children

    if (recovering) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
          <p className="text-sm text-slate-600">Restaurando datos locales…</p>
        </div>
      )
    }

    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-slate-50 via-white to-blue-50 px-4">
        <div className="w-full max-w-md text-center">
          <p className="text-2xl font-semibold tracking-tight text-blue-700">mihistoriadental</p>
          <h1 className="mt-6 text-xl font-semibold text-slate-900">
            Estamos actualizando los datos locales de tu clínica
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-slate-600">
            Este equipo tenía una versión anterior en caché. Pulse el botón para limpiar el
            almacenamiento local y volver a sincronizar desde el servidor. Su sesión se conservará
            si el token sigue siendo válido.
          </p>
          <button
            type="button"
            className="mt-8 inline-flex items-center justify-center rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            onClick={this.handleManualRestore}
          >
            Restaurar y sincronizar ahora
          </button>
          {import.meta.env.DEV ? (
            <p className="mt-4 break-words font-mono text-xs text-slate-400">
              {error.message || 'Error de renderizado'}
            </p>
          ) : null}
        </div>
      </div>
    )
  }
}
