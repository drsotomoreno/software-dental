const base = 'https://www.mihistoriadental.com'
const email = 'dentaltourismshop@gmail.com'

const login = await fetch(`${base}/api/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
  body: JSON.stringify({
    email: 'doctormauriciosoto@gmail.com',
    password: 'Dragon1976%',
  }),
})
const loginBody = await login.json().catch(() => ({}))
if (!login.ok || !loginBody.token) {
  console.error('login_failed', login.status, JSON.stringify(loginBody).slice(0, 300))
  process.exit(1)
}
console.log('login_ok')

async function purge() {
  const del = await fetch(`${base}/api/admin/users/by-email/${encodeURIComponent(email)}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${loginBody.token}`,
      Accept: 'application/json',
    },
  })
  const text = await del.text()
  console.log('delete_status', del.status, text)
  return del.status
}

const first = await purge()
const second = await purge()

if (first === 200 || first === 404) {
  if (second === 404) {
    console.log('PURGE_OK')
    process.exit(0)
  }
}
console.log('PURGE_CHECK_FAILED')
process.exit(1)
