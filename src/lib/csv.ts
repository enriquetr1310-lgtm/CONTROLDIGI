import Papa from 'papaparse'

/** Fila normalizada lista para enviarse a procesar_carga (llaves = columnas de la tabla). */
export interface FilaExpediente {
  clave: string
  nombre: string
  rfc: string | null
  rfc_valido: boolean
  producto: string | null
  monto_solicitado: number | null
  fecha_ingreso: string | null // 'YYYY-MM-DDTHH:MM:SS' (hora local)
  fecha_comite: string | null // 'YYYY-MM-DD'
  monto_aprobado: number | null
  fecha_firma: string | null
  estatus: string
  asesor: string | null
  analista: string | null
  siac_aval_nuevo: string | null
  siac_aval_existente: string | null
  direccion: string | null
  numero_exterior: string | null
  colonia: string | null
  municipio: string | null
  ciudad: string | null
  estado: string | null
  codigo_postal: string | null
  simulacion_cuotas: string | null
  simulacion_monto_cuotas: string | null
  simulacion_producto: string | null
  porcentaje_completitud: number | null
  folio_cdc: string | null
}

export type TipoAviso = 'rfc' | 'estatus' | 'fecha' | 'duplicado' | 'omitida'

export interface Aviso {
  tipo: TipoAviso
  fila: number // número de fila en el archivo (1 = primera fila de datos)
  nombre: string | null
  mensaje: string
}

export interface ResultadoLectura {
  filas: FilaExpediente[]
  avisos: Aviso[]
  totalLeidas: number
}

export class ErrorArchivo extends Error {}

/** Quita acentos, pasa a minúsculas y colapsa espacios (para comparar textos). */
export function normalizarTexto(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/** Encabezado normalizado del archivo -> campo interno */
const COLUMNAS: Record<string, keyof FilaExpediente> = {
  nombre: 'nombre',
  producto: 'producto',
  'monto solicitado': 'monto_solicitado',
  'fecha de ingreso': 'fecha_ingreso',
  'fecha de comite de credito': 'fecha_comite',
  'monto aprobado': 'monto_aprobado',
  'fecha de firma': 'fecha_firma',
  estatus: 'estatus',
  'asesor de credito': 'asesor',
  analista: 'analista',
  'siac - alta aval nuevo': 'siac_aval_nuevo',
  'siac - alta aval existente': 'siac_aval_existente',
  direccion: 'direccion',
  'numero exterior': 'numero_exterior',
  colonia: 'colonia',
  municipio: 'municipio',
  ciudad: 'ciudad',
  estado: 'estado',
  'codigo postal': 'codigo_postal',
  'simulacion cuotas': 'simulacion_cuotas',
  'simulacion monto cuotas': 'simulacion_monto_cuotas',
  'simulacion producto': 'simulacion_producto',
  'porcentaje de completitud': 'porcentaje_completitud',
  'folio consulta cdc': 'folio_cdc',
  rfc: 'rfc',
}

const OBLIGATORIAS = ['nombre', 'estatus', 'fecha de ingreso', 'rfc']

// Persona física: 4 letras + 6 dígitos + 3 homoclave. Persona moral: 3 letras.
const RFC_VALIDO = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/
const RFC_BASE = /^[A-ZÑ&]{3,4}\d{6}/

// ---------------------------------------------------------------------
// Conversores de valores
// ---------------------------------------------------------------------

export function texto(v: unknown): string | null {
  if (v == null) return null
  const s = String(v).replace(/\s+/g, ' ').trim()
  return s === '' ? null : s
}

export function numero(v: unknown): number | null {
  const s = texto(v)
  if (!s) return null
  const n = Number(s.replace(/[$,\s]/g, ''))
  return Number.isFinite(n) ? n : null
}

const RE_FECHA = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/
const RE_ISO = /^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2}))?)?$/

const p2 = (n: number) => String(n).padStart(2, '0')

/**
 * Convierte 'dd/mm/aaaa hh:mm', 'dd/mm/aa' o ISO a partes de fecha.
 * Devuelve null si está vacío y 'invalida' si no se pudo interpretar.
 */
function partesFecha(v: unknown): { a: number; m: number; d: number; h: number; mi: number; s: number } | null | 'invalida' {
  const s = texto(v)
  if (!s) return null
  let a: number, m: number, d: number, h = 0, mi = 0, seg = 0
  let x = RE_FECHA.exec(s)
  if (x) {
    d = +x[1]
    m = +x[2]
    a = x[3].length === 2 ? 2000 + +x[3] : +x[3]
    if (x[4]) [h, mi, seg] = [+x[4], +x[5], +(x[6] ?? 0)]
  } else if ((x = RE_ISO.exec(s))) {
    a = +x[1]
    m = +x[2]
    d = +x[3]
    if (x[4]) [h, mi, seg] = [+x[4], +x[5], +(x[6] ?? 0)]
  } else {
    return 'invalida'
  }
  const f = new Date(Date.UTC(a, m - 1, d))
  if (f.getUTCFullYear() !== a || f.getUTCMonth() !== m - 1 || f.getUTCDate() !== d) return 'invalida'
  if (h > 23 || mi > 59 || seg > 59) return 'invalida'
  return { a, m, d, h, mi, s: seg }
}

