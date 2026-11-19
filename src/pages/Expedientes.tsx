import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { normalizarTexto } from '../lib/csv'
import { DIAS_RETENCION, type ConfigEstatus, type Expediente } from '../lib/tipos'
import { dinero, diasDesde, fechaCorta, plural, sumarDias, textoDias } from '../lib/formato'
import EstatusBadge from '../components/EstatusBadge'

type FilaLista = Pick<
  Expediente,
  | 'id'
  | 'nombre'
  | 'rfc'
  | 'rfc_valido'
  | 'estatus'
  | 'asesor'
  | 'analista'
  | 'monto_solicitado'
  | 'monto_aprobado'
  | 'fecha_ingreso'
  | 'estatus_desde'
  | 'cerrado_en'
  | 'motivo_cierre'
  | 'folio_cdc'
>

const COLUMNAS =
  'id,nombre,rfc,rfc_valido,estatus,asesor,analista,monto_solicitado,monto_aprobado,fecha_ingreso,estatus_desde,cerrado_en,motivo_cierre,folio_cdc'

type Orden = 'dias' | 'nombre' | 'estatus' | 'monto' | 'ingreso' | 'cerrado'

/** Dirección natural de cada columna al ordenarla por primera vez */
const ASC_POR_DEFECTO: Record<Orden, boolean> = {
  nombre: true,
  estatus: true,
  dias: false, // más días en el estatus primero
  monto: false,
  ingreso: false,
  cerrado: false,
}

