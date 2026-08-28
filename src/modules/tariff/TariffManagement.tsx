import { useMemo, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import {
  deleteCustomTreatment,
  persistCustomTreatment,
  persistTariffPrice,
  updateCustomTreatment,
} from '@/services/tariffService'
import { useTariffStore } from '@/store/useTariffStore'
import type { TariffItem, TariffTabFilter } from '@/types/pricing'
import { formatCurrency } from '@/utils'
import { CustomTreatmentModal } from './CustomTreatmentModal'
import { useTariffSync } from './useTariffSync'
import { VirtualTariffTable } from './VirtualTariffTable'

const TAB_OPTIONS: { id: TariffTabFilter; label: string }[] = [
  { id: 'all', label: 'Todos' },
  { id: 'cups', label: 'Catálogo CUPS' },
  { id: 'custom', label: 'Mis Tratamientos Personalizados' },
]

export function TariffManagement() {
  const { user } = useAuth()
  const isLoaded = useTariffSync(user?.id)
  const tariffs = useTariffStore((state) => state.tariffs)
  const updatePrice = useTariffStore((state) => state.updatePrice)
  const addCustomTreatment = useTariffStore((state) => state.addCustomTreatment)
  const updateCustomTreatmentStore = useTariffStore((state) => state.updateCustomTreatment)
  const removeTariff = useTariffStore((state) => state.removeTariff)

  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<TariffTabFilter>('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create')
  const [editingItem, setEditingItem] = useState<TariffItem | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)

  const filteredTariffs = useMemo(() => {
    const query = search.trim().toLowerCase()

    return tariffs.filter((item) => {
      if (tab === 'cups' && item.type !== 'CUPS') return false
      if (tab === 'custom' && item.type !== 'CUSTOM') return false
      if (!query) return true
      return (
        item.code.toLowerCase().includes(query) || item.name.toLowerCase().includes(query)
      )
    })
  }, [tariffs, search, tab])

  const stats = useMemo(() => {
    const cups = tariffs.filter((t) => t.type === 'CUPS')
    const custom = tariffs.filter((t) => t.type === 'CUSTOM')
    const priced = tariffs.filter((t) => t.price > 0)
    return { cups: cups.length, custom: custom.length, priced: priced.length }
  }, [tariffs])

  const handlePriceChange = async (code: string, price: number) => {
    if (!user?.id) return
    updatePrice(code, price)
    try {
      await persistTariffPrice(user.id, code, price)
      setStatusMessage(`Precio actualizado: ${code}`)
    } catch (error) {
      console.error(error)
      setStatusMessage('Error al guardar el precio. Reintente.')
    }
  }

  const handleCreateCustom = async (values: {
    name: string
    category: string
    price: number
  }) => {
    if (!user?.id) throw new Error('Sesión no válida.')

    const item = addCustomTreatment({
      code: '',
      name: values.name,
      category: values.category,
      price: values.price,
      isActive: true,
      updatedAt: new Date().toISOString(),
    })

    await persistCustomTreatment(user.id, item)
    setStatusMessage(`Tratamiento ${item.code} creado.`)
  }

  const handleEditCustom = async (values: {
    name: string
    category: string
    price: number
  }) => {
    if (!user?.id || !editingItem) throw new Error('Sesión no válida.')

    updateCustomTreatmentStore(editingItem.code, values)
    await updateCustomTreatment(user.id, editingItem.code, values)
    setStatusMessage(`Tratamiento ${editingItem.code} actualizado.`)
  }

  const openCreateModal = () => {
    setModalMode('create')
    setEditingItem(null)
    setModalOpen(true)
  }

  const openEditModal = (item: TariffItem) => {
    setModalMode('edit')
    setEditingItem(item)
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
    setEditingItem(null)
    setModalMode('create')
  }

  const handleDeleteCustom = async (code: string) => {
    if (!user?.id) return
    if (!window.confirm(`¿Eliminar el tratamiento ${code}?`)) return

    removeTariff(code)
    try {
      await deleteCustomTreatment(user.id, code)
      setStatusMessage(`Tratamiento ${code} eliminado.`)
    } catch (error) {
      console.error(error)
      setStatusMessage('No se pudo eliminar el tratamiento.')
    }
  }

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            Mis Precios y Procedimientos
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Catálogo CUPS con precios editables y tratamientos personalizados para autocarga al
            presupuesto.
          </p>
        </div>
        <button type="button" onClick={openCreateModal} className="btn-primary">
          + Nuevo tratamiento personalizado
        </button>
      </header>

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <p className="text-xs uppercase text-slate-500">CUPS activos</p>
          <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            {stats.cups.toLocaleString('es-CO')}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <p className="text-xs uppercase text-slate-500">Personalizados</p>
          <p className="text-2xl font-bold text-violet-600 dark:text-violet-400">
            {stats.custom.toLocaleString('es-CO')}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <p className="text-xs uppercase text-slate-500">Con precio definido</p>
          <p className="text-2xl font-bold text-dental-700 dark:text-dental-400">
            {stats.priced.toLocaleString('es-CO')}
          </p>
        </div>
      </div>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1 dark:border-slate-700 dark:bg-slate-800">
          {TAB_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setTab(option.id)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                tab === option.id
                  ? 'bg-white text-dental-700 shadow-sm dark:bg-slate-900 dark:text-dental-300'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por código CUPS o descripción..."
          className="input-field w-full sm:max-w-md"
        />
      </div>

      {!isLoaded ? (
        <div className="rounded-xl border border-slate-200 bg-white px-6 py-16 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
          Cargando tarifario desde almacenamiento local…
        </div>
      ) : (
        <VirtualTariffTable
          items={filteredTariffs}
          onPriceChange={handlePriceChange}
          onEditCustom={tab !== 'cups' ? openEditModal : undefined}
          onDeleteCustom={tab !== 'cups' ? handleDeleteCustom : undefined}
        />
      )}

      {statusMessage && (
        <p className="mt-3 text-sm text-dental-700 dark:text-dental-300">{statusMessage}</p>
      )}

      <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">
        Los cambios de precio se guardan localmente (offline-first) y se consultan en O(1) desde
        el presupuesto clínico. Precio promedio configurado:{' '}
        {stats.priced > 0
          ? formatCurrency(
              tariffs.filter((t) => t.price > 0).reduce((sum, t) => sum + t.price, 0) /
                stats.priced,
            )
          : formatCurrency(0)}
      </p>

      <CustomTreatmentModal
        open={modalOpen}
        mode={modalMode}
        editCode={editingItem?.code}
        initialValues={
          editingItem
            ? {
                name: editingItem.name,
                category: editingItem.category,
                price: editingItem.price,
              }
            : undefined
        }
        onClose={closeModal}
        onSubmit={modalMode === 'edit' ? handleEditCustom : handleCreateCustom}
      />
    </div>
  )
}
