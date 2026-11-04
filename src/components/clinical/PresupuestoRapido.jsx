import { useEffect, useRef, useState } from 'react'
import {
  AlignVerticalJustifyCenter,
  ListPlus,
  MessageCircle,
  Plus,
  Printer,
  Smile,
  Trash2,
} from 'lucide-react'
import { UPPER_LEFT, UPPER_RIGHT, LOWER_LEFT, LOWER_RIGHT } from '@/constants/dental'
import { useAuth } from '@/contexts/AuthContext'
import {
  openQuickBudgetWhatsApp,
  printQuickBudget,
  resolveAccountHolderTitle,
} from '@/utils/quickBudgetPrint'

const FDI_UPPER = [...UPPER_RIGHT, ...UPPER_LEFT]
const FDI_LOWER = [...LOWER_RIGHT, ...LOWER_LEFT]

/** Icono de implante dental (tornillo + corona) — Lucide no trae uno específico. */
function DentalImplantIcon({ className = 'h-5 w-5' }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {/* Corona */}
      <path d="M8.5 3.5c0-1 1.2-1.8 3.5-1.8s3.5.8 3.5 1.8v1.7H8.5V3.5Z" />
      <path d="M7.5 5.2h9v1.6c0 .7-.6 1.2-1.2 1.2H8.7c-.6 0-1.2-.5-1.2-1.2V5.2Z" />
      {/* Pilar */}
      <path d="M10.2 8h3.6v2.2h-3.6V8Z" />
      {/* Cuerpo del implante con rosca */}
      <path d="M9.4 10.2h5.2l-.7 9.2c0 .9-1.2 1.6-1.9 1.6s-1.9-.7-1.9-1.6l-.7-9.2Z" />
      <path d="M9.6 12.2h4.8" />
      <path d="M9.7 14.2h4.6" />
      <path d="M9.9 16.2h4.2" />
      <path d="M10.1 18.2h3.8" />
    </svg>
  )
}

const QUICK_CATEGORIES = [
  {
    id: 'ortodoncia',
    label: 'Ortodoncia',
    concepto: 'Ortodoncia',
    icon: AlignVerticalJustifyCenter,
    accent: 'border-sky-300 bg-sky-50 text-sky-900 hover:bg-sky-100 focus-visible:ring-sky-400',
  },
  {
    id: 'implantes',
    label: 'Implantes',
    concepto: 'Implantes',
    icon: DentalImplantIcon,
    accent:
      'border-emerald-300 bg-emerald-50 text-emerald-900 hover:bg-emerald-100 focus-visible:ring-emerald-400',
  },
  {
    id: 'estetica',
    label: 'Restauración / Estética',
    concepto: 'Restauración / Estética',
    icon: Smile,
    accent:
      'border-violet-300 bg-violet-50 text-violet-900 hover:bg-violet-100 focus-visible:ring-violet-400',
  },
  {
    id: 'otro',
    label: 'Agregar otro Procedimiento',
    concepto: 'Otro procedimiento',
    icon: ListPlus,
    accent:
      'border-amber-300 bg-amber-50 text-amber-950 hover:bg-amber-100 focus-visible:ring-amber-400',
  },
]

const OTHER_PROCEDURES = [
  { id: 'profilaxis_dental', label: 'Profilaxis Dental' },
  { id: 'detartraje_profundo', label: 'Detartraje Profundo' },
  { id: 'fluorizacion', label: 'Fluorización' },
  { id: 'resina_fotocurado', label: 'Resina de Fotocurado' },
  { id: 'ionomero_vidrio', label: 'Ionomero de Vidrio' },
  { id: 'endodoncia', label: 'Endodoncia' },
  { id: 'exodoncia_simple', label: 'Exodoncia Simple' },
  { id: 'exodoncia_quirurgica', label: 'Exodoncia Quirúrgica' },
  { id: 'exodoncia_supernumerario', label: 'Exodoncia Supernumerario' },
  { id: 'cirugia_gingival', label: 'Cirugía Gingival' },
  { id: 'aclaramiento_dental', label: 'Aclaramiento Dental' },
  { id: 'manual', label: 'Crear procedimiento manual…' },
]

const ANATOMICAL_SCOPE_OPTIONS = [
  { id: 'teeth', label: 'Diente(s)' },
  { id: 'maxilar_superior', label: 'Maxilar superior' },
  { id: 'maxilar_inferior', label: 'Maxilar inferior' },
  { id: 'denticion', label: 'Toda la dentición' },
]

const ORTHO_MODALITIES = [
  { id: 'brackets_metalicos', label: 'Ortodoncia con Brackets Metálicos' },
  { id: 'brackets_esteticos', label: 'Ortodoncia con Brackets Estéticos' },
  { id: 'alineadores', label: 'Ortodoncia con Alineadores' },
  { id: 'ortopedia_maxilar', label: 'Ortopedia Maxilar' },
]

const ORTHO_COST_ROWS = [
  { key: 'cuota_inicial', label: 'Cuota inicial' },
  { key: 'controles', label: 'Controles' },
  { key: 'retenedores', label: 'Retenedores' },
]

