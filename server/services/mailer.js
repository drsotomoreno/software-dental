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

export async function getMailRuntime() {
  const stored = await loadMailSettings()
  return {
    resendApiKey: (process.env.RESEND_API_KEY || stored.resendApiKey || '').trim(),
    sendgridApiKey: (process.env.SENDGRID_API_KEY || stored.sendgridApiKey || '').trim(),
    brevoApiKey: (process.env.BREVO_API_KEY || stored.brevoApiKey || '').trim(),
    smtp: {
      host: config.smtp.host,
      port: config.smtp.port,
      user: config.smtp.user,
      pass: config.smtp.pass,
      from: (process.env.MAIL_FROM || stored.from || config.smtp.from).trim(),
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
  if (runtime.brevoApiKey) return 'brevo'
  if (runtime.resendApiKey) return 'resend'
  if (runtime.sendgridApiKey) return 'sendgrid'
  if (runtime.smtp.host && runtime.smtp.user && runtime.smtp.pass) return 'smtp'
  return 'none'
}

async function sendWithResend(runtime, { to, from, subject, html, text }) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${runtime.resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to: [to], subject, html, text }),
  })
  if (!response.ok) {
    throw new Error(`Resend ${response.status}: ${await response.text()}`)
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
  const from = runtime.smtp.from
  const payload = { to, from, subject, html, text }

  const configured = Boolean(
    runtime.resendApiKey ||
      runtime.sendgridApiKey ||
      runtime.brevoApiKey ||
      (runtime.smtp.host && runtime.smtp.user && runtime.smtp.pass),
  )

  if (!configured) {
    console.error(`[Auth] Correo no configurado. Destino: ${to}`)
    throw new Error('MAIL_NOT_CONFIGURED')
  }

  const errors = []

  if (runtime.brevoApiKey) {
    try {
      await sendWithBrevo(runtime, payload)
      return { sent: true, via: 'brevo' }
    } catch (error) {
      errors.push(error)
      console.error('[Auth] Falló envío con Brevo', error)
    }
  }

  if (runtime.resendApiKey) {
    try {
      await sendWithResend(runtime, payload)
      return { sent: true, via: 'resend' }
    } catch (error) {
      errors.push(error)
      console.error('[Auth] Falló envío con Resend', error)
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
  const err = new Error('MAIL_SEND_FAILED')
  err.cause = errors[0]
  throw err
}

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
