import { useRef, useState, useCallback } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { TariffItem } from '@/types/pricing'
import { formatCurrency } from '@/utils'

interface VirtualTariffTableProps {
  items: TariffItem[]
  onPriceChange: (code: string, price: number) => void
  onEditCustom?: (item: TariffItem) => void
  onDeleteCustom?: (code: string) => void
}

const ROW_HEIGHT = 52

export function VirtualTariffTable({
  items,
  onPriceChange,
  onEditCustom,
  onDeleteCustom,
}: VirtualTariffTableProps) {
  const parentRef = useRef<HTMLDivElement>(null)
  const [editingCode, setEditingCode] = useState<string | null>(null)
  const [draftPrice, setDraftPrice] = useState('')

  const rowVirtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  })

  const commitPrice = useCallback(
    (code: string) => {
      const parsed = Number.parseFloat(draftPrice)
      if (!Number.isFinite(parsed) || parsed < 0) {
        setEditingCode(null)
        return
      }
      onPriceChange(code, parsed)
      setEditingCode(null)
    },
    [draftPrice, onPriceChange],
  )

  const startEdit = (item: TariffItem) => {
    setEditingCode(item.code)
    setDraftPrice(String(item.price))
  }

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center text-sm text-slate-500 dark:border-slate-600 dark:bg-slate-800/50 dark:text-slate-400">
        No hay tarifas que coincidan con la búsqueda o el filtro seleccionado.
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="grid grid-cols-[120px_minmax(0,1fr)_140px_120px_110px] gap-2 border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
        <span>Código</span>
        <span>Descripción</span>
        <span>Categoría</span>
        <span>Precio</span>
        <span className="text-right">Tipo</span>
      </div>

      <div ref={parentRef} className="h-[min(70vh,640px)] overflow-auto">
        <div
          style={{
            height: `${rowVirtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const item = items[virtualRow.index]
            const isEditing = editingCode === item.code

            return (
              <div
                key={item.code}
                className="grid grid-cols-[120px_minmax(0,1fr)_140px_120px_110px] items-center gap-2 border-b border-slate-100 px-4 text-sm dark:border-slate-800"
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <span className="font-mono text-xs text-slate-700 dark:text-slate-300">
                  {item.code}
                </span>
                <span
                  className="truncate text-slate-900 dark:text-slate-100"
                  title={item.name}
                >
                  {item.name}
                </span>
                <span className="truncate text-xs text-slate-500 dark:text-slate-400">
                  {item.category}
                </span>
                <div>
                  {isEditing ? (
                    <input
                      type="number"
                      min={0}
                      value={draftPrice}
                      onChange={(e) => setDraftPrice(e.target.value)}
                      onBlur={() => commitPrice(item.code)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitPrice(item.code)
                        if (e.key === 'Escape') setEditingCode(null)
                      }}
                      className="input-field w-full py-1 text-xs"
                      autoFocus
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => startEdit(item)}
                      className="w-full rounded-lg border border-transparent px-2 py-1 text-left font-medium text-dental-700 transition hover:border-dental-200 hover:bg-dental-50 dark:text-dental-300 dark:hover:border-dental-800 dark:hover:bg-dental-950/30"
                      title="Clic para editar precio"
                    >
                      {formatCurrency(item.price)}
                    </button>
                  )}
                </div>
                <div className="flex items-center justify-end gap-1">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                      item.type === 'CUSTOM'
                        ? 'bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300'
                        : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                    }`}
                  >
                    {item.type === 'CUSTOM' ? 'Propio' : 'CUPS'}
                  </span>
                  {item.type === 'CUSTOM' && onEditCustom && (
                    <button
                      type="button"
                      onClick={() => onEditCustom(item)}
                      className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-dental-700 dark:hover:bg-slate-800 dark:hover:text-dental-300"
                      title="Editar nombre, categoría y precio"
                    >
                      ✎
                    </button>
                  )}
                  {item.type === 'CUSTOM' && onDeleteCustom && (
                    <button
                      type="button"
                      onClick={() => onDeleteCustom(item.code)}
                      className="text-red-500 hover:text-red-700"
                      title="Eliminar"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="border-t border-slate-200 px-4 py-2 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
        {items.length.toLocaleString('es-CO')} tarifa{items.length === 1 ? '' : 's'} · tabla
        virtualizada
      </div>
    </div>
  )
}
