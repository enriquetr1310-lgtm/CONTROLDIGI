import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import {
  DIAS_RETENCION,
  MOTIVOS_CIERRE,
  type EventoHistorial,
  type Expediente,
  type Nota,
} from '../lib/tipos'
import { dinero, diasDesde, fechaCorta, fechaHoraCorta, sumarDias, textoDias } from '../lib/formato'
import EstatusBadge from '../components/EstatusBadge'

export default function ExpedienteDetalle() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const [exp, setExp] = useState<Expediente | null | undefined>(undefined)
  const [historial, setHistorial] = useState<EventoHistorial[]>([])
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    const [e, h] = await Promise.all([
      supabase.from('expedientes').select('*').eq('id', id!).maybeSingle(),
      supabase.from('historial_estatus').select('*').eq('expediente_id', id!).order('fecha').order('id'),
    ])
    if (e.error || h.error) {
      setError((e.error ?? h.error)!.message)
      return
    }
    setExp(e.data as Expediente | null)
    setHistorial(h.data ?? [])
  }, [id])

  useEffect(() => {
    cargar()
  }, [cargar])

  const volver = () => (location.key !== 'default' ? navigate(-1) : navigate('/expedientes'))

  if (error) return <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>
  if (exp === undefined) return <p className="text-sm text-slate-500">Cargando…</p>
  if (exp === null) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-slate-600">
          Este expediente ya no existe (pudo haberse eliminado {DIAS_RETENCION} días después de cerrarse).
        </p>
        <Link to="/expedientes" className="text-sm text-marca-600 hover:underline">
          ← Ir a expedientes
        </Link>
      </div>
    )
  }

  const domicilio = [
    [exp.direccion, exp.numero_exterior && exp.numero_exterior !== '0' ? exp.numero_exterior : null]
      .filter(Boolean)
      .join(' '),
    exp.colonia,
    exp.municipio !== exp.colonia ? exp.municipio : null,
    exp.ciudad,
    exp.estado,
    exp.codigo_postal && `C.P. ${exp.codigo_postal}`,
  ]
    .filter(Boolean)
    .join(', ')

  const haySimulacion = exp.simulacion_producto || exp.simulacion_cuotas || exp.simulacion_monto_cuotas

  return (
    <div className="space-y-5">
      <button onClick={volver} className="text-sm text-marca-600 hover:underline">
        ← Volver
      </button>

      {/* Encabezado */}
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold text-slate-900">{exp.nombre}</h1>
          <EstatusBadge estatus={exp.estatus} />
          {exp.cerrado_en && (
            <span className="rounded-full bg-slate-700 px-2 py-0.5 text-xs font-medium text-white">Cerrado</span>
          )}
        </div>
        <p className="text-sm text-slate-500">
          {exp.rfc ?? 'Sin RFC'}
          {!exp.rfc_valido && <span className="ml-1 text-amber-600">· RFC incompleto o inválido</span>}
          {exp.folio_cdc && <> · Folio CDC {exp.folio_cdc}</>}
        </p>
        {!exp.cerrado_en && (
          <p className="text-sm text-slate-700">
            <span className="font-medium">{textoDias(diasDesde(exp.estatus_desde))}</span> en este estatus (desde{' '}
            {fechaHoraCorta(exp.estatus_desde)})
          </p>
        )}
      </header>

      {exp.cerrado_en && <BloqueCierre exp={exp} onCambio={cargar} />}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <div className="grid gap-4 sm:grid-cols-2">
            <Tarjeta titulo="Crédito">
              <Dato etiqueta="Producto" valor={exp.producto} />
              <Dato etiqueta="Monto solicitado" valor={dinero(exp.monto_solicitado)} />
              <Dato etiqueta="Monto aprobado" valor={exp.monto_aprobado != null ? dinero(exp.monto_aprobado) : null} />
              <Dato etiqueta="Fecha de ingreso" valor={exp.fecha_ingreso && fechaHoraCorta(exp.fecha_ingreso)} />
              <Dato etiqueta="Comité de crédito" valor={exp.fecha_comite && fechaCorta(exp.fecha_comite)} />
              <Dato etiqueta="Fecha de firma" valor={exp.fecha_firma && fechaCorta(exp.fecha_firma)} />
              <Dato
                etiqueta="Completitud (sistema)"
                valor={exp.porcentaje_completitud != null ? `${Number(exp.porcentaje_completitud)}%` : null}
              />
            </Tarjeta>

            <div className="space-y-4">
              <Tarjeta titulo="Equipo">
                <Dato etiqueta="Asesor de crédito" valor={exp.asesor} />
                <Dato etiqueta="Analista" valor={exp.analista} />
              </Tarjeta>
              <Tarjeta titulo="Domicilio">
                <p className="text-sm text-slate-700">{domicilio || '—'}</p>
              </Tarjeta>
            </div>
          </div>

          {(exp.siac_aval_nuevo || exp.siac_aval_existente) && (
            <Tarjeta titulo="SIAC · Avales">
              <Dato etiqueta="Alta aval nuevo" valor={exp.siac_aval_nuevo} bloque />
              <Dato etiqueta="Alta aval existente" valor={exp.siac_aval_existente} bloque />
            </Tarjeta>
          )}

          {haySimulacion && (
            <Tarjeta titulo="Simulación">
              <Dato etiqueta="Producto" valor={exp.simulacion_producto} />
              <Dato etiqueta="Cuotas" valor={exp.simulacion_cuotas} />
              <Dato etiqueta="Monto de cuotas" valor={exp.simulacion_monto_cuotas} />
            </Tarjeta>
          )}

          <Notas expedienteId={exp.id} />
        </div>

        <div className="space-y-4">
          <LineaTiempo eventos={historial} />
          <Tarjeta titulo="Seguimiento">
            <Dato etiqueta="Visto por primera vez" valor={fechaHoraCorta(exp.primera_vez)} />
            <Dato etiqueta="Último archivo donde apareció" valor={fechaHoraCorta(exp.ultima_vez_en_reporte)} />
          </Tarjeta>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------

function Tarjeta({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold text-slate-900">{titulo}</h2>
      <div className="space-y-2">{children}</div>
    </section>
  )
}

function Dato({ etiqueta, valor, bloque }: { etiqueta: string; valor: ReactNode; bloque?: boolean }) {
  if (bloque) {
    return (
      <div>
        <p className="text-xs text-slate-500">{etiqueta}</p>
        <p className="text-sm text-slate-800">{valor || '—'}</p>
      </div>
    )
  }
  return (
    <div className="flex justify-between gap-4 text-sm">
      <span className="text-slate-500">{etiqueta}</span>
      <span className="text-right text-slate-800">{valor || '—'}</span>
    </div>
  )
}

function BloqueCierre({ exp, onCambio }: { exp: Expediente; onCambio: () => void }) {
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function cambiarMotivo(motivo: string) {
    if (motivo === exp.motivo_cierre) return
    setGuardando(true)
    setError(null)
    const { error: e1 } = await supabase.from('expedientes').update({ motivo_cierre: motivo }).eq('id', exp.id)
    if (!e1) {
      await supabase.from('historial_estatus').insert({
        expediente_id: exp.id,
        estatus_anterior: exp.motivo_cierre,
        estatus_nuevo: motivo,
      })
    }
    setGuardando(false)
    if (e1) setError(e1.message)
    else onCambio()
  }

  return (
    <section className="space-y-2 rounded-lg border border-slate-300 bg-slate-100 p-4 text-sm text-slate-800">
      <p>
        <span className="font-semibold">Cerrado</span> el {fechaHoraCorta(exp.cerrado_en!)} · Se eliminará el{' '}
        <span className="font-medium">{fechaCorta(sumarDias(exp.cerrado_en!, DIAS_RETENCION))}</span> si no vuelve a
        aparecer en el archivo.
      </p>
      <label className="flex flex-wrap items-center gap-2">
        <span>Motivo de cierre:</span>
        <select
          value={exp.motivo_cierre ?? ''}
          disabled={guardando}
          onChange={(e) => cambiarMotivo(e.target.value)}
          className="rounded-md border border-slate-300 bg-white px-2 py-1"
        >
          {!MOTIVOS_CIERRE.includes(exp.motivo_cierre as (typeof MOTIVOS_CIERRE)[number]) && (
            <option value={exp.motivo_cierre ?? ''}>{exp.motivo_cierre ?? 'Sin motivo'}</option>
          )}
          {MOTIVOS_CIERRE.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        {guardando && <span className="text-slate-500">Guardando…</span>}
      </label>
      {error && <p className="text-red-700">{error}</p>}
    </section>
  )
}

function LineaTiempo({ eventos }: { eventos: EventoHistorial[] }) {
  const recientes = [...eventos].reverse()
  return (
    <Tarjeta titulo="Línea de tiempo">
      {eventos.length === 0 ? (
        <p className="text-sm text-slate-500">Sin movimientos registrados.</p>
      ) : (
        <ol className="relative space-y-4 border-l border-slate-200 pl-4">
          {recientes.map((ev, i) => {
            const siguiente = recientes[i - 1]
            const duracion = siguiente ? diasDesde(ev.fecha, new Date(siguiente.fecha)) : diasDesde(ev.fecha)
            return (
              <li key={ev.id} className="relative">
                <span
                  className={`absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full ${
                    i === 0 ? 'bg-marca-600' : 'bg-slate-300'
                  }`}
                />
                <div className="flex flex-wrap items-center gap-1 text-sm">
                  {ev.estatus_anterior ? (
                    <>
                      <span className="text-slate-500">{ev.estatus_anterior}</span>
                      <span className="text-slate-400">→</span>
                    </>
                  ) : (
                    <span className="text-slate-500">Alta ·</span>
                  )}
                  <EstatusBadge estatus={ev.estatus_nuevo} />
                </div>
                <p className="mt-0.5 text-xs text-slate-500">
                  {fechaHoraCorta(ev.fecha)} · {ev.carga_id ? 'Carga de archivo' : 'Manual'}
                  {ev.usuario_email && ` · ${ev.usuario_email}`}
                </p>
                <p className="text-xs text-slate-400">
                  {i === 0
                    ? duracion === 0
                      ? 'Hoy'
                      : `Hace ${textoDias(duracion)}`
                    : `Duró ${duracion === 0 ? 'menos de un día' : textoDias(duracion)}`}
                </p>
              </li>
            )
          })}
        </ol>
      )}
    </Tarjeta>
  )
}

function Notas({ expedienteId }: { expedienteId: string }) {
  const { session } = useAuth()
  const miCorreo = session?.user.email
  const [notas, setNotas] = useState<Nota[] | null>(null)
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    const { data, error: e } = await supabase
      .from('notas_expediente')
      .select('id,texto,autor_email,created_at')
      .eq('expediente_id', expedienteId)
      .order('created_at', { ascending: false })
    if (e) setError(e.message)
    else setNotas(data ?? [])
  }, [expedienteId])

  useEffect(() => {
    cargar()
  }, [cargar])

  async function agregar(ev: FormEvent) {
    ev.preventDefault()
    const t = texto.trim()
    if (!t) return
    setEnviando(true)
    setError(null)
    const { error: e } = await supabase.from('notas_expediente').insert({ expediente_id: expedienteId, texto: t })
    setEnviando(false)
    if (e) {
      setError(e.message)
      return
    }
    setTexto('')
    cargar()
  }

  async function borrar(id: number) {
    if (!window.confirm('¿Borrar esta nota?')) return
    const { error: e } = await supabase.from('notas_expediente').delete().eq('id', id)
    if (e) setError(e.message)
    else cargar()
  }

  return (
    <Tarjeta titulo="Notas de seguimiento">
      <form onSubmit={agregar} className="space-y-2">
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          maxLength={2000}
          rows={2}
          placeholder="Ej. Se pidió al asesor el comprobante de domicilio actualizado…"
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-marca-600 focus:ring-2 focus:ring-marca-100"
        />
        <button
          type="submit"
          disabled={enviando || !texto.trim()}
          className="rounded-md bg-marca-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-marca-700 disabled:opacity-50"
        >
          {enviando ? 'Guardando…' : 'Agregar nota'}
        </button>
      </form>

      {error && (
        <p className="text-sm text-red-700">
          {error.includes('notas_expediente') ? 'Falta ejecutar el script 003_notas_expediente.sql en Supabase.' : error}
        </p>
      )}

      {notas && notas.length > 0 && (
        <ul className="divide-y divide-slate-100 pt-1">
          {notas.map((n) => (
            <li key={n.id} className="py-2.5">
              <p className="whitespace-pre-wrap text-sm text-slate-800">{n.texto}</p>
              <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                <span>
                  {n.autor_email} · {fechaHoraCorta(n.created_at)}
                </span>
                {n.autor_email === miCorreo && (
                  <button onClick={() => borrar(n.id)} className="text-rose-600 hover:underline">
                    Borrar
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {notas && notas.length === 0 && <p className="text-sm text-slate-500">Aún no hay notas.</p>}
    </Tarjeta>
  )
}
