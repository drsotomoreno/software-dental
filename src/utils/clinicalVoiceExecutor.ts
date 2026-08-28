import { getClinicalVoiceHandlers } from '@/bootstrap/voiceClinicalRegistry'
import type { BudgetLineItem, ClinicalRecordFormData, TreatmentPlanItem } from '@/types/clinicalRecord'
import type { AnyToothNumber, OdontogramData } from '@/types/odontogram'
import { calcBudgetSummary } from './budget'
import { generateId } from './crypto'
import {
  getDefaultQuantityForCups,
} from '@/utils/cupsBillingRules'
import {
  addAdditionalDiagnosisToClinical,
  ensureDiagnosisOnTooth,
} from './clinicalDiagnosisVoice'
import { applyFaceStates, applyGlobalState } from './odontogramMutations'
import { mergeSuggestedTreatments, suggestTreatmentFromOdontogram } from './odontogramTreatmentPlan'
import { getDefaultCie10SearchEngine } from '@/services/Cie10SearchEngine'
import {
  describeClinicalVoiceCommand,
  parseClinicalVoiceCommand,
  type ClinicalVoiceCommand,
} from './voiceCommandParser'

export interface ClinicalVoiceExecutionResult {
  ok: boolean
  message: string
  command?: ClinicalVoiceCommand
  transcript: string
}

function mergeBudgetItems(
  current: BudgetLineItem[],
  toAdd: BudgetLineItem[],
): BudgetLineItem[] {
  const existing = new Set(
    current.map((i) => `${i.procedure.trim().toLowerCase()}|${i.toothNumber ?? ''}`),
  )
  const additions = toAdd.filter((item) => {
    const key = `${item.procedure.trim().toLowerCase()}|${item.toothNumber ?? ''}`
    if (existing.has(key)) return false
    existing.add(key)
    return true
  })
  return [...current, ...additions]
}

function createTreatmentItem(
  procedure: string,
  cupsCode: string | undefined,
  toothNumber: number | undefined,
  phase: TreatmentPlanItem['phase'] = 'fase_ii',
): TreatmentPlanItem {
  return {
    id: generateId(),
    phase,
    procedure,
    cupsCode,
    toothNumber,
    quantity: getDefaultQuantityForCups(cupsCode),
    unitPrice: 0,
    notes: 'Agregado por asistente de voz',
    patientApproved: 'pendiente',
    executionStatus: 'pendiente',
    source: 'manual',
  }
}

function createBudgetItem(
  procedure: string,
  cupsCode: string | undefined,
  toothNumber: number | undefined,
  treatmentPlanItemId?: string,
): BudgetLineItem {
  return {
    id: generateId(),
    treatmentPlanItemId,
    procedure,
    cupsCode,
    toothNumber,
    quantity: getDefaultQuantityForCups(cupsCode),
    unitPrice: 0,
  }
}

function suggestPlanAndBudgetFromOdontogram(
  odontogram: OdontogramData,
  clinical: ClinicalRecordFormData,
  addToPlan: boolean,
  addToBudget: boolean,
): ClinicalRecordFormData {
  if (!addToPlan && !addToBudget) return clinical

  const suggested = suggestTreatmentFromOdontogram(odontogram)
  let treatmentPlan = clinical.treatmentPlan
  let budgetItems = clinical.budgetItems
  let budget = clinical.budget

  if (addToPlan) {
    treatmentPlan = mergeSuggestedTreatments(clinical.treatmentPlan, suggested)
  }

  if (addToBudget) {
    const budgetAdds = suggested.map((item) =>
      createBudgetItem(item.procedure, item.cupsCode, item.toothNumber, item.id),
    )
    budgetItems = mergeBudgetItems(clinical.budgetItems, budgetAdds)
    budget = calcBudgetSummary(
      budgetItems,
      clinical.budget.discount,
      clinical.orthodonticsBudget,
    )
  }

  return {
    ...clinical,
    treatmentPlan,
    budgetItems,
    budget,
  }
}

function resolveCie10FromVoiceQuery(query: string): { code: string; description: string } | null {
  const engine = getDefaultCie10SearchEngine()
  const results = engine.search(query, 1)
  return results[0] ?? null
}

