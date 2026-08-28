import {
  IMPLANT_BOP_OPTIONS,
  IMPLANT_GINGIVAL_BIOTYPE_OPTIONS,
  IMPLANT_GINGIVAL_INFLAMMATION_OPTIONS,
  IMPLANT_KERATINIZED_MUCOSA_OPTIONS,
  IMPLANT_MOBILITY_OPTIONS,
  IMPLANT_PERIODONTITIS_HISTORY_OPTIONS,
  type ImplantPeriodontalAssessment,
} from '@/types/implantPeriodontalAssessment'

interface ImplantPeriodontalAssessmentSectionProps {
  value: ImplantPeriodontalAssessment
  onChange: (value: ImplantPeriodontalAssessment) => void
  disabled?: boolean
}

export function ImplantPeriodontalAssessmentSection({
  value,
  onChange,
  disabled = false,
}: ImplantPeriodontalAssessmentSectionProps) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <header className="border-b border-slate-200 bg-slate-50 px-4 py-3">
        <h3 className="text-sm font-semibold text-slate-800">
          Evaluación Periodontal y Gingival Pre-Implante
        </h3>
        <p className="text-xs text-slate-500">
          Registre el estado periodontal y gingival del sitio receptor antes de planificar implantes.
        </p>
      </header>

      <div className="space-y-5 p-4">
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Antecedentes y actividad de periodontitis
          </h4>
          <div className="mt-2 space-y-2">
            {IMPLANT_PERIODONTITIS_HISTORY_OPTIONS.map((option) => {
              const active = value.periodontitisHistory === option.id
              return (
                <label
                  key={option.id}
                  className={`flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-xs transition ${
                    active
                      ? option.id === 'active'
                        ? 'border-amber-400 bg-amber-50 text-amber-900'
                        : 'border-dental-500 bg-dental-50 text-dental-800'
                      : 'border-slate-200 bg-slate-50/60 text-slate-700 hover:border-slate-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="implant-periodontitis-history"
                    checked={active}
                    disabled={disabled}
                    onChange={() =>
                      onChange({ ...value, periodontitisHistory: option.id })
                    }
                    className="mt-0.5 h-3.5 w-3.5 border-slate-300 text-dental-600 focus:ring-dental-500"
                  />
                  <span>{option.label}</span>
                </label>
              )
            })}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Biotipo gingival
            </h4>
            <div className="mt-2 flex flex-wrap gap-2">
              {IMPLANT_GINGIVAL_BIOTYPE_OPTIONS.map((option) => {
                const active = value.gingivalBiotype === option.id
                return (
                  <button
                    key={option.id}
                    type="button"
                    disabled={disabled}
                    onClick={() => onChange({ ...value, gingivalBiotype: option.id })}
                    className={`rounded-md border px-3 py-1.5 text-xs font-semibold ${
                      active
                        ? 'border-dental-500 bg-dental-50 text-dental-800'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    {option.label}
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Ancho de mucosa queratinizada
            </h4>
            <div className="mt-2 space-y-2">
              {IMPLANT_KERATINIZED_MUCOSA_OPTIONS.map((option) => {
                const active = value.keratinizedMucosaWidth === option.id
                return (
                  <label
                    key={option.id}
                    className={`flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-xs ${
                      active
                        ? option.id === 'insufficient'
                          ? 'border-amber-400 bg-amber-50 text-amber-900'
                          : 'border-dental-500 bg-dental-50 text-dental-800'
                        : 'border-slate-200 bg-white text-slate-700'
                    }`}
                  >
                    <input
                      type="radio"
                      name="implant-keratinized-mucosa"
                      checked={active}
                      disabled={disabled}
                      onChange={() =>
                        onChange({ ...value, keratinizedMucosaWidth: option.id })
                      }
                      className="mt-0.5 h-3.5 w-3.5 border-slate-300 text-dental-600 focus:ring-dental-500"
                    />
                    <span>{option.label}</span>
                  </label>
                )
              })}
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Defectos mucogingivales y retracciones
          </h4>
          <ul className="mt-2 space-y-2">
            <li>
              <label className="flex cursor-pointer items-start gap-2 text-xs text-slate-700">
                <input
                  type="checkbox"
                  checked={value.mucogingivalDefects.gingivalRecessions}
                  disabled={disabled}
                  onChange={(event) =>
                    onChange({
                      ...value,
                      mucogingivalDefects: {
                        ...value.mucogingivalDefects,
                        gingivalRecessions: event.target.checked,
                      },
                    })
                  }
                  className="mt-0.5 h-3.5 w-3.5 rounded border-slate-300 text-dental-600 focus:ring-dental-500"
                />
                Presencia de recesiones gingivales en el sitio o adyacentes
              </label>
            </li>
            <li>
              <label className="flex cursor-pointer items-start gap-2 text-xs text-slate-700">
                <input
                  type="checkbox"
                  checked={value.mucogingivalDefects.papillaLossAlveolarDefects}
                  disabled={disabled}
                  onChange={(event) =>
                    onChange({
                      ...value,
                      mucogingivalDefects: {
                        ...value.mucogingivalDefects,
                        papillaLossAlveolarDefects: event.target.checked,
                      },
                    })
                  }
                  className="mt-0.5 h-3.5 w-3.5 rounded border-slate-300 text-dental-600 focus:ring-dental-500"
                />
                Pérdida de papilas interdentales / defectos del reborde alveolar
              </label>
            </li>
          </ul>
          <label className="mt-2 block text-[11px] text-slate-500">
            Observaciones
            <input
              type="text"
              value={value.mucogingivalDefects.notes}
              disabled={disabled}
              onChange={(event) =>
                onChange({
                  ...value,
                  mucogingivalDefects: {
                    ...value.mucogingivalDefects,
                    notes: event.target.value,
                  },
                })
              }
              placeholder="Localización y extensión de defectos..."
              className="mt-1 block w-full rounded-lg border border-slate-300 px-2 py-1 text-xs"
            />
          </label>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Salud periodontal de dientes adyacentes
          </h4>
          <ul className="mt-2 space-y-2">
            <li>
              <label className="flex cursor-pointer items-start gap-2 text-xs text-slate-700">
                <input
                  type="checkbox"
                  checked={value.adjacentTeethHealth.deepPockets}
                  disabled={disabled}
                  onChange={(event) =>
                    onChange({
                      ...value,
                      adjacentTeethHealth: {
                        ...value.adjacentTeethHealth,
                        deepPockets: event.target.checked,
                      },
                    })
                  }
                  className="mt-0.5 h-3.5 w-3.5 rounded border-slate-300 text-dental-600 focus:ring-dental-500"
                />
                Bolsas periodontales profundas (sondaje &gt; 4 mm)
              </label>
            </li>
          </ul>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-[11px] text-slate-500">
              Sangrado al sondaje (BOP)
              <select
                value={value.adjacentTeethHealth.bleedingOnProbing}
                disabled={disabled}
                onChange={(event) =>
                  onChange({
                    ...value,
                    adjacentTeethHealth: {
                      ...value.adjacentTeethHealth,
                      bleedingOnProbing: event.target.value as ImplantPeriodontalAssessment['adjacentTeethHealth']['bleedingOnProbing'],
                    },
                  })
                }
                className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs"
              >
                <option value="">Sin registrar</option>
                {IMPLANT_BOP_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-[11px] text-slate-500">
              Movilidad dentaria adyacente
              <select
                value={value.adjacentTeethHealth.mobilityGrade}
                disabled={disabled}
                onChange={(event) =>
                  onChange({
                    ...value,
                    adjacentTeethHealth: {
                      ...value.adjacentTeethHealth,
                      mobilityGrade: event.target.value as ImplantPeriodontalAssessment['adjacentTeethHealth']['mobilityGrade'],
                    },
                  })
                }
                className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs"
              >
                <option value="">Sin registrar</option>
                {IMPLANT_MOBILITY_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Inflamación gingival crónica o hiperplasias
          </h4>
          <div className="mt-2 space-y-2">
            {IMPLANT_GINGIVAL_INFLAMMATION_OPTIONS.map((option) => {
              const active = value.gingivalInflammation === option.id
              return (
                <label
                  key={option.id}
                  className={`flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-xs ${
                    active
                      ? 'border-dental-500 bg-dental-50 text-dental-800'
                      : 'border-slate-200 bg-slate-50/60 text-slate-700'
                  }`}
                >
                  <input
                    type="radio"
                    name="implant-gingival-inflammation"
                    checked={active}
                    disabled={disabled}
                    onChange={() => onChange({ ...value, gingivalInflammation: option.id })}
                    className="mt-0.5 h-3.5 w-3.5 border-slate-300 text-dental-600 focus:ring-dental-500"
                  />
                  <span>{option.label}</span>
                </label>
              )
            })}
          </div>
        </div>
      </div>
    </section>
  )
}
