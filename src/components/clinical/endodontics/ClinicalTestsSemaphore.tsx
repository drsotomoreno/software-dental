import type { ReactNode } from 'react'
import type { EndoClinicalTests } from '@/types/endoAnnex.types'
import { NECROSIS_CIE10_CODES } from '@/types/endoAnnex.types'

interface ClinicalTestsSemaphoreProps {
  value: EndoClinicalTests
  diagnosisCodes: string[]
  onChange: (value: EndoClinicalTests) => void
  disabled?: boolean
}

function chipClass(active: boolean, tone: 'green' | 'red' | 'amber', disabled?: boolean): string {
  if (disabled) return 'bg-slate-100 text-slate-400 cursor-not-allowed'
  if (!active) return 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
  if (tone === 'green') return 'border-green-300 bg-green-50 text-green-800'
  if (tone === 'red') return 'border-red-300 bg-red-50 text-red-800'
  return 'border-amber-300 bg-amber-50 text-amber-800'
}

function TestGroup({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-2.5">
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  )
}

export function ClinicalTestsSemaphore({
  value,
  diagnosisCodes,
  onChange,
  disabled = false,
}: ClinicalTestsSemaphoreProps) {
  const hideThermal = diagnosisCodes.some((code) => NECROSIS_CIE10_CODES.has(code))

  const setThermalCold = (next: 'positive' | 'negative' | '') => {
    onChange({
      ...value,
      thermalCold: value.thermalCold === next ? '' : next,
      thermalPersistentPain: next === 'positive' ? value.thermalPersistentPain : false,
    })
  }

  const setBinaryTest = (
    key: 'percussion' | 'palpation',
    next: 'positive' | 'negative',
  ) => {
    onChange({
      ...value,
      [key]: value[key] === next ? '' : next,
    })
  }

  return (
    <div className="space-y-2">
      <h6 className="text-xs font-semibold text-slate-700">Semáforo Clínico</h6>
      <div className="grid gap-2 sm:grid-cols-2">
        {!hideThermal && (
          <TestGroup label="Prueba Térmica (Frío)">
            <button
              type="button"
              disabled={disabled}
              onClick={() => setThermalCold('negative')}
              className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition ${chipClass(
                value.thermalCold === 'negative',
                'green',
                disabled,
              )}`}
            >
              −
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() => setThermalCold('positive')}
              className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition ${chipClass(
                value.thermalCold === 'positive',
                'red',
                disabled,
              )}`}
            >
              +
            </button>
            {value.thermalCold === 'positive' && (
              <button
                type="button"
                disabled={disabled}
                onClick={() =>
                  onChange({
                    ...value,
                    thermalPersistentPain: !value.thermalPersistentPain,
                  })
                }
                className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition ${chipClass(
                  value.thermalPersistentPain,
                  'amber',
                  disabled,
                )}`}
              >
                Dolor persistente
              </button>
            )}
          </TestGroup>
        )}

        <TestGroup label="Percusión">
          <button
            type="button"
            disabled={disabled}
            onClick={() => setBinaryTest('percussion', 'negative')}
            className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition ${chipClass(
              value.percussion === 'negative',
              'green',
              disabled,
            )}`}
          >
            Normal
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => setBinaryTest('percussion', 'positive')}
            className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition ${chipClass(
              value.percussion === 'positive',
              'red',
              disabled,
            )}`}
          >
            +
          </button>
        </TestGroup>

        <TestGroup label="Palpación">
          <button
            type="button"
            disabled={disabled}
            onClick={() => setBinaryTest('palpation', 'negative')}
            className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition ${chipClass(
              value.palpation === 'negative',
              'green',
              disabled,
            )}`}
          >
            Normal
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => setBinaryTest('palpation', 'positive')}
            className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition ${chipClass(
              value.palpation === 'positive',
              'red',
              disabled,
            )}`}
          >
            +
          </button>
        </TestGroup>
      </div>
      {hideThermal && (
        <p className="text-[11px] text-slate-500">
          Pruebas térmicas omitidas por diagnóstico de necrosis pulpar.
        </p>
      )}
    </div>
  )
}
