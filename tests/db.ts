import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const DIR = join(__dirname, '..', 'supabase', 'migrations')

/** Postgres en memoria con las migraciones del proyecto y simulación mínima de Supabase Auth. */
export async function crearBase(): Promise<PGlite> {
  const db = new PGlite()
  await db.exec(`
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
    create function auth.jwt() returns jsonb language sql as $$ select '{"email":"prueba@equipo.mx"}'::jsonb $$;
    create role authenticated;
    create role anon;
  `)
  for (const f of readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort()) {
    await db.exec(readFileSync(join(DIR, f), 'utf8'))
  }
  return db
}
