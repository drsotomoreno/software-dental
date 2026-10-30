/**
 * Tableta esclava — Modo Kiosco.
 * Seguridad: cero importaciones de @/db/*, Dexie.js o Auth clínico.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import SignaturePad, { type SignaturePadHandle } from './SignaturePad'
import KioskIntake from './KioskIntake'
import {
  connectKioskSocket,
  emitKioskCancelled,
  onKioskTrigger,
  submitKioskSignature,
  type KioskSocket,
} from './kioskSocketClient'
import type {
  KioskScreenState,
  KioskTriggerEvent,
  KioskTriggerPayload,
} from './kioskTypes'
import { useKioskWakeLock } from './useKioskWakeLock'

const SUCCESS_HOLD_MS = 3000
/** Sin interacción tras recibir una acción → alerta «¿Sigue ahí?» */
const INACTIVITY_MS = 5 * 60 * 1000
/** Si no responde la alerta, cancela y vuelve a IDLE. */
const STILL_THERE_GRACE_MS = 60 * 1000

function screenForAction(actionType: string): KioskScreenState {
  if (actionType === 'INTAKE') return 'SHOW_INTAKE'
  if (actionType === 'EVOLUTION') return 'SHOW_EVOLUTION'
  if (actionType === 'CONSENT') return 'SHOW_CONSENT'
  return 'IDLE'
}

function isActiveFormScreen(screen: KioskScreenState) {
  return screen === 'SHOW_INTAKE' || screen === 'SHOW_EVOLUTION' || screen === 'SHOW_CONSENT'
}

function ConnectionBadge({
  connected,
  reconnecting,
  variant = 'dark',
}: {
  connected: boolean
  reconnecting: boolean
  variant?: 'dark' | 'light'
}) {
  const dark = variant === 'dark'
  if (connected && !reconnecting) {
    return (
      <div
        className={`pointer-events-none absolute right-3 top-3 z-20 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium shadow-sm backdrop-blur ${
          dark ? 'bg-black/35 text-emerald-100' : 'bg-white/90 text-emerald-800 border border-emerald-200'
        }`}
        role="status"
      >
        <span className="h-2 w-2 rounded-full bg-emerald-400" aria-hidden />
        Conectado a la clínica
      </div>
    )
  }

  return (
    <div
      className={`pointer-events-none absolute right-3 top-3 z-20 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium shadow-sm backdrop-blur ${
        dark
          ? 'animate-pulse bg-black/40 text-amber-100'
          : 'animate-pulse bg-amber-50 text-amber-900 border border-amber-300'
      }`}
      role="status"
    >
      <span
        className={`h-2 w-2 rounded-full ${reconnecting ? 'bg-amber-400' : 'bg-rose-500'} animate-pulse`}
        aria-hidden
      />
      Reconectando con el servidor…
    </div>
  )
}

function IdleScreen({ clinicName }: { clinicName: string }) {
  return (
    <div className="relative flex min-h-[100dvh] flex-col items-center justify-center overflow-hidden bg-gradient-to-b from-slate-900 via-teal-950 to-slate-900 px-6 text-center">
      <div
        className="pointer-events-none absolute inset-0 opacity-30"
        style={{
          backgroundImage:
            'radial-gradient(circle at 20% 20%, rgba(45,212,191,0.25), transparent 40%), radial-gradient(circle at 80% 70%, rgba(14,165,233,0.2), transparent 45%)',
        }}
      />
      <div className="relative z-10 max-w-xl space-y-5">
        <p className="text-sm font-semibold uppercase tracking-[0.28em] text-teal-200/90">
          Mi Historia Dental
        </p>
        <h1 className="font-serif text-4xl font-semibold tracking-tight text-white sm:text-5xl">
          {clinicName || 'Clínica dental'}
        </h1>
        <p className="text-lg text-teal-50/85 sm:text-xl">
          Esperando indicación del profesional…
        </p>
        <div className="mx-auto mt-6 h-1.5 w-24 animate-pulse rounded-full bg-teal-300/70" />
      </div>
    </div>
  )
}

function SuccessScreen() {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-teal-50 px-6 text-center">
      <div className="max-w-xl space-y-4">
        <p className="text-5xl font-semibold text-teal-800" aria-hidden>
          ✓
        </p>
        <h1 className="text-3xl font-semibold leading-snug text-slate-900 sm:text-4xl">
          Firma registrada con éxito
        </h1>
        <p className="text-lg text-slate-600">Devolviendo la tableta al modo espera…</p>
      </div>
    </div>
  )
}

