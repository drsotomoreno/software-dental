import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { getStoredApiAuth } from '@/services/apiAuthService'
import { usePermisos } from '@/hooks/usePermisos'

type RolInvitable = 'COLABORADOR_CLINICO' | 'COLABORADOR_ADMIN'

interface Cupo {
  usados: number
  max: number
}

interface Colaborador {
  id: string
  nombre: string
  email: string
  rol: string
  rethus: string | null
  activo: boolean
  codigo_sede_reps?: string | null
  invite_token?: string | null
  invite_expires_at?: string | null
}

interface EquipoResponse {
  plan: string | null
  cupos: { profesionales: Cupo; administrativos: Cupo } | null
  titular: Colaborador | null
  colaboradores: Colaborador[]
}

const ROL_LABEL: Record<string, string> = {
  TITULAR: 'Titular',
  COLABORADOR_CLINICO: 'Clínico',
  COLABORADOR_ADMIN: 'Administrativo',
}

function enlaceActivacion(token: string) {
  return `${window.location.origin}/activar?token=${encodeURIComponent(token)}`
}

function mensajeWhatsapp(nombre: string, enlace: string) {
  const saludo = nombre ? `Hola ${nombre}. ` : 'Hola. '
  return `${saludo}Activa tu acceso a mihistoriadental con este enlace: ${enlace}`
}

async function apiColaboradores(path: string, init: RequestInit = {}) {
  const token = getStoredApiAuth()?.token
  const response = await fetch(path, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(payload.error || 'No se pudo completar la acción.')
  }
  return payload
}

