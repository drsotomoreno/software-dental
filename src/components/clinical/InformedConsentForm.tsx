import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { normalizeConsent, type CategoryInformedConsent, type InformedConsent } from '@/types/consent'
import type { TreatmentPlanItem } from '@/types/clinicalRecord'
import {
  getClinicalConsentCategory,
  type ClinicalConsentCategoryId,
} from '@/constants/consentCategories'
import {
  getConsentLabel,
  getConsentTemplate,
  type ConsentTemplateId,
} from '@/constants/consentTemplates'
import {
  CLINICAL_HISTORY_SECTION_NUMBERS,
  CLINICAL_SECTION_TITLE_CLASS,
  clinicalSectionTitle,
} from '@/constants/clinicalHistorySections'
import { DigitalSignatureCanvas } from '@/components/signature'
import { formatDate, generateId } from '@/utils/crypto'
import {
  canAddCategoryConsent,
  categoriesAvailableForNewConsent,
  createCategoryConsentDraft,
  listArchivedCategoryConsents,
  missingArchivedConsentCategories,
  tryArchiveCategoryConsent,
} from '@/utils/informedConsentRules'

const EMPTY_CATEGORY_CONSENTS: CategoryInformedConsent[] = []

interface InformedConsentFormProps {
  data: InformedConsent
  onChange: (data: InformedConsent) => void
  treatmentPlan?: TreatmentPlanItem[]
  orthodonticsBudgetActive?: boolean
  dentalImplantsBudgetActive?: boolean
  professionalLicense?: string
  disabled?: boolean
}

