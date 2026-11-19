import { beforeEach, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { crearBase } from './db'
import type { FilaExpediente } from '../src/lib/csv'

interface Resultado {
  aplicado: boolean
  carga_id: string | null
  activos_antes: number
  sin_cambio: number
  nuevos: { clave: string; a: string }[]
  cambios: { clave: string; de: string; a: string }[]
  reactivados: { clave: string; motivo_cierre: string }[]
  cerrados: { clave: string }[]
  salen: { clave: string }[]
  ignorados: { clave: string }[]
}

function exp(clave: string, estatus: string, extra: Partial<FilaExpediente> = {}): Partial<FilaExpediente> {
  return {
    clave,
    nombre: `CLIENTE ${clave}`,
    rfc: null,
    rfc_valido: true,
    estatus,
    fecha_ingreso: '2026-11-10T10:00:00',
    monto_solicitado: 50000,
    ...extra,
  }
}

async function cargar(db: PGlite, filas: Partial<FilaExpediente>[], aplicar = true): Promise<Resultado> {
  const r = await db.query<{ r: Resultado }>('select public.procesar_carga($1, $2::jsonb, $3) as r', [
    'legajos-prueba.csv',
    JSON.stringify(filas),
    aplicar,
  ])
  return r.rows[0].r
}

const claves = (xs: { clave: string }[]) => xs.map((x) => x.clave).sort()

async function expediente(db: PGlite, clave: string) {
  const r = await db.query<{
    estatus: string
    cerrado_en: Date | null
    motivo_cierre: string | null
    estatus_desde: Date
    monto_solicitado: string
  }>('select * from public.expedientes where clave = $1', [clave])
  return r.rows[0]
}

async function historial(db: PGlite, clave: string) {
  const r = await db.query<{ estatus_anterior: string | null; estatus_nuevo: string }>(
    `select h.estatus_anterior, h.estatus_nuevo from public.historial_estatus h
       join public.expedientes e on e.id = h.expediente_id where e.clave = $1 order by h.id`,
    [clave],
  )
  return r.rows.map((h) => `${h.estatus_anterior ?? '∅'} → ${h.estatus_nuevo}`)
}

describe('procesar_carga', () => {
  let db: PGlite
  beforeEach(async () => {
    db = await crearBase()
  })

  it('la vista previa no escribe nada', async () => {
    const r = await cargar(db, [exp('A', 'Nuevo'), exp('B', 'Comité')], false)
    expect(r.aplicado).toBe(false)
    expect(claves(r.nuevos)).toEqual(['A', 'B'])
    const n = await db.query<{ n: number }>('select count(*)::int as n from public.expedientes')
    const c = await db.query<{ n: number }>('select count(*)::int as n from public.cargas')
    expect(n.rows[0].n).toBe(0)
    expect(c.rows[0].n).toBe(0)
  })

  it('primera carga: crea activos e ignora los que ya vienen en Mesa de control', async () => {
    const r = await cargar(db, [exp('A', 'Nuevo'), exp('B', 'Comité'), exp('C', 'Mesa de control')])
    expect(claves(r.nuevos)).toEqual(['A', 'B'])
    expect(claves(r.ignorados)).toEqual(['C'])
    expect(await expediente(db, 'C')).toBeUndefined()
    expect(await historial(db, 'A')).toEqual(['∅ → Nuevo'])

    // "Nuevo" arranca su reloj en la fecha de ingreso (hora de México); otros estatus, hoy
    const a = await expediente(db, 'A')
    const b = await expediente(db, 'B')
    expect(a.estatus_desde.toISOString()).toBe('2026-11-10T16:00:00.000Z')
    expect(Date.now() - b.estatus_desde.getTime()).toBeLessThan(60_000)

    const carga = await db.query<{ nuevos: number; ignorados: number; cargado_por_email: string }>(
      'select nuevos, ignorados, cargado_por_email from public.cargas',
    )
    expect(carga.rows[0]).toEqual({ nuevos: 2, ignorados: 1, cargado_por_email: 'prueba@equipo.mx' })
  })

  it('cargas siguientes: cambios, sin cambio, salidas, cierres y reactivaciones', async () => {
    await cargar(db, [exp('A', 'Nuevo'), exp('B', 'Análisis de crédito'), exp('C', 'Comité'), exp('D', 'En revisión')])

    // Día 2: A cambia, B igual (pero con nuevo monto), C no viene, D llega en Mesa de control, E es nuevo
    const r2 = await cargar(db, [
      exp('A', 'Alta de solicitud'),
      exp('B', 'Análisis de crédito', { monto_solicitado: 99000 }),
      exp('D', 'Mesa de control'),
      exp('E', 'Nuevo'),
    ])
    expect(r2.activos_antes).toBe(4)
    expect(r2.cambios).toMatchObject([{ clave: 'A', de: 'Nuevo', a: 'Alta de solicitud' }])
    expect(r2.sin_cambio).toBe(1)
    expect(claves(r2.salen)).toEqual(['C'])
    expect(claves(r2.cerrados)).toEqual(['D'])
    expect(claves(r2.nuevos)).toEqual(['E'])

    expect(Number((await expediente(db, 'B')).monto_solicitado)).toBe(99000)
    expect(await expediente(db, 'C')).toMatchObject({ motivo_cierre: 'Salió del reporte', estatus: 'Comité' })
    expect(await expediente(db, 'D')).toMatchObject({ motivo_cierre: 'Mesa de control', estatus: 'Mesa de control' })
    expect(await historial(db, 'A')).toEqual(['∅ → Nuevo', 'Nuevo → Alta de solicitud'])
    expect(await historial(db, 'C')).toEqual(['∅ → Comité', 'Comité → Salió del reporte'])

    // Día 3: C reaparece (se reactiva); D sigue llegando en Mesa de control (ya cerrado, se ignora)
    const cerradoD = (await expediente(db, 'D')).cerrado_en
    const r3 = await cargar(db, [
      exp('A', 'Alta de solicitud'),
      exp('B', 'Análisis de crédito'),
      exp('C', 'Comité'),
      exp('D', 'Mesa de control'),
      exp('E', 'Nuevo'),
    ])
    expect(r3.reactivados).toMatchObject([{ clave: 'C', motivo_cierre: 'Salió del reporte' }])
    expect(claves(r3.ignorados)).toEqual(['D'])
    expect(r3.salen).toEqual([])
    expect(await expediente(db, 'C')).toMatchObject({ cerrado_en: null, motivo_cierre: null })
    expect(await historial(db, 'C')).toEqual([
      '∅ → Comité',
      'Comité → Salió del reporte',
      'Salió del reporte → Comité',
    ])
    // El reloj de 3 días de D no se reinicia
    expect((await expediente(db, 'D')).cerrado_en).toEqual(cerradoD)

    const cargas = await db.query<{ n: number }>('select count(*)::int as n from public.cargas')
    expect(cargas.rows[0].n).toBe(3)
  })

  it('rechaza archivos vacíos o con claves repetidas sin guardar nada', async () => {
    await expect(cargar(db, [])).rejects.toThrow(/no contiene expedientes/)
    await expect(cargar(db, [exp('A', 'Nuevo'), exp('A', 'Comité')])).rejects.toThrow(/duplicados/)
    const c = await db.query<{ n: number }>('select count(*)::int as n from public.cargas')
    expect(c.rows[0].n).toBe(0)
  })
})