export function executeClinicalVoiceCommand(
  command: ClinicalVoiceCommand,
  handlers = getClinicalVoiceHandlers(),
): ClinicalVoiceExecutionResult {
  if (!handlers) {
    return {
      ok: false,
      message: 'Abra la historia clínica de un paciente para usar comandos de voz.',
      command,
      transcript: '',
    }
  }

  if (handlers.isDisabled?.()) {
    return {
      ok: false,
      message: 'La historia clínica está bloqueada; no se pueden aplicar comandos.',
      command,
      transcript: '',
    }
  }

  const odontogram = handlers.getOdontogram()
  const clinical = handlers.getClinicalData()

  if (!clinical) {
    return {
      ok: false,
      message: 'No hay historia clínica activa.',
      command,
      transcript: '',
    }
  }

  const needsOdontogram =
    command.type === 'odontogram_faces' ||
    command.type === 'odontogram_global' ||
    command.type === 'treatment_add' ||
    command.type === 'budget_add'

  if (needsOdontogram && !odontogram) {
    return {
      ok: false,
      message: 'No hay odontograma activo.',
      command,
      transcript: '',
    }
  }

  let updatedOdontogram = odontogram!
  let updatedClinical = clinical

  switch (command.type) {
    case 'odontogram_faces':
      updatedOdontogram = applyFaceStates(
        odontogram!,
        command.toothNumber as AnyToothNumber,
        command.faces,
        command.faceState,
      )
      handlers.setOdontogram(updatedOdontogram)
      updatedClinical = suggestPlanAndBudgetFromOdontogram(
        updatedOdontogram,
        clinical,
        command.addToPlan,
        command.addToBudget,
      )
      if (command.addToPlan || command.addToBudget) {
        handlers.setClinicalData(updatedClinical)
      }
      break

    case 'odontogram_global':
      updatedOdontogram = applyGlobalState(
        odontogram!,
        command.toothNumber as AnyToothNumber,
        command.globalState,
      )
      handlers.setOdontogram(updatedOdontogram)
      updatedClinical = suggestPlanAndBudgetFromOdontogram(
        updatedOdontogram,
        clinical,
        command.addToPlan,
        command.addToBudget,
      )
      if (command.addToPlan || command.addToBudget) {
        handlers.setClinicalData(updatedClinical)
      }
      break

    case 'treatment_add': {
      const item = createTreatmentItem(
        command.procedure,
        command.cupsCode,
        command.toothNumber,
        command.phase,
      )
      handlers.setClinicalData({
        ...clinical,
        treatmentPlan: [...clinical.treatmentPlan, item],
      })
      break
    }

    case 'budget_add': {
      const item = createBudgetItem(command.procedure, command.cupsCode, command.toothNumber)
      const budgetItems = mergeBudgetItems(clinical.budgetItems, [item])
      handlers.setClinicalData({
        ...clinical,
        budgetItems,
        budget: calcBudgetSummary(
          budgetItems,
          clinical.budget.discount,
          clinical.orthodonticsBudget,
        ),
      })
      break
    }

    case 'diagnosis_tooth': {
      const match = resolveCie10FromVoiceQuery(command.searchQuery)
      if (!match) {
        return {
          ok: false,
          message: `No se encontró diagnóstico CIE-10 para "${command.searchQuery}".`,
          command,
          transcript: '',
        }
      }
      updatedClinical = ensureDiagnosisOnTooth(
        clinical,
        String(command.toothNumber),
        match.code,
        match.description,
      )
      handlers.setClinicalData(updatedClinical)
      break
    }

    case 'diagnosis_additional': {
      const match = resolveCie10FromVoiceQuery(command.searchQuery)
      if (!match) {
        return {
          ok: false,
          message: `No se encontró diagnóstico CIE-10 para "${command.searchQuery}".`,
          command,
          transcript: '',
        }
      }
      updatedClinical = addAdditionalDiagnosisToClinical(clinical, match.code, match.description)
      handlers.setClinicalData(updatedClinical)
      break
    }
  }

  const summary = describeClinicalVoiceCommand(command)
  const extras: string[] = []
  if (
    (command.type === 'odontogram_faces' || command.type === 'odontogram_global') &&
    command.addToPlan
  ) {
    extras.push('plan actualizado')
  }
  if (
    (command.type === 'odontogram_faces' || command.type === 'odontogram_global') &&
    command.addToBudget
  ) {
    extras.push('presupuesto actualizado')
  }
  if (command.type === 'diagnosis_tooth' || command.type === 'diagnosis_additional') {
    const match = resolveCie10FromVoiceQuery(command.searchQuery)
    if (match) {
      extras.push(`${match.code} — ${match.description}`)
    }
  }

  return {
    ok: true,
    message: extras.length > 0 ? `${summary} — ${extras.join(', ')}` : summary,
    command,
    transcript: '',
  }
}

export function processClinicalVoiceTranscript(
  transcript: string,
  handlers = getClinicalVoiceHandlers(),
): ClinicalVoiceExecutionResult {
  const command = parseClinicalVoiceCommand(transcript)
  if (!command) {
    return {
      ok: false,
      message: `Comando no reconocido: "${transcript.trim()}"`,
      transcript,
    }
  }

  const result = executeClinicalVoiceCommand(command, handlers)
  return { ...result, transcript }
}
