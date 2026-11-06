import QRCode from 'qrcode'
import { clinicSyncAliasIds } from '../../shared/clinicalSyncScope.js'
import {
  resolveSubscriptionSession,
  sessionHintFromRequest,
} from '../services/subscriptionAuthStore.js'
import { signKioskToken } from '../utils/kioskJwt.js'
import { buildKioskLanUrl, resolveKioskLinkTarget } from '../utils/localLanAddress.js'

/** IP de este PC en la Wi-Fi de la clínica. La tableta no puede usar localhost. */
const KIOSK_LAN_IP = '192.168.80.35'
const KIOSK_TOKEN_TTL_SEC = 60 * 60 * 12

function bearerToken(req) {
  const authHeader = req.headers.authorization ?? ''
  return authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null
}

function requestedPort(req) {
  const fromQuery = String(req.query?.port || '').trim()
  if (/^\d{2,5}$/.test(fromQuery)) return fromQuery
  const host = String(req.headers.host || '')
  const match = host.match(/:(\d+)$/)
  if (match) return match[1]
  const local = req.socket?.localPort
  return local ? String(local) : ''
}

/**
 * GET /api/v1/kiosk/lan-link
 * Sesión clínica: arma la URL del kiosco (dominio público o IP de la LAN)
 * e imprime la URL y un QR en la terminal del servidor.
 */
export async function getKioskLanLink(req, res, next) {
  try {
    const session = await resolveSubscriptionSession(bearerToken(req), sessionHintFromRequest(req))
    if (!session?.user) {
      return res.status(401).json({ success: false, error: 'Sesión inválida o expirada.' })
    }

    const { canonical } = clinicSyncAliasIds(session.user)
    if (!canonical) {
      return res.status(400).json({ success: false, error: 'La sesión no tiene clínica asociada.' })
    }

    const token = signKioskToken({ clinicId: canonical, expiresInSec: KIOSK_TOKEN_TTL_SEC })
    const target = resolveKioskLinkTarget(req, { lanIp: KIOSK_LAN_IP, lanPort: requestedPort(req) })
    const url = buildKioskLanUrl({
      ip: target.ip,
      port: target.port || '',
      clinicId: canonical,
      token,
      protocol: target.origin.startsWith('https:') ? 'https:' : 'http:',
    })

    console.log('\n[Kiosco] Enlace para la tableta:')
    console.log(url)
    try {
      const qr = await QRCode.toString(url, { type: 'terminal', small: true, errorCorrectionLevel: 'L' })
      console.log(qr)
    } catch (qrError) {
      console.error('[Kiosco] No se pudo imprimir el QR en la terminal:', qrError?.message || qrError)
    }

    return res.json({
      success: true,
      ip: target.ip,
      port: target.port,
      clinicId: canonical,
      url,
      expiresInSec: KIOSK_TOKEN_TTL_SEC,
    })
  } catch (error) {
    return next(error)
  }
}