export function fechaHora(v: unknown): string | null | 'invalida' {
  const p = partesFecha(v)
  if (p === null || p === 'invalida') return p
  return `${p.a}-${p2(p.m)}-${p2(p.d)}T${p2(p.h)}:${p2(p.mi)}:${p2(p.s)}`
}

export function fecha(v: unknown): string | null | 'invalida' {
  const p = partesFecha(v)
  if (p === null || p === 'invalida') return p
  return `${p.a}-${p2(p.m)}-${p2(p.d)}`
}

/** El analista a veces llega como JSON: {"value":"X","code":"X","text":"X"} */
export function analista(v: unknown): string | null {
  const s = texto(v)
  if (!s || !s.startsWith('{')) return s
  try {
    const o = JSON.parse(s) as Record<string, unknown>
    return texto(o.text ?? o.value ?? o.code) ?? s
  } catch {
    return s
  }
}

/**
 * Clave única del expediente: base del RFC (10 caracteres, sin homoclave) + fecha/hora de ingreso.
 * Se usa la base porque la homoclave a veces llega incompleta ("xxx") y se corrige después.
 * Sin RFC utilizable se usa el nombre.
 */
export function calcularClave(rfc: string | null, nombre: string, fechaIngreso: string | null): string {
  const base = rfc && RFC_BASE.exec(rfc)?.[0]
  const id = base ?? `NOMBRE:${normalizarTexto(nombre).toUpperCase()}`
  return `${id}|${fechaIngreso ?? 'SIN-FECHA'}`
}

// ---------------------------------------------------------------------
// Lectura del archivo
// ---------------------------------------------------------------------

/** Decodifica el archivo como UTF-8; si no es válido, como Windows-1252 (Excel en español). */
export function decodificar(buffer: ArrayBuffer): string {
  let s: string
  try {
    s = new TextDecoder('utf-8', { fatal: true }).decode(buffer)
  } catch {
    s = new TextDecoder('windows-1252').decode(buffer)
  }
  return s.replace(/^﻿/, '')
}

/** Divide una fila de tabla Markdown respetando los "\|" escapados. */
function celdasMarkdown(linea: string): string[] {
  const t = linea.trim().replace(/^\|/, '').replace(/\|$/, '')
  return t.split(/(?<!\\)\|/).map((c) => c.replace(/\\\|/g, '|').trim())
}

function tablaMarkdown(contenido: string): string[][] {
  return contenido
    .split(/\r?\n/)
    .filter((l) => l.trim().startsWith('|'))
    .map(celdasMarkdown)
    .filter((celdas) => !celdas.every((c) => /^:?-{3,}:?$/.test(c))) // separador | --- |
}

function tablaCsv(contenido: string): string[][] {
  const r = Papa.parse<string[]>(contenido, { skipEmptyLines: 'greedy' })
  if (r.data.length === 0) throw new ErrorArchivo('El archivo está vacío.')
  return r.data
}

/**
 * Lee el contenido del archivo de legajos (CSV o tabla Markdown) y lo normaliza.
 * @param estatusConocidos nombres oficiales de estatus (de config_estatus) para corregir
 *        diferencias de acentos o mayúsculas y avisar de estatus desconocidos.
 */
