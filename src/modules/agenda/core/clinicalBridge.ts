import { usePatientPrecautionAlert } from '@/hooks/usePatientPrecautionAlert'
import type { EvolutionNote } from '@/types/evolutionNote'
import { appendPatientEvolutionNote } from '@/utils/patientClinicalDraft'

/** Registra la nota de inasistencia en el borrador de historia clínica. */
export async function recordNoShowEvolution(
  patientRouteId: string,
  note: EvolutionNote,
): Promise<void> {
  await appendPatientEvolutionNote(patientRouteId, note)
}

export function useAgendaPrecautionActive(patientRouteId?: string | null): boolean {
  const alert = usePatientPrecautionAlert(patientRouteId)
  return alert?.active ?? false
}
