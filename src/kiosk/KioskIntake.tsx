import { useRef, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { useParams } from 'react-router-dom'
import SignaturePad, { type SignaturePadHandle } from './SignaturePad'

const DOCUMENT_TYPES = [
  { value: 'CC', label: 'Cédula de ciudadanía' },
  { value: 'CE', label: 'Cédula de extranjería' },
  { value: 'TI', label: 'Tarjeta de identidad' },
  { value: 'PA', label: 'Pasaporte' },
  { value: 'RC', label: 'Registro civil' },
  { value: 'NUIP', label: 'NUIP' },
] as const

type YesNo = 'si' | 'no'
type DocumentType = (typeof DOCUMENT_TYPES)[number]['value']

interface KioskIntakeFormValues {
  firstName: string
  lastName: string
  documentType: DocumentType
  documentNumber: string
  phone: string
  allergicToMedication: YesNo | null
  hasHypertension: YesNo | null
  hasDiabetes: YesNo | null
  takesAnticoagulants: YesNo | null
}

const inputClass =
  'mt-2 w-full min-h-14 rounded-xl border-2 border-slate-300 bg-white px-4 text-xl text-slate-900 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100'
const labelClass = 'block text-lg font-medium text-slate-800'
const sectionClass = 'space-y-5'
const yesNoBtnBase =
  'min-h-14 flex-1 rounded-xl border-2 text-xl font-semibold transition-colors active:scale-[0.99]'

function YesNoField({
  label,
  value,
  onChange,
  error,
}: {
  label: string
  value: YesNo | null
  onChange: (v: YesNo) => void
  error?: string
}) {
  return (
    <fieldset>
      <legend className={labelClass}>{label}</legend>
      <div className="mt-3 flex gap-3">
        <button
          type="button"
          className={`${yesNoBtnBase} ${
            value === 'si'
              ? 'border-teal-700 bg-teal-700 text-white'
              : 'border-slate-300 bg-white text-slate-700'
          }`}
          onClick={() => onChange('si')}
        >
          Sí
        </button>
        <button
          type="button"
          className={`${yesNoBtnBase} ${
            value === 'no'
              ? 'border-slate-800 bg-slate-800 text-white'
              : 'border-slate-300 bg-white text-slate-700'
          }`}
          onClick={() => onChange('no')}
        >
          No
        </button>
      </div>
      {error ? <p className="mt-2 text-base text-red-600">{error}</p> : null}
    </fieldset>
  )
}

export interface KioskIntakeSubmitPayload {
  datosBasicos: {
    firstName: string
    lastName: string
    documentType: DocumentType
    documentNumber: string
    phone: string
  }
  anamnesis: {
    allergicToMedication: boolean
    hasHypertension: boolean
    hasDiabetes: boolean
    takesAnticoagulants: boolean
  }
  signatureBase64: string
  clinicId: string | null
}

export interface KioskIntakeProps {
  /** Prefill opcional cuando el profesional envía el registro desde el PC. */
  initialValues?: Partial<KioskIntakeFormValues>
  /** Si se define, no hace POST HTTP: entrega el payload al padre (p. ej. Socket.IO). */
  onRemoteSubmit?: (payload: KioskIntakeSubmitPayload) => Promise<void>
  successMessage?: string
  /** Tras éxito, avisa al padre (p. ej. volver a IDLE). */
  onSuccessComplete?: () => void
  /** ms antes de onSuccessComplete. 0 = no auto-reset. */
  successHoldMs?: number
  submitLabel?: string
}

/**
 * Intake del paciente en tableta. Sin Dexie ni Auth del sistema clínico.
 */
export default function KioskIntake({
  initialValues,
  onRemoteSubmit,
  successMessage = 'Registro exitoso. Por favor devuelva la tableta a su odontólogo o auxiliar.',
  onSuccessComplete,
  successHoldMs = 0,
  submitLabel = 'Firmar y Enviar',
}: KioskIntakeProps = {}) {
  const { clinicId, token } = useParams<{ clinicId: string; token: string }>()
  const signatureRef = useRef<SignaturePadHandle>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [signatureError, setSignatureError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<KioskIntakeFormValues>({
    defaultValues: {
      firstName: initialValues?.firstName ?? '',
      lastName: initialValues?.lastName ?? '',
      documentType: initialValues?.documentType ?? 'CC',
      documentNumber: initialValues?.documentNumber ?? '',
      phone: initialValues?.phone ?? '',
      allergicToMedication: initialValues?.allergicToMedication ?? null,
      hasHypertension: initialValues?.hasHypertension ?? null,
      hasDiabetes: initialValues?.hasDiabetes ?? null,
      takesAnticoagulants: initialValues?.takesAnticoagulants ?? null,
    },
  })

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null)
    setSignatureError(null)

    const signatureBase64 = signatureRef.current?.toDataURL() ?? null
    if (!signatureBase64) {
      setSignatureError('Por favor firme en el recuadro antes de continuar.')
      return
    }

    if (!onRemoteSubmit && !token) {
      setSubmitError('Enlace de kiosco inválido. Solicite uno nuevo en recepción.')
      return
    }

    const payload: KioskIntakeSubmitPayload = {
      datosBasicos: {
        firstName: values.firstName.trim(),
        lastName: values.lastName.trim(),
        documentType: values.documentType,
        documentNumber: values.documentNumber.trim(),
        phone: values.phone.trim(),
      },
      anamnesis: {
        allergicToMedication: values.allergicToMedication === 'si',
        hasHypertension: values.hasHypertension === 'si',
        hasDiabetes: values.hasDiabetes === 'si',
        takesAnticoagulants: values.takesAnticoagulants === 'si',
      },
      signatureBase64,
      // clinicId lo impone el JWT; se envía solo como referencia de UI.
      clinicId: clinicId ?? null,
    }

    try {
      if (onRemoteSubmit) {
        await onRemoteSubmit(payload)
        setSuccess(true)
        if (successHoldMs > 0 && onSuccessComplete) {
          window.setTimeout(() => onSuccessComplete(), successHoldMs)
        }
        return
      }

      const response = await fetch('/api/v1/kiosk/intake', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      })

      if (response.status === 200 || response.status === 201) {
        setSuccess(true)
        if (successHoldMs > 0 && onSuccessComplete) {
          window.setTimeout(() => onSuccessComplete(), successHoldMs)
        }
        return
      }

      let message = 'No se pudo guardar el registro. Intente de nuevo.'
      try {
        const data = (await response.json()) as { error?: string; message?: string }
        message = data.error || data.message || message
      } catch {
        /* respuesta no JSON */
      }
      setSubmitError(message)
    } catch {
      setSubmitError('Sin conexión. Verifique la red e intente otra vez.')
    }
  })

  if (success) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-teal-50 px-6 text-center">
        <div className="max-w-xl space-y-4">
          <p className="text-5xl font-semibold text-teal-800" aria-hidden>
            ✓
          </p>
          <h1 className="text-3xl font-semibold leading-snug text-slate-900 sm:text-4xl">
            {successMessage}
          </h1>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-[100dvh] bg-slate-50 text-slate-900">
      <form
        onSubmit={onSubmit}
        className="mx-auto flex min-h-[100dvh] w-full max-w-3xl flex-col px-5 py-8 sm:px-8"
      >
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
          Sus datos
        </h1>
        <p className="mt-2 text-lg text-slate-600">
          Complete la información y firme al final. Campos marcados con * son obligatorios.
        </p>

        <div className="mt-8 flex-1 space-y-10">
          <section className={sectionClass} aria-labelledby="kiosk-datos">
            <h2 id="kiosk-datos" className="text-2xl font-semibold text-slate-900">
              Datos básicos
            </h2>

            <div>
              <label htmlFor="firstName" className={labelClass}>
                Nombres *
              </label>
              <input
                id="firstName"
                autoComplete="given-name"
                className={inputClass}
                {...register('firstName', {
                  required: 'Ingrese sus nombres',
                  minLength: { value: 2, message: 'Mínimo 2 caracteres' },
                })}
              />
              {errors.firstName ? (
                <p className="mt-2 text-base text-red-600">{errors.firstName.message}</p>
              ) : null}
            </div>

            <div>
              <label htmlFor="lastName" className={labelClass}>
                Apellidos *
              </label>
              <input
                id="lastName"
                autoComplete="family-name"
                className={inputClass}
                {...register('lastName', {
                  required: 'Ingrese sus apellidos',
                  minLength: { value: 2, message: 'Mínimo 2 caracteres' },
                })}
              />
              {errors.lastName ? (
                <p className="mt-2 text-base text-red-600">{errors.lastName.message}</p>
              ) : null}
            </div>

            <div>
              <label htmlFor="documentType" className={labelClass}>
                Tipo de documento *
              </label>
              <select
                id="documentType"
                className={inputClass}
                {...register('documentType', { required: true })}
              >
                {DOCUMENT_TYPES.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="documentNumber" className={labelClass}>
                Número de documento *
              </label>
              <input
                id="documentNumber"
                inputMode="numeric"
                autoComplete="off"
                className={inputClass}
                {...register('documentNumber', {
                  required: 'Ingrese el número de documento',
                  minLength: { value: 5, message: 'Documento demasiado corto' },
                })}
              />
              {errors.documentNumber ? (
                <p className="mt-2 text-base text-red-600">{errors.documentNumber.message}</p>
              ) : null}
            </div>

            <div>
              <label htmlFor="phone" className={labelClass}>
                Teléfono *
              </label>
              <input
                id="phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                className={inputClass}
                {...register('phone', {
                  required: 'Ingrese un teléfono de contacto',
                  minLength: { value: 7, message: 'Teléfono inválido' },
                })}
              />
              {errors.phone ? (
                <p className="mt-2 text-base text-red-600">{errors.phone.message}</p>
              ) : null}
            </div>
          </section>

          <section className={sectionClass} aria-labelledby="kiosk-anamnesis">
            <h2 id="kiosk-anamnesis" className="text-2xl font-semibold text-slate-900">
              Anamnesis rápida
            </h2>

            <Controller
              name="allergicToMedication"
              control={control}
              rules={{ required: 'Seleccione Sí o No' }}
              render={({ field }) => (
                <YesNoField
                  label="¿Es alérgico a algún medicamento? *"
                  value={field.value}
                  onChange={field.onChange}
                  error={errors.allergicToMedication?.message}
                />
              )}
            />

            <Controller
              name="hasHypertension"
              control={control}
              rules={{ required: 'Seleccione Sí o No' }}
              render={({ field }) => (
                <YesNoField
                  label="¿Sufre de hipertensión? *"
                  value={field.value}
                  onChange={field.onChange}
                  error={errors.hasHypertension?.message}
                />
              )}
            />

            <Controller
              name="hasDiabetes"
              control={control}
              rules={{ required: 'Seleccione Sí o No' }}
              render={({ field }) => (
                <YesNoField
                  label="¿Es diabético(a)? *"
                  value={field.value}
                  onChange={field.onChange}
                  error={errors.hasDiabetes?.message}
                />
              )}
            />

            <Controller
              name="takesAnticoagulants"
              control={control}
              rules={{ required: 'Seleccione Sí o No' }}
              render={({ field }) => (
                <YesNoField
                  label="¿Toma anticoagulantes? *"
                  value={field.value}
                  onChange={field.onChange}
                  error={errors.takesAnticoagulants?.message}
                />
              )}
            />
          </section>

          <section className="space-y-3" aria-labelledby="kiosk-firma">
            <h2 id="kiosk-firma" className="text-2xl font-semibold text-slate-900">
              Firma *
            </h2>
            <p className="text-lg text-slate-600">
              Firme con el dedo dentro del recuadro para autorizar el registro.
            </p>
            <SignaturePad ref={signatureRef} height={240} />
            {signatureError ? (
              <p className="text-base text-red-600" role="alert">
                {signatureError}
              </p>
            ) : null}
          </section>
        </div>

        {submitError ? (
          <p
            className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-lg text-red-700"
            role="alert"
          >
            {submitError}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={isSubmitting}
          className="mt-8 min-h-16 w-full rounded-2xl bg-teal-700 text-2xl font-semibold text-white shadow-sm transition enabled:active:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? 'Guardando…' : submitLabel}
        </button>
      </form>
    </div>
  )
}
