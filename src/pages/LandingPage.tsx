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

type FeatureTone = 'clinical' | 'innovation' | 'admin' | 'ops' | 'infra' | 'comms'

const FEATURE_TONES: Record<FeatureTone, { card: string; icon: string }> = {
  clinical: {
    card: 'border-blue-100 bg-blue-50/50 hover:border-blue-300',
    icon: 'bg-blue-100 text-blue-600',
  },
  innovation: {
    card: 'border-emerald-200 bg-emerald-50/60 hover:border-emerald-400',
    icon: 'bg-emerald-100 text-emerald-600',
  },
  admin: {
    card: 'border-indigo-100 bg-indigo-50/50 hover:border-indigo-300',
    icon: 'bg-indigo-100 text-indigo-600',
  },
  ops: {
    card: 'border-amber-100 bg-amber-50/50 hover:border-amber-300',
    icon: 'bg-amber-100 text-amber-600',
  },
  infra: {
    card: 'border-cyan-100 bg-cyan-50/50 hover:border-cyan-300',
    icon: 'bg-cyan-100 text-cyan-600',
  },
  comms: {
    card: 'border-emerald-100 bg-emerald-50/50 hover:border-emerald-300',
    icon: 'bg-emerald-100 text-emerald-600',
  },
}

const FEATURES: Array<{
  title: string
  text: string
  icon: LucideIcon
  tone: FeatureTone
  featured?: boolean
}> = [
  {
    title: 'Odontograma Digital',
    text: 'Odontograma interactivo para registrar el estado dental. Claro, rápido y sin papel.',
    icon: Smile,
    tone: 'clinical',
  },
  {
    title: 'IA que Escucha',
    text: 'Activa la escucha inteligente. La IA transcribe los hallazgos y diligencia por ti.',
    icon: Mic,
    tone: 'innovation',
    featured: true,
  },
  {
    title: 'Historia Clínica',
    text: 'Anamnesis, plan de tratamiento y evoluciones que cumplen estándares colombianos.',
    icon: Stethoscope,
    tone: 'clinical',
  },
  {
    title: 'RIPS Resolución 948',
    text: 'Genera archivos RIPS automáticamente. Sin reingreso de datos ni errores de códigos.',
    icon: FileJson,
    tone: 'admin',
  },
  {
    title: 'Facturación DIAN',
    text: 'Factura electrónica integrada. Genera la factura directamente desde la atención.',
    icon: Receipt,
    tone: 'admin',
  },
  {
    title: 'Agenda Inteligente',
    text: 'Programa citas, tratamientos y maneja la vista por profesional y por silla.',
    icon: CalendarDays,
    tone: 'ops',
  },
  {
    title: 'Historia Clínica en la Nube',
    text: 'Información encriptada. Cumple regulaciones de privacidad y Res. 948 actualizada.',
    icon: Lock,
    tone: 'infra',
  },
  {
    title: 'WhatsApp Integrado',
    text: 'Envía recordatorios automáticos al WhatsApp del paciente. Reduce el ausentismo.',
    icon: MessageCircle,
    tone: 'comms',
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

      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8 lg:py-10">
          <h1 className="sr-only">
            mihistoriadental: el software que soluciona tu gestión de historias sin afectar tu
            rentabilidad
          </h1>
          {/*
            El titular y la bajada ya van impresos en la fotografía.
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
          */}
          <img
            src="/hero-mihistoriadental.jpg"
            alt="mihistoriadental: el software que soluciona tu gestión de historias sin afectar tu rentabilidad"
            width={1024}
            height={572}
            fetchPriority="high"
            className="h-auto w-full rounded-2xl object-cover object-center"
          />

          <div className="mx-auto mt-10 max-w-4xl text-center">
            <p className="text-xl font-medium leading-snug tracking-tight text-slate-800 sm:text-2xl sm:leading-snug lg:text-3xl lg:leading-tight">
              ¿Cansado de pagar software costoso con funciones que nunca usas y de perder horas
              escribiendo historias clínicas? Imagínate dictar cada diagnóstico y evolución con tu
              propia voz mientras{' '}
              <span className="font-bold text-dental-700">{APP_SHORT_NAME}</span> hace el resto.
              Además, cumple 100% con la normatividad colombiana: facturación DIAN, RIPS, WhatsApp
              automatizado y firma digital en tablet. Una plataforma diseñada a la medida para{' '}
              <span className="font-bold text-dental-700">blindar tu rentabilidad</span>.
            </p>
          </div>

          <div className="mx-auto mt-8 flex max-w-xl flex-col gap-3">
            <Link
              to="/registro"
              className="btn-primary w-full px-6 py-4 text-center text-base font-semibold"
            >
              Inicia Prueba Gratuita
            </Link>
            <a href="#planes" className="btn-secondary w-fit px-6 py-3 text-center text-base">
              Ver Planes
            </a>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16">
        <div className="mb-12 text-center">
          <h2 className="mb-3 text-3xl font-bold text-slate-900">¿Qué incluye?</h2>
          <p className="mx-auto max-w-2xl text-slate-600">
            Todo lo que tu consulta necesita para atender, documentar y facturar en un solo flujo.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((feature) => {
            const Icon = feature.icon
            const tone = FEATURE_TONES[feature.tone]
            return (
              <article
                key={feature.title}
                className={`relative rounded-2xl border p-6 transition-all duration-300 hover:shadow-md ${tone.card}`}
              >
                {feature.featured ? (
                  <span className="absolute -top-3 right-4 rounded-full bg-emerald-600 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                    Destacado
                  </span>
                ) : null}
                <div
                  className={`mb-4 flex h-12 w-12 items-center justify-center rounded-xl ${tone.icon}`}
                >
                  <Icon className="h-6 w-6" aria-hidden />
                </div>
                <h3 className="mb-2 text-lg font-semibold text-slate-900">{feature.title}</h3>
                <p className="text-sm leading-relaxed text-slate-600">{feature.text}</p>
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

          <div className="mt-12 grid grid-cols-1 items-stretch gap-5 md:grid-cols-2 xl:grid-cols-4">
            {PAID_PLANS.map((plan) => (
              <article
                key={plan.id}
                className={`relative flex h-full flex-col justify-between rounded-2xl border p-6 shadow-sm transition-shadow duration-300 hover:shadow-md ${
                  plan.featured
                    ? 'border-dental-800 bg-dental-800 text-white shadow-dental-900/20'
                    : 'border-slate-200 bg-white text-slate-800'
                }`}
              >
                <header className="flex flex-col">
                  <div className="mb-4 flex min-h-7 items-start">
                    {plan.featured ? (
                      <p className="inline-flex rounded-full bg-amber-400 px-3 py-1 text-xs font-semibold text-dental-950">
                        ★ El más elegido
                      </p>
                    ) : (
                      <span
                        className="invisible inline-flex rounded-full px-3 py-1 text-xs font-semibold"
                        aria-hidden
                      >
                        ★ El más elegido
                      </span>
                    )}
                  </div>
                  <h3 className="min-h-7 text-xl font-bold leading-7">{plan.name}</h3>
                  <div className="mt-2 flex min-h-[20.5rem] flex-col justify-between gap-5">
                    <p
                      className={`text-sm leading-relaxed ${
                        plan.featured ? 'text-dental-100' : 'text-slate-600'
                      }`}
                    >
                      {plan.blurb}
                    </p>
                    <p className="flex min-h-10 items-end gap-1">
                      <span className="text-3xl font-bold tracking-tight">{plan.priceLabel}</span>
                      <span
                        className={`mb-1 text-sm font-medium ${
                          plan.period
                            ? plan.featured
                              ? 'text-dental-100'
                              : 'text-slate-500'
                            : 'invisible'
                        }`}
                      >
                        {plan.period || 'COP/mes'}
                      </span>
                    </p>
                  </div>
                </header>

                <ul className="mt-6 flex grow flex-col space-y-2.5 text-sm">
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

                <div className="mt-8">
                  <Link
                    to="/subscription-plans"
                    className={`inline-flex w-full items-center justify-center rounded-lg px-4 py-2.5 text-sm font-medium transition ${
                      plan.featured
                        ? 'bg-white text-dental-800 hover:bg-dental-50'
                        : 'bg-dental-600 text-white hover:bg-dental-700'
                    }`}
                  >
                    {plan.cta}
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}