export default function Expedientes() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const [filas, setFilas] = useState<FilaLista[] | null>(null)
  const [estatusCfg, setEstatusCfg] = useState<ConfigEstatus[]>([])
  const [error, setError] = useState<string | null>(null)

  const vista = params.get('vista') === 'cerrados' ? 'cerrados' : 'activos'
  const q = params.get('q') ?? ''
  // El buscador filtra con su propio estado (al instante) y se refleja en la URL después,
  // para no perder teclas si alguien escribe rápido.
  const [texto, setTexto] = useState(q)
  const fEstatus = params.get('estatus') ?? ''
  const fAsesor = params.get('asesor') ?? ''
  const fAnalista = params.get('analista') ?? ''
  const orden = (params.get('orden') as Orden) || (vista === 'activos' ? 'dias' : 'cerrado')
  const dir = params.get('dir')
  const asc = dir ? dir === 'asc' : ASC_POR_DEFECTO[orden]

  // React Router arma los cambios con los parámetros del momento en que se programaron;
  // con esta referencia cada cambio parte siempre de los más recientes.
  const paramsActuales = useRef(params)
  paramsActuales.current = params

  function setParam(cambios: Record<string, string | null>) {
    const p = new URLSearchParams(paramsActuales.current)
    for (const [k, v] of Object.entries(cambios)) {
      if (v) p.set(k, v)
      else p.delete(k)
    }
    if (p.toString() === paramsActuales.current.toString()) return
    paramsActuales.current = p
    setParams(p, { replace: true })
  }

  useEffect(() => {
    const t = setTimeout(() => setParam({ q: texto.trim() || null }), 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo debe reaccionar al texto
  }, [texto])

  useEffect(() => {
    Promise.all([
      supabase.from('expedientes').select(COLUMNAS),
      supabase.from('config_estatus').select('*').order('orden'),
    ]).then(([exp, cfg]) => {
      if (exp.error || cfg.error) {
        setError((exp.error ?? cfg.error)!.message)
        return
      }
      setFilas(exp.data as FilaLista[])
      setEstatusCfg(cfg.data ?? [])
    })
  }, [])

  const ordenEstatus = useMemo(() => new Map(estatusCfg.map((e) => [e.estatus, e.orden])), [estatusCfg])

  const delaVista = useMemo(
    () => (filas ?? []).filter((f) => (vista === 'activos' ? !f.cerrado_en : !!f.cerrado_en)),
    [filas, vista],
  )

  const opciones = useMemo(() => {
    const unicos = (xs: (string | null)[]) =>
      [...new Set(xs.filter((x): x is string => !!x))].sort((a, b) => a.localeCompare(b, 'es'))
    return { asesores: unicos(delaVista.map((f) => f.asesor)), analistas: unicos(delaVista.map((f) => f.analista)) }
  }, [delaVista])

  // Filtros excepto estatus (para que los contadores de estatus respondan a los demás filtros)
  const filtradasSinEstatus = useMemo(() => {
    const nq = normalizarTexto(texto)
    return delaVista.filter(
      (f) =>
        (!nq ||
          normalizarTexto(`${f.nombre} ${f.rfc ?? ''} ${f.folio_cdc ?? ''} ${f.asesor ?? ''}`).includes(nq)) &&
        (!fAsesor || f.asesor === fAsesor) &&
        (!fAnalista || f.analista === fAnalista),
    )
  }, [delaVista, texto, fAsesor, fAnalista])

  const conteoEstatus = useMemo(() => {
    const m = new Map<string, number>()
    for (const f of filtradasSinEstatus) {
      const k = vista === 'activos' ? f.estatus : (f.motivo_cierre ?? 'Cerrado')
      m.set(k, (m.get(k) ?? 0) + 1)
    }
    return [...m].sort((a, b) => (ordenEstatus.get(a[0]) ?? 99) - (ordenEstatus.get(b[0]) ?? 99))
  }, [filtradasSinEstatus, vista, ordenEstatus])

  const visibles = useMemo(() => {
    const lista = filtradasSinEstatus.filter(
      (f) => !fEstatus || (vista === 'activos' ? f.estatus : (f.motivo_cierre ?? 'Cerrado')) === fEstatus,
    )
    const valor = (f: FilaLista): number | string => {
      switch (orden) {
        case 'nombre':
          return f.nombre
        case 'estatus':
          return ordenEstatus.get(f.estatus) ?? 99
        case 'monto':
          return f.monto_aprobado ?? f.monto_solicitado ?? 0
        case 'ingreso':
          return f.fecha_ingreso ?? ''
        case 'cerrado':
          return f.cerrado_en ?? ''
        default:
          return -new Date(f.estatus_desde).getTime() // mayor = más tiempo en el estatus
      }
    }
    const signo = asc ? 1 : -1
    return [...lista].sort((a, b) => {
      const va = valor(a)
      const vb = valor(b)
      const c = typeof va === 'number' ? va - (vb as number) : String(va).localeCompare(String(vb), 'es')
      return c * signo
    })
  }, [filtradasSinEstatus, fEstatus, vista, orden, asc, ordenEstatus])

  const totalActivos = (filas ?? []).filter((f) => !f.cerrado_en).length
  const totalCerrados = (filas ?? []).length - totalActivos
  const hayFiltros = !!(texto.trim() || fEstatus || fAsesor || fAnalista)

  function ordenarPor(campo: Orden) {
    if (orden === campo) setParam({ dir: asc ? 'desc' : 'asc' })
    else setParam({ orden: campo, dir: null })
  }

  if (error) {
    return <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-xl font-semibold text-slate-900">Expedientes</h1>
        <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 text-sm">
          {(['activos', 'cerrados'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setParam({ vista: v === 'activos' ? null : v, estatus: null, asesor: null, analista: null, orden: null, dir: null })}
              className={`rounded-md px-3 py-1.5 font-medium ${
                vista === v ? 'bg-marca-600 text-white' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              {v === 'activos' ? `Activos (${totalActivos})` : `Cerrados (${totalCerrados})`}
            </button>
          ))}
        </div>
      </div>

      {vista === 'cerrados' && (
        <p className="text-sm text-slate-500">
          Los expedientes cerrados se eliminan automáticamente {DIAS_RETENCION} días después de su cierre. Si vuelven a
          aparecer en el archivo, se reactivan solos.
        </p>
      )}

      {/* Filtros */}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <input
          type="search"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Buscar nombre, RFC, folio…"
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-marca-600 focus:ring-2 focus:ring-marca-100 lg:col-span-2"
        />
        <Selector
          valor={fAsesor}
          opciones={opciones.asesores}
          vacio="Todos los asesores"
          onChange={(v) => setParam({ asesor: v })}
        />
        <Selector
          valor={fAnalista}
          opciones={opciones.analistas}
          vacio="Todos los analistas"
          onChange={(v) => setParam({ analista: v })}
        />
      </div>

      {/* Contadores por estatus (funcionan como filtro) */}
      <div className="flex flex-wrap gap-2">
        <Chip activo={!fEstatus} onClick={() => setParam({ estatus: null })}>
          Todos · {filtradasSinEstatus.length}
        </Chip>
        {conteoEstatus.map(([e, n]) => (
          <Chip key={e} activo={fEstatus === e} onClick={() => setParam({ estatus: fEstatus === e ? null : e })}>
            {e} · {n}
          </Chip>
        ))}
        {hayFiltros && (
          <button
            onClick={() => {
              setTexto('')
              setParam({ q: null, estatus: null, asesor: null, analista: null })
            }}
            className="px-2 text-sm text-marca-600 hover:underline"
          >
            Limpiar filtros
          </button>
        )}
      </div>

      {filas === null ? (
        <p className="text-sm text-slate-500">Cargando…</p>
      ) : visibles.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          {delaVista.length === 0
            ? vista === 'activos'
              ? 'No hay expedientes activos. Carga el archivo del día en «Cargar archivo».'
              : 'No hay expedientes cerrados.'
            : 'Ningún expediente coincide con los filtros.'}
        </div>
      ) : (
        <>
          <p className="text-xs text-slate-500">{plural(visibles.length, 'expediente', 'expedientes')}</p>

          {/* Tabla (pantallas medianas en adelante) */}
          <div className="hidden overflow-x-auto rounded-lg border border-slate-200 bg-white md:block">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr>
                  <Th campo="nombre" orden={orden} asc={asc} onClick={ordenarPor}>
                    Nombre
                  </Th>
                  <Th campo="estatus" orden={orden} asc={asc} onClick={ordenarPor}>
                    {vista === 'activos' ? 'Estatus' : 'Último estatus'}
                  </Th>
                  {vista === 'activos' ? (
                    <Th campo="dias" orden={orden} asc={asc} onClick={ordenarPor}>
                      En estatus
                    </Th>
                  ) : (
                    <>
                      <th className="px-4 py-2 font-medium">Motivo</th>
                      <Th campo="cerrado" orden={orden} asc={asc} onClick={ordenarPor}>
                        Cerrado
                      </Th>
                    </>
                  )}
                  <th className="px-4 py-2 font-medium">Asesor</th>
                  <th className="px-4 py-2 font-medium">Analista</th>
                  <Th campo="monto" orden={orden} asc={asc} onClick={ordenarPor} derecha>
                    Monto
                  </Th>
                  <Th campo="ingreso" orden={orden} asc={asc} onClick={ordenarPor}>
                    Ingreso
                  </Th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((f) => (
                  <tr
                    key={f.id}
                    onClick={() => navigate(`/expedientes/${f.id}`)}
                    className="cursor-pointer border-t border-slate-100 hover:bg-marca-50/60"
                  >
                    <td className="px-4 py-2.5">
                      <Link
                        to={`/expedientes/${f.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="font-medium text-slate-900 hover:text-marca-700 hover:underline"
                      >
                        {f.nombre}
                      </Link>
                      <div className="text-xs text-slate-500">
                        {f.rfc ?? 'Sin RFC'}
                        {!f.rfc_valido && <span className="ml-1 text-amber-600">· RFC incompleto</span>}
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <EstatusBadge estatus={f.estatus} />
                    </td>
                    {vista === 'activos' ? (
                      <td className="whitespace-nowrap px-4 py-2.5 tabular-nums">{textoDias(diasDesde(f.estatus_desde))}</td>
                    ) : (
                      <>
                        <td className="px-4 py-2.5">
                          <EstatusBadge estatus={f.motivo_cierre ?? 'Cerrado'} />
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-slate-600">
                          {fechaCorta(f.cerrado_en)}
                          <div className="text-xs text-slate-400">
                            Se elimina {fechaCorta(sumarDias(f.cerrado_en!, DIAS_RETENCION))}
                          </div>
                        </td>
                      </>
                    )}
                    <td className="px-4 py-2.5 text-slate-600">{f.asesor ?? '—'}</td>
                    <td className="px-4 py-2.5 text-slate-600">{f.analista ?? '—'}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums">
                      {dinero(f.monto_solicitado)}
                      {f.monto_aprobado != null && (
                        <div className="text-xs text-emerald-700">Aprob. {dinero(f.monto_aprobado)}</div>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-slate-600">{fechaCorta(f.fecha_ingreso)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Tarjetas (celular) */}
          <ul className="space-y-2 md:hidden">
            {visibles.map((f) => (
              <li key={f.id}>
                <Link
                  to={`/expedientes/${f.id}`}
                  className="block rounded-lg border border-slate-200 bg-white p-3 active:bg-marca-50"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-medium text-slate-900">{f.nombre}</span>
                    <EstatusBadge estatus={vista === 'activos' ? f.estatus : (f.motivo_cierre ?? 'Cerrado')} />
                  </div>
                  <div className="mt-1 text-xs text-slate-500">{f.asesor ?? 'Sin asesor'}</div>
                  <div className="mt-2 flex justify-between text-xs text-slate-600">
                    <span>
                      {vista === 'activos'
                        ? `En estatus: ${textoDias(diasDesde(f.estatus_desde))}`
                        : `Cerrado ${fechaCorta(f.cerrado_en)}`}
                    </span>
                    <span className="tabular-nums">{dinero(f.monto_aprobado ?? f.monto_solicitado)}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

function Selector(props: { valor: string; opciones: string[]; vacio: string; onChange: (v: string | null) => void }) {
  return (
    <select
      value={props.valor}
      onChange={(e) => props.onChange(e.target.value || null)}
      className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-marca-600 focus:ring-2 focus:ring-marca-100"
    >
      <option value="">{props.vacio}</option>
      {props.opciones.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  )
}

function Chip(props: { activo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={props.onClick}
      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
        props.activo
          ? 'border-marca-600 bg-marca-600 text-white'
          : 'border-slate-300 bg-white text-slate-600 hover:border-marca-600'
      }`}
    >
      {props.children}
    </button>
  )
}

function Th(props: {
  campo: Orden
  orden: Orden
  asc: boolean
  onClick: (c: Orden) => void
  derecha?: boolean
  children: React.ReactNode
}) {
  const activo = props.orden === props.campo
  return (
    <th className={`px-4 py-2 font-medium ${props.derecha ? 'text-right' : ''}`}>
      <button onClick={() => props.onClick(props.campo)} className="inline-flex items-center gap-1 hover:text-slate-800">
        {props.children}
        <span className={activo ? 'text-marca-600' : 'text-slate-300'}>{activo && props.asc ? '▲' : '▼'}</span>
      </button>
    </th>
  )
}
