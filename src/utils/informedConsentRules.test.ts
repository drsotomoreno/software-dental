import { createEmptyConsent, normalizeConsent, type CategoryInformedConsent } from '@/types/consent'
import type { TreatmentPlanItem } from '@/types/clinicalRecord'
import type { SignatureCaptureMetadata } from '@/types/signature'
import {
  canAddCategoryConsent,
  categoryForTreatmentItem,
  createCategoryConsentDraft,
  missingArchivedConsentCategories,
  requiredConsentCategories,
  tryArchiveCategoryConsent,
  validateInformedConsentForRecord,
} from '@/utils/informedConsentRules'

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message)
}

function planItem(partial: Partial<TreatmentPlanItem> & Pick<TreatmentPlanItem, 'procedure'>): TreatmentPlanItem {
  return {
    id: partial.id ?? 'item-1',
    phase: 'fase_i',
    quantity: 1,
    unitPrice: 0,
    patientApproved: 'pendiente',
    executionStatus: 'pendiente',
    ...partial,
  }
}

const signature = (): SignatureCaptureMetadata => ({
  signatureMethod: 'canvas_biometric',
  strokeCount: 6,
  captureStartedAt: '2026-10-09T12:00:00.000Z',
  captureEndedAt: '2026-10-09T12:00:05.000Z',
  canvasWidth: 400,
  canvasHeight: 150,
})

function archiveCategory(
  consent: ReturnType<typeof createEmptyConsent>,
  categoryId: 'ortodoncia' | 'operatoria_restauradora' | 'endodoncia' | 'cirugia_oral',
  templateId?: 'ortodoncia_brackets' | 'ortodoncia_alineadores' | 'operatoria_dental' | 'endodoncia' | 'cirugia_oral',
) {
  const draft = createCategoryConsentDraft({
    id: `draft-${categoryId}-${templateId ?? 'default'}`,
    categoryId,
    templateId,
    professionalLicense: '1234567890',
  })
  const withDraft = {
    ...consent,
    records: [
      ...consent.records,
      {
        ...draft,
        textAccepted: true,
        patientSignatureDataUrl: `data:image/png;base64,${categoryId}-paciente`,
        patientSignatureMeta: signature(),
        professionalSignatureDataUrl: `data:image/png;base64,${categoryId}-profesional`,
        professionalSignatureMeta: signature(),
      },
    ],
  }
  const archived = tryArchiveCategoryConsent(withDraft, draft.id, '2026-10-09T15:00:00.000Z')
  if (!archived.ok) throw new Error(archived.message)
  return archived.consent
}

const orthoControls = [
  planItem({ procedure: 'Consulta de control por ortodoncia', cupsCode: '890322' }),
  planItem({ id: '2', procedure: 'Control mecánico de ortodoncia', cupsCode: '893106' }),
  planItem({ id: '3', procedure: 'Activación de brackets', source: 'orthodontics_annex' }),
]

const requiredOrtho = requiredConsentCategories({ treatmentPlan: orthoControls })
assert(
  requiredOrtho.length === 1 && requiredOrtho[0] === 'ortodoncia',
  `Los controles de ortodoncia deben exigir una sola categoría y exigieron ${requiredOrtho.join(',')}`,
)

const orthoConsent = archiveCategory(createEmptyConsent('1234567890'), 'ortodoncia', 'ortodoncia_brackets')
assert(
  missingArchivedConsentCategories(orthoConsent, { treatmentPlan: orthoControls }).length === 0,
  'El consentimiento de ortodoncia debe cubrir los controles siguientes',
)
assert(
  canAddCategoryConsent(orthoConsent.records, 'ortodoncia') !== null,
  'No se puede agregar un segundo consentimiento de ortodoncia',
)

const secondModality = tryArchiveCategoryConsent(
  {
    ...orthoConsent,
    records: [
      ...orthoConsent.records,
      {
        ...createCategoryConsentDraft({
          id: 'draft-alineadores',
          categoryId: 'ortodoncia',
          templateId: 'ortodoncia_alineadores',
          professionalLicense: '1234567890',
        }),
        textAccepted: true,
        patientSignatureDataUrl: 'data:image/png;base64,alineadores',
        patientSignatureMeta: signature(),
        professionalSignatureDataUrl: 'data:image/png;base64,alineadores-pro',
        professionalSignatureMeta: signature(),
      },
    ],
  },
  'draft-alineadores',
  '2026-10-09T16:00:00.000Z',
)
assert(!secondModality.ok, 'Brackets y alineadores comparten la categoría de ortodoncia')

