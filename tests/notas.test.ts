import { beforeEach, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { crearBase } from './db'

describe('notas_expediente (seguridad)', () => {
  let db: PGlite
  let expId: string

  beforeEach(async () => {
    db = await crearBase()
    const r = await db.query<{ id: string }>(
      "insert into public.expedientes (clave, nombre, estatus) values ('A|1', 'CLIENTE A', 'Nuevo') returning id",
    )
    expId = r.rows[0].id
    // Nota de otra persona (insertada como administrador, sin RLS)
    await db.query("insert into public.notas_expediente (expediente_id, texto, autor_email) values ($1, 'De otra persona', 'otra@equipo.mx')", [expId])
  })

  it('un usuario agrega notas a su nombre y solo puede borrar las suyas', async () => {
    await db.exec('set role authenticated')
    await db.query("insert into public.notas_expediente (expediente_id, texto) values ($1, 'Mía')", [expId])

    // No puede firmar como otra persona
    await expect(
      db.query("insert into public.notas_expediente (expediente_id, texto, autor_email) values ($1, 'x', 'otra@equipo.mx')", [expId]),
    ).rejects.toThrow()

    await db.query('delete from public.notas_expediente')
    const r = await db.query<{ texto: string; autor_email: string }>('select texto, autor_email from public.notas_expediente')
    expect(r.rows).toEqual([{ texto: 'De otra persona', autor_email: 'otra@equipo.mx' }])
  })

  it('las notas se borran junto con el expediente', async () => {
    await db.query('delete from public.expedientes where id = $1', [expId])
    const r = await db.query<{ n: number }>('select count(*)::int n from public.notas_expediente')
    expect(r.rows[0].n).toBe(0)
  })
})
