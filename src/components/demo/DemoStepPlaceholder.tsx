import type { DemoStep } from '@/constants/demoSteps'

interface DemoStepPlaceholderProps {
  step: DemoStep
}

/** Contenido provisional del paso; se reemplazará por el módulo interactivo real. */
export function DemoStepPlaceholder({ step }: DemoStepPlaceholderProps) {
  return (
    <div className="flex h-full min-h-[22rem] flex-col justify-center rounded-xl border border-dashed border-dental-200 bg-white px-6 py-10 text-center shadow-sm sm:px-10">
      <p className="text-xs font-semibold uppercase tracking-wider text-dental-600">
        Paso {step.id} de 10
      </p>
      <h2 className="mt-2 text-2xl font-semibold text-slate-800">{step.title}</h2>
      <p className="mx-auto mt-3 max-w-xl text-sm text-slate-500">{step.description}</p>
      <p className="mx-auto mt-8 max-w-md rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600">
        Aquí se renderizará el contenido interactivo de este paso. El cascarón ya está listo para
        conectar el módulo correspondiente.
      </p>
    </div>
  )
}
