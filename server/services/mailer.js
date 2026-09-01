import nodemailer from 'nodemailer'
import { config } from '../config.js'

export async function sendPasswordResetEmail({ to, resetUrl }) {
  const { host, port, user, pass, from } = config.smtp

  if (!host) {
    console.log(`[Auth] SMTP no configurado. Enlace de recuperación para ${to}: ${resetUrl}`)
    return { sent: false, logged: true }
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: Number(port) === 465,
    auth: user && pass ? { user, pass } : undefined,
  })

  await transporter.sendMail({
    from,
    to,
    subject: 'Recuperación de contraseña — doctorSEOlabs',
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
  })

  return { sent: true, logged: false }
}
