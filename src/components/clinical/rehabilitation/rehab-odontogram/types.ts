export type RehabArchProsthesisScope = 'superior_inferior' | 'superior' | 'inferior'

export interface RehabArchProsthesisPlan {
  scope: RehabArchProsthesisScope
  color: string
}

/** @deprecated Use RehabArchProsthesisScope */
export type RehabProtesisTotalScope = RehabArchProsthesisScope

/** @deprecated Use RehabArchProsthesisPlan */
export type RehabProtesisTotalPlan = RehabArchProsthesisPlan

export type RehabArchPlanningTreatmentId = 'protesis_total' | 'protesis_parcial_removible'

export type RehabTreatmentType =
  | 'corona_individual'
  | 'carilla'
  | 'implante'
  | 'pilar_ppf'
  | 'pontico_ppf'
  | 'incrustacion'

export type ToothAnatomyType = 'incisor' | 'canine' | 'premolar' | 'molar'

import type { ImplantFixtureSize } from '@/constants/implantPlanning'
import type { RehabRestorationDetails } from '@/constants/rehabilitationRestoration'

export type RehabOdontogramVariant = 'rehabilitation' | 'implants'

export type RehabQuadrantId = 'upperRight' | 'upperLeft' | 'lowerLeft' | 'lowerRight'

export interface RehabTreatmentOption {
  id: RehabTreatmentType
  label: string
  color: string
}

export interface RehabTreatmentPlanEntry {
  dienteId: string
  eliminado?: boolean
  tratamiento?: RehabTreatmentType
  color?: string
  /** Medidas del implante (solo cuando tratamiento === 'implante') */
  implantSize?: ImplantFixtureSize
}

export interface RehabOdontogramProps {
  value?: RehabTreatmentPlanEntry[]
  protesisTotal?: RehabArchProsthesisPlan | null
  protesisParcialRemovible?: RehabArchProsthesisPlan | null
  onChange?: (plan: RehabTreatmentPlanEntry[]) => void
  onProtesisTotalChange?: (protesisTotal: RehabArchProsthesisPlan | null) => void
  onProtesisParcialRemovibleChange?: (protesisParcialRemovible: RehabArchProsthesisPlan | null) => void
  restorationDetails?: RehabRestorationDetails
  onRestorationDetailsChange?: (details: RehabRestorationDetails) => void
  title?: string
  variant?: RehabOdontogramVariant
  disabled?: boolean
  className?: string
}
