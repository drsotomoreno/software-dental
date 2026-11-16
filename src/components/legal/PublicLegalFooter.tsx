import { Link } from 'react-router-dom'

/** Enlaces legales visibles en inicio y login. Google exige el enlace a la política en la página principal. */
export function PublicLegalFooter() {
  return (
    <footer className="border-t border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-600">
      <nav
        className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2"
        aria-label="Información legal"
      >
        <Link
          to="/privacidad"
          className="font-semibold text-dental-700 underline underline-offset-2 hover:text-dental-800"
        >
          Política de Privacidad
        </Link>
        <Link
          to="/terminos"
          className="font-semibold text-dental-700 underline underline-offset-2 hover:text-dental-800"
        >
          Condiciones del Servicio
        </Link>
      </nav>
      <p className="mt-3 text-xs text-slate-500">
        mihistoriadental.com — Doctor SEO Labs S.A.S. · Bucaramanga, Santander, Colombia
      </p>
    </footer>
  )
}
