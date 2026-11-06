import { Link } from 'react-router-dom'
import { ShieldOff } from 'lucide-react'

/** 403 de la interfaz. El API responde el mismo código con soloSuperAdmin. */
export function SuperAdminForbidden() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-900 text-white">
          <ShieldOff className="h-6 w-6" aria-hidden />
        </div>
        <p className="mt-4 text-sm font-semibold uppercase tracking-wide text-sky-700">Error 403</p>
        <h1 className="mt-1 text-xl font-semibold text-slate-900">Acceso restringido</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          El Panel de Control mihistoriadental es exclusivo del superadministrador de la plataforma.
        </p>
        <Link
          to="/app"
          className="mt-6 inline-flex items-center justify-center rounded-xl bg-sky-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-800"
        >
          Volver al consultorio
        </Link>
      </div>
    </div>
  )
}
