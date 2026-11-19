-- =====================================================================
-- CONTROLDIGI · Fase 3 · Notas de seguimiento por expediente
-- Pegar completo en Supabase > SQL Editor > New query > Run.
-- Es seguro volver a ejecutarlo.
-- =====================================================================

create table if not exists public.notas_expediente (
  id            bigint generated always as identity primary key,
  expediente_id uuid not null references public.expedientes (id) on delete cascade,
  texto         text not null check (length(trim(texto)) > 0 and length(texto) <= 2000),
  autor_email   text not null default (auth.jwt() ->> 'email'),
  created_at    timestamptz not null default now()
);

create index if not exists notas_expediente_idx on public.notas_expediente (expediente_id, created_at desc);

grant select, insert, delete on public.notas_expediente to authenticated;
grant usage, select on all sequences in schema public to authenticated;

alter table public.notas_expediente enable row level security;

-- Todo el equipo ve y agrega notas; cada quien solo borra las suyas.
drop policy if exists "notas_ver" on public.notas_expediente;
create policy "notas_ver" on public.notas_expediente
  for select to authenticated using (true);

drop policy if exists "notas_agregar" on public.notas_expediente;
create policy "notas_agregar" on public.notas_expediente
  for insert to authenticated with check (autor_email = (auth.jwt() ->> 'email'));

drop policy if exists "notas_borrar_propias" on public.notas_expediente;
create policy "notas_borrar_propias" on public.notas_expediente
  for delete to authenticated using (autor_email = (auth.jwt() ->> 'email'));