export function GestionColaboradores() {
  const { esTitular } = usePermisos()
  const [equipo, setEquipo] = useState<EquipoResponse | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [rol, setRol] = useState<RolInvitable>('COLABORADOR_CLINICO')
  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')
  const [rethus, setRethus] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [ocupadoId, setOcupadoId] = useState('')
  const [copiadoId, setCopiadoId] = useState('')

  const cargar = useCallback(async () => {
    setError('')
    try {
      const payload = (await apiColaboradores('/api/colaboradores')) as EquipoResponse
      setEquipo({
        plan: payload.plan ?? null,
        cupos: payload.cupos ?? null,
        titular: payload.titular ?? null,
        colaboradores: Array.isArray(payload.colaboradores) ? payload.colaboradores : [],
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar el equipo.')
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    if (!esTitular) {
      setCargando(false)
      return
    }
    void cargar()
  }, [cargar, esTitular])

  const cupoClinico = equipo?.cupos?.profesionales
  const cupoAdmin = equipo?.cupos?.administrativos
  const clinicoLleno = Boolean(cupoClinico && cupoClinico.usados >= cupoClinico.max)
  const adminLleno = Boolean(cupoAdmin && cupoAdmin.usados >= cupoAdmin.max)
  const rolLleno = rol === 'COLABORADOR_CLINICO' ? clinicoLleno : adminLleno

  useEffect(() => {
    if (rol === 'COLABORADOR_CLINICO' && clinicoLleno && !adminLleno) {
      setRol('COLABORADOR_ADMIN')
    } else if (rol === 'COLABORADOR_ADMIN' && adminLleno && !clinicoLleno) {
      setRol('COLABORADOR_CLINICO')
    }
  }, [rol, clinicoLleno, adminLleno])

  const crear = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    setAviso('')
    if (rolLleno) {
      setError('Ese cupo ya está completo.')
      return
    }
    if (rol === 'COLABORADOR_CLINICO' && !rethus.trim()) {
      setError('El colaborador clínico exige ReTHUS.')
      return
    }
    setEnviando(true)
    try {
      await apiColaboradores('/api/colaboradores', {
        method: 'POST',
        body: JSON.stringify({
          nombre: nombre.trim(),
          email: email.trim(),
          rol,
          ...(rol === 'COLABORADOR_CLINICO' ? { rethus: rethus.trim() } : {}),
        }),
      })
      setNombre('')
      setEmail('')
      setRethus('')
      setAviso('Invitación creada. Comparte el enlace con el colaborador.')
      await cargar()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear el colaborador.')
    } finally {
      setEnviando(false)
    }
  }

  const cambiarEstado = async (colaborador: Colaborador, activo: boolean) => {
    setError('')
    setOcupadoId(colaborador.id)
    try {
      await apiColaboradores(`/api/colaboradores/${colaborador.id}/estado`, {
        method: 'PATCH',
        body: JSON.stringify({ activo }),
      })
      await cargar()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cambiar el estado.')
    } finally {
      setOcupadoId('')
    }
  }

  const regenerar = async (colaborador: Colaborador) => {
    setError('')
    setOcupadoId(colaborador.id)
    try {
      await apiColaboradores(`/api/colaboradores/${colaborador.id}/regenerar-enlace`, {
        method: 'POST',
      })
      setAviso(`Nuevo enlace listo para ${colaborador.nombre}.`)
      await cargar()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo regenerar el enlace.')
    } finally {
      setOcupadoId('')
    }
  }

  const copiar = async (colaborador: Colaborador) => {
    const token = colaborador.invite_token
    if (!token) return
    await navigator.clipboard.writeText(enlaceActivacion(token))
    setCopiadoId(colaborador.id)
    window.setTimeout(() => setCopiadoId(''), 2000)
  }

  if (!esTitular) {
    return (
      <section className="card">
        <p className="text-sm text-slate-600">Solo el titular puede administrar el equipo de la sede.</p>
      </section>
    )
  }

  const titular = equipo?.titular

  return (
    <section className="card space-y-6">
      <header className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Equipo de la sede</h2>
            <p className="text-sm text-slate-500">Invita clínicos y administrativos sin salir de la clínica.</p>
          </div>
          <span className="rounded-full bg-dental-50 px-3 py-1 text-sm font-medium text-dental-800">
            Plan {equipo?.plan || 'sin plan'}
          </span>
        </div>
        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg bg-slate-50 px-3 py-2">
            <dt className="text-xs uppercase tracking-wide text-slate-500">REPS de la sede</dt>
            <dd className="text-sm font-medium text-slate-900">{titular?.codigo_sede_reps || '—'}</dd>
          </div>
          <div className="rounded-lg bg-slate-50 px-3 py-2">
            <dt className="text-xs uppercase tracking-wide text-slate-500">ReTHUS del titular</dt>
            <dd className="text-sm font-medium text-slate-900">{titular?.rethus || '—'}</dd>
          </div>
          <div className="rounded-lg bg-slate-50 px-3 py-2">
            <dt className="text-xs uppercase tracking-wide text-slate-500">Clínicos</dt>
            <dd className="text-sm font-medium text-slate-900">
              {cupoClinico ? `${cupoClinico.usados}/${cupoClinico.max}` : '—'}
            </dd>
          </div>
          <div className="rounded-lg bg-slate-50 px-3 py-2">
            <dt className="text-xs uppercase tracking-wide text-slate-500">Admin</dt>
            <dd className="text-sm font-medium text-slate-900">
              {cupoAdmin ? `${cupoAdmin.usados}/${cupoAdmin.max}` : '—'}
            </dd>
          </div>
        </dl>
      </header>

      {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      {aviso ? <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{aviso}</p> : null}

      <form onSubmit={crear} className="grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="label-field" htmlFor="rol-colaborador">
            Tipo de colaborador
          </label>
          <select
            id="rol-colaborador"
            className="input-field"
            value={rol}
            onChange={(event) => setRol(event.target.value as RolInvitable)}
          >
            <option value="COLABORADOR_CLINICO" disabled={clinicoLleno}>
              Clínico{clinicoLleno ? ' (cupo lleno)' : ''}
            </option>
            <option value="COLABORADOR_ADMIN" disabled={adminLleno}>
              Administrativo{adminLleno ? ' (cupo lleno)' : ''}
            </option>
          </select>
        </div>
        <div>
          <label className="label-field" htmlFor="nombre-colaborador">
            Nombre
          </label>
          <input
            id="nombre-colaborador"
            className="input-field"
            value={nombre}
            onChange={(event) => setNombre(event.target.value)}
            required
            maxLength={255}
          />
        </div>
        <div>
          <label className="label-field" htmlFor="correo-colaborador">
            Correo
          </label>
          <input
            id="correo-colaborador"
            type="email"
            className="input-field"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </div>
        {rol === 'COLABORADOR_CLINICO' ? (
          <div className="sm:col-span-2">
            <label className="label-field" htmlFor="rethus-colaborador">
              ReTHUS
            </label>
            <input
              id="rethus-colaborador"
              className="input-field"
              value={rethus}
              onChange={(event) => setRethus(event.target.value)}
              required
              maxLength={50}
            />
          </div>
        ) : null}
        <div className="sm:col-span-2">
          <button type="submit" className="btn-primary" disabled={enviando || rolLleno || cargando}>
            {enviando ? 'Creando…' : 'Crear invitación'}
          </button>
        </div>
      </form>

      <ul className="space-y-3 border-t border-slate-100 pt-4">
        {cargando ? <li className="text-sm text-slate-500">Cargando equipo…</li> : null}
        {!cargando && equipo?.colaboradores.length === 0 ? (
          <li className="text-sm text-slate-500">Aún no hay colaboradores.</li>
        ) : null}
        {equipo?.colaboradores.map((colaborador) => {
          const token = colaborador.invite_token?.trim() || ''
          const enlace = token ? enlaceActivacion(token) : ''
          const whatsapp = enlace
            ? `https://wa.me/?text=${encodeURIComponent(mensajeWhatsapp(colaborador.nombre, enlace))}`
            : ''
          const ocupado = ocupadoId === colaborador.id
          return (
            <li key={colaborador.id} className="rounded-lg border border-slate-200 px-3 py-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-slate-900">{colaborador.nombre}</p>
                  <p className="text-sm text-slate-500">{colaborador.email}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {ROL_LABEL[colaborador.rol] || colaborador.rol}
                    {colaborador.rethus ? ` · ReTHUS ${colaborador.rethus}` : ''}
                    {' · '}
                    {colaborador.activo ? 'Activo' : 'Suspendido'}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={ocupado}
                    onClick={() => void cambiarEstado(colaborador, !colaborador.activo)}
                  >
                    {colaborador.activo ? 'Suspender' : 'Reactivar'}
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={ocupado}
                    onClick={() => void regenerar(colaborador)}
                  >
                    Regenerar enlace
                  </button>
                </div>
              </div>
              {token ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" className="btn-secondary" onClick={() => void copiar(colaborador)}>
                    {copiadoId === colaborador.id ? 'Enlace copiado' : 'Copiar enlace'}
                  </button>
                  <a
                    className="btn-secondary"
                    href={whatsapp}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Enviar por WhatsApp
                  </a>
                </div>
              ) : null}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
