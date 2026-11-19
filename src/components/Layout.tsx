import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../lib/auth'

const enlaces = [
  { to: '/', texto: 'Inicio', fin: true },
  { to: '/cargar', texto: 'Cargar archivo' },
  { to: '/expedientes', texto: 'Expedientes' },
  { to: '/alertas', texto: 'Alertas' },
  { to: '/documentos', texto: 'Documentos' },
]

export default function Layout() {
  const { session, cerrarSesion } = useAuth()
  const [menuAbierto, setMenuAbierto] = useState(false)

  const claseEnlace = ({ isActive }: { isActive: boolean }) =>
    `block rounded-md px-3 py-2 text-sm font-medium transition-colors ${
      isActive ? 'bg-marca-700 text-white' : 'text-marca-100 hover:bg-marca-700/60 hover:text-white'
    }`

  return (
    <div className="min-h-screen">
      <header className="bg-marca-900 text-white">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3">
          <span className="font-semibold tracking-tight">Control de Expedientes</span>

          <nav className="hidden flex-1 gap-1 md:flex">
            {enlaces.map((e) => (
              <NavLink key={e.to} to={e.to} end={e.fin} className={claseEnlace}>
                {e.texto}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto hidden items-center gap-3 md:flex">
            <span className="text-xs text-marca-100">{session?.user.email}</span>
            <button
              onClick={cerrarSesion}
              className="rounded-md border border-white/30 px-3 py-1.5 text-xs hover:bg-white/10"
            >
              Salir
            </button>
          </div>

          <button
            className="ml-auto rounded-md border border-white/30 px-3 py-1.5 text-sm md:hidden"
            onClick={() => setMenuAbierto((v) => !v)}
            aria-expanded={menuAbierto}
          >
            Menú
          </button>
        </div>

        {menuAbierto && (
          <nav className="space-y-1 border-t border-white/10 px-4 py-3 md:hidden">
            {enlaces.map((e) => (
              <NavLink
                key={e.to}
                to={e.to}
                end={e.fin}
                className={claseEnlace}
                onClick={() => setMenuAbierto(false)}
              >
                {e.texto}
              </NavLink>
            ))}
            <div className="flex items-center justify-between pt-2 text-xs text-marca-100">
              <span>{session?.user.email}</span>
              <button onClick={cerrarSesion} className="rounded-md border border-white/30 px-3 py-1.5">
                Salir
              </button>
            </div>
          </nav>
        )}
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  )
}
