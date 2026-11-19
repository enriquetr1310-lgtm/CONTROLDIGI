import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import {
  decodificar,
  ErrorArchivo,
  fechaDeNombreArchivo,
  leerLegajos,
  type Aviso,
  type ResultadoLectura,
  type TipoAviso,
} from '../lib/csv'
import type { Carga, ConfigEstatus, ItemCarga, ResultadoCarga } from '../lib/tipos'
import { fechaHoraCorta, plural } from '../lib/formato'

type Paso =
  | { tipo: 'inicio' }
  | { tipo: 'procesando' }
  | { tipo: 'vista_previa'; archivo: string; lectura: ResultadoLectura; resultado: ResultadoCarga; advertencias: string[] }
  | { tipo: 'aplicando'; archivo: string; lectura: ResultadoLectura; resultado: ResultadoCarga; advertencias: string[] }
  | { tipo: 'listo'; archivo: string; resultado: ResultadoCarga }

/** Proporción de activos que, si "salen" en una sola carga, exige confirmación extra. */
const UMBRAL_SALIDAS = 0.3

export default function Cargar() {
  const [paso, setPaso] = useState<Paso>({ tipo: 'inicio' })
  const [error, setError] = useState<string | null>(null)
  const [confirmado, setConfirmado] = useState(false)
  const [historial, setHistorial] = useState<Carga[]>([])
  const [estatus, setEstatus] = useState<ConfigEstatus[]>([])

  const cargarHistorial = useCallback(async () => {
    const { data } = await supabase.from('cargas').select('*').order('created_at', { ascending: false }).limit(10)
    setHistorial(data ?? [])
  }, [])

  useEffect(() => {
    cargarHistorial()
    supabase
      .from('config_estatus')
      .select('*')
      .order('orden')
      .then(({ data }) => setEstatus(data ?? []))
  }, [cargarHistorial])

  async function procesarArchivo(archivo: File) {
    setError(null)
    setConfirmado(false)
    setPaso({ tipo: 'procesando' })
    try {
      const contenido = decodificar(await archivo.arrayBuffer())
      const lectura = leerLegajos(
        contenido,
        estatus.map((e) => e.estatus),
      )
      const { data, error: errRpc } = await supabase.rpc('procesar_carga', {
        p_nombre_archivo: archivo.name,
        p_filas: lectura.filas,
        p_aplicar: false,
      })
      if (errRpc) throw new Error(errRpc.message)
      const resultado = data as ResultadoCarga
      setPaso({
        tipo: 'vista_previa',
        archivo: archivo.name,
        lectura,
        resultado,
        advertencias: calcularAdvertencias(archivo.name, resultado, historial[0]),
      })
    } catch (e) {
      setError(e instanceof ErrorArchivo || e instanceof Error ? e.message : String(e))
      setPaso({ tipo: 'inicio' })
    }
  }

  async function aplicar() {
    if (paso.tipo !== 'vista_previa') return
    setPaso({ ...paso, tipo: 'aplicando' })
    const { data, error: errRpc } = await supabase.rpc('procesar_carga', {
      p_nombre_archivo: paso.archivo,
      p_filas: paso.lectura.filas,
      p_aplicar: true,
    })
    if (errRpc) {
      setError(`No se pudo aplicar la carga (no se guardó ningún cambio): ${errRpc.message}`)
      setPaso({ ...paso, tipo: 'vista_previa' })
      return
    }
    setPaso({ tipo: 'listo', archivo: paso.archivo, resultado: data as ResultadoCarga })
    cargarHistorial()
  }

  const reiniciar = () => {
    setPaso({ tipo: 'inicio' })
    setError(null)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Cargar archivo del día</h1>
        <p className="text-sm text-slate-500">
          Sube el CSV de legajos (filtrado sin "Mesa de control"). Antes de guardar verás qué cambiará.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">
          {error}
        </div>
      )}

      {(paso.tipo === 'inicio' || paso.tipo === 'procesando') && (
        <ZonaArchivo onArchivo={procesarArchivo} ocupado={paso.tipo === 'procesando'} />
      )}

      {(paso.tipo === 'vista_previa' || paso.tipo === 'aplicando') && (
        <VistaPrevia
          archivo={paso.archivo}
          lectura={paso.lectura}
          resultado={paso.resultado}
          advertencias={paso.advertencias}
          confirmado={confirmado}
          onConfirmar={setConfirmado}
          aplicando={paso.tipo === 'aplicando'}
          onAplicar={aplicar}
          onCancelar={reiniciar}
        />
      )}

      {paso.tipo === 'listo' && <CargaLista archivo={paso.archivo} resultado={paso.resultado} onOtra={reiniciar} />}

      <HistorialCargas cargas={historial} />
    </div>
  )
}

