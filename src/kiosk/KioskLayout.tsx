import { Outlet } from 'react-router-dom'

/**
 * Shell del modo kiosco: pantalla completa, sin menús clínicos, Auth ni Dexie.
 */
export default function KioskLayout() {
  return (
    <div className="min-h-[100dvh] bg-slate-50 text-slate-900">
      <Outlet />
    </div>
  )
}
