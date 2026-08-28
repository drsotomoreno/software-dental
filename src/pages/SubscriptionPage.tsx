const PLANS = [
  {
    id: 'basico',
    name: 'Básico',
    price: 89000,
    features: ['Hasta 100 pacientes', 'Odontograma', 'Agenda básica'],
  },
  {
    id: 'profesional',
    name: 'Profesional',
    price: 149000,
    features: ['Pacientes ilimitados', 'Firma Ley 527', 'Exportación RIPS', 'Soporte prioritario'],
    highlighted: true,
  },
  {
    id: 'clinica',
    name: 'Clínica',
    price: 299000,
    features: ['Multi-profesional', 'FHIR API', 'Facturación electrónica', 'Administración central'],
  },
] as const

export function SubscriptionPage() {
  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold">Mi Suscripción</h1>
      <p className="mb-6 text-slate-600">
        Plan actual: <span className="font-semibold text-dental-700">Profesional</span> — Prueba
        gratuita hasta el 10 Sep 2026
      </p>

      <div className="grid gap-4 md:grid-cols-3">
        {PLANS.map((plan) => (
          <div
            key={plan.id}
            className={`card ${
              'highlighted' in plan && plan.highlighted
                ? 'ring-2 ring-dental-500'
                : ''
            }`}
          >
            <h2 className="text-lg font-semibold">{plan.name}</h2>
            <p className="mt-2 text-2xl font-bold text-dental-700">
              ${plan.price.toLocaleString('es-CO')}
              <span className="text-sm font-normal text-slate-500">/mes</span>
            </p>
            <ul className="mt-4 space-y-2 text-sm text-slate-600">
              {plan.features.map((f) => (
                <li key={f} className="flex items-center gap-2">
                  <span className="text-green-500">✓</span> {f}
                </li>
              ))}
            </ul>
            <button
              type="button"
              className={`mt-6 w-full ${
                'highlighted' in plan && plan.highlighted ? 'btn-primary' : 'btn-secondary'
              }`}
            >
              {'highlighted' in plan && plan.highlighted ? 'Plan actual' : 'Cambiar plan'}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
