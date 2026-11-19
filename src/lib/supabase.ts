import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** true cuando faltan las variables de entorno de Supabase */
export const faltaConfiguracion = !url || !key

export const supabase: SupabaseClient = faltaConfiguracion
  ? (null as unknown as SupabaseClient)
  : createClient(url!, key!)