function StillThereModal({
  onStay,
}: {
  onStay: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 px-5 backdrop-blur-[2px]"
      role="alertdialog"
      aria-labelledby="kiosk-still-there-title"
      aria-describedby="kiosk-still-there-desc"
    >
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-xl">
        <h2 id="kiosk-still-there-title" className="text-2xl font-semibold text-slate-900">
          ¿Sigue ahí?
        </h2>
        <p id="kiosk-still-there-desc" className="mt-3 text-base text-slate-600">
          No hemos detectado actividad. Toque el botón para continuar firmando, o la tableta
          volverá sola a la pantalla de espera.
        </p>
        <button
          type="button"
          className="mt-6 min-h-14 w-full rounded-xl bg-teal-700 text-lg font-semibold text-white"
          onClick={onStay}
        >
          Sí, sigo aquí
        </button>
      </div>
    </div>
  )
}

function DocumentSignScreen({
  title,
  contentText,
  showAcceptBoxes,
  busy,
  error,
  onActivity,
  onSubmit,
}: {
  title: string
  contentText: string
  showAcceptBoxes: boolean
  busy: boolean
  error: string | null
  onActivity: () => void
  onSubmit: (signatureBase64: string, accepted: boolean) => void
}) {
  const signatureRef = useRef<SignaturePadHandle>(null)
  const [acceptedText, setAcceptedText] = useState(false)
  const [acceptedPrivacy, setAcceptedPrivacy] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

  const canSign = !showAcceptBoxes || (acceptedText && acceptedPrivacy)

  return (
    <div
      className="mx-auto flex min-h-[100dvh] w-full max-w-3xl flex-col px-5 py-8 sm:px-8"
      onPointerDown={onActivity}
      onKeyDown={onActivity}
    >
      <header className="mb-6">
        <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">
          Mi Historia Dental
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
          {title || 'Documento para firmar'}
        </h1>
      </header>

      <article className="mb-6 max-h-[40vh] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm">
        <pre className="whitespace-pre-wrap font-sans text-base leading-relaxed text-slate-800">
          {contentText || 'Sin contenido.'}
        </pre>
      </article>

      {showAcceptBoxes ? (
        <div className="mb-6 space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <label className="flex items-start gap-3 text-base text-slate-800">
            <input
              type="checkbox"
              className="mt-1 h-5 w-5"
              checked={acceptedText}
              onChange={(event) => {
                onActivity()
                setAcceptedText(event.target.checked)
              }}
            />
            <span>He leído y acepto el texto del consentimiento informado.</span>
          </label>
          <label className="flex items-start gap-3 text-base text-slate-800">
            <input
              type="checkbox"
              className="mt-1 h-5 w-5"
              checked={acceptedPrivacy}
              onChange={(event) => {
                onActivity()
                setAcceptedPrivacy(event.target.checked)
              }}
            />
            <span>Autorizo el tratamiento de mis datos personales con fines clínicos.</span>
          </label>
        </div>
      ) : null}

      <div className="mb-4" onPointerDown={onActivity}>
        <p className="mb-2 text-lg font-medium text-slate-800">Firma del paciente</p>
        <SignaturePad ref={signatureRef} height={220} />
      </div>

      {(localError || error) && (
        <p role="alert" className="mb-3 text-base text-red-600">
          {localError || error}
        </p>
      )}

      <button
        type="button"
        disabled={busy || !canSign}
        className="mt-auto min-h-14 w-full rounded-xl bg-teal-700 text-xl font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
        onClick={() => {
          onActivity()
          setLocalError(null)
          if (showAcceptBoxes && !canSign) {
            setLocalError('Marque las casillas de aceptación antes de firmar.')
            return
          }
          const signatureBase64 = signatureRef.current?.toDataURL() ?? null
          if (!signatureBase64) {
            setLocalError('Por favor firme en el recuadro antes de continuar.')
            return
          }
          onSubmit(signatureBase64, canSign)
        }}
      >
        {busy ? 'Enviando…' : 'Firmar y Enviar'}
      </button>
    </div>
  )
}

/**
 * Pantalla principal de la tableta esclava: IDLE hasta que el PC dispara una acción.
 */
