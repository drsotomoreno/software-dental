import { useState } from 'react'
import { Link } from 'react-router-dom'
import { APP_INITIALS, APP_NAME } from '@/constants/branding'

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        setError(payload.error || 'No se pudo enviar la solicitud.')
        return
      }
      setSent(true)
    } catch {
      setError('No se pudo conectar con el servidor. Intente de nuevo.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-dental-50 px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-dental-600 text-lg font-bold text-white">
            {APP_INITIALS}
          </div>
          <h1 className="text-2xl font-bold text-slate-900">{APP_NAME}</h1>
          <p className="mt-1 text-sm text-slate-600">Recuperación de contraseña</p>
        </div>

        {sent ? (
          <div className="card space-y-4">
            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              Si el correo está registrado, enviaremos un enlace para restablecer la contraseña.
              Revise su bandeja de entrada (y la carpeta de spam). El enlace caduca en 15 minutos.
            </p>
            <Link to="/login" className="btn-primary inline-flex w-full">
              Volver al inicio de sesión
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="card space-y-4">
            <p className="text-sm text-slate-600">
              Ingrese el correo de su cuenta. Le enviaremos un enlace para crear una nueva
              contraseña.
            </p>
            <div>
              <label className="label-field">Correo electrónico</label>
              <input
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-field"
                placeholder="usuario@clinica.co"
              />
            </div>
            {error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
            )}
            <button type="submit" disabled={submitting} className="btn-primary w-full">
              {submitting ? 'Enviando...' : 'Enviar enlace'}
            </button>
            <p className="text-center text-sm text-slate-500">
              <Link to="/login" className="font-medium text-dental-700 hover:underline">
                Volver al inicio de sesión
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  )
}
