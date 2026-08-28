import { useState } from 'react'

interface SignConfirmationModalProps {
  open: boolean
  title: string
  description: string
  userEmail: string
  onConfirm: (password: string) => Promise<{ ok: true } | { ok: false; error: string }>
  onCancel: () => void
}

export function SignConfirmationModal({
  open,
  title,
  description,
  userEmail,
  onConfirm,
  onCancel,
}: SignConfirmationModalProps) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (!open) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    const result = await onConfirm(password)
    setBusy(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setPassword('')
    onCancel()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl"
      >
        <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
        <p className="mt-2 text-sm text-slate-600">{description}</p>

        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          <p className="font-medium">Identificación inequívoca</p>
          <p className="mt-1">
            Firmando como <strong>{userEmail}</strong>. Las credenciales son personales e
            intransferibles. Esta acción quedará en la bitácora de auditoría.
          </p>
        </div>

        <div className="mt-4">
          <label className="label-field">Confirme su contraseña</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input-field"
            autoFocus
            required
          />
        </div>

        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="btn-secondary" disabled={busy}>
            Cancelar
          </button>
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? 'Verificando…' : 'Confirmar y firmar'}
          </button>
        </div>
      </form>
    </div>
  )
}
