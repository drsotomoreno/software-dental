import { useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { APP_INITIALS, APP_NAME } from '@/constants/branding'
import { useAuth } from '@/contexts/AuthContext'
import { setStoredApiAuth, type ApiSubscriptionUser } from '@/services/apiAuthService'
import { PasswordInput } from '@/components/ui/PasswordInput'

interface UsuarioActivado {
  id: string
  nombre: string
  email: string
  rol: string
  rethus: string | null
  activo: boolean
  clinicId?: string
  clinicSyncId?: string
}

export function ActivarCuenta() {
  const [params] = useSearchParams()
  const token = (params.get('token') || '').trim()
  const navigate = useNavigate()
  const { applySessionUser } = useAuth()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  const guardarSesion = (jwt: string, usuario: UsuarioActivado, clinicSyncId?: string) => {
    const sesion: ApiSubscriptionUser & { rethus?: string | null; clinicSyncId?: string } = {
      id: usuario.id,
      nombre: usuario.nombre,
      email: usuario.email,
      rol: usuario.rol as ApiSubscriptionUser['rol'],
      estado_pago: 'activo',
      fecha_vencimiento: null,
      rethusNumber: usuario.rethus || undefined,
      rethus: usuario.rethus,
      clinicId: usuario.clinicId || clinicSyncId,
      clinicSyncId: clinicSyncId || usuario.clinicSyncId,
      accessEnabled: usuario.activo !== false,
    }
    setStoredApiAuth(jwt, sesion)
    applySessionUser(sesion)
  }

  const enviar = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    if (!token) {
      setError('El enlace de activación no trae token.')
      return
    }
    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.')
      return
    }
    if (password !== confirm) {
      setError('Las contraseñas no coinciden.')
      return
    }

    setEnviando(true)
    try {
      const response = await fetch('/api/auth/activar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ token, password }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok || !payload.token || !payload.user) {
        setError(payload.error || 'No se pudo activar la cuenta.')
        return
      }
      guardarSesion(String(payload.token), payload.user as UsuarioActivado, payload.clinicSyncId)
      navigate('/app', { replace: true })
    } catch {
      setError('No se pudo conectar con el servidor. Intente de nuevo.')
    } finally {
      setEnviando(false)
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
          <p className="mt-1 text-sm text-slate-600">Activa tu acceso de colaborador</p>
        </div>

        {!token ? (
          <div className="card">
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              El enlace no es válido. Pide al titular que regenere la invitación.
            </p>
          </div>
        ) : (
          <form onSubmit={enviar} className="card space-y-4">
            {error ? (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
            ) : null}
            <div>
              <label className="label-field" htmlFor="activar-password">
                Contraseña
              </label>
              <PasswordInput
                id="activar-password"
                autoComplete="new-password"
                required
                minLength={8}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Mínimo 8 caracteres"
              />
            </div>
            <div>
              <label className="label-field" htmlFor="activar-confirm">
                Confirmar contraseña
              </label>
              <PasswordInput
                id="activar-confirm"
                autoComplete="new-password"
                required
                minLength={8}
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                placeholder="Repite la contraseña"
              />
            </div>
            <button type="submit" className="btn-primary w-full" disabled={enviando}>
              {enviando ? 'Activando…' : 'Activar cuenta'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
