import { config } from '../config.js'
import { loadMailSettings } from './mailSettingsStore.js'

const RESET_SUBJECT = 'Recuperación de contraseña — doctorSEOlabs'

function parseFromAddress(from) {
  const match = String(from).match(/<([^>]+)>/)
  return match ? match[1].trim() : String(from).trim()
}

function mailBody(resetUrl) {
  return {
    text: [
      'Recibimos una solicitud para restablecer su contraseña.',
      '',
      `Abra este enlace (válido 15 minutos): ${resetUrl}`,
      '',
      'Si usted no solicitó este cambio, ignore este mensaje.',
    ].join('\n'),
    html: `
      <p>Recibimos una solicitud para restablecer su contraseña en <strong>doctorSEOlabs</strong>.</p>
      <p><a href="${resetUrl}">Restablecer contraseña</a></p>
      <p>Este enlace caduca en 15 minutos. Si usted no lo solicitó, ignore este mensaje.</p>
    `,
  }
}

const RESEND_FROM = 'Doctor SEO Labs <notificaciones@mihistoriadental.com>'

function logResendError(context, details) {
  const payload = {
    context,
    to: details?.to || null,
    from: details?.from || null,
    statusCode: details?.error?.statusCode || details?.error?.status || null,
    name: details?.error?.name || details?.error?.constructor?.name || null,
    message: details?.error?.message || String(details?.error || ''),
    raw: details?.error,
  }
  console.error('[Auth] Resend error detallado', JSON.stringify(payload, null, 2))
}

export async function getMailRuntime() {
  const stored = await loadMailSettings()
  return {
    resendApiKey: (
      process.env.RESEND_API_KEY ||
      stored.resendApiKey ||
      config.mail.resendApiKey ||
      ''
    ).trim(),
    sendgridApiKey: (process.env.SENDGRID_API_KEY || stored.sendgridApiKey || '').trim(),
    brevoApiKey: (process.env.BREVO_API_KEY || stored.brevoApiKey || '').trim(),
    smtp: {
      host: config.smtp.host,
      port: config.smtp.port,
      user: config.smtp.user,
      pass: config.smtp.pass,
      from: RESEND_FROM,
    },
  }
}

export async function isMailConfigured() {
  const runtime = await getMailRuntime()
  return Boolean(
    runtime.resendApiKey ||
      runtime.sendgridApiKey ||
      runtime.brevoApiKey ||
      (runtime.smtp.host && runtime.smtp.user && runtime.smtp.pass),
  )
}

export async function mailTransportLabel() {
  const runtime = await getMailRuntime()
  if (runtime.resendApiKey) return 'resend'
  if (runtime.brevoApiKey) return 'brevo'
  if (runtime.sendgridApiKey) return 'sendgrid'
  if (runtime.smtp.host && runtime.smtp.user && runtime.smtp.pass) return 'smtp'
  return 'none'
}

async function sendWithResend(runtime, { to, subject, html, text }) {
  const { Resend } = await import('resend')
  const resend = new Resend(runtime.resendApiKey)
  const fromAddress = RESEND_FROM

  try {
    const { data, error } = await resend.emails.send({
      from: fromAddress,
      to: [to],
      subject,
      html,
      text,
    })
    if (!error) {
      console.log('[Auth] Resend envió el correo', JSON.stringify({ to, from: fromAddress, id: data?.id || null }))
      return data
    }
    logResendError('emails.send', { to, from: fromAddress, error })
    const err = new Error(error?.message || JSON.stringify(error) || 'Resend no pudo enviar el correo')
    err.cause = error
    throw err
  } catch (error) {
    if (error?.cause) throw error
    logResendError('emails.send exception', { to, from: fromAddress, error })
    throw error
  }
}

async function sendWithSendgrid(runtime, { to, from, subject, html, text }) {
  const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${runtime.sendgridApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: parseFromAddress(from) },
      subject,
      content: [
        { type: 'text/plain', value: text },
        { type: 'text/html', value: html },
      ],
    }),
  })
  if (!response.ok && response.status !== 202) {
    throw new Error(`SendGrid ${response.status}: ${await response.text()}`)
  }
}

async function sendWithBrevo(runtime, { to, from, subject, html, text }) {
  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': runtime.brevoApiKey,
      accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sender: { email: parseFromAddress(from), name: 'doctorSEOlabs' },
      to: [{ email: to }],
      subject,
      htmlContent: html,
      textContent: text,
    }),
  })
  if (!response.ok) {
    throw new Error(`Brevo ${response.status}: ${await response.text()}`)
  }
}

