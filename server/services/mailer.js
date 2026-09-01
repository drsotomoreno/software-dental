import { config } from '../config.js'

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

export function isMailConfigured() {
  return Boolean(
    config.mail.resendApiKey ||
      config.mail.sendgridApiKey ||
      config.mail.brevoApiKey ||
      (config.smtp.host && config.smtp.user && config.smtp.pass),
  )
}

export function mailTransportLabel() {
  if (config.mail.resendApiKey) return 'resend'
  if (config.mail.sendgridApiKey) return 'sendgrid'
  if (config.mail.brevoApiKey) return 'brevo'
  if (config.smtp.host && config.smtp.user && config.smtp.pass) return 'smtp'
  return 'none'
}

async function sendWithResend({ to, from, subject, html, text }) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.mail.resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to: [to], subject, html, text }),
  })
  if (!response.ok) {
    throw new Error(`Resend ${response.status}: ${await response.text()}`)
  }
}

async function sendWithSendgrid({ to, from, subject, html, text }) {
  const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.mail.sendgridApiKey}`,
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

async function sendWithBrevo({ to, from, subject, html, text }) {
  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': config.mail.brevoApiKey,
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

async function sendWithSmtp({ to, from, subject, html, text }) {
  const { host, port, user, pass } = config.smtp
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
  const from = config.smtp.from
  const payload = { to, from, subject, html, text }

  if (!isMailConfigured()) {
    console.error(
      `[Auth] Correo no configurado. Defina RESEND_API_KEY o SMTP_HOST/SMTP_USER/SMTP_PASS. Destino: ${to}`,
    )
    throw new Error('MAIL_NOT_CONFIGURED')
  }

  const errors = []

  if (config.mail.resendApiKey) {
    try {
      await sendWithResend(payload)
      return { sent: true, via: 'resend' }
    } catch (error) {
      errors.push(error)
      console.error('[Auth] Falló envío con Resend', error)
    }
  }

  if (config.mail.sendgridApiKey) {
    try {
      await sendWithSendgrid(payload)
      return { sent: true, via: 'sendgrid' }
    } catch (error) {
      errors.push(error)
      console.error('[Auth] Falló envío con SendGrid', error)
    }
  }

  if (config.mail.brevoApiKey) {
    try {
      await sendWithBrevo(payload)
      return { sent: true, via: 'brevo' }
    } catch (error) {
      errors.push(error)
      console.error('[Auth] Falló envío con Brevo', error)
    }
  }

  if (config.smtp.host && config.smtp.user && config.smtp.pass) {
    try {
      await sendWithSmtp(payload)
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