const IMPLANT_OPTIONS = [
  { id: 'implante', label: 'Implante', needsTeeth: true },
  { id: 'corona_sobre_implante', label: 'Corona sobre implante', needsTeeth: true },
  { id: 'pontico_sobre_implantes', label: 'Póntico sobre implantes', needsTeeth: true },
  {
    id: 'protesis_total_superior_fija',
    label: 'Prótesis total superior fija sobre implantes',
    needsTeeth: false,
  },
  {
    id: 'protesis_total_inferior_fija',
    label: 'Prótesis total inferior fija sobre implantes',
    needsTeeth: false,
  },
  {
    id: 'protesis_superior_removible',
    label: 'Prótesis superior removible sobre implantes',
    needsTeeth: false,
  },
  {
    id: 'protesis_inferior_removible',
    label: 'Prótesis inferior removible sobre implantes',
    needsTeeth: false,
  },
]

const AESTHETIC_PROCEDURES = [
  { id: 'carilla', label: 'Carilla', needsTeeth: true },
  { id: 'corona', label: 'Corona', needsTeeth: true },
  { id: 'pontico_ppf', label: 'Póntico de PPF', needsTeeth: true },
  { id: 'pilar_ppf', label: 'Pilar de PPF', needsTeeth: true },
  { id: 'incrustacion', label: 'Incrustación', needsTeeth: true },
  { id: 'protesis_total_superior', label: 'Prótesis total superior', needsTeeth: false },
  { id: 'protesis_total_inferior', label: 'Prótesis total inferior', needsTeeth: false },
  { id: 'protesis_parcial_superior', label: 'Prótesis parcial superior', needsTeeth: true },
  { id: 'protesis_parcial_inferior', label: 'Prótesis parcial inferior', needsTeeth: true },
]

const AESTHETIC_MATERIALS = [
  { id: 'resina', label: 'Resina' },
  { id: 'resina_3d', label: 'Resina 3D' },
  { id: 'disilicato_litio', label: 'Disilicato de Litio' },
  { id: 'zirconia', label: 'Zirconia' },
  { id: 'metal_ceramica', label: 'Metal+Cerámica' },
  { id: 'acrilico_rigido', label: 'Acrílico Rígido' },
  { id: 'acrilico_flexible', label: 'Acrílico Flexible' },
  { id: 'metal_acrilico', label: 'Metal+Acrílico' },
  { id: 'otro', label: 'Otro' },
]

function emptyOrthoCosts() {
  return {
    cuota_inicial: { quantity: 1, unitPrice: '' },
    controles: { quantity: 1, unitPrice: '' },
    retenedores: { quantity: 1, unitPrice: '' },
  }
}

function emptyImplantDrafts() {
  return Object.fromEntries(
    IMPLANT_OPTIONS.map((option) => [
      option.id,
      { enabled: false, teeth: [], unitPrice: '' },
    ]),
  )
}

function emptyAestheticDrafts() {
  return Object.fromEntries(
    AESTHETIC_PROCEDURES.map((option) => [
      option.id,
      { enabled: false, teeth: [], material: '', materialOther: '', unitPrice: '' },
    ]),
  )
}

function emptyOtherDraft() {
  return {
    procedureId: '',
    customName: '',
    scope: 'teeth',
    teeth: [],
    unitPrice: '',
  }
}

function resolveOtherProcedureLabel(draft) {
  if (!draft?.procedureId) return ''
  if (draft.procedureId === 'manual') {
    return String(draft.customName || '').trim()
  }
  return OTHER_PROCEDURES.find((item) => item.id === draft.procedureId)?.label ?? ''
}

function resolveScopeLabel(draft) {
  if (!draft) return ''
  if (draft.scope === 'teeth') {
    if (!draft.teeth?.length) return ''
    return draft.teeth.length === 1
      ? `diente ${draft.teeth[0]}`
      : `dientes ${sortTeeth(draft.teeth).join(', ')}`
  }
  return ANATOMICAL_SCOPE_OPTIONS.find((item) => item.id === draft.scope)?.label ?? draft.scope
}

function otherDraftTotal(draft) {
  const unitPrice = parseMoney(draft?.unitPrice)
  if (!Number.isFinite(unitPrice) || unitPrice <= 0) return 0
  if (draft.scope === 'teeth') {
    if (!draft.teeth?.length) return 0
    return draft.teeth.length * unitPrice
  }
  return unitPrice
}

function formatCOP(value) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(Number.isFinite(value) ? value : 0)
}

function parseMoney(value) {
  const parsed = Number(String(value).replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : NaN
}

function parseQuantity(value) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 0
  return Math.max(0, Math.floor(parsed))
}

function buildPatientLabel(patient) {
  if (!patient) return 'Paciente sin identificar'
  const name = [patient.firstName, patient.lastName].filter(Boolean).join(' ').trim()
  return name || 'Paciente sin identificar'
}

function buildDocumentLabel(patient) {
  if (!patient) return '—'
  const type = patient.documentType?.trim() || 'Doc'
  const number = patient.documentNumber?.trim()
  return number ? `${type} ${number}` : '—'
}

function newItemId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function sortTeeth(teeth) {
  return [...teeth].sort((a, b) => a - b)
}

function implantLineTotal(option, draft) {
  if (!draft?.enabled) return 0
  const unitPrice = parseMoney(draft.unitPrice)
  if (!Number.isFinite(unitPrice) || unitPrice <= 0) return 0
  const quantity = option.needsTeeth ? draft.teeth.length : 1
  if (quantity <= 0) return 0
  return quantity * unitPrice
}

