-- =====================================================================
-- CONTROLDIGI · Esquema inicial
-- Pegar completo en Supabase > SQL Editor > New query > Run.
-- Es seguro volver a ejecutarlo (usa IF NOT EXISTS / ON CONFLICT).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Catálogo de estatus: orden de las etapas, días permitidos sin cambio
-- antes de alertar y si el estatus cierra el expediente para el área.
-- ---------------------------------------------------------------------
create table if not exists public.config_estatus (
  estatus      text primary key,
  orden        int  not null,
  dias_alerta  int  check (dias_alerta is null or dias_alerta >= 0),
  es_final     boolean not null default false
);

insert into public.config_estatus (estatus, orden, dias_alerta, es_final) values
  ('Nuevo',               1, 1, false),
  ('Alta de solicitud',   2, 3, false),
  ('Análisis de crédito', 3, 2, false),
  ('En revisión',         4, 2, false),
  ('Comité',              5, 2, false),
  ('Mesa de control',     6, null, true),
  ('Cancelado',           7, null, true),
  ('Rechazado',           8, null, true)
on conflict (estatus) do nothing;

-- ---------------------------------------------------------------------
-- Bitácora de cargas diarias del CSV
-- ---------------------------------------------------------------------
create table if not exists public.cargas (
  id               uuid primary key default gen_random_uuid(),
  nombre_archivo   text not null,
  cargado_por      uuid default auth.uid() references auth.users (id) on delete set null,
  cargado_por_email text default (auth.jwt() ->> 'email'),
  created_at       timestamptz not null default now(),
  total_filas      int not null default 0,
  nuevos           int not null default 0,
  cambios_estatus  int not null default 0,
  sin_cambio       int not null default 0,
  salieron         int not null default 0,
  reactivados      int not null default 0,
  ignorados        int not null default 0
);

-- ---------------------------------------------------------------------
-- Expedientes
-- clave = RFC + fecha/hora de ingreso (un cliente puede tener varios
-- expedientes a la vez, por eso el RFC solo no es único).
-- ---------------------------------------------------------------------
create table if not exists public.expedientes (
  id                      uuid primary key default gen_random_uuid(),
  clave                   text not null unique,

  -- Datos tal como vienen en el CSV (normalizados)
  nombre                  text not null,
  rfc                     text,
  rfc_valido              boolean not null default true,
  producto                text,
  monto_solicitado        numeric(14,2),
  fecha_ingreso           timestamp,          -- hora local del sistema origen
  fecha_comite            date,
  monto_aprobado          numeric(14,2),
  fecha_firma             date,
  estatus                 text not null,
  asesor                  text,
  analista                text,
  siac_aval_nuevo         text,
  siac_aval_existente     text,
  direccion               text,
  numero_exterior         text,
  colonia                 text,
  municipio               text,
  ciudad                  text,
  estado                  text,
  codigo_postal           text,
  simulacion_cuotas       text,
  simulacion_monto_cuotas text,
  simulacion_producto     text,
  porcentaje_completitud  numeric(5,2),
  folio_cdc               text,

  -- Seguimiento
  estatus_desde           timestamptz not null default now(), -- último cambio de estatus
  primera_vez             timestamptz not null default now(), -- primera carga en que apareció
  ultima_vez_en_reporte   timestamptz not null default now(),
  ultima_carga_id         uuid references public.cargas (id) on delete set null,
  cerrado_en              timestamptz,        -- null = activo
  motivo_cierre           text,               -- 'Salió del reporte', 'Mesa de control', 'Cancelado', 'Rechazado'
  notas                   text,

  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create index if not exists expedientes_estatus_idx  on public.expedientes (estatus);
create index if not exists expedientes_rfc_idx      on public.expedientes (rfc);
create index if not exists expedientes_cerrado_idx  on public.expedientes (cerrado_en);

-- ---------------------------------------------------------------------
-- Historial de cambios de estatus (línea de tiempo del expediente)
-- ---------------------------------------------------------------------
create table if not exists public.historial_estatus (
  id               bigint generated always as identity primary key,
  expediente_id    uuid not null references public.expedientes (id) on delete cascade,
  estatus_anterior text,
  estatus_nuevo    text not null,
  fecha            timestamptz not null default now(),
  carga_id         uuid references public.cargas (id) on delete set null,
  usuario_email    text default (auth.jwt() ->> 'email')
);

create index if not exists historial_expediente_idx on public.historial_estatus (expediente_id, fecha);

-- ---------------------------------------------------------------------
-- Checklist de documentos (mismo catálogo para todos los expedientes)
-- ---------------------------------------------------------------------
create table if not exists public.catalogo_documentos (
  id         bigint generated always as identity primary key,
  nombre     text not null unique,
  orden      int not null default 0,
  activo     boolean not null default true,
  created_at timestamptz not null default now()
);

-- Si no hay registro para un documento, se considera FALTANTE.
create table if not exists public.documentos_expediente (
  expediente_id   uuid   not null references public.expedientes (id) on delete cascade,
  documento_id    bigint not null references public.catalogo_documentos (id) on delete cascade,
  recibido        boolean not null default false,
  nota            text,
  actualizado_por text default (auth.jwt() ->> 'email'),
  updated_at      timestamptz not null default now(),
  primary key (expediente_id, documento_id)
);

-- ---------------------------------------------------------------------
-- updated_at automático
-- ---------------------------------------------------------------------
create or replace function public.tocar_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists expedientes_updated_at on public.expedientes;
create trigger expedientes_updated_at before update on public.expedientes
  for each row execute function public.tocar_updated_at();

drop trigger if exists documentos_expediente_updated_at on public.documentos_expediente;
create trigger documentos_expediente_updated_at before update on public.documentos_expediente
  for each row execute function public.tocar_updated_at();

-- ---------------------------------------------------------------------
-- Seguridad (RLS): solo usuarios con sesión iniciada; todos ven todo.
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'config_estatus', 'cargas', 'expedientes', 'historial_estatus',
    'catalogo_documentos', 'documentos_expediente'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "equipo_acceso_total" on public.%I', t);
    execute format(
      'create policy "equipo_acceso_total" on public.%I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;