export function InformedConsentForm({
  data,
  onChange,
  treatmentPlan = [],
  orthodonticsBudgetActive = false,
  dentalImplantsBudgetActive = false,
  professionalLicense = '',
  disabled = false,
}: InformedConsentFormProps) {
  const [composerOpen, setComposerOpen] = useState(false)
  const [pickerCategory, setPickerCategory] = useState('')
  const [formError, setFormError] = useState('')

  const records = data.records ?? EMPTY_CATEGORY_CONSENTS
  const archived = useMemo(() => listArchivedCategoryConsents({ records }), [records])
  const draft = records.find((record) => record.status === 'borrador') ?? null
  const availableCategories = useMemo(
    () => categoriesAvailableForNewConsent(records),
    [records],
  )
  const missingCategories = useMemo(
    () =>
      missingArchivedConsentCategories(
        { records },
        {
          treatmentPlan,
          orthodonticsBudgetActive,
          dentalImplantsBudgetActive,
        },
      ),
    [records, treatmentPlan, orthodonticsBudgetActive, dentalImplantsBudgetActive],
  )

  const replaceRecords = (nextRecords: CategoryInformedConsent[]) => {
    onChange(
      normalizeConsent({
        ...data,
        records: nextRecords,
      }),
    )
  }

  const openComposer = () => {
    setFormError('')
    setPickerCategory('')
    setComposerOpen(true)
  }

  const startDraft = (categoryId: ClinicalConsentCategoryId) => {
    const block = canAddCategoryConsent(records, categoryId)
    if (block) {
      setFormError(block)
      return
    }
    const nextDraft = createCategoryConsentDraft({
      id: generateId(),
      categoryId,
      professionalLicense: data.professionalLicense || professionalLicense,
    })
    replaceRecords([...records, nextDraft])
    setComposerOpen(true)
    setPickerCategory('')
    setFormError('')
  }

  const patchDraft = (patch: Partial<CategoryInformedConsent>) => {
    if (!draft) return
    replaceRecords(records.map((record) => (record.id === draft.id ? { ...record, ...patch } : record)))
  }

  const changeDraftCategory = (categoryId: ClinicalConsentCategoryId) => {
    if (!draft) return
    const block = canAddCategoryConsent(
      records.filter((record) => record.id !== draft.id),
      categoryId,
    )
    if (block) {
      setFormError(block)
      return
    }
    const next = createCategoryConsentDraft({
      id: draft.id,
      categoryId,
      professionalLicense: draft.professionalLicense || data.professionalLicense || professionalLicense,
    })
    patchDraft({
      ...next,
      textAccepted: false,
      patientSignatureDataUrl: undefined,
      patientSignatureMeta: undefined,
      professionalSignatureDataUrl: undefined,
      professionalSignatureMeta: undefined,
    })
    setFormError('')
  }

  const changeDraftTemplate = (templateId: ConsentTemplateId) => {
    patchDraft({
      templateId,
      textAccepted: false,
      patientSignatureDataUrl: undefined,
      patientSignatureMeta: undefined,
      professionalSignatureDataUrl: undefined,
      professionalSignatureMeta: undefined,
    })
    setFormError('')
  }

  const cancelDraft = () => {
    if (draft) {
      replaceRecords(records.filter((record) => record.id !== draft.id))
    }
    setComposerOpen(false)
    setPickerCategory('')
    setFormError('')
  }

  const archiveDraft = () => {
    if (!draft) return
    const result = tryArchiveCategoryConsent(data, draft.id, new Date().toISOString())
    if (!result.ok) {
      setFormError(result.message)
      return
    }
    onChange(result.consent)
    setComposerOpen(false)
    setFormError('')
  }

  const draftCategory = draft ? getClinicalConsentCategory(draft.categoryId) : undefined
  const draftTemplates = draftCategory?.templateIds ?? []
  const showComposer = !disabled && (composerOpen || Boolean(draft))

  return (
    <section className="card" id="clinical-consent-category-rule">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <h3 className={CLINICAL_SECTION_TITLE_CLASS}>
          {clinicalSectionTitle(
            CLINICAL_HISTORY_SECTION_NUMBERS.consentimiento,
            'Consentimiento Informado y Firmas',
          )}
        </h3>
        {!disabled && availableCategories.length > 0 && !draft && (
          <button
            type="button"
            className="btn-primary"
            onClick={openComposer}
            data-testid="add-consent-button"
          >
            <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
            Agregar consentimiento
          </button>
        )}
      </div>

      <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs leading-relaxed text-slate-600">
        <p className="font-medium text-slate-800">Regla de consentimientos informados</p>
        <ul className="mt-1 list-disc space-y-1 pl-4">
          <li>
            Se archiva un solo consentimiento por categoría clínica o especialidad (ortodoncia,
            operatoria / restauradora, cirugía oral, endodoncia y las demás del listado).
          </li>
          <li>
            Ese documento queda vigente para las atenciones y controles del mismo tipo de
            tratamiento. El paciente no vuelve a firmar en cada cita.
          </li>
          <li>
            Está prohibido usar un consentimiento general único para todo el plan de tratamiento.
          </li>
        </ul>
      </div>

      {missingCategories.length > 0 && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
          El plan todavía no tiene consentimiento archivado de{' '}
          <strong>{missingCategories.map((category) => category.label).join(', ')}</strong>. Agregue
          uno por categoría. Con eso quedan cubiertas las citas y los controles de ese tratamiento.
        </div>
      )}

      <div data-testid="archived-consent-list">
        <h4 className="clinical-label-raw mb-2 text-sm font-semibold text-slate-800">
          Consentimientos firmados y archivados
        </h4>
        {archived.length === 0 ? (
          <p className="mb-4 rounded-xl border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-600">
            Todavía no hay consentimientos firmados y archivados. Al archivar el de una categoría,
            quedará visible aquí y no tendrá que repetir la firma en los controles de ese
            tratamiento.
          </p>
        ) : (
          <div className="mb-4 space-y-3">
            {archived.map((record) => {
              const category = getClinicalConsentCategory(record.categoryId)
              const signedAt = record.signedAt || record.archivedAt
              return (
                <article
                  key={record.id}
                  className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4"
                  data-testid={`archived-consent-${record.categoryId}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-emerald-950">
                        {category?.label ?? record.categoryId}
                      </p>
                      <p className="text-xs text-emerald-900">{getConsentLabel(record.templateId)}</p>
                    </div>
                    <span className="rounded-full bg-emerald-700 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white">
                      Firmado y archivado
                    </span>
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-emerald-950">
                    Vigente para esta categoría: {category?.coverageSummary} No repita la firma en
                    cada control.
                  </p>
                  <p className="mt-1 text-xs text-slate-600">
                    {signedAt ? `Archivado el ${formatDate(signedAt)}` : 'Archivado'}
                    {record.professionalLicense
                      ? ` · Documento profesional ${record.professionalLicense}`
                      : ''}
                  </p>
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs font-medium text-dental-700">
                      Ver documento y firmas
                    </summary>
                    <div className="mt-2 max-h-64 overflow-y-auto rounded-lg border border-emerald-100 bg-white p-3 text-xs leading-relaxed whitespace-pre-line text-slate-700">
                      {getConsentTemplate(record.templateId)?.text}
                    </div>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      {record.patientSignatureDataUrl && (
                        <figure className="rounded-lg border border-slate-200 bg-white p-2">
                          <figcaption className="mb-1 text-[11px] font-medium text-slate-500">
                            Firma del paciente
                          </figcaption>
                          <img
                            src={record.patientSignatureDataUrl}
                            alt={`Firma del paciente — ${category?.label ?? 'consentimiento'}`}
                            className="max-h-24 w-full object-contain"
                          />
                        </figure>
                      )}
                      {record.professionalSignatureDataUrl && (
                        <figure className="rounded-lg border border-slate-200 bg-white p-2">
                          <figcaption className="mb-1 text-[11px] font-medium text-slate-500">
                            Firma del profesional
                          </figcaption>
                          <img
                            src={record.professionalSignatureDataUrl}
                            alt={`Firma del profesional — ${category?.label ?? 'consentimiento'}`}
                            className="max-h-24 w-full object-contain"
                          />
                        </figure>
                      )}
                    </div>
                  </details>
                </article>
              )
            })}
          </div>
        )}
      </div>

      {!disabled && archived.length > 0 && availableCategories.length === 0 && !draft && (
        <p className="mb-4 text-xs text-slate-500">
          Cada categoría clínica ya tiene un consentimiento firmado y archivado.
        </p>
      )}

      {showComposer && (
        <div className="rounded-xl border border-dental-200 bg-white p-4" data-testid="consent-composer">
          <h4 className="clinical-label-raw mb-3 text-sm font-semibold text-slate-800">Nuevo consentimiento</h4>
          {!draft ? (
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-[240px] flex-1">
                <label className="label-field" htmlFor="consent-category-picker">
                  Categoría clínica
                </label>
                <select
                  id="consent-category-picker"
                  className="input-field"
                  value={pickerCategory}
                  onChange={(event) => {
                    const categoryId = event.target.value as ClinicalConsentCategoryId
                    setPickerCategory(categoryId)
                    if (categoryId) startDraft(categoryId)
                  }}
                >
                  <option value="">Seleccione la categoría...</option>
                  {availableCategories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.label}
                      {missingCategories.some((missing) => missing.id === category.id)
                        ? ' — pendiente del plan'
                        : ''}
                    </option>
                  ))}
                </select>
              </div>
              <button type="button" className="btn-secondary" onClick={cancelDraft}>
                Cancelar
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label className="label-field" htmlFor="consent-draft-category">
                    Categoría clínica
                  </label>
                  <select
                    id="consent-draft-category"
                    className="input-field"
                    value={draft.categoryId}
                    onChange={(event) =>
                      changeDraftCategory(event.target.value as ClinicalConsentCategoryId)
                    }
                  >
                    {getClinicalConsentCategory(draft.categoryId) && (
                      <option value={draft.categoryId}>
                        {getClinicalConsentCategory(draft.categoryId)?.label}
                      </option>
                    )}
                    {availableCategories
                      .filter((category) => category.id !== draft.categoryId)
                      .map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.label}
                        </option>
                      ))}
                  </select>
                </div>
                {draftTemplates.length > 1 && (
                  <div>
                    <label className="label-field" htmlFor="consent-draft-template">
                      Texto de la categoría
                    </label>
                    <select
                      id="consent-draft-template"
                      className="input-field"
                      value={draft.templateId}
                      onChange={(event) =>
                        changeDraftTemplate(event.target.value as ConsentTemplateId)
                      }
                    >
                      {draftTemplates.map((templateId) => (
                        <option key={templateId} value={templateId}>
                          {getConsentLabel(templateId)}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <p className="text-xs text-slate-500">
                {draftCategory?.coverageSummary} Este archivo no se repite en cada cita.
              </p>

              <div className="max-h-72 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs leading-relaxed whitespace-pre-line text-slate-700">
                {getConsentTemplate(draft.templateId)?.text}
              </div>

              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={draft.textAccepted}
                  onChange={(event) => patchDraft({ textAccepted: event.target.checked })}
                  className="mt-0.5 rounded border-slate-300 text-dental-600 focus:ring-dental-500"
                />
                <span className="text-sm text-slate-700">
                  El paciente ha leído y acepta el consentimiento informado de{' '}
                  {draftCategory?.label ?? 'esta categoría'}{' '}
                  <span className="text-red-500">*</span>
                </span>
              </label>

              <div className="grid gap-6 lg:grid-cols-2">
                <div>
                  <h5 className="mb-2 text-sm font-semibold text-slate-700">Firma del paciente</h5>
                  <DigitalSignatureCanvas
                    key={`${draft.id}:${draft.templateId}:paciente`}
                    onSignatureChange={(result) =>
                      patchDraft({
                        patientSignatureDataUrl: result?.dataUrl,
                        patientSignatureMeta: result?.metadata,
                      })
                    }
                    width={400}
                    height={150}
                  />
                </div>
                <div>
                  <h5 className="mb-2 text-sm font-semibold text-slate-700">Firma del profesional</h5>
                  <div className="mb-3">
                    <label className="label-field" htmlFor="consent-draft-license">
                      Número de Documento (Cédula / ReTHUS)
                    </label>
                    <input
                      id="consent-draft-license"
                      value={draft.professionalLicense}
                      onChange={(event) =>
                        patchDraft({
                          professionalLicense: event.target.value,
                          professionalRegistry: event.target.value,
                        })
                      }
                      placeholder="Cédula del profesional"
                      className="input-field font-mono"
                    />
                  </div>
                  <DigitalSignatureCanvas
                    key={`${draft.id}:${draft.templateId}:profesional`}
                    onSignatureChange={(result) =>
                      patchDraft({
                        professionalSignatureDataUrl: result?.dataUrl,
                        professionalSignatureMeta: result?.metadata,
                      })
                    }
                    width={400}
                    height={150}
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn-primary" onClick={archiveDraft}>
                  Firmar y archivar
                </button>
                <button type="button" className="btn-secondary" onClick={cancelDraft}>
                  Cancelar
                </button>
              </div>
            </div>
          )}
          {formError && (
            <p className="mt-3 text-sm text-red-600" role="alert">
              {formError}
            </p>
          )}
        </div>
      )}
    </section>
  )
}