function aestheticLineTotal(option, draft) {
  return implantLineTotal(option, draft)
}

function resolveAestheticMaterialLabel(draft) {
  if (!draft?.material) return ''
  if (draft.material === 'otro') {
    return String(draft.materialOther || '').trim() || 'Otro'
  }
  return AESTHETIC_MATERIALS.find((item) => item.id === draft.material)?.label ?? draft.material
}

function ToothChipPicker({
  selectedTeeth,
  onChange,
  accentClass,
  panelClass = 'border-emerald-100 bg-emerald-50/40',
  titleClass = 'text-emerald-900',
  hintClass = 'text-emerald-800',
}) {
  const selected = new Set(selectedTeeth)

  const toggle = (fdi) => {
    const next = new Set(selected)
    if (next.has(fdi)) next.delete(fdi)
    else next.add(fdi)
    onChange(sortTeeth([...next]))
  }

  const renderRow = (teeth) => (
    <div className="flex flex-wrap gap-1">
      {teeth.map((fdi) => {
        const isOn = selected.has(fdi)
        return (
          <button
            key={fdi}
            type="button"
            onClick={() => toggle(fdi)}
            aria-pressed={isOn}
            className={`min-w-[2.25rem] rounded-md border px-2 py-1 text-xs font-semibold transition ${
              isOn
                ? accentClass
                : 'border-slate-300 bg-white text-slate-600 hover:border-slate-400 hover:bg-slate-50'
            }`}
          >
            {fdi}
          </button>
        )
      })}
    </div>
  )

  return (
    <div className={`space-y-2 rounded-lg border p-3 ${panelClass}`}>
      <p className={`text-xs font-semibold ${titleClass}`}>Piezas FDI</p>
      {renderRow(FDI_UPPER)}
      {renderRow(FDI_LOWER)}
      <p className={`text-xs ${hintClass}`}>
        {selectedTeeth.length > 0
          ? `Seleccionadas: ${sortTeeth(selectedTeeth).join(', ')}`
          : 'Seleccione uno o más dientes'}
      </p>
    </div>
  )
}

/**
 * Presupuesto ágil sin diagnósticos previos.
 * Pensado para la vista de Nuevo Paciente (sustituye visualmente la sección 8).
 */