function calcularAdvertencias(nombre: string, r: ResultadoCarga, ultima?: Carga): string[] {
  const adv: string[] = []
  const salen = r.salen.length
  if (r.activos_antes >= 5 && salen / r.activos_antes >= UMBRAL_SALIDAS) {
    adv.push(
      `Se cerrarán ${salen} de ${r.activos_antes} expedientes activos (${Math.round((salen / r.activos_antes) * 100)}%) porque no vienen en el archivo. ` +
        'Verifica que el archivo esté completo y no filtrado por asesor u otro criterio.',
    )
  }
  const fechaNueva = fechaDeNombreArchivo(nombre)
  const fechaUltima = ultima && fechaDeNombreArchivo(ultima.nombre_archivo)
  if (fechaNueva && fechaUltima && fechaNueva < fechaUltima) {
    adv.push(
      `Este archivo (${fechaHoraCorta(fechaNueva)}) es anterior al último cargado (${fechaHoraCorta(fechaUltima)}).`,
    )
  }
  if (ultima && ultima.nombre_archivo === nombre) {
    adv.push(`Un archivo con el mismo nombre ya se cargó el ${fechaHoraCorta(ultima.created_at)}.`)
  }
  return adv
}

// ---------------------------------------------------------------------

function ZonaArchivo({ onArchivo, ocupado }: { onArchivo: (f: File) => void; ocupado: boolean }) {
  const input = useRef<HTMLInputElement>(null)
  const [encima, setEncima] = useState(false)

  function onDrop(e: DragEvent) {
    e.preventDefault()
    setEncima(false)
    const f = e.dataTransfer.files[0]
    if (f && !ocupado) onArchivo(f)
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        setEncima(true)
      }}
      onDragLeave={() => setEncima(false)}
      onDrop={onDrop}
      className={`rounded-xl border-2 border-dashed p-10 text-center transition-colors ${
        encima ? 'border-marca-600 bg-marca-50' : 'border-slate-300 bg-white'
      }`}
    >
      {ocupado ? (
        <p className="text-sm text-slate-600">Leyendo y comparando con la base…</p>
      ) : (
        <>
          <p className="text-sm text-slate-600">Arrastra aquí el archivo o</p>
          <button
            onClick={() => input.current?.click()}
            className="mt-3 rounded-md bg-marca-600 px-4 py-2 text-sm font-medium text-white hover:bg-marca-700"
          >
            Seleccionar archivo
          </button>
          <p className="mt-2 text-xs text-slate-400">legajos-DD-MM-AAAA-HH-MM.csv</p>
        </>
      )}
      <input
        ref={input}
        type="file"
        accept=".csv,.txt,.md,text/csv"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (f) onArchivo(f)
        }}
      />
    </div>
  )
}

// ---------------------------------------------------------------------

const TONOS = {
  azul: 'border-sky-200 bg-sky-50 text-sky-900',
  ambar: 'border-amber-200 bg-amber-50 text-amber-900',
  verde: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  rojo: 'border-rose-200 bg-rose-50 text-rose-900',
  gris: 'border-slate-200 bg-white text-slate-700',
} as const

function Tarjeta({ titulo, valor, tono }: { titulo: string; valor: number; tono: keyof typeof TONOS }) {
  return (
    <div className={`rounded-lg border p-3 ${TONOS[tono]}`}>
      <p className="text-xs font-medium opacity-80">{titulo}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{valor}</p>
    </div>
  )
}

