import { Link } from 'react-router-dom'
import { BlogSection } from '@/components/landing/BlogSection'
import { APP_SHORT_NAME } from '@/constants/branding'
import { PAID_PLANS } from '../../shared/subscriptionPlans.js'

export function LandingPage() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <header className="border-b border-dental-100 bg-white/90">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <Link to="/" className="text-sm font-semibold tracking-wide text-dental-700">
            {APP_SHORT_NAME}
          </Link>
          <div className="flex items-center gap-3">
            <a
              href="#guias-tecnicas"
              className="hidden text-sm font-medium text-slate-600 transition hover:text-dental-700 sm:inline"
            >
              Guías técnicas
            </a>
            <Link to="/login" className="btn-secondary px-4 py-2 text-sm">
              Iniciar sesión
            </Link>
          </div>
        </div>
      </header>

      <main className="w-full">
        {/* 1. HERO SECTION (H1 Principal) */}
        <section className="relative mx-auto max-w-7xl px-6 py-20 text-center lg:py-32">
          <span className="mb-6 inline-block rounded-full border border-cyan-200 bg-cyan-50 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-cyan-700">
            Arquitectura Offline-First &bull; RIPS &bull; DIAN
          </span>

          {/* H1: Término de búsqueda #1 */}
          <h1 className="mb-6 text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl lg:text-6xl">
            Software para clínica dental{' '}
            <span className="text-cyan-600">sin límites de conexión</span>
          </h1>

          <p className="mx-auto mb-10 max-w-3xl text-lg text-slate-600 sm:text-xl">
            mihistoriadental el software que soluciona tu gestión de historias sin afectar tu
            rentabilidad. Dictado por voz, cumplimiento normativo y sincronización automática en la
            nube por solo $50,000 COP/mes.
          </p>

          <div className="flex flex-col justify-center gap-4 sm:flex-row">
            <Link
              to="/registro"
              className="rounded-xl bg-cyan-500 px-8 py-4 font-bold text-slate-950 shadow-lg transition-all hover:bg-cyan-400"
            >
              Empieza como Pionero
            </Link>
            <a
              href="#planes"
              className="rounded-xl border border-slate-300 bg-white px-8 py-4 font-semibold text-slate-800 transition-all hover:bg-slate-100"
            >
              Ver Demostración
            </a>
          </div>

          <img
            src="/hero-mihistoriadental.jpg"
            alt="Software para clínica dental sin límites de conexión — mihistoriadental"
            width={1024}
            height={572}
            fetchPriority="high"
            className="mx-auto mt-12 h-auto w-full max-w-5xl rounded-2xl object-cover object-center"
          />
        </section>

        {/* 2. NÚCLEO CLÍNICO (H2 - Término #2) */}
        <section className="mx-auto max-w-7xl border-t border-slate-200 px-6 py-20">
          <div className="max-w-3xl">
            <h2 className="mb-6 text-3xl font-bold text-slate-900 sm:text-4xl">
              Historia clínica digital odontológica con odontograma interactivo
            </h2>
            <p className="mb-10 text-lg leading-relaxed text-slate-600">
              Diseñado por odontólogos para especialistas. Gestiona diagnósticos, gráficos
              periodontales, planes de tratamiento y consentimientos informados con validez legal
              respaldada por sellos criptográficos SHA-256.
            </p>

            <div className="space-y-8">
              <article>
                <h3 className="mb-2 text-xl font-semibold text-slate-900">
                  Diagnósticos con clasificación CIE-10
                </h3>
                <p className="text-base leading-relaxed text-slate-600">
                  En el historial clínico selecciona con agilidad los códigos de la clasificación
                  oficial de patologías. El buscador de{' '}
                  <strong className="font-semibold text-slate-800">CIE-10</strong> acelera el
                  registro diagnóstico y deja cada hallazgo listo para RIPS sin reescribir datos.
                </p>
              </article>

              <article>
                <h3 className="mb-2 text-xl font-semibold text-slate-900">
                  Periodontograma y seguimiento visual
                </h3>
                <p className="text-base leading-relaxed text-slate-600">
                  Junto al odontograma interactivo, el{' '}
                  <strong className="font-semibold text-slate-800">Periodontograma</strong> registra
                  profundidad de bolsas, movilidad y sangrado, para un seguimiento visual claro de
                  la salud periodontal del paciente en cada control.
                </p>
              </article>
            </div>
          </div>
        </section>

        {/* 3. CUMPLIMIENTO NORMATIVO (H2 - Término #3) */}
        <section className="border-t border-slate-200 bg-white/60">
          <div className="mx-auto max-w-7xl px-6 py-20">
            <div className="max-w-3xl">
              <h2 className="mb-6 text-3xl font-bold text-slate-900 sm:text-4xl">
                Software dental con RIPS y facturación electrónica DIAN
              </h2>
              <p className="mb-6 text-lg leading-relaxed text-slate-600">
                Olvídate de las multas y los dolores de cabeza con el MinSalud. Genera paquetes RIPS
                JSON automáticos, obtén la validación CUV en tiempo real desde el endpoint oficial y
                emite tus facturas electrónicas sin fricciones.
              </p>
            </div>
          </div>
        </section>

        {/* 4. GESTIÓN Y OPERACIÓN (H2 - Término #4) */}
        <section className="mx-auto max-w-7xl border-t border-slate-200 px-6 py-20">
          <div className="max-w-3xl">
            <h2 className="mb-6 text-3xl font-bold text-slate-900 sm:text-4xl">
              Programa para consultorio odontológico y control de pacientes
            </h2>
            <p className="mb-10 text-lg leading-relaxed text-slate-600">
              Lleva el control absoluto de caja, ingresos y pagos, y automatiza los recordatorios
              por WhatsApp con selector internacional de prefijos para reducir el ausentismo.
            </p>

            <article>
              <h3 className="mb-2 text-xl font-semibold text-slate-900">
                Agenda multi-usuario para turnos y citas
              </h3>
              <p className="text-base leading-relaxed text-slate-600">
                La{' '}
                <strong className="font-semibold text-slate-800">Agenda multi-usuario</strong>{' '}
                organiza turnos y citas por profesional, optimiza el tiempo de la clínica, refuerza
                la prevención de ausentismo y mantiene el control operativo diario del consultorio.
              </p>
            </article>
          </div>
        </section>

        {/* 5. INNOVACIÓN TECNOLÓGICA (H2 - Término #5) */}
        <section className="border-t border-slate-200 bg-white/60">
          <div className="mx-auto max-w-7xl px-6 py-20">
            <div className="max-w-3xl">
              <h2 className="mb-6 text-3xl font-bold text-slate-900 sm:text-4xl">
                Software dental con inteligencia artificial y notas por voz
              </h2>
              <p className="mb-6 text-lg leading-relaxed text-slate-600">
                Ahorra horas de tipeo al finalizar tu jornada. Dicta las evoluciones clínicas y notas
                operatorias 100% manos libres gracias a nuestro motor de transcripción inteligente
                integrado en la experiencia offline-first.
              </p>
            </div>
          </div>
        </section>

        <BlogSection />
      </main>

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
