/** Rechaza si `work` no termina en `ms`. El trabajo sigue en segundo plano. */
export function withDeadline(work, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const error = new Error('Tiempo de espera agotado')
      error.code = 'DEADLINE'
      reject(error)
    }, ms)
    Promise.resolve()
      .then(work)
      .then(
        (value) => {
          clearTimeout(timer)
          resolve(value)
        },
        (error) => {
          clearTimeout(timer)
          reject(error)
        },
      )
  })
}
