import { Info } from 'lucide-react'
import { UVT_2026_EDUCATION_BANNER } from '@/utils/fiscalProfile'
import { LegalTooltip } from '@/components/ui/LegalTooltip'

export function Uvt2026EducationBanner() {
  return (
    <div
      role="note"
      className="flex items-start gap-3 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-950"
    >
      <Info className="mt-0.5 h-5 w-5 shrink-0 text-sky-700" aria-hidden />
      <div>
        <p className="flex items-center gap-1.5 font-semibold text-sky-900">
          ¿Quién debe facturar electrónicamente? UVT 2026
          <LegalTooltip topic="uvt" />
          <LegalTooltip topic="fev" />
        </p>
        <p className="mt-1 leading-relaxed">{UVT_2026_EDUCATION_BANNER}</p>
      </div>
    </div>
  )
}
