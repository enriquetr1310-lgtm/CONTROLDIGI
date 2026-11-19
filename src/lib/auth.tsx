import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, faltaConfiguracion } from './supabase'

interface AuthState {
  session: Session | null
  cargando: boolean
  iniciarSesion: (email: string, password: string) => Promise<string | null>
  cerrarSesion: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [cargando, setCargando] = useState(!faltaConfiguracion)

  useEffect(() => {
    if (faltaConfiguracion) return
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setCargando(false)
    })
    const { data } = supabase.auth.onAuthStateChange((_evento, nueva) => setSession(nueva))
    return () => data.subscription.unsubscribe()
  }, [])

  async function iniciarSesion(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (!error) return null
    if (error.message.toLowerCase().includes('invalid login')) return 'Correo o contraseña incorrectos.'
    return error.message
  }

  async function cerrarSesion() {
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{ session, cargando, iniciarSesion, cerrarSesion }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>')
  return ctx
}
