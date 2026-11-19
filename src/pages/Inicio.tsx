import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

interface ConfigEstatus {
  estatus: string
  orden: number
  dias_alerta: number | null
  es_final: boolean
}

type Estado =
  | { tipo: 'cargando' }
  | { tipo: 'error'; mensaje: string }
  | { tipo: 'ok'; estatus: ConfigEstatus[]; conteo: Record<string, number>; activos: number }

export default function Inicio() {
  const [estado, setEstado] = useState<Estado>({ tipo: 'cargando' })

  useEffect(() => {
    async function cargar() {
      const [cfg, exp] = await Promise.all([
        supabase.from('config_estatus').select('*').order('orden'),
        supabase.from('expedientes').select('estatus').is('cerrado_en', null),
      ])
      const error = cfg.error ?? exp.error
      if (error) {
        setEstado({ tipo: 'error', mensaje: error.message })
        return
      }
      const conteo: Record<string, number> = {}
      for (const e of exp.data ?? []) conteo[e.estatus] = (conteo[e.estatus] ?? 0) + 1
      setEstado({ tipo: 'ok', estatus: cfg.data ?? [], conteo, activos: exp.data?.length ?? 0 })
    }
    cargar()
  }, [])

  if (estado.tipo === 'cargando') return <p className="text-sm text-slate-500">Cargando…</p>

  if (estado.tipo === 'error') {
    return (
      <div className="space-y-2 rounded-lg border border-red-200 bg-red-50 p-5 text-sm text-red-800">
        <p className="font-semibold">No se pudo leer la base de datos.</p>
        <p>
          Verifica que ejecutaste el script <code>supabase/migrations/001_esquema_inicial.sql</code> en el SQL Editor
          de Supabase.
        </p>
        <p className="text-xs text-red-600">Detalle: {estado.mensaje}</p>
      </div>
    )
  }

  const activos = estado.estatus.filter((e) => !e.es_final)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Inicio</h1>
          <p className="text-sm text-slate-500">
            {estado.activos} expediente{estado.activos === 1 ? '' : 's'} activo{estado.activos === 1 ? '' : 's'}
          </p>
        </div>
        <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-800">
          Conexión con Supabase correcta
        </span>
      </div>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {activos.map((e) => (
          <Link
            key={e.estatus}
            to={`/expedientes?estatus=${encodeURIComponent(e.estatus)}`}
            className="rounded-lg border border-slate-200 bg-white p-4 transition-colors hover:border-marca-600"
          >
            <p className="text-xs font-medium text-slate-500">{e.estatus}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{estado.conteo[e.estatus] ?? 0}</p>
            <p className="mt-1 text-xs text-slate-400">
              Alerta a {e.dias_alerta} día{e.dias_alerta === 1 ? '' : 's'} sin cambio
            </p>
          </Link>
        ))}
      </section>

      {estado.activos === 0 && (
        <p className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
          Aún no hay expedientes. Ve a «Cargar archivo» para subir el CSV del día.
        </p>
      )}
    </div>
  )
}
