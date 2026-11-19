import { useState, type FormEvent } from 'react'
import { useAuth } from '../lib/auth'

export default function Login() {
  const { iniciarSesion } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setEnviando(true)
    setError(await iniciarSesion(email.trim(), password))
    setEnviando(false)
  }

  return (
    <div className="grid min-h-screen place-items-center bg-marca-900 px-4">
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4 rounded-xl bg-white p-6 shadow-xl">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Control de Expedientes</h1>
          <p className="text-sm text-slate-500">Inicia sesión con tu cuenta del equipo.</p>
        </div>

        <label className="block space-y-1">
          <span className="text-sm font-medium text-slate-700">Correo</span>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-marca-600 focus:ring-2 focus:ring-marca-100"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-sm font-medium text-slate-700">Contraseña</span>
          <input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-marca-600 focus:ring-2 focus:ring-marca-100"
          />
        </label>

        {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <button
          type="submit"
          disabled={enviando}
          className="w-full rounded-md bg-marca-600 px-4 py-2 text-sm font-medium text-white hover:bg-marca-700 disabled:opacity-60"
        >
          {enviando ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </div>
  )
}
