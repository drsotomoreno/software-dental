/** Avisa al hilo principal cada minuto. Ese hilo solo envía si el usuario está inactivo. */
const scope = self as unknown as { postMessage: (message: unknown) => void }

setInterval(() => {
  scope.postMessage({ type: 'rips-sync-tick' })
}, 60_000)

scope.postMessage({ type: 'rips-sync-ready' })