async function sendWithSmtp(runtime, { to, from, subject, html, text }) {
  const { host, port, user, pass } = runtime.smtp
  const mod = await import('nodemailer')
  const nodemailer = mod.default ?? mod
  const isGmail = /gmail/i.test(host) || /gmail\.com$/i.test(user)
  const transporter = nodemailer.createTransport(
    isGmail
      ? { service: 'gmail', auth: { user, pass } }
      : {
          host,
          port,
          secure: Number(port) === 465,
          requireTLS: Number(port) === 587,
          auth: { user, pass },
          connectionTimeout: 12_000,
          greetingTimeout: 12_000,
          socketTimeout: 12_000,
        },
  )
  await transporter.sendMail({ from, to, subject, text, html })
}

async function sendTransactionalEmail({ to, subject, html, text }) {
  const runtime = await getMailRuntime()
  if (
    !runtime.resendApiKey &&
    !runtime.brevoApiKey &&
    !runtime.sendgridApiKey &&
    !(runtime.smtp.host && runtime.smtp.user && runtime.smtp.pass)
  ) {
    const err = new Error('MAIL_NOT_CONFIGURED')
    throw err
  }
  const from = runtime.smtp.from || config.mail.resendFrom
  const payload = { to, from, subject, html, text }
  const errors = []

  if (runtime.resendApiKey) {
    try {
      await sendWithResend(runtime, payload)
      return { sent: true, via: 'resend' }
    } catch (error) {
      errors.push(error)
      logResendError('sendTransactionalEmail catch', { to, from, error })
    }
  }

  if (runtime.brevoApiKey) {
    try {
      await sendWithBrevo(runtime, payload)
      return { sent: true, via: 'brevo' }
    } catch (error) {
      errors.push(error)
      console.error('[Auth] Falló envío con Brevo', error)
    }
  }

  if (runtime.sendgridApiKey) {
    try {
      await sendWithSendgrid(runtime, payload)
      return { sent: true, via: 'sendgrid' }
    } catch (error) {
      errors.push(error)
      console.error('[Auth] Falló envío con SendGrid', error)
    }
  }

  if (runtime.smtp.host && runtime.smtp.user && runtime.smtp.pass) {
    try {
      await sendWithSmtp(runtime, payload)
      return { sent: true, via: 'smtp' }
    } catch (error) {
      errors.push(error)
      console.error('[Auth] Falló envío SMTP', error)
    }
  }

  console.error(`[Auth] No se pudo entregar el correo a ${to}.`)
  const first = errors[0]
  const err = new Error(first?.message || 'MAIL_SEND_FAILED')
  err.cause = first?.cause || first
  throw err
}

function describeMailError(error) {
  const raw = [
    error?.message,
    error?.cause?.message,
    typeof error?.cause === 'object' ? JSON.stringify(error.cause) : '',
  ]
    .filter(Boolean)
    .join(' ')

  if (/MAIL_NOT_CONFIGURED/i.test(raw)) {
    return 'El servidor no tiene correo configurado. Agregue RESEND_API_KEY en Render o guarde la clave en Perfil → Correo de verificación.'
  }
  if (/invalid.*api key|unauthorized|401/i.test(raw)) {
    return 'La clave de Resend no es válida. Revise RESEND_API_KEY en Render.'
  }
  if (/own email|testing emails/i.test(raw)) {
    return 'Resend en modo prueba solo envía a doctormauriciosoto@gmail.com. Para Yahoo u otros correos hay que verificar mihistoriadental.com en resend.com/domains.'
  }
  if (/verify a domain|not verified|restricted to|add and verify your domain/i.test(raw)) {
    return 'Resend no puede enviar el código hasta verificar mihistoriadental.com. Agregue en Namecheap (Advanced DNS) los registros DKIM y SPF que muestra resend.com/domains.'
  }
  return 'No se pudo enviar el código al correo. Intente de nuevo más tarde.'
}

export { describeMailError }

export async function sendPasswordResetEmail({ to, resetUrl }) {
  const { html, text } = mailBody(resetUrl)
  return sendTransactionalEmail({ to, subject: RESET_SUBJECT, html, text })
}

export async function sendVerificationCodeEmail({ to, code }) {
  return sendTransactionalEmail({
    to,
    subject: 'Código de verificación — doctorSEOlabs',
    text: [
      'Use este código para verificar su correo y crear su cuenta:',
      '',
      code,
      '',
      'El código caduca en 15 minutos. Si usted no solicitó el registro, ignore este mensaje.',
    ].join('\n'),
    html: `
      <p>Use este código para verificar su correo y crear su cuenta en <strong>doctorSEOlabs</strong>:</p>
      <p style="font-size:28px;font-weight:700;letter-spacing:0.24em">${code}</p>
      <p>Caduca en 15 minutos. Si usted no solicitó el registro, ignore este mensaje.</p>
    `,
  })
}
