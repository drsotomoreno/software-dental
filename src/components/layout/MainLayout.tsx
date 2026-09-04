import { Outlet, Link } from 'react-router-dom'
import { APP_NAME } from '@/constants/branding'
import { TopNavbar } from './TopNavbar'
import { BackupReminderBanner } from './BackupReminderBanner'
import { useAutoBackup } from '@/hooks/useAutoBackup'
import { useAuth } from '@/contexts/AuthContext'

export function MainLayout() {
  useAutoBackup()
  const { isTrialLimited } = useAuth()

  return (
    <div className="flex min-h-screen flex-col">
      <TopNavbar />
      {isTrialLimited && (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-sm text-amber-950">
          Prueba de 7 días: 1 paciente y 1 nota de voz por casilla.{' '}
          <Link to="/welcome-trial" className="font-semibold underline">
            Ver planes
          </Link>
        </div>
      )}
      <BackupReminderBanner />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">
        <Outlet />
      </main>
      <footer className="border-t border-slate-200 bg-white py-3 text-center text-xs text-slate-500">
        {APP_NAME} — RIPS · Ley 527 · FHIR R4
      </footer>
    </div>
  )
}
