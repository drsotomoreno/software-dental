import { useEffect, useState, type FormEvent } from 'react'
import type { ScheduleColumn } from '@/types/appointment'
import type { CreateScheduleBlockInput, ScheduleBlockType } from '@/types/scheduleBlock'
import { minutesToTime, timeToMinutes } from '@/constants/procedures'
import type { SlotSelection } from './CreateAppointmentModal'

interface BlockSlotModalProps {
  isOpen: boolean
  selection: SlotSelection | null
  columns: ScheduleColumn[]
  defaultDate?: string
  defaultType?: ScheduleBlockType
  onClose: () => void
  onSubmit: (input: CreateScheduleBlockInput) => Promise<void>
}

export function BlockSlotModal({
  isOpen,
  selection,
  columns,
  defaultDate,
  defaultType = 'time_range',
  onClose,
  onSubmit,
}: BlockSlotModalProps) {
  const [blockType, setBlockType] = useState<ScheduleBlockType>(defaultType)
  const [date, setDate] = useState('')
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('09:30')
  const [columnScope, setColumnScope] = useState<'all' | string>('all')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!isOpen) return
    setBlockType(defaultType)
    setDate(selection?.date ?? defaultDate ?? '')
    setStartTime(selection?.startTime ?? '09:00')
    const endMin = timeToMinutes(selection?.startTime ?? '09:00') + 30
    setEndTime(minutesToTime(endMin))
    setColumnScope(selection?.columnId ?? 'all')
    setReason('')
    setError('')
  }, [isOpen, selection, defaultDate, defaultType])

  if (!isOpen) return null

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!date) {
      setError('Seleccione una fecha.')
      return
    }
    if (blockType === 'time_range' && timeToMinutes(endTime) <= timeToMinutes(startTime)) {
      setError('La hora de fin debe ser posterior al inicio.')
      return
    }

    setSaving(true)
    setError('')
    try {
      await onSubmit({
        date,
        type: blockType,
        startTime: blockType === 'time_range' ? startTime : undefined,
        endTime: blockType === 'time_range' ? endTime : undefined,
        columnId: columnScope === 'all' ? undefined : columnScope,
        reason: reason.trim() || undefined,
      })
      onClose()
    } catch {
      setError('No se pudo guardar el bloqueo.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="card w-full max-w-md">
        <h2 className="mb-4 text-lg font-semibold text-slate-800">Bloquear agenda</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setBlockType('time_range')}
              className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${
                blockType === 'time_range'
                  ? 'border-slate-900 bg-black text-white'
                  : 'border-slate-200 text-slate-600'
              }`}
            >
              Rango horario
            </button>
            <button
              type="button"
              onClick={() => setBlockType('full_day')}
              className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${
                blockType === 'full_day'
                  ? 'border-slate-900 bg-black text-white'
                  : 'border-slate-200 text-slate-600'
              }`}
            >
              Día completo
            </button>
          </div>

          <div>
            <label className="label-field">Fecha</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="input-field"
              required
            />
          </div>

          {blockType === 'time_range' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label-field">Desde</label>
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="input-field"
                  required
                />
              </div>
              <div>
                <label className="label-field">Hasta</label>
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="input-field"
                  required
                />
              </div>
            </div>
          )}

          <div>
            <label className="label-field">Aplicar a</label>
            <select
              value={columnScope}
              onChange={(e) => setColumnScope(e.target.value)}
              className="input-field"
            >
              <option value="all">Todas las sillas / consultorios</option>
              {columns.map((col) => (
                <option key={col.id} value={col.id}>
                  {col.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label-field">Motivo (opcional)</label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ej. Reunión, vacaciones, mantenimiento..."
              className="input-field"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-slate-900 disabled:opacity-50"
            >
              {saving ? 'Guardando…' : 'Bloquear'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
