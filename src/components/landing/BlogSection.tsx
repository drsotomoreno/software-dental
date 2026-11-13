import { Link } from 'react-router-dom'

const GUIDES = [
  {
    id: 'rips-json-minsalud',
    title: 'Cómo generar RIPS odontológicos en formato JSON sin errores ante MinSalud',
    lead: 'Los RIPS odontológicos en JSON deben salir con la estructura que MinSalud valida en el MUV: procedimientos, diagnósticos CIE-10 e incapacidad coherentes, sin arreglos vacíos ni campos que el validador rechaza.',
    body: 'En la práctica clínica, el error más costoso es rearmar el archivo a mano después de cada consulta. Un software que arma el JSON desde la evolución firmada reduce rechazos CUV y deja el paquete listo para transmitir, incluso cuando la consulta se documentó sin internet.',
  },
  {
    id: 'dian-resolucion-2275-fev',
    title:
      'Facturación electrónica DIAN para odontólogos: Guía práctica de la Resolución 2275 y FEV',
    lead: 'La facturación electrónica DIAN para odontólogos exige emitir el documento electrónico (FEV) con los datos fiscales correctos y, cuando aplique, anular solo mediante nota crédito conforme a la Resolución 2275.',
    body: 'Para la clínica dental, eso significa integrar CUFE, numeración autorizada y el vínculo con la atención clínica sin duplicar digitación. El flujo correcto conecta el abono o el procedimiento facturado con el RIPS y con la DIAN en un solo cierre de consulta.',
  },
  {
    id: 'offline-first-colombia',
    title:
      'Por qué elegir un software odontológico offline-first en Bogotá, Medellín, Cali y toda Colombia',
    lead: 'Un software odontológico offline-first guarda la historia clínica en el equipo y sincroniza cuando hay red, para que la consulta no se detenga por fallas de fibra, Wi‑Fi inestable o sedes en zonas con cobertura intermitente.',
    body: 'En Bogotá, Medellín, Cali y el resto del país, las clínicas que atienden varios sillones necesitan continuidad operativa: odontograma, consentimientos y evoluciones deben quedar registrados al instante. La arquitectura offline-first de Mi Historia Dental prioriza ese trabajo local y luego replica a la nube sin perder autoría ni trazabilidad.',
  },
] as const

/**
 * Recursos técnicos SEO para tráfico orgánico nacional (RIPS, DIAN, offline-first).
 * Modular: integrar en LandingPage u otro layout de marketing.
 */
export function BlogSection() {
  return (
    <section
      id="guias-tecnicas"
      aria-labelledby="guias-tecnicas-heading"
      className="scroll-mt-8 border-t border-slate-200 bg-white/60"
    >
      <div className="mx-auto max-w-7xl px-6 py-20">
        <div className="max-w-3xl">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-cyan-700">
            Recursos para odontólogos en Colombia
          </p>
          <h2
            id="guias-tecnicas-heading"
            className="mb-6 text-3xl font-bold text-slate-900 sm:text-4xl"
          >
            Guías técnicas y normativas para clínicas dentales en Colombia
          </h2>
          <p className="mb-10 text-lg leading-relaxed text-slate-600">
            Si busca cómo cumplir RIPS MinSalud, facturar con la DIAN o trabajar sin depender del
            internet en su consultorio, estas guías resumen lo esencial para clínicas dentales en
            toda Colombia: qué exige la norma, qué debe salir bien a la primera y cómo un software
            offline-first acorta el camino hasta el registro de pioneros.
          </p>
        </div>

        <div className="max-w-3xl space-y-12">
          {GUIDES.map((guide) => (
            <article key={guide.id} className="border-t border-slate-200 pt-10 first:border-t-0 first:pt-0">
              <h3 className="mb-3 text-xl font-semibold text-slate-900 sm:text-2xl">
                {guide.title}
              </h3>
              <p className="mb-3 text-base font-medium leading-relaxed text-slate-700">{guide.lead}</p>
              <p className="mb-5 text-base leading-relaxed text-slate-600">{guide.body}</p>
              <Link
                to="/registro"
                className="inline-flex text-sm font-semibold text-cyan-700 underline-offset-4 transition hover:text-cyan-800 hover:underline"
              >
                Empieza como pionero por $50.000 COP/mes
              </Link>
            </article>
          ))}
        </div>

        <div className="mt-14 max-w-3xl rounded-xl border border-cyan-200 bg-cyan-50/80 px-6 py-8">
          <p className="text-base leading-relaxed text-slate-700">
            ¿Listo para aplicar RIPS, DIAN y historia clínica offline-first en su consulta? El plan
            pionero de Mi Historia Dental cuesta{' '}
            <strong className="font-semibold text-slate-900">$50.000 COP al mes</strong> e incluye
            el núcleo normativo para clínicas dentales en Colombia.
          </p>
          <Link
            to="/registro"
            className="mt-5 inline-flex rounded-xl bg-cyan-500 px-6 py-3 text-sm font-bold text-slate-950 shadow-sm transition hover:bg-cyan-400"
          >
            Registrarme como pionero
          </Link>
        </div>
      </div>
    </section>
  )
}
