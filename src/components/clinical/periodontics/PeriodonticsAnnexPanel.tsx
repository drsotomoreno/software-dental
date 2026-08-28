import { useCallback, useMemo } from 'react'
import type { ToothNumber } from '@/types/odontogram'
import type { PeriodontalSiteKey, PeriodonticsAnnex } from '@/types/periodonticsAnnex'
import {
  computePeriodontalIndices,
  updateSiteInAnnex,
  updateToothInAnnex,
} from '@/utils/periodonticsAnnex'
import { PeriodontogramChart } from './PeriodontogramChart'
import { PeriodontogramSiteGrid } from './PeriodontogramSiteGrid'
import { PeriodontalIndicesSummaryPanel } from './PeriodontalIndicesSummaryPanel'
import { PeriodontalDiagnosisSection } from './PeriodontalDiagnosisSection'
import { PeriodontalTreatmentPlanSection } from './PeriodontalTreatmentPlanSection'

interface PeriodonticsAnnexPanelProps {
  data: PeriodonticsAnnex
  onChange: (data: PeriodonticsAnnex) => void
  disabled?: boolean
}

export function PeriodonticsAnnexPanel({
  data,
  onChange,
  disabled = false,
}: PeriodonticsAnnexPanelProps) {
  const indices = useMemo(() => computePeriodontalIndices(data), [data])

  const selectedToothRecord = useMemo(
    () => data.teeth.find((tooth) => tooth.number === data.selectedTooth) ?? null,
    [data.teeth, data.selectedTooth],
  )

  const handleSelectTooth = useCallback(
    (number: ToothNumber) => {
      onChange({
        ...data,
        selectedTooth: data.selectedTooth === number ? null : number,
      })
    },
    [data, onChange],
  )

  const handleUpdateTooth = useCallback(
    (patch: Parameters<typeof updateToothInAnnex>[2]) => {
      if (!data.selectedTooth) return
      onChange(updateToothInAnnex(data, data.selectedTooth, patch))
    },
    [data, onChange],
  )

  const handleUpdateSite = useCallback(
    (siteKey: PeriodontalSiteKey, patch: Parameters<typeof updateSiteInAnnex>[3]) => {
      if (!data.selectedTooth) return
      onChange(updateSiteInAnnex(data, data.selectedTooth, siteKey, patch))
    },
    [data, onChange],
  )

  return (
    <div className="space-y-4">
      <PeriodontalIndicesSummaryPanel summary={indices} />

      <PeriodontogramChart
        teeth={data.teeth}
        selectedTooth={data.selectedTooth}
        disabled={disabled}
        onSelectTooth={handleSelectTooth}
      />

      {selectedToothRecord && (
        <PeriodontogramSiteGrid
          tooth={selectedToothRecord}
          disabled={disabled}
          onUpdateTooth={handleUpdateTooth}
          onUpdateSite={handleUpdateSite}
        />
      )}

      <PeriodontalDiagnosisSection
        diagnosis={data.diagnosis}
        disabled={disabled}
        onChange={(diagnosis) => onChange({ ...data, diagnosis })}
      />

      <PeriodontalTreatmentPlanSection
        rows={data.treatmentPlan}
        disabled={disabled}
        onChange={(treatmentPlan) => onChange({ ...data, treatmentPlan })}
      />
    </div>
  )
}
