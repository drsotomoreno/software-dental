import { networkInterfaces } from 'node:os'

const PRIVATE_V4 =
  /^(192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3})$/

function isIpv4(net) {
  return net?.family === 'IPv4' || net?.family === 4
}

/** Primera IPv4 de la LAN (prioriza 192.168 / 10 / 172.16–31). */
export function getLocalLanIPv4() {
  const addresses = []
  for (const entries of Object.values(networkInterfaces())) {
    for (const net of entries || []) {
      if (!isIpv4(net) || net.internal) continue
      addresses.push(net.address)
    }
  }
  return addresses.find((ip) => PRIVATE_V4.test(ip)) || addresses[0] || ''
}

export function isPrivateLanHostname(hostname) {
  const host = String(hostname || '').trim().toLowerCase()
  return host === 'localhost' || host === '127.0.0.1' || PRIVATE_V4.test(host)
}

/** Origen http(s) de localhost o de una IP privada, para la tableta en la misma Wi-Fi. */
export function isPrivateLanOrigin(origin) {
  try {
    const url = new URL(origin)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false
    return isPrivateLanHostname(url.hostname)
  } catch {
    return false
  }
}

export function buildKioskLanUrl({ ip, port, clinicId, token, protocol = 'http:' }) {
  const host = port ? `${ip}:${port}` : ip
  return `${protocol}//${host}/kiosco/${encodeURIComponent(clinicId)}/${encodeURIComponent(token)}`
}
