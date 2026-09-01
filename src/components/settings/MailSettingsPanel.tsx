import { useEffect, useState } from 'react'
import { getStoredApiAuth } from '@/services/apiAuthService'

export function MailSettingsPanel() {
  const [from, setFrom] = useState('')
  const [brevoApiKey, setBrevoApiKey] = useState('')
  const [resendApiKey, setResendApiKey] = useState('')
  const [status, setStatus] = useState('Comprobando...')
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    const auth = getStoredApiAuth()
    if (!auth?.token) {
      setStatus('Inicie sesión como superadmin para configurar el correo.')
      return
    }
    void fetch('/api/auth/mail-settings', {
      headers: { Authorization: `Bearer ${auth.token}`, Accept: 'application/json' },
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}))
        if (!response.ok) {
          setStatus(payload.error || 'No se pudo leer la configuración.')
          return
        }
        setFrom(payload.mail?.from || '')
        setStatus(
          payload.mail?.configured
            ? `Correo activo (${payload.mail.transport})`
            : 'Correo no configurado: los códigos de registro no se envían.',
        )
      })
      .catch(() => setStatus('No se pudo conectar con el servidor.'))
  }, [])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSaved(false)
    const auth = getStoredApiAuth()
    if (!auth?.token) {
      setError('Sesión de superadmin no encontrada.')
      return
    }
    setSubmitting(true)
    try {
      const response = await fetch('/api/auth/mail-settings', {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${auth.token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          from: from.trim(),
          ...(brevoApiKey.trim() ? { brevoApiKey: brevoApiKey.trim() } : {}),
          ...(resendApiKey.trim() ? { resendApiKey: resendApiKey.trim() } : {}),
        }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        setError(payload.error || 'No se pudo guardar.')
        return
      }
      setBrevoApiKey('')
      setResendApiKey('')
      setSaved(true)
      setStatus(
        payload.mail?.configured
          ? `Correo activo (${payload.mail.transport})`
          : 'Correo no configurado.',
      )
    } catch {
      setError('No se pudo conectar con el servidor.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSave} className="card space-y-4">
      <div>
        <h2 className="text-base font-semibold text-slate-800">Correo de verificación</h2>
        <p className="mt-1 text-sm text-slate-600">
          Render bloquea SMTP. Use una API HTTPS (Brevo recomendado: verifique su Gmail como
          remitente y pegue la API key). Sin esto, el registro no puede enviar el código.
        </p>
        <p className="mt-2 text-sm font-medium text-slate-700">{status}</p>
      </div>
      <div>
        <label className="label-field">Remitente (MAIL_FROM)</label>
        <input
          type="text"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className="input-field"
          placeholder="doctorSEOlabs <doctormauriciosoto@gmail.com>"
        />
      </div>
      <div>
        <label className="label-field">API key de Brevo</label>
        <input
          type="password"
          value={brevoApiKey}
          onChange={(e) => setBrevoApiKey(e.target.value)}
          className="input-field"
          placeholder="Dejar vacío para no cambiar"
          autoComplete="off"
        />
      </div>
      <div>
        <label className="label-field">API key de Resend (opcional)</label>
        <input
          type="password"
          value={resendApiKey}
          onChange={(e) => setResendApiKey(e.target.value)}
          className="input-field"
          placeholder="Dejar vacío para no cambiar"
          autoComplete="off"
        />
      </div>
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <button type="submit" disabled={submitting} className="btn-primary">
        {submitting ? 'Guardando...' : 'Guardar correo'}
      </button>
      {saved && <p className="text-sm text-green-600">Configuración de correo guardada.</p>}
    </form>
  )
}
