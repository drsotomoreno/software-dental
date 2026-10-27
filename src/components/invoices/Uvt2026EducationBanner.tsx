import { Info } from 'lucide-react'
import {
  UVT_2026_EDUCATION_INTRO,
  UVT_2026_EDUCATION_REQUIREMENTS,
} from '@/utils/fiscalProfile'
import { LegalTooltip } from '@/components/ui/LegalTooltip'

export function Uvt2026EducationBanner() {
  return (
    <div
      role="note"
      className="flex items-start gap-4 rounded-2xl border border-sky-200 bg-sky-50 px-5 py-5 text-sky-950"
    >
      <Info className="mt-1 h-8 w-8 shrink-0 text-sky-700" aria-hidden />
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2 text-2xl font-bold leading-snug text-sky-950">
          ¿Quién debe facturar electrónicamente? UVT 2026
          <LegalTooltip topic="uvt" />
          <LegalTooltip topic="fev" />
        </p>
        <p className="mt-4 text-2xl font-bold leading-relaxed text-sky-950">
          {UVT_2026_EDUCATION_INTRO}
        </p>
        <ul className="mt-4 list-disc space-y-3 pl-7 text-2xl font-bold leading-relaxed text-sky-950">
          {UVT_2026_EDUCATION_REQUIREMENTS.map((item) => (
            <li key={item.label}>
              {item.label}: {item.text}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
