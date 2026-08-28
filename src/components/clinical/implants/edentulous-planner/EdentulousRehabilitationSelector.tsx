import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import {
  BRIDGE_IMPLANT_COUNT_OPTIONS,
  BRIDGE_MATERIAL_OPTIONS,
  EDENTULOUS_ARCH_LABELS,
  EXTREME_ATROPHY_OPTIONS,
  HYBRID_MATERIAL_OPTIONS,
  HYBRID_VARIANT_OPTIONS,
  LOADING_PROTOCOL_OPTIONS,
  OVERDENTURE_ATTACHMENT_OPTIONS,
  OVERDENTURE_SUBTYPE_OPTIONS,
  REHABILITATION_CATEGORY_OPTIONS,
  type ArchRehabilitationSelection,
  type EdentulousArchKey,
  type EdentulousRehabilitationCategory,
  type EdentulousRehabilitationPlan,
  normalizeEdentulousRehabilitationPlan,
} from '@/types/implantRehabilitationModality'

interface EdentulousRehabilitationSelectorProps {
  value: EdentulousRehabilitationPlan
  onChange: (value: EdentulousRehabilitationPlan) => void
  disabled?: boolean
}

const ARCH_TABS: EdentulousArchKey[] = ['maxilla', 'mandible']

function ChoiceButton({
  active,
  disabled,
  onClick,
  children,
  className = '',
}: {
  active: boolean
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg border px-2.5 py-1.5 text-left text-xs transition-colors ${
        active
          ? 'border-sky-300 bg-sky-50 font-medium text-sky-800'
          : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
      } disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
    >
      {children}
    </button>
  )
}

