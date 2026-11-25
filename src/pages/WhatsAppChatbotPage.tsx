import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  BellRing,
  Bot,
  Lock,
  MessageSquare,
  Package,
  PlugZap,
  UserX,
} from 'lucide-react'
import { WhatsappBalanceCard } from '@/components/whatsapp/WhatsappBalanceCard'
import { WhatsappNoShowsPanel } from '@/components/whatsapp/WhatsappNoShowsPanel'
import { WhatsappPackageCheckoutButton } from '@/components/whatsapp/WhatsappPackageCheckoutButton'
import {
  fetchWhatsappStatus,
  patchWhatsappSettings,
  type WhatsappStatus,
} from '@/services/whatsappApiService'

type Section = 'general' | 'chatbot' | 'reminders' | 'no-shows' | 'packages'

const SECTIONS: { id: Section; label: string; icon: typeof Bot }[] = [
  { id: 'general', label: 'General', icon: MessageSquare },
  { id: 'chatbot', label: 'Chatbot 24/7', icon: Bot },
  { id: 'reminders', label: 'Recordatorios', icon: BellRing },
  { id: 'no-shows', label: 'Inasistencias', icon: UserX },
  { id: 'packages', label: 'Paquetes y Saldo', icon: Package },
]

function parseSection(raw: string | null): Section {
  const value = String(raw || '').trim().toLowerCase()
  if (value === 'chatbot' || value === 'reminders' || value === 'no-shows' || value === 'packages') {
    return value
  }
  if (value === 'inasistencias') return 'no-shows'
  if (value === 'paquetes' || value === 'saldo') return 'packages'
  return 'general'
}

