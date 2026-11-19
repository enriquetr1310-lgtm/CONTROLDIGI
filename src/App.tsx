import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './lib/auth'
import { faltaConfiguracion } from './lib/supabase'
import Layout from './components/Layout'
import Login from './pages/Login'
import Inicio from './pages/Inicio'
import Cargar from './pages/Cargar'
import Pendiente from './pages/Pendiente'
import SinConfigurar from './pages/SinConfigurar'

export default function App() {
  const { session, cargando } = useAuth()

  if (faltaConfiguracion) return <SinConfigurar />
  if (cargando) {
    return <div className="grid min-h-screen place-items-center text-slate-500">Cargando…</div>
  }
  if (!session) return <Login />

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Inicio />} />
        <Route path="cargar" element={<Cargar />} />
        <Route path="expedientes" element={<Pendiente titulo="Expedientes" fase={3} />} />
        <Route path="alertas" element={<Pendiente titulo="Alertas" fase={4} />} />
        <Route path="documentos" element={<Pendiente titulo="Catálogo de documentos" fase={5} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