export function PresupuestoRapido({ patient = null, onItemsChange }) {
  const { user } = useAuth()
  const onItemsChangeRef = useRef(onItemsChange)
  onItemsChangeRef.current = onItemsChange

  const [activeCategory, setActiveCategory] = useState(null)
  const [orthoModality, setOrthoModality] = useState(null)
  const [orthoCosts, setOrthoCosts] = useState(emptyOrthoCosts)
  const [implantDrafts, setImplantDrafts] = useState(emptyImplantDrafts)
  const [aestheticDrafts, setAestheticDrafts] = useState(emptyAestheticDrafts)
  const [otherDraft, setOtherDraft] = useState(emptyOtherDraft)
  const [items, setItems] = useState([])
  const [formError, setFormError] = useState('')

  const total = items.reduce((sum, item) => sum + (Number(item.valor) || 0), 0)
  const implantDraftTotal = IMPLANT_OPTIONS.reduce(
    (sum, option) => sum + implantLineTotal(option, implantDrafts[option.id]),
    0,
  )
  const aestheticDraftTotal = AESTHETIC_PROCEDURES.reduce(
    (sum, option) => sum + aestheticLineTotal(option, aestheticDrafts[option.id]),
    0,
  )
  const otherSubtotal = otherDraftTotal(otherDraft)
  const patientName = buildPatientLabel(patient)
  const patientDocument = buildDocumentLabel(patient)
  const accountHolderName = resolveAccountHolderTitle(user)
  const professionalName = user
    ? [user.firstName, user.lastName].filter(Boolean).join(' ').trim()
    : ''
  const showOrthoPanel = activeCategory === 'ortodoncia'
  const showImplantPanel = activeCategory === 'implantes'
  const showAestheticPanel = activeCategory === 'estetica'
  const showOtherPanel = activeCategory === 'otro'
  const selectedModality = ORTHO_MODALITIES.find((item) => item.id === orthoModality) ?? null
  const selectedImplantOptions = IMPLANT_OPTIONS.filter(
    (option) => implantDrafts[option.id]?.enabled,
  )
  const selectedAestheticOptions = AESTHETIC_PROCEDURES.filter(
    (option) => aestheticDrafts[option.id]?.enabled,
  )
  const otherProcedureLabel = resolveOtherProcedureLabel(otherDraft)

  useEffect(() => {
    onItemsChangeRef.current?.(items)
  }, [items])

  const selectCategory = (category) => {
    setFormError('')
    setActiveCategory(category.id)
    setOrthoModality(null)
    setOrthoCosts(emptyOrthoCosts())
    setImplantDrafts(emptyImplantDrafts())
    setAestheticDrafts(emptyAestheticDrafts())
    setOtherDraft(emptyOtherDraft())
  }

  const selectOrthoModality = (modality) => {
    setOrthoModality(modality.id)
    setFormError('')
  }

  const updateOrthoCost = (key, patch) => {
    setOrthoCosts((prev) => ({
      ...prev,
      [key]: { ...prev[key], ...patch },
    }))
  }

  const updateImplantDraft = (id, patch) => {
    setImplantDrafts((prev) => ({
      ...prev,
      [id]: { ...prev[id], ...patch },
    }))
  }

  const toggleImplantOption = (id) => {
    setImplantDrafts((prev) => {
      const current = prev[id]
      const enabled = !current.enabled
      return {
        ...prev,
        [id]: {
          ...current,
          enabled,
          teeth: enabled ? current.teeth : [],
          unitPrice: enabled ? current.unitPrice : '',
        },
      }
    })
    setFormError('')
  }

  const updateAestheticDraft = (id, patch) => {
    setAestheticDrafts((prev) => ({
      ...prev,
      [id]: { ...prev[id], ...patch },
    }))
  }

  const toggleAestheticOption = (id) => {
    setAestheticDrafts((prev) => {
      const current = prev[id]
      const enabled = !current.enabled
      return {
        ...prev,
        [id]: {
          ...current,
          enabled,
          teeth: enabled ? current.teeth : [],
          material: enabled ? current.material : '',
          materialOther: enabled ? current.materialOther : '',
          unitPrice: enabled ? current.unitPrice : '',
        },
      }
    })
    setFormError('')
  }

  const addOrthoPackage = () => {
    if (!selectedModality) {
      setFormError('Seleccione el tipo de ortodoncia.')
      return
    }

    const lines = []
    for (const row of ORTHO_COST_ROWS) {
      const cost = orthoCosts[row.key]
      const quantity = parseQuantity(cost.quantity)
      const unitPrice = parseMoney(cost.unitPrice)
      if (!quantity || !Number.isFinite(unitPrice) || unitPrice <= 0) continue
      const lineTotal = quantity * unitPrice
      const qtyLabel = quantity > 1 ? ` × ${quantity}` : ''
      lines.push({
        id: newItemId(),
        concepto: `${selectedModality.label} — ${row.label}${qtyLabel}`,
        valor: lineTotal,
      })
    }

    if (lines.length === 0) {
      setFormError('Asigne valor a cuota inicial, controles y/o retenedores.')
      return
    }

    setItems((prev) => [...prev, ...lines])
    setOrthoCosts(emptyOrthoCosts())
    setOrthoModality(null)
    setActiveCategory(null)
    setFormError('')
  }

  const addImplantPackage = () => {
    const lines = []

    for (const option of IMPLANT_OPTIONS) {
      const draft = implantDrafts[option.id]
      if (!draft.enabled) continue

      const unitPrice = parseMoney(draft.unitPrice)
      if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
        setFormError(`Asigne un valor a «${option.label}».`)
        return
      }

      if (option.needsTeeth) {
        if (draft.teeth.length === 0) {
          setFormError(`Seleccione al menos un diente para «${option.label}».`)
          return
        }
        for (const tooth of sortTeeth(draft.teeth)) {
          lines.push({
            id: newItemId(),
            concepto: `${option.label} — diente ${tooth}`,
            valor: unitPrice,
          })
        }
      } else {
        lines.push({
          id: newItemId(),
          concepto: option.label,
          valor: unitPrice,
        })
      }
    }

    if (lines.length === 0) {
      setFormError('Active al menos un ítem de implantes y asigne su valor.')
      return
    }

    setItems((prev) => [...prev, ...lines])
    setImplantDrafts(emptyImplantDrafts())
    setActiveCategory(null)
    setFormError('')
  }

  const addAestheticPackage = () => {
    const lines = []

    for (const option of AESTHETIC_PROCEDURES) {
      const draft = aestheticDrafts[option.id]
      if (!draft.enabled) continue

      if (!draft.material) {
        setFormError(`Seleccione el material de «${option.label}».`)
        return
      }
      if (draft.material === 'otro' && !String(draft.materialOther || '').trim()) {
        setFormError(`Indique el material «Otro» de «${option.label}».`)
        return
      }

      const materialLabel = resolveAestheticMaterialLabel(draft)
      const unitPrice = parseMoney(draft.unitPrice)
      if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
        setFormError(`Asigne un valor a «${option.label}».`)
        return
      }

      if (option.needsTeeth) {
        if (draft.teeth.length === 0) {
          setFormError(`Seleccione al menos un diente para «${option.label}».`)
          return
        }
        for (const tooth of sortTeeth(draft.teeth)) {
          lines.push({
            id: newItemId(),
            concepto: `${option.label} (${materialLabel}) — diente ${tooth}`,
            valor: unitPrice,
          })
        }
      } else {
        lines.push({
          id: newItemId(),
          concepto: `${option.label} (${materialLabel})`,
          valor: unitPrice,
        })
      }
    }

    if (lines.length === 0) {
      setFormError('Seleccione al menos un procedimiento de restauración / estética.')
      return
    }

    setItems((prev) => [...prev, ...lines])
    setAestheticDrafts(emptyAestheticDrafts())
    setActiveCategory(null)
    setFormError('')
  }

  const updateOtherDraft = (patch) => {
    setOtherDraft((prev) => ({ ...prev, ...patch }))
  }

  const addOtherProcedure = () => {
    const label = resolveOtherProcedureLabel(otherDraft)
    if (!otherDraft.procedureId) {
      setFormError('Seleccione un procedimiento en el menú.')
      return
    }
    if (otherDraft.procedureId === 'manual' && !label) {
      setFormError('Escriba el nombre del procedimiento manual.')
      return
    }

    const unitPrice = parseMoney(otherDraft.unitPrice)
    if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
      setFormError('Asigne un valor al procedimiento.')
      return
    }

    const lines = []
    if (otherDraft.scope === 'teeth') {
      if (!otherDraft.teeth.length) {
        setFormError('Seleccione al menos un diente o elija un maxilar.')
        return
      }
      for (const tooth of sortTeeth(otherDraft.teeth)) {
        lines.push({
          id: newItemId(),
          concepto: `${label} — diente ${tooth}`,
          valor: unitPrice,
        })
      }
    } else {
      const scopeLabel = resolveScopeLabel(otherDraft)
      if (!scopeLabel) {
        setFormError('Seleccione diente(s) o maxilar.')
        return
      }
      lines.push({
        id: newItemId(),
        concepto: `${label} — ${scopeLabel}`,
        valor: unitPrice,
      })
    }

    setItems((prev) => [...prev, ...lines])
    setOtherDraft(emptyOtherDraft())
    setActiveCategory(null)
    setFormError('')
  }

  const updateItem = (id, patch) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item
        const next = { ...item, ...patch }
        if (patch.valor !== undefined) {
          const parsed = parseMoney(patch.valor)
          next.valor = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
        }
        return next
      }),
    )
  }

  const removeItem = (id) => {
    setItems((prev) => prev.filter((item) => item.id !== id))
  }

  const buildPrintPayload = () => ({
    accountHolderName,
    patientName,
    patientDocument,
    patientPhone: patient?.phone || '',
    patientEmail: patient?.email || '',
    items: items.map((item) => ({ concepto: item.concepto, valor: Number(item.valor) || 0 })),
    total,
    professionalName: professionalName || undefined,
    professionalDocument: user?.documentNumber || undefined,
  })

  const handlePrint = () => {
    if (items.length === 0) return
    printQuickBudget(buildPrintPayload())
  }

  const handleWhatsApp = () => {
    if (items.length === 0) return
    openQuickBudgetWhatsApp(buildPrintPayload(), patient?.phone)
  }

  return (
    <section className="presupuesto-rapido rounded-xl border-2 border-teal-300 bg-white shadow-md ring-1 ring-teal-100">
      <div className="space-y-5 p-5 sm:p-6">
        <div className="rounded-lg border border-teal-200 bg-teal-50 px-4 py-3">
          <h2 className="text-lg font-bold text-teal-950">Presupuesto Rápido</h2>
          <p className="mt-1 text-sm text-teal-800">
            Cotice al instante sin diagnósticos previos. Ortodoncia, implantes, restauración /
            estética u otro procedimiento despliegan solo lo seleccionado.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {QUICK_CATEGORIES.map((category) => {
            const Icon = category.icon
            const isActive = activeCategory === category.id
            return (
              <button
                key={category.id}
                type="button"
                onClick={() => selectCategory(category)}
                className={`flex min-h-[4.5rem] items-center justify-center gap-2 rounded-xl border-2 px-4 py-4 text-base font-semibold transition focus-visible:outline-none focus-visible:ring-2 ${category.accent} ${
                  isActive ? 'ring-2 ring-offset-2' : ''
                }`}
              >
                <Icon className="h-5 w-5 shrink-0" aria-hidden />
                <span className="text-center leading-tight">{category.label}</span>
              </button>
            )
          })}
        </div>

        {showOrthoPanel ? (
          <div className="space-y-4 rounded-xl border border-sky-200 bg-sky-50/60 p-4">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-sky-800">
                Tipo de ortodoncia
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {ORTHO_MODALITIES.map((modality) => {
                  const isSelected = orthoModality === modality.id
                  return (
                    <button
                      key={modality.id}
                      type="button"
                      onClick={() => selectOrthoModality(modality)}
                      className={`rounded-lg border-2 px-3 py-3 text-left text-sm font-semibold transition ${
                        isSelected
                          ? 'border-sky-500 bg-white text-sky-950 ring-2 ring-sky-300'
                          : 'border-sky-200 bg-white/80 text-sky-900 hover:border-sky-400 hover:bg-white'
                      }`}
                    >
                      {modality.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {selectedModality ? (
              <div className="space-y-3 rounded-lg border border-sky-200 bg-white p-4">
                <p className="text-sm font-semibold text-slate-800">
                  {selectedModality.label}
                  <span className="ml-2 text-xs font-normal text-slate-500">
                    Asigne cantidad y valor a cada rubro
                  </span>
                </p>

                <div className="overflow-hidden rounded-lg border border-slate-200">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-100 text-slate-700">
                      <tr>
                        <th className="px-3 py-2 font-semibold">Rubro</th>
                        <th className="w-24 px-3 py-2 font-semibold">Cant.</th>
                        <th className="w-36 px-3 py-2 font-semibold">Valor unit. ($)</th>
                        <th className="w-32 px-3 py-2 text-right font-semibold">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {ORTHO_COST_ROWS.map((row) => {
                        const cost = orthoCosts[row.key]
                        const quantity = parseQuantity(cost.quantity)
                        const unitPrice = parseMoney(cost.unitPrice)
                        const subtotal =
                          quantity > 0 && Number.isFinite(unitPrice) && unitPrice > 0
                            ? quantity * unitPrice
                            : 0
                        return (
                          <tr key={row.key}>
                            <td className="px-3 py-2.5 font-medium text-slate-900">{row.label}</td>
                            <td className="px-3 py-2">
                              <input
                                type="number"
                                min="0"
                                step="1"
                                inputMode="numeric"
                                aria-label={`Cantidad de ${row.label}`}
                                value={cost.quantity}
                                onChange={(event) =>
                                  updateOrthoCost(row.key, { quantity: event.target.value })
                                }
                                className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="number"
                                min="0"
                                step="1000"
                                inputMode="numeric"
                                aria-label={`Valor de ${row.label}`}
                                value={cost.unitPrice}
                                onChange={(event) =>
                                  updateOrthoCost(row.key, { unitPrice: event.target.value })
                                }
                                placeholder="0"
                                className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
                              />
                            </td>
                            <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">
                              {subtotal > 0 ? formatCOP(subtotal) : '—'}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={addOrthoPackage}
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
                  >
                    <Plus className="h-4 w-4" aria-hidden />
                    Agregar ortodoncia
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-sky-800">
                Seleccione una modalidad para cargar cuota inicial, controles y retenedores.
              </p>
            )}
          </div>
        ) : null}

        {showImplantPanel ? (
          <div className="space-y-4 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-emerald-800">
                Tipo de tratamiento de implantes
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {IMPLANT_OPTIONS.map((option) => {
                  const isSelected = Boolean(implantDrafts[option.id]?.enabled)
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => toggleImplantOption(option.id)}
                      className={`rounded-lg border-2 px-3 py-3 text-left text-sm font-semibold transition ${
                        isSelected
                          ? 'border-emerald-500 bg-white text-emerald-950 ring-2 ring-emerald-300'
                          : 'border-emerald-200 bg-white/80 text-emerald-900 hover:border-emerald-400 hover:bg-white'
                      }`}
                    >
                      {option.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {selectedImplantOptions.length > 0 ? (
              <div className="space-y-3 rounded-lg border border-emerald-200 bg-white p-4">
                <p className="text-sm font-semibold text-slate-800">
                  Tratamientos seleccionados
                  <span className="ml-2 text-xs font-normal text-slate-500">
                    Elija dientes cuando aplique y asigne el valor
                  </span>
                </p>

                <div className="space-y-4">
                  {selectedImplantOptions.map((option) => {
                    const draft = implantDrafts[option.id]
                    const lineTotal = implantLineTotal(option, draft)
                    return (
                      <div
                        key={option.id}
                        className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/60 p-3"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <p className="text-sm font-semibold text-slate-900">{option.label}</p>
                          <p className="text-sm font-bold tabular-nums text-emerald-900">
                            {lineTotal > 0 ? formatCOP(lineTotal) : '—'}
                          </p>
                        </div>

                        {option.needsTeeth ? (
                          <ToothChipPicker
                            selectedTeeth={draft.teeth}
                            onChange={(teeth) => updateImplantDraft(option.id, { teeth })}
                            accentClass="border-emerald-500 bg-emerald-100 text-emerald-900"
                          />
                        ) : (
                          <p className="text-xs text-slate-500">Arcada completa · un solo valor</p>
                        )}

                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                          <div>
                            <label className="mb-1 block text-xs font-semibold text-slate-600">
                              {option.needsTeeth ? 'Valor por diente ($)' : 'Valor ($)'}
                            </label>
                            <input
                              type="number"
                              min="0"
                              step="1000"
                              inputMode="numeric"
                              value={draft.unitPrice}
                              onChange={(event) =>
                                updateImplantDraft(option.id, { unitPrice: event.target.value })
                              }
                              placeholder="0"
                              className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
                            />
                          </div>
                          {option.needsTeeth ? (
                            <p className="pb-1 text-xs text-slate-500">
                              Cantidad: <strong>{draft.teeth.length}</strong>
                            </p>
                          ) : null}
                        </div>
                      </div>
                    )
                  })}
                </div>

                <div className="flex flex-col gap-3 border-t border-slate-200 pt-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-emerald-950">
                    <span className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                      Subtotal implantes
                    </span>
                    <p className="text-xl font-bold tabular-nums">{formatCOP(implantDraftTotal)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={addImplantPackage}
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
                  >
                    <Plus className="h-4 w-4" aria-hidden />
                    Agregar implantes
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-emerald-800">
                Seleccione uno o más tratamientos para asignar dientes y valores.
              </p>
            )}
          </div>
        ) : null}

        {showAestheticPanel ? (
          <div className="space-y-4 rounded-xl border border-violet-200 bg-violet-50/60 p-4">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-violet-800">
                Procedimiento de restauración / estética
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {AESTHETIC_PROCEDURES.map((option) => {
                  const isSelected = Boolean(aestheticDrafts[option.id]?.enabled)
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => toggleAestheticOption(option.id)}
                      className={`rounded-lg border-2 px-3 py-3 text-left text-sm font-semibold transition ${
                        isSelected
                          ? 'border-violet-500 bg-white text-violet-950 ring-2 ring-violet-300'
                          : 'border-violet-200 bg-white/80 text-violet-900 hover:border-violet-400 hover:bg-white'
                      }`}
                    >
                      {option.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {selectedAestheticOptions.length > 0 ? (
              <div className="space-y-3 rounded-lg border border-violet-200 bg-white p-4">
                <p className="text-sm font-semibold text-slate-800">
                  Procedimientos seleccionados
                  <span className="ml-2 text-xs font-normal text-slate-500">
                    Material, dientes y valor
                  </span>
                </p>

                <div className="space-y-4">
                  {selectedAestheticOptions.map((option) => {
                    const draft = aestheticDrafts[option.id]
                    const lineTotal = aestheticLineTotal(option, draft)
                    return (
                      <div
                        key={option.id}
                        className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/60 p-3"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <p className="text-sm font-semibold text-slate-900">{option.label}</p>
                          <p className="text-sm font-bold tabular-nums text-violet-900">
                            {lineTotal > 0 ? formatCOP(lineTotal) : '—'}
                          </p>
                        </div>

                        <div>
                          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Material
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {AESTHETIC_MATERIALS.map((material) => {
                              const isOn = draft.material === material.id
                              return (
                                <button
                                  key={material.id}
                                  type="button"
                                  onClick={() =>
                                    updateAestheticDraft(option.id, {
                                      material: material.id,
                                      materialOther:
                                        material.id === 'otro' ? draft.materialOther : '',
                                    })
                                  }
                                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                                    isOn
                                      ? 'border-violet-500 bg-violet-100 text-violet-950'
                                      : 'border-slate-300 bg-white text-slate-600 hover:border-violet-300'
                                  }`}
                                >
                                  {material.label}
                                </button>
                              )
                            })}
                          </div>
                          {draft.material === 'otro' ? (
                            <input
                              type="text"
                              value={draft.materialOther}
                              onChange={(event) =>
                                updateAestheticDraft(option.id, {
                                  materialOther: event.target.value,
                                })
                              }
                              placeholder="Especifique el material"
                              className="mt-2 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-200"
                            />
                          ) : null}
                        </div>

                        {option.needsTeeth ? (
                          <ToothChipPicker
                            selectedTeeth={draft.teeth}
                            onChange={(teeth) => updateAestheticDraft(option.id, { teeth })}
                            accentClass="border-violet-500 bg-violet-100 text-violet-900"
                            panelClass="border-violet-100 bg-violet-50/40"
                            titleClass="text-violet-900"
                            hintClass="text-violet-800"
                          />
                        ) : (
                          <p className="text-xs text-slate-500">Arcada completa · un solo valor</p>
                        )}

                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                          <div>
                            <label className="mb-1 block text-xs font-semibold text-slate-600">
                              {option.needsTeeth ? 'Valor por diente ($)' : 'Valor ($)'}
                            </label>
                            <input
                              type="number"
                              min="0"
                              step="1000"
                              inputMode="numeric"
                              value={draft.unitPrice}
                              onChange={(event) =>
                                updateAestheticDraft(option.id, {
                                  unitPrice: event.target.value,
                                })
                              }
                              placeholder="0"
                              className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-200"
                            />
                          </div>
                          {option.needsTeeth ? (
                            <p className="pb-1 text-xs text-slate-500">
                              Cantidad: <strong>{draft.teeth.length}</strong>
                            </p>
                          ) : null}
                        </div>
                      </div>
                    )
                  })}
                </div>

                <div className="flex flex-col gap-3 border-t border-slate-200 pt-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-violet-950">
                    <span className="text-xs font-semibold uppercase tracking-wide text-violet-700">
                      Subtotal estética
                    </span>
                    <p className="text-xl font-bold tabular-nums">
                      {formatCOP(aestheticDraftTotal)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={addAestheticPackage}
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
                  >
                    <Plus className="h-4 w-4" aria-hidden />
                    Agregar estética
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-violet-800">
                Seleccione uno o más procedimientos para asignar material, dientes y valores.
              </p>
            )}
          </div>
        ) : null}

        {showOtherPanel ? (
          <div className="space-y-4 rounded-xl border border-amber-200 bg-amber-50/60 p-4">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-900">
                Otro procedimiento
              </p>
              <label className="mb-1 block text-xs font-semibold text-slate-600" htmlFor="otro-proc">
                Seleccione en el menú
              </label>
              <select
                id="otro-proc"
                value={otherDraft.procedureId}
                onChange={(event) =>
                  updateOtherDraft({
                    procedureId: event.target.value,
                    customName:
                      event.target.value === 'manual' ? otherDraft.customName : '',
                  })
                }
                className="w-full rounded-lg border-2 border-amber-200 bg-white px-3 py-2.5 text-sm font-semibold text-amber-950 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
              >
                <option value="">Elija un procedimiento…</option>
                {OTHER_PROCEDURES.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            {otherDraft.procedureId ? (
              <div className="space-y-4 rounded-lg border border-amber-200 bg-white p-4">
                {otherDraft.procedureId === 'manual' ? (
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-600">
                      Nombre del procedimiento
                    </label>
                    <input
                      type="text"
                      value={otherDraft.customName}
                      onChange={(event) => updateOtherDraft({ customName: event.target.value })}
                      placeholder="Ej. Frenectomía, Biopsia, etc."
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
                    />
                  </div>
                ) : (
                  <p className="text-sm font-semibold text-slate-900">{otherProcedureLabel}</p>
                )}

                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Diente o maxilar
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {ANATOMICAL_SCOPE_OPTIONS.map((scope) => {
                      const isOn = otherDraft.scope === scope.id
                      return (
                        <button
                          key={scope.id}
                          type="button"
                          onClick={() =>
                            updateOtherDraft({
                              scope: scope.id,
                              teeth: scope.id === 'teeth' ? otherDraft.teeth : [],
                            })
                          }
                          className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                            isOn
                              ? 'border-amber-500 bg-amber-100 text-amber-950'
                              : 'border-slate-300 bg-white text-slate-600 hover:border-amber-300'
                          }`}
                        >
                          {scope.label}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {otherDraft.scope === 'teeth' ? (
                  <ToothChipPicker
                    selectedTeeth={otherDraft.teeth}
                    onChange={(teeth) => updateOtherDraft({ teeth })}
                    accentClass="border-amber-500 bg-amber-100 text-amber-950"
                    panelClass="border-amber-100 bg-amber-50/50"
                    titleClass="text-amber-950"
                    hintClass="text-amber-900"
                  />
                ) : (
                  <p className="text-xs text-slate-500">
                    Alcance: <strong>{resolveScopeLabel(otherDraft)}</strong> · un solo valor
                  </p>
                )}

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-600">
                      {otherDraft.scope === 'teeth' ? 'Valor por diente ($)' : 'Valor ($)'}
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="1000"
                      inputMode="numeric"
                      value={otherDraft.unitPrice}
                      onChange={(event) => updateOtherDraft({ unitPrice: event.target.value })}
                      placeholder="0"
                      className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
                    />
                  </div>
                  {otherDraft.scope === 'teeth' ? (
                    <p className="pb-1 text-xs text-slate-500">
                      Cantidad: <strong>{otherDraft.teeth.length}</strong>
                    </p>
                  ) : null}
                </div>

                <div className="flex flex-col gap-3 border-t border-slate-200 pt-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-amber-950">
                    <span className="text-xs font-semibold uppercase tracking-wide text-amber-800">
                      Subtotal
                    </span>
                    <p className="text-xl font-bold tabular-nums">{formatCOP(otherSubtotal)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={addOtherProcedure}
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-amber-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
                  >
                    <Plus className="h-4 w-4" aria-hidden />
                    Agregar procedimiento
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-amber-900">
                Elija un procedimiento del menú o cree uno manual; luego asigne diente o maxilar y
                valor.
              </p>
            )}
          </div>
        ) : null}

        {formError ? (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</p>
        ) : null}

        <div className="overflow-hidden rounded-lg border border-slate-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-900 text-white">
              <tr>
                <th className="px-4 py-3 font-semibold">Concepto</th>
                <th className="w-40 px-4 py-3 text-right font-semibold">Valor</th>
                <th className="w-14 px-3 py-3 text-center font-semibold">
                  <span className="sr-only">Eliminar</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-slate-400">
                    Aún no hay ítems. Use los botones rápidos para cotizar.
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr key={item.id} className="bg-white">
                    <td className="px-4 py-2">
                      <input
                        type="text"
                        value={item.concepto}
                        onChange={(event) =>
                          updateItem(item.id, { concepto: event.target.value })
                        }
                        className="w-full rounded-md border border-transparent bg-transparent px-2 py-1.5 font-medium text-slate-900 outline-none hover:border-slate-200 focus:border-teal-500 focus:bg-white focus:ring-2 focus:ring-teal-200"
                        aria-label="Editar concepto"
                      />
                    </td>
                    <td className="px-4 py-2 text-right">
                      <input
                        type="number"
                        min="0"
                        step="1000"
                        inputMode="numeric"
                        value={item.valor}
                        onChange={(event) => updateItem(item.id, { valor: event.target.value })}
                        className="w-full rounded-md border border-transparent bg-transparent px-2 py-1.5 text-right tabular-nums text-slate-700 outline-none hover:border-slate-200 focus:border-teal-500 focus:bg-white focus:ring-2 focus:ring-teal-200"
                        aria-label="Editar valor"
                      />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <button
                        type="button"
                        onClick={() => removeItem(item.id)}
                        className="inline-flex rounded-md p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                        aria-label={`Eliminar ${item.concepto}`}
                        title="Eliminar"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-teal-950">
            <span className="text-xs font-semibold uppercase tracking-wide text-teal-700">
              Total
            </span>
            <p className="text-2xl font-bold tabular-nums">{formatCOP(total)}</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={handleWhatsApp}
              disabled={items.length === 0}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#25D366] px-5 py-3.5 text-base font-semibold text-white shadow-md transition hover:bg-[#1ebe57] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <MessageCircle className="h-5 w-5" aria-hidden />
              Enviar por WhatsApp
            </button>
            <button
              type="button"
              onClick={handlePrint}
              disabled={items.length === 0}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-6 py-3.5 text-base font-semibold text-white shadow-md transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Printer className="h-5 w-5" aria-hidden />
              Imprimir Presupuesto
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}

export default PresupuestoRapido
