import { describe, expect, it } from 'vitest'
import {
  analista,
  calcularClave,
  decodificar,
  ErrorArchivo,
  fecha,
  fechaDeNombreArchivo,
  fechaHora,
  leerLegajos,
  numero,
} from '../src/lib/csv'

const ESTATUS = ['Nuevo', 'Alta de solicitud', 'Análisis de crédito', 'En revisión', 'Comité', 'Mesa de control']

const ENCABEZADO =
  'NOMBRE,PRODUCTO,MONTO SOLICITADO,FECHA DE INGRESO,FECHA DE COMITÉ DE CRÉDITO,MONTO APROBADO,FECHA DE FIRMA,ESTATUS,ASESOR DE CRÉDITO,ANALISTA,SIAC - Alta Aval Nuevo,SIAC - Alta Aval Existente,Direccion,Número exterior,Colonia,Municipio,Ciudad,Estado,Código Postal,Simulación cuotas,Simulación monto cuotas,Simulación producto,Porcentaje de completitud,Folio consulta CDC,RFC'

const fila = (o: Partial<Record<string, string>>) =>
  [
    o.nombre ?? 'PEREZ LOPEZ JUAN', '', o.monto ?? '50000', o.ingreso ?? '18/11/2026 16:08', o.comite ?? '',
    o.aprobado ?? '', '', o.estatus ?? 'Nuevo', 'Asesor Uno', o.analista ?? 'ANALISTA UNO', o.siac ?? '', '',
    'Calle 1', '10', 'Centro', 'Puebla', 'Puebla', 'PUEBLA', '72000', '', '', '', '100', '1234567890',
    o.rfc ?? 'PELJ800101AB1',
  ]
    .map((c) => (/[",|]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c))
    .join(',')

describe('conversores', () => {
  it('interpreta fechas en varios formatos', () => {
    expect(fechaHora('18/11/2026 16:08')).toBe('2026-11-18T16:08:00')
    expect(fechaHora('5/1/2026 9:05')).toBe('2026-01-05T09:05:00')
    expect(fecha('17/11/26')).toBe('2026-11-17')
    expect(fecha('2026-11-17')).toBe('2026-11-17')
    expect(fecha('')).toBeNull()
    expect(fecha('31/02/2026')).toBe('invalida')
    expect(fecha('mañana')).toBe('invalida')
  })

  it('interpreta montos', () => {
    expect(numero('150000.00')).toBe(150000)
    expect(numero('$1,250.50')).toBe(1250.5)
    expect(numero('')).toBeNull()
    expect(numero('abc')).toBeNull()
  })

  it('extrae el analista cuando llega como JSON', () => {
    expect(analista('{"value":"ANA RUIZ","code":"ANA RUIZ","text":"ANA RUIZ"}')).toBe('ANA RUIZ')
    expect(analista('ANA RUIZ')).toBe('ANA RUIZ')
    expect(analista('{roto')).toBe('{roto')
  })

  it('la clave usa la base del RFC (sin homoclave) y la fecha de ingreso', () => {
    expect(calcularClave('PELJ800101AB1', 'X', '2026-11-18T16:08:00')).toBe('PELJ800101|2026-11-18T16:08:00')
    expect(calcularClave('PELJ800101xxx'.toUpperCase(), 'X', '2026-11-18T16:08:00')).toBe(
      'PELJ800101|2026-11-18T16:08:00',
    )
    expect(calcularClave(null, 'Pérez  López', null)).toBe('NOMBRE:PEREZ LOPEZ|SIN-FECHA')
  })

  it('lee la fecha del nombre del archivo', () => {
    const f = fechaDeNombreArchivo('legajos-19-11-2026-12-21.csv')!
    expect([f.getFullYear(), f.getMonth(), f.getDate(), f.getHours(), f.getMinutes()]).toEqual([2026, 10, 19, 12, 21])
    expect(fechaDeNombreArchivo('otro.csv')).toBeNull()
  })
})

describe('leerLegajos (CSV)', () => {
  it('normaliza una fila completa', () => {
    const { filas, avisos } = leerLegajos(
      [ENCABEZADO, fila({ estatus: 'Analisis de credito', comite: '17/11/26', aprobado: '45000' })].join('\n'),
      ESTATUS,
    )
    expect(avisos).toEqual([])
    expect(filas).toHaveLength(1)
    expect(filas[0]).toMatchObject({
      clave: 'PELJ800101|2026-11-18T16:08:00',
      nombre: 'PEREZ LOPEZ JUAN',
      estatus: 'Análisis de crédito', // corregido al nombre oficial
      monto_solicitado: 50000,
      monto_aprobado: 45000,
      fecha_comite: '2026-11-17',
      rfc_valido: true,
      folio_cdc: '1234567890',
      codigo_postal: '72000',
    })
  })

  it('separa con punto y coma y respeta el "|" dentro de comillas', () => {
    const csv = [ENCABEZADO, fila({ siac: 'CURP|*RFC DUPLICADO' })].join('\n')
    const pyc = csv.replace(/,/g, ';')
    expect(leerLegajos(csv).filas[0].siac_aval_nuevo).toBe('CURP|*RFC DUPLICADO')
    expect(leerLegajos(pyc).filas[0].siac_aval_nuevo).toBe('CURP|*RFC DUPLICADO')
  })

  it('un cliente con dos expedientes genera dos claves distintas', () => {
    const { filas } = leerLegajos(
      [ENCABEZADO, fila({ ingreso: '18/11/2026 10:00' }), fila({ ingreso: '18/11/2026 11:30', monto: '20000' })].join(
        '\n',
      ),
    )
    expect(filas.map((f) => f.clave)).toEqual(['PELJ800101|2026-11-18T10:00:00', 'PELJ800101|2026-11-18T11:30:00'])
  })

  it('avisa de RFC inválido, estatus desconocido, fechas raras y duplicados', () => {
    const { filas, avisos } = leerLegajos(
      [
        ENCABEZADO,
        fila({ rfc: 'MACA640903xxx', nombre: 'A' }),
        fila({ rfc: 'BBBB900101AB1', nombre: 'B', estatus: 'Suspendido' }),
        fila({ rfc: 'CCCC900101AB1', nombre: 'C', comite: '99/99/2026' }),
        fila({ rfc: 'CCCC900101AB1', nombre: 'C' }),
        fila({ rfc: 'DDDD900101AB1', nombre: 'D', estatus: '' }),
      ].join('\n'),
      ESTATUS,
    )
    expect(avisos.map((a) => a.tipo).sort()).toEqual(['duplicado', 'estatus', 'fecha', 'omitida', 'rfc'])
    expect(filas).toHaveLength(3)
    expect(filas.find((f) => f.nombre === 'A')!.rfc_valido).toBe(false)
  })

  it('rechaza archivos que no son de legajos', () => {
    expect(() => leerLegajos('a,b,c\n1,2,3')).toThrow(ErrorArchivo)
    expect(() => leerLegajos(ENCABEZADO)).toThrow(/no contiene expedientes/)
  })

  it('decodifica archivos en Windows-1252 (acentos de Excel)', () => {
    const bytes = new Uint8Array([0x43, 0x4f, 0x4d, 0x49, 0x54, 0xc9]) // "COMITÉ" en latin1
    expect(decodificar(bytes.buffer)).toBe('COMITÉ')
    const utf8 = new TextEncoder().encode('﻿COMITÉ')
    expect(decodificar(utf8.buffer as ArrayBuffer)).toBe('COMITÉ')
  })
})

describe('leerLegajos (tabla Markdown)', () => {
  it('lee la tabla y quita el escape de "\\|"', () => {
    const md = [
      '| NOMBRE | FECHA DE INGRESO | ESTATUS | SIAC - Alta Aval Nuevo | RFC |',
      '| --- | --- | --- | --- | --- |',
      '| PEREZ LOPEZ JUAN | 18/11/2026 16:08 | Comité | CURP\\|*RFC YA REGISTRADOS | PELJ800101AB1 |',
      '',
    ].join('\n')
    const { filas } = leerLegajos(md, ESTATUS)
    expect(filas[0]).toMatchObject({ estatus: 'Comité', siac_aval_nuevo: 'CURP|*RFC YA REGISTRADOS' })
  })
})
