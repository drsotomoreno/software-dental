import { useState } from 'react'
import { ChevronLeft, ChevronRight, Info } from 'lucide-react'
import { DEMO_STEPS, getDemoStep } from '@/constants/demoSteps'
import { DemoStepChiefComplaint } from './DemoStepChiefComplaint'
import { DemoStepConsentSignature } from './DemoStepConsentSignature'
import { DemoStepDiagnosis } from './DemoStepDiagnosis'
import { DemoStepEvolution } from './DemoStepEvolution'
import { DemoStepOdontogram } from './DemoStepOdontogram'
import { DemoStepPatientName } from './DemoStepPatientName'
import { DemoStepPayments } from './DemoStepPayments'
import { DemoStepPlaceholder } from './DemoStepPlaceholder'
import { DemoStepRips } from './DemoStepRips'
import { DemoStepTreatmentPlan } from './DemoStepTreatmentPlan'
import { EMPTY_DEMO_FORM, type DemoFormData } from './demoTypes'

export function DemoShell() {
  const [currentStep, setCurrentStep] = useState(1)
  const [formData, setFormData] = useState<DemoFormData>(EMPTY_DEMO_FORM)
  const step = getDemoStep(currentStep) ?? DEMO_STEPS[0]
  const isFirst = currentStep <= 1
  const isLast = currentStep >= DEMO_STEPS.length

  const goToStep = (stepId: number) => {
    if (stepId < 1 || stepId > DEMO_STEPS.length) return
    setCurrentStep(stepId)
  }

  const goPrevious = () => goToStep(currentStep - 1)
  const goNext = () => goToStep(currentStep + 1)

  const updateField = <K extends keyof DemoFormData>(key: K, value: DemoFormData[K]) => {
    setFormData((prev) => ({ ...prev, [key]: value }))
  }

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <DemoStepPatientName
            value={formData.patientName}
            onChange={(patientName) => updateField('patientName', patientName)}
          />
        )
      case 2:
        return (
          <DemoStepChiefComplaint
            value={formData.chiefComplaint}
            onChange={(chiefComplaint) => updateField('chiefComplaint', chiefComplaint)}
          />
        )
      case 3:
        return (
          <DemoStepOdontogram
            selectedTeeth={formData.selectedTeeth}
            onChange={(selectedTeeth) => updateField('selectedTeeth', selectedTeeth)}
          />
        )
      case 4:
        return (
          <DemoStepDiagnosis
            selectedDiagnosisCode={formData.selectedDiagnosisCode}
            onChange={(selectedDiagnosisCode) =>
              updateField('selectedDiagnosisCode', selectedDiagnosisCode)
            }
          />
        )
      case 5:
        return (
          <DemoStepTreatmentPlan
            treatmentRow={formData.treatmentRow}
            onChange={(treatmentRow) => updateField('treatmentRow', treatmentRow)}
          />
        )
      case 7:
        return (
          <DemoStepConsentSignature
            signatureDataUrl={formData.signatureDataUrl}
            onChange={(signatureDataUrl) => updateField('signatureDataUrl', signatureDataUrl)}
          />
        )
      case 8:
        return (
          <DemoStepPayments
            formData={formData}
            onChange={(payment) => updateField('payment', payment)}
          />
        )
      case 9:
        return (
          <DemoStepEvolution
            value={formData.evolutionNote}
            onChange={(evolutionNote) => updateField('evolutionNote', evolutionNote)}
          />
        )
      case 10:
        return (
          <DemoStepRips
            formData={formData}
            generatedRipsJson={formData.generatedRipsJson}
            onGenerated={(generatedRipsJson) => updateField('generatedRipsJson', generatedRipsJson)}
          />
        )
      default:
        return <DemoStepPlaceholder step={step} />
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-800">
      {/* Banner fijo de versión de prueba */}
      <div className="sticky top-0 z-40 border-b border-amber-300 bg-gradient-to-r from-amber-400 via-amber-300 to-sky-300 shadow-md">
        <div className="mx-auto flex max-w-7xl items-center justify-center gap-2 px-4 py-3 text-center sm:px-6">
          <Info className="hidden h-5 w-5 shrink-0 text-amber-950 sm:block" aria-hidden />
          <p className="text-sm font-semibold text-amber-950 sm:text-base">
            Esta es una versión de prueba reducida. Sigue nuestra guía paso a paso.
          </p>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:gap-6 lg:py-6">
        {/* Stepper lateral */}
        <aside className="w-full shrink-0 lg:w-64">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm lg:sticky lg:top-20">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-dental-600">
              MiHistoriaDental
            </p>
            <h1 className="mb-4 text-lg font-semibold text-slate-800">Guía interactiva</h1>

            <nav aria-label="Pasos de la demo" className="space-y-1">
              {DEMO_STEPS.map((item) => {
                const isActive = item.id === currentStep
                const isDone = item.id < currentStep
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => goToStep(item.id)}
                    className={[
                      'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition',
                      isActive
                        ? 'bg-dental-600 text-white shadow-sm'
                        : isDone
                          ? 'bg-dental-50 text-dental-800 hover:bg-dental-100'
                          : 'text-slate-600 hover:bg-slate-50',
                    ].join(' ')}
                    aria-current={isActive ? 'step' : undefined}
                  >
                    <span
                      className={[
                        'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                        isActive
                          ? 'bg-white text-dental-700'
                          : isDone
                            ? 'bg-dental-200 text-dental-800'
                            : 'bg-slate-100 text-slate-500',
                      ].join(' ')}
                    >
                      {item.id}
                    </span>
                    <span className="min-w-0 truncate font-medium">{item.shortTitle}</span>
                  </button>
                )
              })}
            </nav>
          </div>
        </aside>

        {/* Área principal del paso */}
        <section className="flex min-w-0 flex-1 flex-col">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Contenido del paso
              </p>
              <p className="text-sm text-slate-600">
                {currentStep} / {DEMO_STEPS.length}
              </p>
            </div>
            <div
              className="hidden h-2 max-w-xs flex-1 overflow-hidden rounded-full bg-slate-200 sm:block"
              role="progressbar"
              aria-valuenow={currentStep}
              aria-valuemin={1}
              aria-valuemax={DEMO_STEPS.length}
              aria-label="Progreso de la guía"
            >
              <div
                className="h-full rounded-full bg-dental-500 transition-all duration-300"
                style={{ width: `${(currentStep / DEMO_STEPS.length) * 100}%` }}
              />
            </div>
          </div>

          <div className="flex-1">{renderStepContent()}</div>

          <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-200 pt-4">
            <button
              type="button"
              onClick={goPrevious}
              disabled={isFirst}
              className="btn-secondary gap-1 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden />
              Anterior
            </button>
            <button
              type="button"
              onClick={goNext}
              disabled={isLast}
              className="btn-primary gap-1 disabled:cursor-not-allowed"
            >
              Siguiente
              <ChevronRight className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </section>
      </div>
    </div>
  )
}