export default function KioskApp() {
  const { clinicId, token } = useParams<{ clinicId: string; token: string }>()
  const [searchParams] = useSearchParams()
  const clinicNameParam = searchParams.get('clinicName') || ''

  useKioskWakeLock(true)

  const [screen, setScreen] = useState<KioskScreenState>('IDLE')
  const [clinicName, setClinicName] = useState(clinicNameParam)
  const [connected, setConnected] = useState(false)
  const [reconnecting, setReconnecting] = useState(false)
  const [socketError, setSocketError] = useState<string | null>(null)
  const [active, setActive] = useState<KioskTriggerEvent | null>(null)
  const [busy, setBusy] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [stillThereOpen, setStillThereOpen] = useState(false)
  const socketRef = useRef<KioskSocket | null>(null)
  const screenRef = useRef<KioskScreenState>('IDLE')
  const activeRef = useRef<KioskTriggerEvent | null>(null)
  const inactivityTimerRef = useRef<number | null>(null)
  const stillThereTimerRef = useRef<number | null>(null)

  screenRef.current = screen
  activeRef.current = active

  const intakeDefaults = useMemo(() => {
    const form = (active?.payload?.formData || {}) as Record<string, unknown>
    const datos = (form.datosBasicos || form) as Record<string, unknown>
    return {
      firstName: String(datos.firstName || ''),
      lastName: String(datos.lastName || ''),
      documentType: (String(datos.documentType || 'CC') as 'CC') || 'CC',
      documentNumber: String(datos.documentNumber || ''),
      phone: String(datos.phone || ''),
    }
  }, [active])

  const clearInactivityTimers = useCallback(() => {
    if (inactivityTimerRef.current != null) {
      window.clearTimeout(inactivityTimerRef.current)
      inactivityTimerRef.current = null
    }
    if (stillThereTimerRef.current != null) {
      window.clearTimeout(stillThereTimerRef.current)
      stillThereTimerRef.current = null
    }
  }, [])

  const goIdle = useCallback(() => {
    clearInactivityTimers()
    setStillThereOpen(false)
    setScreen('IDLE')
    setActive(null)
    setBusy(false)
    setSubmitError(null)
  }, [clearInactivityTimers])

  const cancelForInactivity = useCallback(() => {
    const action = activeRef.current
    const socket = socketRef.current
    if (action && socket) {
      emitKioskCancelled(socket, {
        actionType: action.actionType,
        documentId: action.payload?.documentId,
        patientId: action.payload?.patientId,
        reason: 'inactivity',
      })
    }
    goIdle()
  }, [goIdle])

  const armStillThereGrace = useCallback(() => {
    if (stillThereTimerRef.current != null) {
      window.clearTimeout(stillThereTimerRef.current)
    }
    stillThereTimerRef.current = window.setTimeout(() => {
      cancelForInactivity()
    }, STILL_THERE_GRACE_MS)
  }, [cancelForInactivity])

  const bumpActivity = useCallback(() => {
    if (!isActiveFormScreen(screenRef.current)) return
    setStillThereOpen(false)
    if (stillThereTimerRef.current != null) {
      window.clearTimeout(stillThereTimerRef.current)
      stillThereTimerRef.current = null
    }
    if (inactivityTimerRef.current != null) {
      window.clearTimeout(inactivityTimerRef.current)
    }
    inactivityTimerRef.current = window.setTimeout(() => {
      if (!isActiveFormScreen(screenRef.current)) return
      setStillThereOpen(true)
      armStillThereGrace()
    }, INACTIVITY_MS)
  }, [armStillThereGrace])

  useEffect(() => {
    if (!token) {
      setSocketError('Enlace de kiosco inválido.')
      return
    }

    const socket = connectKioskSocket({
      token,
      clinicName: clinicNameParam || undefined,
    })
    socketRef.current = socket

    const onConnect = () => {
      setConnected(true)
      setReconnecting(false)
      setSocketError(null)
    }
    const onDisconnect = () => {
      // No tocamos screen/active: el formulario y la firma quedan en memoria.
      setConnected(false)
      setReconnecting(true)
    }
    const onReconnectAttempt = () => {
      setReconnecting(true)
      setConnected(false)
    }
    const onReady = (payload: { clinicName?: string | null }) => {
      if (payload?.clinicName) setClinicName(payload.clinicName)
    }
    const onError = (error: Error) => {
      setReconnecting(true)
      setConnected(false)
      setSocketError(error.message || 'No se pudo conectar al servidor.')
    }

    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)
    socket.on('reconnect_attempt', onReconnectAttempt)
    socket.on('kiosk:ready', onReady)
    socket.on('connect_error', onError)

    const stopTrigger = onKioskTrigger(socket, (event) => {
      setSubmitError(null)
      setStillThereOpen(false)
      setActive(event)
      setScreen(screenForAction(event.actionType))
    })

    return () => {
      stopTrigger()
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
      socket.off('reconnect_attempt', onReconnectAttempt)
      socket.off('kiosk:ready', onReady)
      socket.off('connect_error', onError)
      socket.disconnect()
      socketRef.current = null
    }
  }, [clinicNameParam, token])

  // Armar / limpiar el timer de inactividad al entrar o salir de un formulario.
  useEffect(() => {
    if (isActiveFormScreen(screen)) {
      bumpActivity()
      return
    }
    clearInactivityTimers()
    setStillThereOpen(false)
  }, [screen, bumpActivity, clearInactivityTimers])

  useEffect(() => () => clearInactivityTimers(), [clearInactivityTimers])

  const markSuccessThenIdle = () => {
    clearInactivityTimers()
    setStillThereOpen(false)
    setScreen('SUCCESS')
    window.setTimeout(() => goIdle(), SUCCESS_HOLD_MS)
  }

  const persistSignature = async (input: {
    signatureBase64: string
    formData?: Record<string, unknown>
  }) => {
    const socket = socketRef.current
    const action = active
    if (!socket || !action) {
      throw new Error('La tableta no está conectada. Espere un momento e intente de nuevo.')
    }
    const payload: KioskTriggerPayload = action.payload || {}
    const result = await submitKioskSignature(socket, {
      documentType: action.actionType,
      documentId: payload.documentId,
      patientId: payload.patientId,
      title: payload.title,
      contentText: payload.contentText,
      signatureBase64: input.signatureBase64,
      formData: input.formData,
    })
    if (!result.ok) {
      throw new Error(result.message || 'No se pudo registrar la firma.')
    }
  }

  if (!token || !clinicId) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-rose-50 px-6 text-center text-rose-800">
        Enlace de kiosco inválido. Solicite uno nuevo en recepción.
      </div>
    )
  }

  const connectionBadge = (
    <ConnectionBadge
      connected={connected}
      reconnecting={reconnecting || !connected}
      variant={screen === 'IDLE' ? 'dark' : 'light'}
    />
  )

  const stillThereOverlay = stillThereOpen ? (
    <StillThereModal
      onStay={() => {
        bumpActivity()
      }}
    />
  ) : null

  if (screen === 'SUCCESS') {
    return (
      <div className="relative">
        {connectionBadge}
        <SuccessScreen />
      </div>
    )
  }

  if (screen === 'SHOW_INTAKE') {
    return (
      <div
        className="relative"
        onPointerDown={bumpActivity}
        onKeyDown={bumpActivity}
      >
        {connectionBadge}
        {stillThereOverlay}
        <KioskIntake
          initialValues={intakeDefaults}
          successMessage="Firma registrada con éxito"
          successHoldMs={SUCCESS_HOLD_MS}
          onSuccessComplete={goIdle}
          submitLabel="Firmar y Enviar"
          onRemoteSubmit={async (payload) => {
            bumpActivity()
            await persistSignature({
              signatureBase64: payload.signatureBase64,
              formData: {
                datosBasicos: payload.datosBasicos,
                anamnesis: payload.anamnesis,
              },
            })
          }}
        />
      </div>
    )
  }

  if (screen === 'SHOW_EVOLUTION' || screen === 'SHOW_CONSENT') {
    return (
      <div className="relative">
        {connectionBadge}
        {stillThereOverlay}
        <DocumentSignScreen
          title={
            active?.payload?.title ||
            (screen === 'SHOW_CONSENT' ? 'Consentimiento informado' : 'Nota de evolución')
          }
          contentText={active?.payload?.contentText || ''}
          showAcceptBoxes={screen === 'SHOW_CONSENT'}
          busy={busy}
          error={submitError}
          onActivity={bumpActivity}
          onSubmit={(signatureBase64, accepted) => {
            setBusy(true)
            setSubmitError(null)
            void persistSignature({
              signatureBase64,
              formData: {
                ...(active?.payload?.formData || {}),
                accepted,
              },
            })
              .then(() => markSuccessThenIdle())
              .catch((error: unknown) => {
                setBusy(false)
                setSubmitError(
                  error instanceof Error ? error.message : 'No se pudo registrar la firma.',
                )
              })
          }}
        />
      </div>
    )
  }

  return (
    <div className="relative">
      {connectionBadge}
      <IdleScreen clinicName={clinicName || decodeURIComponent(clinicId)} />
      {socketError && !reconnecting ? (
        <div className="pointer-events-none absolute bottom-4 left-0 right-0 text-center text-xs text-rose-200/90">
          {socketError}
        </div>
      ) : null}
    </div>
  )
}
