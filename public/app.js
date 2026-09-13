;(function () {
  'use strict'

  const LOG = '[doctorSEO Auth]'
  const TOKEN_KEY = 'doctorSEO_token'
  const USER_KEY = 'doctorSEO_user'
  const ROLE_KEY = 'doctorSEO_rol'
  const LEGACY_TOKEN_KEY = 'doctorseolabs_api_token'
  const LEGACY_USER_KEY = 'doctorseolabs_api_user'
  const MASTER_EMAIL = 'doctormauriciosoto@gmail.com'
  const MASTER_PASSWORD = 'Dragon1976%'

  let pendingPaymentEmail = ''

  const modal = document.getElementById('modal-auth-container')
  const loginView = document.getElementById('auth-view-login')
  const registerView = document.getElementById('auth-view-register')
  const paymentView = document.getElementById('auth-view-payment')
  const messageBox = document.getElementById('auth-message')
  const loginForm = document.getElementById('loginForm')
  const registerForm = document.getElementById('registerForm')
  const loginEmail = document.getElementById('loginEmail')
  const loginPassword = document.getElementById('loginPassword')
  const registerNombre = document.getElementById('registerNombre')
  const registerEmail = document.getElementById('registerEmail')
  const registerPassword = document.getElementById('registerPassword')
  const payButton = document.getElementById('auth-pay-button')
  const appRoot = document.getElementById('root')

  function log(...args) {
    console.log(LOG, ...args)
  }

  function logError(...args) {
    console.error(LOG, ...args)
  }

  function isMasterCredentials(email, password) {
    return (
      String(email || '').trim().toLowerCase() === MASTER_EMAIL &&
      String(password) === MASTER_PASSWORD
    )
  }

  function grantMasterSession(token) {
    const sessionToken = token || 'superadmin-local-' + Date.now()
    const user = {
      id: 'superadmin-session',
      nombre: 'Dr. Mauricio Soto',
      email: MASTER_EMAIL,
      rol: 'superadmin',
      estado_pago: 'exento',
      fecha_vencimiento: null,
    }
    storeAuth(sessionToken, user)
    return { token: sessionToken, user }
  }

  function isSuperAdminUser(user) {
    if (!user) return localStorage.getItem(ROLE_KEY) === 'superadmin'
    const email = String(user.email || '').trim().toLowerCase()
    const rol = String(user.rol || '').trim().toLowerCase()
    return (
      email === MASTER_EMAIL ||
      rol === 'superadmin' ||
      user.estado_pago === 'exento' ||
      localStorage.getItem(ROLE_KEY) === 'superadmin'
    )
  }

  function getApiBase() {
    const port = window.location.port
    if (port === '5173' || port === '5174' || port === '4173' || port === '3000' || port === '') return ''
    return 'http://localhost:3000'
  }

  function isViteDev() {
    const port = window.location.port
    return port === '5173' || port === '5174' || port === '4173'
  }

  function isPublicPath() {
    const path = window.location.pathname.replace(/\/+$/, '') || '/'
    return path === '/' || path === '/login' || path === '/forgot-password' || path === '/reset-password'
  }

  async function apiFetch(path, options) {
    const method = String(options?.method || 'GET').toUpperCase()
    if (method === 'DELETE' && /\/api\/invoices(\/|$)/.test(path)) {
      return {
        response: { status: 403, ok: false },
        payload: {
          success: false,
          error:
            'Por disposición tributaria de la DIAN y normatividad en salud, las facturas electrónicas emitidas no se pueden eliminar de la base de datos.',
        },
        url: path,
      }
    }

    const bases = [getApiBase(), 'http://localhost:3000', '']
    let lastError = null

    for (const base of bases) {
      const url = base ? base + path : path
      log('fetch →', url, options?.method || 'GET')
      try {
        const response = await fetch(url, options)
        const payload = await response.json().catch(function () {
          return { success: false, error: 'Respuesta JSON inválida del servidor.' }
        })
        log('respuesta ←', url, response.status, payload)
        return { response, payload, url }
      } catch (error) {
        lastError = error
        logError('fetch error en', url, error)
      }
    }

    throw lastError || new Error('No se pudo conectar con el servidor API.')
  }

  const PULL_CACHE_DB = 'ClinicSyncPullCache'
  const PULL_CACHE_STORE = 'snapshots'
  let clinicPullInFlight = null

  function tenantIdOfUser(user) {
    return String(user?.clinicId || user?.id || '').trim()
  }

  function payloadOfSyncRecord(record) {
    if (!record || typeof record !== 'object') return {}
    if (record.payload && typeof record.payload === 'object') return record.payload
    return record
  }

  function recordHasBlob(record) {
    const payload = payloadOfSyncRecord(record)
    return Boolean(payload.dataBase64 || record.dataBase64)
  }

  function cacheClinicPullSnapshot(payload) {
    return new Promise(function (resolve) {
      try {
        const req = indexedDB.open(PULL_CACHE_DB, 1)
        req.onupgradeneeded = function () {
          if (!req.result.objectStoreNames.contains(PULL_CACHE_STORE)) {
            req.result.createObjectStore(PULL_CACHE_STORE)
          }
        }
        req.onerror = function () {
          resolve(false)
        }
        req.onsuccess = function () {
          const db = req.result
          const tx = db.transaction(PULL_CACHE_STORE, 'readwrite')
          tx.objectStore(PULL_CACHE_STORE).put(payload, 'latest')
          tx.oncomplete = function () {
            db.close()
            resolve(true)
          }
          tx.onerror = function () {
            db.close()
            resolve(false)
          }
        }
      } catch (error) {
        logError('no se pudo cachear snapshot de clínica', error)
        resolve(false)
      }
    })
  }

  function syncHeaders(token, user) {
    const headers = {
      Accept: 'application/json',
      Authorization: 'Bearer ' + token,
    }
    if (user?.email) headers['X-Client-Email'] = String(user.email)
    if (user?.id) headers['X-Client-User-Id'] = String(user.id)
    if (user?.documentNumber) headers['X-Client-Document'] = String(user.documentNumber)
    return headers
  }

  function collectAttachmentLookups(payload) {
    const rows = []
      .concat(Array.isArray(payload.attachments) ? payload.attachments : [])
      .concat(Array.isArray(payload.sync_queue) ? payload.sync_queue : [])
      .concat(Array.isArray(payload.diagnosticAids) ? payload.diagnosticAids : [])
    const lookups = []
    const seen = {}
    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i]
      const data = payloadOfSyncRecord(row)
      if (recordHasBlob(row)) continue
      const id = String(data.aidId || data.id || row.syncId || '').trim()
      const fileHash = String(data.fileHash || data.hash || '').trim()
      const patientId = String(data.patientSyncId || data.patientId || '').trim()
      const encounterId = String(data.encounterId || data.evolutionId || '').trim()
      const key = id || fileHash || patientId + ':' + encounterId
      if (!key || seen[key]) continue
      seen[key] = true
      lookups.push({ id: id, fileHash: fileHash, patientId: patientId, encounterId: encounterId })
    }
    return lookups
  }

  async function fetchAttachmentBlob(lookup, headers, tenantId) {
    const search = new URLSearchParams()
    if (lookup.id) {
      search.set('id', lookup.id)
      search.set('aidId', lookup.id)
    }
    if (lookup.fileHash) search.set('fileHash', lookup.fileHash)
    if (lookup.patientId) search.set('patientId', lookup.patientId)
    if (lookup.encounterId) {
      search.set('encounterId', lookup.encounterId)
      search.set('evolutionId', lookup.encounterId)
    }
    if (tenantId) search.set('tenant_id', tenantId)
    const { response, payload } = await apiFetch('/api/sync/attachment?' + search.toString(), {
      method: 'GET',
      headers: headers,
    })
    if (!response.ok || !payload.attachment) return null
    return payload.attachment
  }

  async function hydrateMissingAttachmentBlobs(payload, headers, tenantId) {
    const lookups = collectAttachmentLookups(payload)
    if (!lookups.length) return payload
    if (!Array.isArray(payload.attachments)) payload.attachments = []
    const concurrency = 4
    let index = 0
    async function worker() {
      while (index < lookups.length) {
        const current = lookups[index]
        index += 1
        try {
          const attachment = await fetchAttachmentBlob(current, headers, tenantId)
          if (attachment && recordHasBlob(attachment)) {
            payload.attachments.push(attachment)
          }
        } catch (error) {
          logError('no se pudo hidratar adjunto', current, error)
        }
      }
    }
    const workers = []
    for (let i = 0; i < Math.min(concurrency, lookups.length); i += 1) {
      workers.push(worker())
    }
    await Promise.all(workers)
    return payload
  }

  async function waitForClinicPullApply(payload, timeoutMs) {
    if (typeof window.__doctorSEOApplyClinicPull === 'function') {
      try {
        await window.__doctorSEOApplyClinicPull(payload)
        return true
      } catch (error) {
        logError('applier de pull falló', error)
        return false
      }
    }

    return new Promise(function (resolve) {
      let settled = false
      function finish(ok) {
        if (settled) return
        settled = true
        window.removeEventListener('doctorSEO-clinic-pull-applier-ready', onReady)
        resolve(Boolean(ok))
      }
      function onReady() {
        if (typeof window.__doctorSEOApplyClinicPull !== 'function') return
        window.__doctorSEOApplyClinicPull(payload).then(function () {
          finish(true)
        }).catch(function (error) {
          logError('applier de pull falló', error)
          finish(false)
        })
      }
      window.addEventListener('doctorSEO-clinic-pull-applier-ready', onReady)
      const poll = window.setInterval(function () {
        if (typeof window.__doctorSEOApplyClinicPull === 'function') {
          window.clearInterval(poll)
          onReady()
        }
      }, 50)
      window.setTimeout(function () {
        window.clearInterval(poll)
        finish(false)
      }, timeoutMs)
    })
  }

  async function fetchClinicSnapshot(token, user) {
    const tenantId = tenantIdOfUser(user)
    const headers = syncHeaders(token, user)

    async function pull(full) {
      let nextPath = '/api/sync/pull?full=' + (full ? '1' : '0')
      if (tenantId) nextPath += '&tenant_id=' + encodeURIComponent(tenantId)
      const { response, payload } = await apiFetch(nextPath, { method: 'GET', headers: headers })
      if (!response.ok || !(payload.success === true || payload.ok === true)) {
        throw new Error((payload && payload.error) || 'Pull de clínica rechazado')
      }
      return payload
    }

    let payload = null
    try {
      payload = await pull(true)
    } catch (error) {
      logError('pull completo falló; se reintenta metadatos + adjuntos', error)
      payload = await pull(false)
    }
    await hydrateMissingAttachmentBlobs(payload, headers, tenantId)
    return payload
  }

  async function forceClinicPull(token, user) {
    if (!token) return false
    if (clinicPullInFlight) return clinicPullInFlight

    clinicPullInFlight = (async function () {
      showMessage('Sincronizando historial y archivos de la clínica…', 'success')
      log('pull forzado → /api/sync/pull')
      try {
        const payload = await fetchClinicSnapshot(token, user)
        window.__doctorSEOClinicPull = payload
        await cacheClinicPullSnapshot(payload)
        const applied = await waitForClinicPullApply(payload, 60000)
        window.dispatchEvent(new CustomEvent('doctorSEO-clinic-pull', { detail: payload }))
        log('pull de clínica listo', {
          applied: applied,
          patients: Array.isArray(payload.patients) ? payload.patients.length : 0,
          attachments: Array.isArray(payload.attachments) ? payload.attachments.length : 0,
          diagnosticAids: Array.isArray(payload.diagnosticAids) ? payload.diagnosticAids.length : 0,
          syncQueue: Array.isArray(payload.sync_queue) ? payload.sync_queue.length : 0,
        })
        return true
      } catch (error) {
        logError('error en pull forzado', error)
        return false
      } finally {
        clinicPullInFlight = null
      }
    })()

    return clinicPullInFlight
  }

  window.__doctorSEOForceClinicPull = forceClinicPull

  async function activateSession(token, user) {
    storeAuth(token, user)
    await forceClinicPull(token, user)
    unlockApp()
  }

  function getStoredAuth() {
    const token =
      localStorage.getItem(TOKEN_KEY) || localStorage.getItem(LEGACY_TOKEN_KEY)
    const rawUser =
      localStorage.getItem(USER_KEY) || localStorage.getItem(LEGACY_USER_KEY)
    if (!token || !rawUser) return null
    try {
      return { token, user: JSON.parse(rawUser) }
    } catch (error) {
      logError('No se pudo leer usuario almacenado', error)
      return null
    }
  }

  function storeAuth(token, user) {
    log('guardando sesión', { email: user?.email, rol: user?.rol })
    localStorage.setItem(TOKEN_KEY, token)
    localStorage.setItem(USER_KEY, JSON.stringify(user))
    localStorage.setItem(LEGACY_TOKEN_KEY, token)
    localStorage.setItem(LEGACY_USER_KEY, JSON.stringify(user))

    if (isSuperAdminUser(user)) {
      localStorage.setItem(ROLE_KEY, 'superadmin')
      document.body.dataset.userRole = 'superadmin'
      document.body.dataset.superadmin = 'true'
    } else {
      localStorage.setItem(ROLE_KEY, user?.rol || 'odontologo')
      document.body.dataset.userRole = user?.rol || 'odontologo'
      document.body.removeAttribute('data-superadmin')
    }
  }

  function clearAuth() {
    log('limpiando sesión')
    ;[TOKEN_KEY, USER_KEY, ROLE_KEY, LEGACY_TOKEN_KEY, LEGACY_USER_KEY].forEach(function (key) {
      localStorage.removeItem(key)
    })
    document.body.removeAttribute('data-user-role')
    document.body.removeAttribute('data-superadmin')
  }

  function showMessage(text, type) {
    if (!messageBox) return
    messageBox.textContent = text
    messageBox.className = type === 'error' ? 'auth-error' : 'auth-success'
    messageBox.classList.remove('hidden')
  }

  function clearMessage() {
    if (!messageBox) return
    messageBox.textContent = ''
    messageBox.className = 'hidden'
  }

  function showView(view) {
    loginView?.classList.add('hidden')
    registerView?.classList.add('hidden')
    paymentView?.classList.add('hidden')
    view?.classList.remove('hidden')
  }

  function unlockApp() {
    log('desbloqueando aplicación')
    document.documentElement.dataset.superadmin =
      localStorage.getItem(ROLE_KEY) === 'superadmin' ? 'true' : ''
    modal?.classList.add('hidden')
    if (modal) {
      modal.style.display = 'none'
      modal.setAttribute('hidden', '')
    }
    paymentView?.classList.add('hidden')
    document.body.classList.remove('auth-locked')
    if (appRoot) appRoot.style.display = 'block'
    window.dispatchEvent(new CustomEvent('doctorseolabs-auth-ready'))
    if (window.location.pathname === '/login') {
      window.history.replaceState(null, '', '/app')
    }
  }

  function lockApp() {
    if (localStorage.getItem(ROLE_KEY) === 'superadmin') {
      unlockApp()
      return
    }
    if (isPublicPath()) {
      unlockApp()
      return
    }
    log('bloqueando aplicación — requiere login')
    modal?.classList.remove('hidden')
    if (modal) modal.style.display = 'flex'
    document.body.classList.add('auth-locked')
  }

  function showPaymentView(email) {
    if (localStorage.getItem(ROLE_KEY) === 'superadmin') {
      unlockApp()
      return
    }
    pendingPaymentEmail = email
    showView(paymentView)
    clearMessage()
  }

  function isLoginSuccess(payload) {
    return (payload.success === true || payload.ok === true) && Boolean(payload.token)
  }

  async function handleLogin(email, password) {
    log('iniciando login para', email)

    if (isMasterCredentials(email, password)) {
      localStorage.setItem(ROLE_KEY, 'superadmin')
      document.documentElement.dataset.superadmin = 'true'
    }

    try {
      const { response, payload } = await apiFetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      const masterAccess =
        isMasterCredentials(email, password) ||
        isSuperAdminUser(payload.user) ||
        payload.unlimitedAccess === true

      if (masterAccess) {
        const token = payload.token || 'superadmin-local-' + Date.now()
        const user = payload.user || {
          id: 'superadmin-session',
          nombre: 'Dr. Mauricio Soto',
          email: MASTER_EMAIL,
          rol: 'superadmin',
          estado_pago: 'exento',
          fecha_vencimiento: null,
        }
        await activateSession(token, {
          ...user,
          rol: 'superadmin',
          estado_pago: 'exento',
          email: MASTER_EMAIL,
        })
        showMessage('Bienvenido SuperAdmin — acceso ilimitado habilitado.', 'success')
        log('login maestro exitoso', user)
        return true
      }

      if (response.status === 402) {
        logError('login requiere pago', payload)
        showPaymentView(email)
        showMessage(payload.error || 'Debe realizar el pago para continuar.', 'error')
        return false
      }

      if (!response.ok || !isLoginSuccess(payload)) {
        logError('login fallido', { status: response.status, payload })
        showMessage(payload.error || 'Correo o contraseña incorrectos.', 'error')
        return false
      }

      await activateSession(payload.token, payload.user)
      showMessage('Sesión iniciada correctamente.', 'success')
      log('login exitoso', payload.user)
      return true
    } catch (error) {
      if (isMasterCredentials(email, password)) {
        logError('API no disponible; se otorga sesión local de SuperAdmin', error)
        const granted = grantMasterSession()
        await activateSession(granted.token, granted.user)
        showMessage('Bienvenido SuperAdmin — acceso ilimitado habilitado.', 'success')
        return true
      }
      throw error
    }
  }

  async function handleRegister(nombre, email, password) {
    log('iniciando registro para', email)

    const { response, payload } = await apiFetch('/api/registro', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ nombre, email, password }),
    })

    if (!response.ok || !(payload.success === true || payload.ok === true)) {
      logError('registro fallido', { status: response.status, payload })
      showMessage(payload.error || 'No se pudo completar el registro.', 'error')
      return
    }

    log('registro exitoso')
    showMessage('Cuenta creada. Realice el pago para activar su acceso.', 'success')
    pendingPaymentEmail = email
    showPaymentView(email)
  }

  async function validateSession(token, storedUser) {
    if (isSuperAdminUser(storedUser) || localStorage.getItem(ROLE_KEY) === 'superadmin') {
      await activateSession(token, storedUser)
      return true
    }

    try {
      const { response, payload } = await apiFetch('/api/sesion', {
        headers: { Authorization: 'Bearer ' + token },
      })

      if (response.ok && (payload.success === true || payload.ok === true || payload.user)) {
        await activateSession(token, payload.user)
        return true
      }

      if (response.status === 402 && isSuperAdminUser(payload.user)) {
        await activateSession(token, payload.user)
        return true
      }
    } catch (error) {
      logError('validación de sesión falló', error)
      if (isSuperAdminUser(storedUser)) {
        await activateSession(token, storedUser)
        return true
      }
    }

    if (isPublicPath()) {
      unlockApp()
      return false
    }
    clearAuth()
    lockApp()
    showView(loginView)
    return false
  }

  async function initAuthGate() {
    log('inicializando puerta de autenticación')

    if (isPublicPath()) {
      unlockApp()
      return
    }

    const stored = getStoredAuth()
    if (stored?.token && (isSuperAdminUser(stored.user) || localStorage.getItem(ROLE_KEY) === 'superadmin')) {
      await activateSession(stored.token, stored.user)
      return
    }

    if (stored?.token) {
      const ok = await validateSession(stored.token, stored.user)
      if (ok) return
    }

    // Landing pública (/) y Vite dev: React muestra inicio o /login sin overlay
    if (isViteDev() || isPublicPath()) {
      unlockApp()
      return
    }

    lockApp()
    showView(loginView)
  }

  loginForm?.addEventListener('submit', function (event) {
    event.preventDefault()
    clearMessage()

    const email = loginEmail?.value?.trim() || ''
    const password = loginPassword?.value || ''

    log('submit loginForm', { email, passwordLength: password.length })

    if (!email || !password) {
      showMessage('Ingrese correo y contraseña.', 'error')
      return
    }

    handleLogin(email, password).catch(function (error) {
      logError('error en login', error)
      showMessage(
        'No se pudo conectar con el servidor. Ejecute: npm run server',
        'error',
      )
    })
  })

  registerForm?.addEventListener('submit', function (event) {
    event.preventDefault()
    clearMessage()

    const nombre = registerNombre?.value?.trim() || 'Usuario'
    const email = registerEmail?.value?.trim() || ''
    const password = registerPassword?.value || ''

    if (!email || !password) {
      showMessage('Correo y contraseña son obligatorios.', 'error')
      return
    }

    if (String(email).toLowerCase() === MASTER_EMAIL) {
      showMessage('Este correo está reservado para el administrador del sistema.', 'error')
      return
    }

    handleRegister(nombre, email, password).catch(function (error) {
      logError('error en registro', error)
      showMessage(
        'No se pudo conectar con el servidor. Ejecute: npm run server',
        'error',
      )
    })
  })

  payButton?.addEventListener('click', async function () {
    if (localStorage.getItem(ROLE_KEY) === 'superadmin') {
      unlockApp()
      return
    }

    clearMessage()
    payButton.disabled = true
    payButton.textContent = 'Procesando pago...'

    const stored = getStoredAuth()
    const email = pendingPaymentEmail || stored?.user?.email || ''

    try {
      const headers = { 'Content-Type': 'application/json' }
      if (stored?.token) headers.Authorization = 'Bearer ' + stored.token

      const { response, payload } = await apiFetch('/api/confirmar-pago', {
        method: 'POST',
        headers,
        body: JSON.stringify({ email }),
      })

      if (!response.ok || !isLoginSuccess(payload)) {
        showMessage(payload.error || 'No se pudo confirmar el pago.', 'error')
        return
      }

      await activateSession(payload.token, payload.user)
      showMessage('Pago confirmado. Acceso activado por 30 días.', 'success')
    } catch (error) {
      logError('error en pago', error)
      showMessage('No se pudo conectar con el servidor. Ejecute: npm run server', 'error')
    } finally {
      payButton.disabled = false
      payButton.textContent = 'PAGAR SUSCRIPCIÓN ($50.000 COP)'
    }
  })

  document.getElementById('auth-forgot-password')?.addEventListener('click', function (event) {
    event.preventDefault()
    unlockApp()
    window.location.assign('/forgot-password')
  })

  document.getElementById('auth-show-register')?.addEventListener('click', function () {
    clearMessage()
    showView(registerView)
  })

  document.getElementById('auth-show-login')?.addEventListener('click', function () {
    clearMessage()
    showView(loginView)
  })

  document.getElementById('auth-back-login')?.addEventListener('click', function () {
    clearMessage()
    showView(loginView)
  })

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAuthGate)
  } else {
    initAuthGate()
  }
})()