export function leerLegajos(contenido: string, estatusConocidos: string[] = []): ResultadoLectura {
  const esMarkdown = contenido.trimStart().startsWith('|')
  const tabla = esMarkdown ? tablaMarkdown(contenido) : tablaCsv(contenido)
  if (tabla.length < 1) throw new ErrorArchivo('El archivo está vacío.')

  const encabezados = tabla[0].map((h) => normalizarTexto(h))
  const faltan = OBLIGATORIAS.filter((c) => !encabezados.includes(c))
  if (faltan.length) {
    throw new ErrorArchivo(
      `No parece el archivo de legajos: faltan las columnas ${faltan.map((f) => f.toUpperCase()).join(', ')}.`,
    )
  }
  const indice = new Map<keyof FilaExpediente, number>()
  encabezados.forEach((h, i) => {
    const campo = COLUMNAS[h]
    if (campo && !indice.has(campo)) indice.set(campo, i)
  })

  const mapaEstatus = new Map(estatusConocidos.map((e) => [normalizarTexto(e), e]))
  const avisos: Aviso[] = []
  const porClave = new Map<string, { fila: FilaExpediente; numero: number }>()
  const estatusDesconocidos = new Set<string>()

  tabla.slice(1).forEach((celdas, i) => {
    const numFila = i + 1
    const crudo = (campo: keyof FilaExpediente) => {
      const idx = indice.get(campo)
      return idx === undefined ? undefined : celdas[idx]
    }

    const nombre = texto(crudo('nombre'))?.toUpperCase() ?? null
    const estatusTexto = texto(crudo('estatus'))
    if (!nombre && !texto(crudo('rfc'))) return // fila en blanco
    if (!nombre || !estatusTexto) {
      avisos.push({ tipo: 'omitida', fila: numFila, nombre, mensaje: 'Fila sin nombre o sin estatus; no se cargará.' })
      return
    }

    const estatus = mapaEstatus.get(normalizarTexto(estatusTexto)) ?? estatusTexto
    if (mapaEstatus.size && !mapaEstatus.has(normalizarTexto(estatusTexto)) && !estatusDesconocidos.has(estatus)) {
      estatusDesconocidos.add(estatus)
      avisos.push({
        tipo: 'estatus',
        fila: numFila,
        nombre,
        mensaje: `Estatus "${estatus}" no está en el catálogo; se tratará como activo.`,
      })
    }

    const rfc = texto(crudo('rfc'))?.toUpperCase().replace(/\s/g, '') ?? null
    // "XXX" es el relleno que se usa cuando no se conoce la homoclave
    const rfcValido = !!rfc && RFC_VALIDO.test(rfc) && !rfc.endsWith('XXX')
    if (!rfcValido) {
      avisos.push({
        tipo: 'rfc',
        fila: numFila,
        nombre,
        mensaje: rfc ? `RFC incompleto o inválido: ${rfc}` : 'Sin RFC.',
      })
    }

    const fechas: Record<'fecha_ingreso' | 'fecha_comite' | 'fecha_firma', string | null> = {
      fecha_ingreso: null,
      fecha_comite: null,
      fecha_firma: null,
    }
    for (const campo of ['fecha_ingreso', 'fecha_comite', 'fecha_firma'] as const) {
      const v = campo === 'fecha_ingreso' ? fechaHora(crudo(campo)) : fecha(crudo(campo))
      if (v === 'invalida') {
        avisos.push({
          tipo: 'fecha',
          fila: numFila,
          nombre,
          mensaje: `Fecha no reconocida en ${campo.replace('_', ' ')}: "${texto(crudo(campo))}"`,
        })
      } else {
        fechas[campo] = v
      }
    }

    const fila: FilaExpediente = {
      clave: calcularClave(rfc, nombre, fechas.fecha_ingreso),
      nombre,
      rfc,
      rfc_valido: rfcValido,
      producto: texto(crudo('producto')),
      monto_solicitado: numero(crudo('monto_solicitado')),
      fecha_ingreso: fechas.fecha_ingreso,
      fecha_comite: fechas.fecha_comite,
      monto_aprobado: numero(crudo('monto_aprobado')),
      fecha_firma: fechas.fecha_firma,
      estatus,
      asesor: texto(crudo('asesor')),
      analista: analista(crudo('analista')),
      siac_aval_nuevo: texto(crudo('siac_aval_nuevo')),
      siac_aval_existente: texto(crudo('siac_aval_existente')),
      direccion: texto(crudo('direccion')),
      numero_exterior: texto(crudo('numero_exterior')),
      colonia: texto(crudo('colonia')),
      municipio: texto(crudo('municipio')),
      ciudad: texto(crudo('ciudad')),
      estado: texto(crudo('estado')),
      codigo_postal: texto(crudo('codigo_postal')),
      simulacion_cuotas: texto(crudo('simulacion_cuotas')),
      simulacion_monto_cuotas: texto(crudo('simulacion_monto_cuotas')),
      simulacion_producto: texto(crudo('simulacion_producto')),
      porcentaje_completitud: numero(crudo('porcentaje_completitud')),
      folio_cdc: texto(crudo('folio_cdc')),
    }

    const previo = porClave.get(fila.clave)
    if (previo) {
      avisos.push({
        tipo: 'duplicado',
        fila: numFila,
        nombre,
        mensaje: `Expediente repetido (mismo RFC y fecha de ingreso que la fila ${previo.numero}); se usará esta última.`,
      })
    }
    porClave.set(fila.clave, { fila, numero: numFila })
  })

  if (porClave.size === 0) throw new ErrorArchivo('El archivo no contiene expedientes.')

  return { filas: [...porClave.values()].map((v) => v.fila), avisos, totalLeidas: tabla.length - 1 }
}

/** Extrae la fecha del nombre "legajos-19-11-2026-12-21.csv" como Date local, o null. */
export function fechaDeNombreArchivo(nombre: string): Date | null {
  const x = /(\d{2})-(\d{2})-(\d{4})-(\d{2})-(\d{2})/.exec(nombre)
  if (!x) return null
  const f = new Date(+x[3], +x[2] - 1, +x[1], +x[4], +x[5])
  return Number.isNaN(f.getTime()) ? null : f
}
