import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { APP_SHORT_NAME } from '@/constants/branding'
import { PublicLegalFooter } from '@/components/legal/PublicLegalFooter'

type LegalDocumentLayoutProps = {
  title: string
  updated: string
  children: ReactNode
}

export function LegalDocumentLayout({ title, updated, children }: LegalDocumentLayoutProps) {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-800">
      <header className="border-b border-dental-100 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link to="/" className="text-sm font-semibold tracking-wide text-dental-700">
            {APP_SHORT_NAME}
          </Link>
          <Link to="/login" className="btn-secondary px-4 py-2 text-sm">
            Iniciar sesión
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-cyan-700">
          mihistoriadental.com
        </p>
        <h1 className="mt-2 text-2xl font-bold leading-tight text-slate-900 sm:text-3xl">{title}</h1>
        <p className="mt-3 text-sm text-slate-500">Última actualización: {updated}</p>
        <article className="mt-8 space-y-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          {children}
        </article>
      </main>

      <PublicLegalFooter />
    </div>
  )
}

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      <div className="space-y-3 text-sm leading-relaxed text-slate-700">{children}</div>
    </section>
  )
}
