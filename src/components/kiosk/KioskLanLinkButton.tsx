import { useState } from 'react'
import QRCode from 'qrcode'
import { Tablet } from 'lucide-react'
import { getStoredApiAuth } from '@/services/apiAuthService'

/** Misma IP que imprime el servidor. Sustituye localhost para la tableta. */
const KIOSK_LAN_IP = '192.168.80.35'

interface LanLinkResponse {
  success?: boolean
  url?: string
  ip?: string
  error?: string
}

function isPrivateHost(hostname: string) {
  const host = hostname.trim().toLowerCase()
  if (host === 'localhost' || host === '127.0.0.1') return true
  return /^(192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3})$/.test(
    host,
  )
}

/** En producción el QR abre el dominio del sitio. La IP fija solo sirve en la Wi-Fi local. */
function urlForTablet(rawUrl: string) {
  const parsed = new URL(rawUrl)
  if (!isPrivateHost(window.location.hostname)) {
    parsed.protocol = window.location.protocol
    parsed.hostname = window.location.hostname
    parsed.port = window.location.port
    return parsed.toString()
  }
  parsed.hostname = KIOSK_LAN_IP
  return parsed.toString()
}

/**
 * En el PC clínico: detecta la IP local (vía API) y muestra el enlace del kiosco con QR.
 */
export function KioskLanLinkButton() {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [url, setUrl] = useState('')
  const [qr, setQr] = useState('')
  const [copied, setCopied] = useState(false)

  const openLink = async () => {
    setOpen(true)
    setError(null)
    setCopied(false)
    setLoading(true)
    try {
      const auth = getStoredApiAuth()
      if (!auth?.token) {
        setError('Inicie sesión para generar el enlace de la tableta.')
        return
      }
      const port = window.location.port
      const response = await fetch(
        `/api/v1/kiosk/lan-link${port ? `?port=${encodeURIComponent(port)}` : ''}`,
        { headers: { Authorization: `Bearer ${auth.token}` } },
      )
      const raw = await response.text()
      let data: LanLinkResponse
      try {
        data = JSON.parse(raw) as LanLinkResponse
      } catch {
        setError('El servidor no entregó el enlace de la tableta.')
        setUrl('')
        setQr('')
        return
      }
      if (!response.ok || !data.url) {
        setError(data.error || 'No se pudo armar el enlace del kiosco.')
        setUrl('')
        setQr('')
        return
      }
      const lanUrl = urlForTablet(data.url)
      setUrl(lanUrl)
      setQr(await QRCode.toDataURL(lanUrl, { margin: 1, width: 280, errorCorrectionLevel: 'L' }))
    } catch {
      setError('Sin conexión con el servidor de este PC.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          void openLink()
        }}
        className="inline-flex h-12 items-center gap-2 rounded-lg border border-slate-200 px-3 text-xl font-bold text-slate-700 hover:bg-slate-50"
      >
        <Tablet className="h-6 w-6 text-teal-700" aria-hidden />
        Tableta
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/40 p-4"
          role="presentation"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="kiosk-lan-title"
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="kiosk-lan-title" className="text-lg font-semibold text-slate-900">
              Conectar tableta
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              {isPrivateHost(window.location.hostname)
                ? 'La tableta y este PC deben estar en la misma Wi-Fi. Escanee el código o abra el enlace.'
                : 'Escanee el código con la tableta. Se abre el modo kiosco en este mismo sitio.'}
            </p>

            {loading ? <p className="mt-6 text-sm text-slate-500">Detectando IP local…</p> : null}
            {error ? (
              <p className="mt-6 text-sm text-rose-700" role="alert">
                {error}
              </p>
            ) : null}
            {qr ? (
              <img
                src={qr}
                alt="Código QR del modo kiosco"
                className="mx-auto mt-4 h-56 w-56"
              />
            ) : null}
            {url ? (
              <p className="mt-4 break-all rounded-lg bg-slate-50 px-3 py-2 font-mono text-xs text-slate-700">
                {url}
              </p>
            ) : null}

            <div className="mt-5 flex justify-end gap-2">
              {url ? (
                <button
                  type="button"
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  onClick={() => {
                    void navigator.clipboard.writeText(url).then(() => setCopied(true))
                  }}
                >
                  {copied ? 'Copiado' : 'Copiar enlace'}
                </button>
              ) : null}
              <button
                type="button"
                className="rounded-lg bg-teal-700 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-800"
                onClick={() => setOpen(false)}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
