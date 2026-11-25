/**
 * Banner de carga mientras Dexie se rellena tras el primer pull de sesión.
 */
export function ClinicHydrationBanner({ visible }: { visible: boolean }) {
  if (!visible) return null
  return (
    <div
      className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-950"
      role="status"
      aria-live="polite"
    >
      <p className="font-medium">Sincronizando datos de la clínica…</p>
      <p className="mt-1 text-blue-800">
        Estamos descargando el listado de pacientes desde el servidor. Espere unos segundos antes
        de asumir que no hay historias en este equipo.
      </p>
    </div>
  )
}