const mixedPlan = [
  planItem({ procedure: 'Obturación con resina', cupsCode: '232102' }),
  planItem({ id: 'endo', procedure: 'Endodoncia unirradicular', cupsCode: '237301', source: 'endodontics_annex' }),
]
assert(
  requiredConsentCategories({ treatmentPlan: mixedPlan }).join(',') ===
    'operatoria_restauradora,endodoncia',
  'Operatoria y endodoncia son categorías distintas',
)

let mixedConsent = archiveCategory(createEmptyConsent('1234567890'), 'operatoria_restauradora', 'operatoria_dental')
const missingEndo = missingArchivedConsentCategories(mixedConsent, { treatmentPlan: mixedPlan })
assert(
  missingEndo.length === 1 && missingEndo[0]?.id === 'endodoncia',
  'Falta el consentimiento de endodoncia',
)
mixedConsent = archiveCategory(mixedConsent, 'endodoncia', 'endodoncia')
assert(
  validateInformedConsentForRecord(mixedConsent, { treatmentPlan: mixedPlan }) === null,
  'Dos categorías archivadas deben permitir cerrar la atención',
)

const generalOnly = normalizeConsent({
  ...createEmptyConsent('1234567890'),
  selectedConsentIds: ['general_odonto'],
  textAccepted: true,
  patientSignatureDataUrl: 'data:image/png;base64,general',
  patientSignatureMeta: signature(),
  professionalSignatureDataUrl: 'data:image/png;base64,general-pro',
  professionalSignatureMeta: signature(),
  signedAt: '2026-10-09T15:00:00.000Z',
})
assert(generalOnly.records.length === 0, 'El consentimiento general no se archiva ni cubre el plan')
assert(
  generalOnly.selectedConsentIds.length === 0,
  'La proyección no debe conservar el consentimiento general',
)
const generalMessage = validateInformedConsentForRecord(generalOnly, {
  treatmentPlan: [planItem({ procedure: 'Obturación con resina', cupsCode: '232102' })],
})
assert(
  Boolean(generalMessage?.includes('Operatoria / Restauradora')),
  `El plan de operatoria no puede quedar cubierto por un consentimiento general: ${generalMessage}`,
)

const legacySpecific = normalizeConsent({
  ...createEmptyConsent('1234567890'),
  selectedConsentIds: ['operatoria_dental', 'general_odonto'],
  textAccepted: true,
  patientSignatureDataUrl: 'data:image/png;base64,legacy',
  patientSignatureMeta: signature(),
  professionalSignatureDataUrl: 'data:image/png;base64,legacy-pro',
  professionalSignatureMeta: signature(),
  signedAt: '2026-10-09T15:00:00.000Z',
})
assert(
  legacySpecific.records.length === 1 &&
    legacySpecific.records[0]?.categoryId === 'operatoria_restauradora' &&
    legacySpecific.records[0]?.status === 'archivado',
  'Una historia vieja conserva la operatoria y descarta el texto general',
)

const perVisit = normalizeConsent({
  ...createEmptyConsent('123'),
  records: [
    {
      id: 'por-cita',
      categoryId: 'cirugia_oral',
      templateId: 'cirugia_oral',
      status: 'archivado',
      scope: 'cita',
      textAccepted: true,
      professionalLicense: '123',
      professionalRegistry: '123',
      patientSignatureDataUrl: 'data:image/png;base64,cita',
      patientSignatureMeta: signature(),
      professionalSignatureDataUrl: 'data:image/png;base64,cita-pro',
      professionalSignatureMeta: signature(),
      signedAt: '2026-10-09T15:00:00.000Z',
    } as unknown as CategoryInformedConsent,
  ],
})
assert(perVisit.records.length === 0, 'Un consentimiento atado a una cita no se conserva')

assert(
  categoryForTreatmentItem(planItem({ procedure: 'Consulta de control por odontología general', cupsCode: '890303' })) ===
    null,
  'El control de odontología general no crea una categoría de consentimiento',
)

const withDraft = {
  ...mixedConsent,
  records: [
    ...mixedConsent.records,
    createCategoryConsentDraft({
      id: 'borrador-cirugia',
      categoryId: 'cirugia_oral',
      professionalLicense: '1234567890',
    }),
  ],
}
assert(
  validateInformedConsentForRecord(withDraft, { treatmentPlan: mixedPlan }) !== null,
  'Un borrador sin archivar bloquea el cierre',
)

console.log('informed consent category rules ok')
