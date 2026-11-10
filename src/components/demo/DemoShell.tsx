import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Info, Sparkles } from 'lucide-react'
import { DEMO_STEPS, getDemoStep } from '@/constants/demoSteps'
import { getStoredApiAuth } from '@/services/apiAuthService'
import { userNeedsWelcome } from '@/utils/subscriptionAccess'
import { PAID_PLANS } from '../../../shared/subscriptionPlans.js'
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
  const needsPlan = userNeedsWelcome(getStoredApiAuth()?.user)

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
            marks={formData.odontogramMarks}
            onChange={(odontogramMarks) => updateField('odontogramMarks', odontogramMarks)}
          />
        )
      case 4:
        return (
          <DemoStepDiagnosis
            selectedDiagnosis={formData.selectedDiagnosis}
            onChange={(selectedDiagnosis) => updateField('selectedDiagnosis', selectedDiagnosis)}
          />
        )
      case 5:
        return (
          <DemoStepTreatmentPlan
            selectedDiagnosis={formData.selectedDiagnosis}
            treatmentRow={formData.treatmentRow}
            onChange={(treatmentRow) => updateField('treatmentRow', treatmentRow)}
          />
        )
      case 6:
        return (
          <DemoStepConsentSignature
            signatureDataUrl={formData.signatureDataUrl}
            onChange={(signatureDataUrl) => updateField('signatureDataUrl', signatureDataUrl)}
          />
        )
      case 7:
        return (
          <DemoStepPayments
            formData={formData}
            onChange={(payment) => updateField('payment', payment)}
          />
        )
      case 8:
        return (
          <DemoStepEvolution
            note={formData.evolutionNote}
            professionalName={formData.evolutionProfessionalName}
            rethus={formData.evolutionRethus}
            signatureDataUrl={formData.evolutionProfessionalSignature}
            signedAt={formData.evolutionSignedAt}
            onNoteChange={(evolutionNote) => updateField('evolutionNote', evolutionNote)}
            onProfessionalNameChange={(evolutionProfessionalName) =>
              updateField('evolutionProfessionalName', evolutionProfessionalName)
            }
            onRethusChange={(evolutionRethus) => updateField('evolutionRethus', evolutionRethus)}
            onSignatureChange={(evolutionProfessionalSignature) =>
              updateField('evolutionProfessionalSignature', evolutionProfessionalSignature)
            }
            onSignedAtChange={(evolutionSignedAt) =>
              updateField('evolutionSignedAt', evolutionSignedAt)
            }
          />
        )
      case 9:
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
      {/* Banner fijo de versión demo (sin plan = solo esta experiencia) */}
      <div className="sticky top-0 z-40 border-b border-amber-300 bg-gradient-to-r from-amber-400 via-amber-300 to-sky-300 shadow-md">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-center gap-2 px-4 py-3 text-center sm:flex-row sm:gap-4 sm:px-6">
          <div className="flex items-center justify-center gap-2">
            <Info className="hidden h-5 w-5 shrink-0 text-amber-950 sm:block" aria-hidden />
            <p className="text-sm font-semibold text-amber-950 sm:text-base">
              {needsPlan
                ? 'Cuenta registrada sin plan: solo puede usar esta versión demo. Active una prueba o plan para abrir la historia clínica.'
                : 'Esta es una versión de prueba reducida. Sigue nuestra guía paso a paso.'}
            </p>
          </div>
          {needsPlan ? (
            <Link
              to="/welcome-trial"
              className="shrink-0 rounded-lg bg-amber-950 px-3 py-1.5 text-xs font-semibold text-amber-50 hover:bg-amber-900 sm:text-sm"
            >
              Activar prueba o plan
            </Link>
          ) : null}
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:gap-6 lg:py-6">
        {/* Stepper lateral */}
        <aside className="w-full shrink-0 lg:w-72">
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
                      'flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition',
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
                        'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                        isActive
                          ? 'bg-white text-dental-700'
                          : isDone
                            ? 'bg-dental-200 text-dental-800'
                            : 'bg-slate-100 text-slate-500',
                      ].join(' ')}
                    >
                      {item.id}
                    </span>
                    <span className="min-w-0 leading-snug font-medium">{item.title}</span>
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

      <section
        id="demo-tarifas-pionero"
        className="border-t border-cyan-200 bg-gradient-to-b from-cyan-50 via-white to-slate-50"
      >
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:py-14">
          <div className="relative overflow-hidden rounded-3xl border-2 border-amber-300 bg-gradient-to-br from-amber-400 via-orange-300 to-cyan-400 p-1 shadow-xl shadow-amber-200/60">
            <div className="rounded-[1.35rem] bg-slate-950 px-6 py-8 text-center sm:px-10 sm:py-10">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-400 text-slate-950">
                <Sparkles className="h-6 w-6" aria-hidden />
              </div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-300">
                Oferta de pionero · cupos limitados
              </p>
              <h2 className="mx-auto mt-3 max-w-4xl text-2xl font-extrabold leading-snug text-white sm:text-3xl lg:text-4xl">
                ¡Te gustó <span className="text-amber-300">mihistoriadental</span>! No pierdas la
                oportunidad de asegurar tu tarifa preferencial de pionero: un beneficio exclusivo
                para los primeros 100 especialistas en dar el salto digital con nosotros.
              </h2>
              <p className="mx-auto mt-4 max-w-2xl text-sm text-slate-300 sm:text-base">
                Elige el plan que mejor se adapte a tu consulta y activa tu acceso con la tarifa de
                lanzamiento.
              </p>
              <Link
                to={needsPlan ? '/welcome-trial' : '/registro'}
                className="mt-6 inline-flex items-center justify-center rounded-xl bg-amber-400 px-6 py-3 text-sm font-bold text-slate-950 shadow-lg shadow-amber-500/30 transition hover:bg-amber-300"
              >
                Asegurar mi tarifa de pionero
              </Link>
            </div>
          </div>

          <div className="mt-10">
            <h3 className="text-center text-2xl font-bold text-slate-900">
              Tarifas preferenciales de pionero
            </h3>
            <p className="mx-auto mt-2 max-w-2xl text-center text-sm text-slate-600 sm:text-base">
              Precios en pesos colombianos. Empieza con lo esencial y escala cuando tu consulta lo
              necesite.
            </p>

            <div className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
              {PAID_PLANS.map((plan) => (
                <article
                  key={plan.id}
                  className={`relative flex flex-col rounded-2xl border p-6 shadow-sm ${
                    plan.featured
                      ? 'border-dental-800 bg-dental-800 text-white shadow-dental-900/20 xl:-translate-y-2'
                      : 'border-slate-200 bg-white text-slate-800'
                  }`}
                >
                  {plan.featured ? (
                    <p className="mb-4 inline-flex self-start rounded-full bg-amber-400 px-3 py-1 text-xs font-semibold text-dental-950">
                      ★ El más elegido
                    </p>
                  ) : null}
                  <h4 className="text-xl font-bold">{plan.name}</h4>
                  <p
                    className={`mt-1 text-sm ${plan.featured ? 'text-dental-100' : 'text-slate-600'}`}
                  >
                    {plan.blurb}
                  </p>
                  <p className="mt-5 flex items-end gap-1">
                    <span className="text-3xl font-bold tracking-tight">{plan.priceLabel}</span>
                    {plan.period ? (
                      <span
                        className={`mb-1 text-sm font-medium ${
                          plan.featured ? 'text-dental-100' : 'text-slate-500'
                        }`}
                      >
                        {plan.period}
                      </span>
                    ) : null}
                  </p>
                  <ul className="mt-6 flex-1 space-y-2.5 text-sm">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex gap-2">
                        <span
                          className={`mt-0.5 ${plan.featured ? 'text-sky-200' : 'text-dental-600'}`}
                        >
                          ✓
                        </span>
                        <span className={plan.featured ? 'text-dental-50' : 'text-slate-600'}>
                          {feature}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <Link
                    to={needsPlan ? '/welcome-trial' : '/registro'}
                    className={`mt-8 inline-flex w-full items-center justify-center rounded-lg px-4 py-2.5 text-sm font-medium transition ${
                      plan.featured
                        ? 'bg-white text-dental-800 hover:bg-dental-50'
                        : 'bg-dental-600 text-white hover:bg-dental-700'
                    }`}
                  >
                    {plan.cta}
                  </Link>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
