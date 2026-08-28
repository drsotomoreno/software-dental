import { useState } from 'react'
import type { ScheduleColumn } from '@/types/appointment'

interface ColumnManagerProps {
  columns: ScheduleColumn[]
  onAdd: (name: string) => Promise<void>
  onRename: (id: string, name: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onReorder: (id: string, direction: 'up' | 'down') => Promise<void>
}

export function ColumnManager({
  columns,
  onAdd,
  onRename,
  onDelete,
  onReorder,
}: ColumnManagerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [error, setError] = useState('')

  const handleAdd = async () => {
    if (!newName.trim()) return
    setError('')
    try {
      await onAdd(newName.trim())
      setNewName('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al agregar silla.')
    }
  }

  const handleRename = async (id: string) => {
    if (!editName.trim()) return
    await onRename(id, editName.trim())
    setEditingId(null)
  }

  const handleDelete = async (id: string) => {
    setError('')
    try {
      await onDelete(id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al eliminar.')
    }
  }

  return (
    <div>
      <button type="button" onClick={() => setIsOpen(!isOpen)} className="btn-secondary text-sm">
        {isOpen ? 'Cerrar sillas' : 'Gestionar sillas'}
      </button>

      {isOpen && (
        <div className="card mt-3">
          <h3 className="mb-3 text-sm font-semibold text-slate-800">
            Sillas y consultorios (columnas dinámicas)
          </h3>

          {error && (
            <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
          )}

          <ul className="mb-4 space-y-2">
            {columns.map((col, idx) => (
              <li
                key={col.id}
                className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
              >
                {editingId === col.id ? (
                  <>
                    <input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="input-field flex-1 py-1 text-sm"
                      onKeyDown={(e) => e.key === 'Enter' && handleRename(col.id)}
                    />
                    <button
                      type="button"
                      onClick={() => handleRename(col.id)}
                      className="text-xs text-dental-600 hover:underline"
                    >
                      Guardar
                    </button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 text-sm font-medium">{col.name}</span>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        disabled={idx === 0}
                        onClick={() => onReorder(col.id, 'up')}
                        className="rounded px-1.5 py-0.5 text-xs text-slate-500 hover:bg-slate-200 disabled:opacity-30"
                        title="Mover arriba"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        disabled={idx === columns.length - 1}
                        onClick={() => onReorder(col.id, 'down')}
                        className="rounded px-1.5 py-0.5 text-xs text-slate-500 hover:bg-slate-200 disabled:opacity-30"
                        title="Mover abajo"
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(col.id)
                          setEditName(col.name)
                        }}
                        className="rounded px-1.5 py-0.5 text-xs text-dental-600 hover:bg-dental-50"
                      >
                        Renombrar
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(col.id)}
                        className="rounded px-1.5 py-0.5 text-xs text-red-500 hover:bg-red-50"
                      >
                        Eliminar
                      </button>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>

          <div className="flex gap-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Nueva silla o consultorio..."
              className="input-field flex-1 text-sm"
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            />
            <button type="button" onClick={handleAdd} className="btn-primary text-sm">
              + Agregar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
