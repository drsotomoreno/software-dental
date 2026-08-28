import { Outlet } from 'react-router-dom'
import { APP_NAME } from '@/constants/branding'
import { TopNavbar } from './TopNavbar'
import { BackupReminderBanner } from './BackupReminderBanner'
import { useAutoBackup } from '@/hooks/useAutoBackup'

export function MainLayout() {
  useAutoBackup()

  return (
    <div className="flex min-h-screen flex-col">
      <TopNavbar />
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