function AccordionCard({
  title,
  description,
  expanded,
  selected,
  disabled,
  onToggle,
  children,
}: {
  title: string
  description: string
  expanded: boolean
  selected: boolean
  disabled?: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <div
      className={`overflow-hidden rounded-xl border transition-colors ${
        selected ? 'border-sky-200 bg-sky-50/40' : 'border-slate-200 bg-white'
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        disabled={disabled}
        className="flex w-full items-start justify-between gap-3 px-3 py-2.5 text-left disabled:cursor-not-allowed disabled:opacity-60"
      >
        <div className="min-w-0">
          <p className={`text-xs font-semibold ${selected ? 'text-sky-800' : 'text-slate-800'}`}>
            {title}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-500">{description}</p>
        </div>
        <ChevronDown
          className={`mt-0.5 h-4 w-4 shrink-0 text-slate-400 transition-transform ${
            expanded ? 'rotate-180' : ''
          }`}
          aria-hidden
        />
      </button>
      {expanded && <div className="border-t border-slate-200/80 px-3 py-3">{children}</div>}
    </div>
  )
}

function OverdentureOptions({
  arch,
  selection,
  disabled,
  onChange,
}: {
  arch: EdentulousArchKey
  selection: ArchRehabilitationSelection
  disabled?: boolean
  onChange: (patch: Partial<ArchRehabilitationSelection>) => void
}) {
  const subtypeOptions = OVERDENTURE_SUBTYPE_OPTIONS.filter((item) => item.arch === arch)
  const subtype = selection.overdenture.subtype

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-1">
        {subtypeOptions.map((option) => (
          <ChoiceButton
            key={option.id}
            active={subtype === option.id}
            disabled={disabled}
            onClick={() =>
              onChange({
                category: 'overdenture',
                overdenture: {
                  ...selection.overdenture,
                  subtype: option.id,
                  attachment: selection.overdenture.attachment || '',
                  maxillaryBarPalateRelief:
                    option.id === 'maxillary_4_implants'
                      ? selection.overdenture.maxillaryBarPalateRelief
                      : false,
                },
              })
            }
            className="w-full"
          >
            <span className="block font-medium">{option.label}</span>
            <span className="mt-0.5 block text-[10px] text-slate-500">{option.description}</span>
          </ChoiceButton>
        ))}
      </div>

      {subtype && (
        <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-2.5">
          <p className="text-[11px] font-medium text-slate-600">Tipo de atache / retención</p>
          <div className="flex flex-wrap gap-2">
            {OVERDENTURE_ATTACHMENT_OPTIONS.map((option) => (
              <ChoiceButton
                key={option.id}
                active={selection.overdenture.attachment === option.id}
                disabled={disabled}
                onClick={() =>
                  onChange({
                    overdenture: { ...selection.overdenture, attachment: option.id },
                  })
                }
              >
                {option.label}
              </ChoiceButton>
            ))}
          </div>

          {subtype === 'maxillary_4_implants' && (
            <label className="mt-2 flex items-start gap-2 text-[11px] text-slate-600">
              <input
                type="checkbox"
                checked={selection.overdenture.maxillaryBarPalateRelief}
                disabled={disabled}
                onChange={(event) =>
                  onChange({
                    overdenture: {
                      ...selection.overdenture,
                      maxillaryBarPalateRelief: event.target.checked,
                    },
                  })
                }
                className="mt-0.5 rounded border-slate-300"
              />
              <span>Barra de unión con liberación de paladar</span>
            </label>
          )}
        </div>
      )}
    </div>
  )
}

function FixedProsthesisOptions({
  selection,
  disabled,
  onChange,
}: {
  selection: ArchRehabilitationSelection
  disabled?: boolean
  onChange: (patch: Partial<ArchRehabilitationSelection>) => void
}) {
  const fixed = selection.fixedProsthesis

  return (
    <div className="space-y-3">
      <div className="grid gap-2">
        <ChoiceButton
          active={fixed.subtype === 'hybrid_all_on'}
          disabled={disabled}
          onClick={() =>
            onChange({
              category: 'fixed_prosthesis',
              fixedProsthesis: { ...fixed, subtype: 'hybrid_all_on' },
            })
          }
          className="w-full"
        >
          <span className="block font-medium">Prótesis híbridas (All-on-4 / All-on-6 / Pro-Arch)</span>
          <span className="mt-0.5 block text-[10px] text-slate-500">
            Soportadas sobre 4 a 6 implantes con opción de implantes posteriores angulados.
          </span>
        </ChoiceButton>

        <ChoiceButton
          active={fixed.subtype === 'circumferential_bridge'}
          disabled={disabled}
          onClick={() =>
            onChange({
              category: 'fixed_prosthesis',
              fixedProsthesis: { ...fixed, subtype: 'circumferential_bridge' },
            })
          }
          className="w-full"
        >
          <span className="block font-medium">Puentes fijos circunferenciales (6 u 8 implantes axiales)</span>
          <span className="mt-0.5 block text-[10px] text-slate-500">
            Distribución uniforme con coronas cerámicas o puentes segmentados de zirconia.
          </span>
        </ChoiceButton>
      </div>

      {fixed.subtype === 'hybrid_all_on' && (
        <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-2.5">
          <p className="text-[11px] font-medium text-slate-600">Variante</p>
          <div className="flex flex-wrap gap-2">
            {HYBRID_VARIANT_OPTIONS.map((option) => (
              <ChoiceButton
                key={option.id}
                active={fixed.hybridVariant === option.id}
                disabled={disabled}
                onClick={() =>
                  onChange({
                    fixedProsthesis: { ...fixed, hybridVariant: option.id },
                  })
                }
              >
                {option.label}
              </ChoiceButton>
            ))}
          </div>

          <p className="pt-1 text-[11px] font-medium text-slate-600">Material de la estructura</p>
          <div className="flex flex-wrap gap-2">
            {HYBRID_MATERIAL_OPTIONS.map((option) => (
              <ChoiceButton
                key={option.id}
                active={fixed.hybridMaterial === option.id}
                disabled={disabled}
                onClick={() =>
                  onChange({
                    fixedProsthesis: { ...fixed, hybridMaterial: option.id },
                  })
                }
              >
                {option.label}
              </ChoiceButton>
            ))}
          </div>

          <label className="flex items-start gap-2 text-[11px] text-slate-600">
            <input
              type="checkbox"
              checked={fixed.angledPosteriorImplants}
              disabled={disabled}
              onChange={(event) =>
                onChange({
                  fixedProsthesis: { ...fixed, angledPosteriorImplants: event.target.checked },
                })
              }
              className="mt-0.5 rounded border-slate-300"
            />
            <span>Implantes posteriores angulados</span>
          </label>
        </div>
      )}

      {fixed.subtype === 'circumferential_bridge' && (
        <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-2.5">
          <p className="text-[11px] font-medium text-slate-600">Distribución de implantes</p>
          <div className="flex flex-wrap gap-2">
            {BRIDGE_IMPLANT_COUNT_OPTIONS.map((option) => (
              <ChoiceButton
                key={option.id}
                active={fixed.bridgeImplantCount === option.id}
                disabled={disabled}
                onClick={() =>
                  onChange({
                    fixedProsthesis: { ...fixed, bridgeImplantCount: option.id },
                  })
                }
              >
                {option.label}
              </ChoiceButton>
            ))}
          </div>

          <p className="pt-1 text-[11px] font-medium text-slate-600">Material de restauración</p>
          <div className="flex flex-wrap gap-2">
            {BRIDGE_MATERIAL_OPTIONS.map((option) => (
              <ChoiceButton
                key={option.id}
                active={fixed.bridgeMaterial === option.id}
                disabled={disabled}
                onClick={() =>
                  onChange({
                    fixedProsthesis: { ...fixed, bridgeMaterial: option.id },
                  })
                }
              >
                {option.label}
              </ChoiceButton>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function ExtremeAtrophyOptions({
  selection,
  disabled,
  onChange,
}: {
  selection: ArchRehabilitationSelection
  disabled?: boolean
  onChange: (patch: Partial<ArchRehabilitationSelection>) => void
}) {
  return (
    <div className="grid gap-2">
      {EXTREME_ATROPHY_OPTIONS.map((option) => (
        <ChoiceButton
          key={option.id}
          active={selection.extremeAtrophy.subtype === option.id}
          disabled={disabled}
          onClick={() =>
            onChange({
              category: 'extreme_atrophy',
              extremeAtrophy: { subtype: option.id },
            })
          }
          className="w-full"
        >
          <span className="block font-medium">{option.label}</span>
          <span className="mt-0.5 block text-[10px] text-slate-500">{option.description}</span>
        </ChoiceButton>
      ))}
    </div>
  )
}

function LoadingProtocolOptions({
  selection,
  disabled,
  onChange,
}: {
  selection: ArchRehabilitationSelection
  disabled?: boolean
  onChange: (patch: Partial<ArchRehabilitationSelection>) => void
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {LOADING_PROTOCOL_OPTIONS.map((option) => (
        <ChoiceButton
          key={option.id}
          active={selection.loadingProtocol === option.id}
          disabled={disabled}
          onClick={() => onChange({ loadingProtocol: option.id })}
          className="w-full"
        >
          <span className="block font-medium">{option.label}</span>
          <span className="mt-0.5 block text-[10px] text-slate-500">{option.description}</span>
        </ChoiceButton>
      ))}
    </div>
  )
}

function ArchRehabilitationPanel({
  arch,
  selection,
  disabled,
  onChange,
}: {
  arch: EdentulousArchKey
  selection: ArchRehabilitationSelection
  disabled?: boolean
  onChange: (selection: ArchRehabilitationSelection) => void
}) {
  const [expandedCategory, setExpandedCategory] = useState<EdentulousRehabilitationCategory | 'loading'>(
    selection.category || 'overdenture',
  )

  const updateSelection = (patch: Partial<ArchRehabilitationSelection>) => {
    onChange({ ...selection, ...patch })
  }

  const toggleCategory = (category: EdentulousRehabilitationCategory) => {
    setExpandedCategory(category)
    if (selection.category !== category) {
      updateSelection({ category })
    }
  }

  return (
    <div className="space-y-3">
      {REHABILITATION_CATEGORY_OPTIONS.map((category) => (
        <AccordionCard
          key={category.id}
          title={category.label}
          description={category.description}
          expanded={expandedCategory === category.id}
          selected={selection.category === category.id}
          disabled={disabled}
          onToggle={() => toggleCategory(category.id)}
        >
          {category.id === 'overdenture' && (
            <OverdentureOptions
              arch={arch}
              selection={selection}
              disabled={disabled}
              onChange={updateSelection}
            />
          )}
          {category.id === 'fixed_prosthesis' && (
            <FixedProsthesisOptions
              selection={selection}
              disabled={disabled}
              onChange={updateSelection}
            />
          )}
          {category.id === 'extreme_atrophy' && (
            <ExtremeAtrophyOptions
              selection={selection}
              disabled={disabled}
              onChange={updateSelection}
            />
          )}
        </AccordionCard>
      ))}

      <AccordionCard
        title="Protocolos de Carga Asociados"
        description="Defina el protocolo de carga protésica para este arco."
        expanded={expandedCategory === 'loading'}
        selected={Boolean(selection.loadingProtocol)}
        disabled={disabled}
        onToggle={() => setExpandedCategory('loading')}
      >
        <LoadingProtocolOptions
          selection={selection}
          disabled={disabled}
          onChange={updateSelection}
        />
      </AccordionCard>

      <label className="block text-[11px] text-slate-500">
        Notas de rehabilitación
        <textarea
          value={selection.notes}
          disabled={disabled}
          onChange={(event) => updateSelection({ notes: event.target.value })}
          rows={2}
          placeholder="Observaciones clínicas o especificaciones adicionales..."
          className="mt-1 block w-full rounded-lg border border-slate-300 px-2.5 py-2 text-xs text-slate-700"
        />
      </label>
    </div>
  )
}

export function EdentulousRehabilitationSelector({
  value,
  onChange,
  disabled = false,
}: EdentulousRehabilitationSelectorProps) {
  const plan = normalizeEdentulousRehabilitationPlan(value)
  const [activeArch, setActiveArch] = useState<EdentulousArchKey>('maxilla')

  const updateArch = (arch: EdentulousArchKey, selection: ArchRehabilitationSelection) => {
    onChange({ ...plan, [arch]: selection })
  }

  return (
    <div className="border-t border-slate-200 bg-slate-50/40 px-4 py-4">
      <div className="mb-3">
        <h4 className="text-xs font-semibold text-slate-800">
          Modalidad de Rehabilitación Protésica
        </h4>
        <p className="mt-0.5 text-[11px] text-slate-500">
          Seleccione la opción de tratamiento y protocolo de carga de forma independiente para cada
          arco edéntulo.
        </p>
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        {ARCH_TABS.map((arch) => (
          <button
            key={arch}
            type="button"
            disabled={disabled}
            onClick={() => setActiveArch(arch)}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
              activeArch === arch
                ? 'border-sky-300 bg-sky-100 text-sky-800'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            } disabled:cursor-not-allowed disabled:opacity-60`}
          >
            {EDENTULOUS_ARCH_LABELS[arch]}
          </button>
        ))}
      </div>

      <ArchRehabilitationPanel
        key={activeArch}
        arch={activeArch}
        selection={plan[activeArch]}
        disabled={disabled}
        onChange={(selection) => updateArch(activeArch, selection)}
      />
    </div>
  )
}