function Resumen({ r }: { r: ResultadoCarga }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      <Tarjeta titulo="Nuevos" valor={r.nuevos.length} tono="azul" />
      <Tarjeta titulo="Cambiaron de estatus" valor={r.cambios.length} tono="ambar" />
      <Tarjeta titulo="Reactivados" valor={r.reactivados.length} tono="verde" />
      <Tarjeta titulo="Salen del reporte" valor={r.salen.length} tono="rojo" />
      <Tarjeta titulo="Llegaron en estatus final" valor={r.cerrados.length} tono="rojo" />
      <Tarjeta titulo="Sin cambio" valor={r.sin_cambio} tono="gris" />
    </div>
  )
}

function ListaItems({ titulo, items, nota }: { titulo: string; items: ItemCarga[]; nota?: string }) {
  if (items.length === 0) return null
  return (
    <details className="group rounded-lg border border-slate-200 bg-white">
      <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium text-slate-800">
        {titulo} <span className="text-slate-400">({items.length})</span>
      </summary>
      {nota && <p className="px-4 pb-2 text-xs text-slate-500">{nota}</p>}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-t border-slate-100 text-xs text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Nombre</th>
              <th className="px-4 py-2 font-medium">Asesor</th>
              <th className="px-4 py-2 font-medium">Estatus</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.clave} className="border-t border-slate-100">
                <td className="px-4 py-2">{i.nombre}</td>
                <td className="px-4 py-2 text-slate-600">{i.asesor ?? '—'}</td>
                <td className="px-4 py-2 text-slate-600">
                  {i.de || i.motivo_cierre ? (
                    <>
                      {i.motivo_cierre ?? i.de} <span className="text-slate-400">→</span> {i.a}
                    </>
                  ) : (
                    i.a
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  )
}

const TITULO_AVISO: Record<TipoAviso, string> = {
  rfc: 'RFC incompleto o inválido',
  estatus: 'Estatus fuera del catálogo',
  fecha: 'Fechas no reconocidas',
  duplicado: 'Filas repetidas',
  omitida: 'Filas que no se cargarán',
}

function Avisos({ avisos }: { avisos: Aviso[] }) {
  if (avisos.length === 0) return null
  const grupos = new Map<TipoAviso, Aviso[]>()
  for (const a of avisos) grupos.set(a.tipo, [...(grupos.get(a.tipo) ?? []), a])
  return (
    <details className="rounded-lg border border-amber-200 bg-amber-50">
      <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium text-amber-900">
        Observaciones del archivo ({avisos.length}) — no impiden la carga
      </summary>
      <div className="space-y-3 px-4 pb-4 text-sm text-amber-900">
        {[...grupos].map(([tipo, lista]) => (
          <div key={tipo}>
            <p className="font-medium">{TITULO_AVISO[tipo]}</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-amber-800">
              {lista.map((a, i) => (
                <li key={i}>
                  Fila {a.fila}
                  {a.nombre ? ` · ${a.nombre}` : ''}: {a.mensaje}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </details>
  )
}

function VistaPrevia(props: {
  archivo: string
  lectura: ResultadoLectura
  resultado: ResultadoCarga
  advertencias: string[]
  confirmado: boolean
  onConfirmar: (v: boolean) => void
  aplicando: boolean
  onAplicar: () => void
  onCancelar: () => void
}) {
  const { archivo, lectura, resultado: r, advertencias, confirmado, aplicando } = props
  const requiereConfirmar = advertencias.length > 0
  const sinCambios =
    r.nuevos.length + r.cambios.length + r.reactivados.length + r.salen.length + r.cerrados.length === 0

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold text-slate-900">Vista previa · {archivo}</h2>
        <p className="text-xs text-slate-500">
          {plural(lectura.totalLeidas, 'fila leída', 'filas leídas')} · {plural(r.total_filas, 'expediente', 'expedientes')}{' '}
          válidos · {plural(r.activos_antes, 'activo', 'activos')} antes de cargar
        </p>
      </div>

      <Resumen r={r} />

      <div className="space-y-2">
        <ListaItems titulo="Nuevos" items={r.nuevos} />
        <ListaItems titulo="Cambiaron de estatus" items={r.cambios} />
        <ListaItems titulo="Reactivados (estaban cerrados y volvieron)" items={r.reactivados} />
        <ListaItems
          titulo="Salen del reporte"
          items={r.salen}
          nota="Ya no vienen en el archivo: se cerrarán como «Salió del reporte» y se eliminarán en 3 días si no reaparecen."
        />
        <ListaItems titulo="Llegaron en estatus final" items={r.cerrados} nota="Se cierran y se eliminarán en 3 días." />
        <ListaItems
          titulo="Ignorados"
          items={r.ignorados}
          nota="Vienen en estatus final y no estaban activos en la app; no se guardan."
        />
      </div>

      <Avisos avisos={lectura.avisos} />

      {advertencias.length > 0 && (
        <div className="space-y-2 rounded-lg border border-rose-300 bg-rose-50 p-4 text-sm text-rose-900">
          <p className="font-semibold">Revisa antes de continuar</p>
          <ul className="list-disc space-y-1 pl-5">
            {advertencias.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
          <label className="flex items-center gap-2 pt-1 font-medium">
            <input
              type="checkbox"
              checked={confirmado}
              onChange={(e) => props.onConfirmar(e.target.checked)}
              className="h-4 w-4"
            />
            Revisé las advertencias y quiero aplicar la carga
          </label>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          onClick={props.onAplicar}
          disabled={aplicando || (requiereConfirmar && !confirmado)}
          className="rounded-md bg-marca-600 px-4 py-2 text-sm font-medium text-white hover:bg-marca-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {aplicando ? 'Aplicando…' : sinCambios ? 'Registrar carga (sin cambios)' : 'Aplicar carga'}
        </button>
        <button
          onClick={props.onCancelar}
          disabled={aplicando}
          className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Cancelar
        </button>
      </div>
    </section>
  )
}

function CargaLista({ archivo, resultado, onOtra }: { archivo: string; resultado: ResultadoCarga; onOtra: () => void }) {
  return (
    <section className="space-y-4">
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
        <p className="font-semibold">Carga aplicada: {archivo}</p>
        <p>Los cambios ya están guardados y registrados en el historial de cada expediente.</p>
      </div>
      <Resumen r={resultado} />
      <div className="flex flex-wrap gap-2">
        <Link
          to="/expedientes"
          className="rounded-md bg-marca-600 px-4 py-2 text-sm font-medium text-white hover:bg-marca-700"
        >
          Ver expedientes
        </Link>
        <button
          onClick={onOtra}
          className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Cargar otro archivo
        </button>
      </div>
    </section>
  )
}

function HistorialCargas({ cargas }: { cargas: Carga[] }) {
  return (
    <section className="space-y-2">
      <h2 className="text-base font-semibold text-slate-900">Últimas cargas</h2>
      {cargas.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
          Todavía no se ha cargado ningún archivo.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="px-4 py-2 font-medium">Fecha</th>
                <th className="px-4 py-2 font-medium">Archivo</th>
                <th className="px-4 py-2 font-medium">Cargó</th>
                <th className="px-4 py-2 text-right font-medium">Expedientes</th>
                <th className="px-4 py-2 text-right font-medium">Nuevos</th>
                <th className="px-4 py-2 text-right font-medium">Cambios</th>
                <th className="px-4 py-2 text-right font-medium">Cerrados</th>
                <th className="px-4 py-2 text-right font-medium">Reactivados</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {cargas.map((c) => (
                <tr key={c.id} className="border-t border-slate-100">
                  <td className="whitespace-nowrap px-4 py-2">{fechaHoraCorta(c.created_at)}</td>
                  <td className="px-4 py-2 text-slate-600">{c.nombre_archivo}</td>
                  <td className="px-4 py-2 text-slate-600">{c.cargado_por_email ?? '—'}</td>
                  <td className="px-4 py-2 text-right">{c.total_filas}</td>
                  <td className="px-4 py-2 text-right">{c.nuevos}</td>
                  <td className="px-4 py-2 text-right">{c.cambios_estatus}</td>
                  <td className="px-4 py-2 text-right">{c.salieron}</td>
                  <td className="px-4 py-2 text-right">{c.reactivados}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
