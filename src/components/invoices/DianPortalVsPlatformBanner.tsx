import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import { DIAN_PORTAL_VS_PLATFORM_COPY } from '@/constants/legalTooltips'
import { LegalTooltip } from '@/components/ui/LegalTooltip'

export function DianPortalVsPlatformBanner() {
  const [open, setOpen] = useState(false)

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-amber-950">
          Saldo de folios para Factura Electrónica
          <LegalTooltip topic="folio" />
          <LegalTooltip topic="dian" />
          <LegalTooltip topic="cufe" />
        </p>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 shadow-sm hover:bg-amber-100"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          <Sparkles className="h-3.5 w-3.5" aria-hidden />
          ¿Por qué evitar el portal gratuito de la DIAN?
        </button>
      </div>
      {open && (
        <p className="mt-3 text-sm leading-relaxed text-amber-950" role="status">
          {DIAN_PORTAL_VS_PLATFORM_COPY}
        </p>
      )}
    </div>
  )
}
