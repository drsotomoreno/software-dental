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
    unlockApp()
    return user
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
    return path === '/' || path === '/login'
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
        storeAuth(token, { ...user, rol: 'superadmin', estado_pago: 'exento', email: MASTER_EMAIL })
        unlockApp()
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

      storeAuth(payload.token, payload.user)
      unlockApp()
      showMessage('Sesión iniciada correctamente.', 'success')
      log('login exitoso', payload.user)
      return true
    } catch (error) {
      if (isMasterCredentials(email, password)) {
        logError('API no disponible; se otorga sesión local de SuperAdmin', error)
        grantMasterSession()
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
      unlockApp()
      return true
    }

    try {
      const { response, payload } = await apiFetch('/api/sesion', {
        headers: { Authorization: 'Bearer ' + token },
      })

      if (response.ok && (payload.success === true || payload.ok === true || payload.user)) {
        storeAuth(token, payload.user)
        unlockApp()
        return true
      }

      if (response.status === 402 && isSuperAdminUser(payload.user)) {
        storeAuth(token, payload.user)
        unlockApp()
        return true
      }
    } catch (error) {
      logError('validación de sesión falló', error)
      if (isSuperAdminUser(storedUser)) {
        unlockApp()
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
      storeAuth(stored.token, stored.user)
      unlockApp()
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

      storeAuth(payload.token, payload.user)
      unlockApp()
      showMessage('Pago confirmado. Acceso activado por 30 días.', 'success')
    } catch (error) {
      logError('error en pago', error)
      showMessage('No se pudo conectar con el servidor. Ejecute: npm run server', 'error')
    } finally {
      payButton.disabled = false
      payButton.textContent = 'PAGAR SUSCRIPCIÓN ($50.000 COP)'
    }
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