export function WhatsAppChatbotPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const section = parseSection(searchParams.get('section'))
  const [status, setStatus] = useState<WhatsappStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [toggleBusy, setToggleBusy] = useState(false)
  const [connectHint, setConnectHint] = useState('')

  const paid = status?.subscription?.paid_subscription_active === true

  const reload = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const next = await fetchWhatsappStatus()
      setStatus(next)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar el estado de WhatsApp.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  useEffect(() => {
    const el = document.getElementById(section)
    if (el && section !== 'general') {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [section, status])

  const setSection = (next: Section) => {
    const params = new URLSearchParams(searchParams)
    if (next === 'general') params.delete('section')
    else params.set('section', next)
    setSearchParams(params, { replace: true })
  }

  async function onToggleChatbot(enabled: boolean) {
    setToggleBusy(true)
    setError('')
    try {
      const updated = await patchWhatsappSettings({ chatbot_enabled: enabled })
      setStatus((prev) =>
        prev
          ? {
              ...prev,
              chatbot_enabled: updated.chatbot_enabled === true,
            }
          : prev,
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cambiar el chatbot.')
    } finally {
      setToggleBusy(false)
    }
  }

  const phoneLabel = useMemo(() => {
    if (!status?.whatsapp_connected) return null
    return status.whatsapp_phone_number_id
      ? `Línea conectada · ID ${status.whatsapp_phone_number_id}`
      : 'Línea WhatsApp conectada'
  }, [status])

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
            Módulo de comunicación
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
            WhatsApp y Chatbot
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Recordatorios automáticos, atención 24/7 y gestión de inasistencias. Los envíos
            manuales gratuitos desde la historia clínica (wa.me) siguen disponibles.
          </p>
        </div>

        <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
          {status?.whatsapp_connected ? (
            <div className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">
              <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden />
              {phoneLabel}
            </div>
          ) : (
            <button
              type="button"
              onClick={() =>
                setConnectHint(
                  'Pronto podrá vincular su WhatsApp Business con Embedded Signup de Meta. Mientras tanto, el equipo puede configurar phone_number_id y token en el servidor.',
                )
              }
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-300 bg-white px-4 py-2.5 text-sm font-semibold text-emerald-700 shadow-sm hover:bg-emerald-50"
            >
              <PlugZap className="h-4 w-4" aria-hidden />
              Conectar WhatsApp
            </button>
          )}

          <label className="inline-flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
            <span className="text-sm font-medium text-slate-700">Chatbot 24/7</span>
            <span className="relative inline-flex h-6 w-11 items-center">
              <input
                type="checkbox"
                className="peer sr-only"
                checked={status?.chatbot_enabled === true}
                disabled={toggleBusy || loading || !status}
                onChange={(event) => void onToggleChatbot(event.target.checked)}
              />
              <span className="h-6 w-11 rounded-full bg-slate-200 transition peer-checked:bg-emerald-500 peer-focus-visible:ring-2 peer-focus-visible:ring-emerald-400 peer-disabled:opacity-50" />
              <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition peer-checked:translate-x-5" />
            </span>
          </label>
        </div>
      </header>

      {connectHint ? (
        <p className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
          {connectHint}
        </p>
      ) : null}

      {!paid && status ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-amber-950 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2">
            <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <p className="text-sm font-medium">
              Exclusivo para planes pagos activos. Activa tu suscripción de mihistoriadental para
              recargar paquetes.
            </p>
          </div>
          <Link
            to="/suscripcion"
            className="inline-flex shrink-0 items-center justify-center rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-500"
          >
            Ver planes
          </Link>
        </div>
      ) : null}

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {loading && !status ? <p className="text-sm text-slate-500">Cargando módulo…</p> : null}

      <nav className="flex flex-wrap gap-2" aria-label="Secciones WhatsApp">
        {SECTIONS.map((item) => {
          const Icon = item.icon
          const active = section === item.id
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setSection(item.id)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                active
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden />
              {item.label}
              {item.id === 'no-shows' && (status?.pending_manual_call || 0) > 0 ? (
                <span className="ml-1 rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] text-white">
                  {status?.pending_manual_call}
                </span>
              ) : null}
            </button>
          )
        })}
      </nav>

      <div id="general" className="grid gap-4 md:grid-cols-2">
        <WhatsappBalanceCard
          title="Recordatorios Automáticos"
          balance={status?.reminders_balance ?? 0}
          unitLabel="mensajes"
          maxReference={150}
          lowThreshold={10}
          accentClass="text-emerald-700"
          barClass="bg-emerald-500"
        />
        <div id="chatbot">
          <WhatsappBalanceCard
            title="Chatbot 24/7"
            balance={status?.chatbot_sessions_balance ?? 0}
            unitLabel="sesiones"
            maxReference={600}
            lowThreshold={20}
            accentClass="text-teal-700"
            barClass="bg-teal-500"
          />
        </div>
      </div>

      <section id="reminders" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Recordatorios de citas</h2>
        <p className="mt-1 text-sm text-slate-500">
          El motor envía plantillas a las 48h y, si el paciente no confirma, otra a las ~24h
          (ahorro de ventana Meta 23h 45m). También gestiona el seguimiento de inasistencias.
        </p>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-600">
          <li>Plantilla <code className="text-xs">cita_48h</code> — 1 crédito</li>
          <li>
            Plantilla <code className="text-xs">cita_24h</code> — solo si no confirmó (1 crédito)
          </li>
          <li>Inasistencias: máximo 2 intentos automáticos, luego lista manual</li>
        </ul>
      </section>

      <section id="packages" className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Tienda de paquetes prepago</h2>
          <p className="text-sm text-slate-500">
            Pago con Bold · Excluido de IVA. Los créditos se acreditan al confirmar el webhook.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-emerald-700">
              Recordatorios Automáticos
            </h3>
            <p className="text-xs text-slate-500">48h, 24h e inasistencias</p>

            <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h4 className="text-base font-semibold text-slate-900">50 Recordatorios</h4>
              <p className="mt-1 text-2xl font-bold text-emerald-700">$20.000 COP</p>
              <p className="mt-1 text-sm text-slate-500">Cubre aprox. 25 citas agendadas</p>
              <div className="mt-4">
                <WhatsappPackageCheckoutButton packageId="REMINDERS_50" locked={!paid} />
              </div>
            </article>

            <article className="relative rounded-2xl border-2 border-emerald-400 bg-white p-5 shadow-md">
              <span className="absolute -top-2.5 left-4 rounded-full bg-emerald-600 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                Más popular · +25 gratis
              </span>
              <h4 className="mt-1 text-base font-semibold text-slate-900">150 Recordatorios</h4>
              <p className="mt-1 text-2xl font-bold text-emerald-700">$50.000 COP</p>
              <p className="mt-1 text-sm text-slate-500">
                Cubre aprox. 75 citas · Ahorras $10.000
              </p>
              <div className="mt-4">
                <WhatsappPackageCheckoutButton packageId="REMINDERS_150" locked={!paid} />
              </div>
            </article>
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-teal-700">
              Chatbot Inteligente 24/7
            </h3>
            <p className="text-xs text-slate-500">Ventanas de atención de 24 horas</p>

            <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h4 className="text-base font-semibold text-slate-900">200 Sesiones de Chat</h4>
              <p className="mt-1 text-2xl font-bold text-teal-700">$20.000 COP</p>
              <p className="mt-1 text-sm text-slate-500">$100 COP por ventana de atención de 24h</p>
              <div className="mt-4">
                <WhatsappPackageCheckoutButton packageId="CHATBOT_200" locked={!paid} />
              </div>
            </article>

            <article className="relative rounded-2xl border-2 border-teal-400 bg-white p-5 shadow-md">
              <span className="absolute -top-2.5 left-4 rounded-full bg-teal-600 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                Mejor valor · +100 gratis
              </span>
              <h4 className="mt-1 text-base font-semibold text-slate-900">600 Sesiones de Chat</h4>
              <p className="mt-1 text-2xl font-bold text-teal-700">$50.000 COP</p>
              <p className="mt-1 text-sm text-slate-500">$83 COP por ventana · Ahorras $10.000</p>
              <div className="mt-4">
                <WhatsappPackageCheckoutButton packageId="CHATBOT_600" locked={!paid} />
              </div>
            </article>
          </div>
        </div>
      </section>

      <WhatsappNoShowsPanel />
    </div>
  )
}
