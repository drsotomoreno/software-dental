import { Link } from 'react-router-dom'
import {
  CalendarDays,
  FileJson,
  Lock,
  MessageCircle,
  Mic,
  Receipt,
  Smile,
  Stethoscope,
  type LucideIcon,
} from 'lucide-react'
import { APP_SHORT_NAME } from '@/constants/branding'
import { PAID_PLANS } from '../../shared/subscriptionPlans.js'

const FEATURES: Array<{ title: string; text: string; icon: LucideIcon }> = [
  {
    title: 'Odontograma Digital',
    text: 'Odontograma interactivo para registrar el estado dental. Claro, rápido y sin papel.',
    icon: Smile,
  },
  {
    title: 'IA que Escucha',
    text: 'Activa la escucha inteligente. La IA transcribe los hallazgos y diligencia por ti.',
    icon: Mic,
  },
  {
    title: 'Historia Clínica',
    text: 'Anamnesis, plan de tratamiento y evoluciones que cumplen estándares colombianos.',
    icon: Stethoscope,
  },
  {
    title: 'RIPS Resolución 948',
    text: 'Genera archivos RIPS automáticamente. Sin reingreso de datos ni errores de códigos.',
    icon: FileJson,
  },
  {
    title: 'Facturación DIAN',
    text: 'Factura electrónica integrada. Genera la factura directamente desde la atención.',
    icon: Receipt,
  },
  {
    title: 'Agenda Inteligente',
    text: 'Programa citas, tratamientos y maneja la vista por profesional y por silla.',
    icon: CalendarDays,
  },
  {
    title: 'Historia Clínica en la Nube',
    text: 'Información encriptada. Cumple regulaciones de privacidad y Res. 948 actualizada.',
    icon: Lock,
  },
  {
    title: 'WhatsApp Integrado',
    text: 'Envía recordatorios automáticos al WhatsApp del paciente. Reduce el ausentismo.',
    icon: MessageCircle,
  },
]

export function LandingPage() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <header className="border-b border-dental-100 bg-white/90">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <Link to="/" className="text-sm font-semibold tracking-wide text-dental-700">
            {APP_SHORT_NAME}
          </Link>
          <Link to="/login" className="btn-secondary px-4 py-2 text-sm">
            Iniciar sesión
          </Link>
        </div>
      </header>

      <section className="border-b border-dental-100 bg-gradient-to-br from-white via-dental-50/70 to-slate-50">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:py-20">
          <div className="grid grid-cols-1 items-center gap-10 md:grid-cols-2 md:gap-14">
            <div>
              <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-dental-600">
                {APP_SHORT_NAME}
              </p>
              <h1 className="text-3xl font-bold leading-tight text-dental-800 sm:text-4xl lg:text-5xl">
                El Software de Historia Clínica Odontológica con Dictado por Voz
              </h1>
              <p className="mt-5 max-w-xl text-base leading-relaxed text-slate-600 sm:text-lg">
                Recupera tu tiempo clínico. Dicta la atención, gestiona todo 100% en la nube y
                exporta los RIPS sin reescribir datos.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-start">
                <div>
                  <Link to="/login" className="btn-primary px-6 py-3 text-center text-base">
                    Iniciar Prueba de 7 Días
                  </Link>
                  <p className="mt-2 max-w-sm text-xs leading-relaxed text-gray-500">
                    Requiere validación con número ReTHUS real. Incluye habilitación de dictado por
                    voz por paciente.
                  </p>
                </div>
                <a href="#planes" className="btn-secondary px-6 py-3 text-center text-base">
                  Ver Planes
                </a>
              </div>
            </div>

            <div className="flex justify-center md:justify-end">
              <img
                src="/image_f3e509.png"
                alt="Historia Clínica Odontológica Dictada por Voz"
                className="h-auto w-full max-w-lg rounded-2xl bg-white object-contain"
              />
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-20">
        <h2 className="text-center text-3xl font-bold text-slate-900">¿Qué incluye?</h2>
        <p className="mx-auto mt-3 max-w-2xl text-center text-slate-600">
          Todo lo que tu consulta necesita para atender, documentar y facturar en un solo flujo.
        </p>
        <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((feature) => {
            const Icon = feature.icon
            return (
              <article
                key={feature.title}
                className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
              >
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-dental-50 text-dental-700">
                  <Icon className="h-5 w-5" aria-hidden />
                </div>
                <h3 className="font-semibold text-slate-900">{feature.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{feature.text}</p>
              </article>
            )
          })}
        </div>
      </section>

      <section id="planes" className="scroll-mt-8 border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-20">
          <h2 className="text-center text-3xl font-bold text-slate-900">
            Planes diseñados para crecer
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-slate-600">
            Empieza con lo esencial y escala cuando tu consulta o tu clínica lo necesiten. Precios en
            pesos colombianos.
          </p>

          <div className="mt-12 grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
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
                <h3 className="text-xl font-bold">{plan.name}</h3>
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
                  to="/login"
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
      </section>
    </div>
  )
}
