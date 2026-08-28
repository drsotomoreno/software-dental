import { Component, type ErrorInfo, type ReactNode } from 'react'

interface ErrorBoundaryProps {
  children: ReactNode
  title?: string
}

interface ErrorBoundaryState {
  error: Error | null
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="card border-red-200 bg-red-50">
          <h2 className="text-lg font-semibold text-red-900">
            {this.props.title ?? 'Error al cargar esta sección'}
          </h2>
          <p className="mt-2 text-sm text-red-800">
            {this.state.error.message || 'Ocurrió un error inesperado.'}
          </p>
          <button
            type="button"
            className="btn-secondary mt-4"
            onClick={() => this.setState({ error: null })}
          >
            Reintentar
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
