-- =====================================================================
-- CONTROLDIGI · Fase 2 · Procesamiento de la carga diaria
-- Pegar completo en Supabase > SQL Editor > New query > Run.
-- Requiere haber ejecutado antes 001_esquema_inicial.sql.
--
-- procesar_carga(nombre_archivo, filas, aplicar)
--   filas   : arreglo JSON de expedientes ya normalizados por la app
--             (llaves = nombres de columna de public.expedientes + "clave")
--   aplicar : false = solo vista previa (no escribe nada)
--             true  = guarda todo en una sola transacción
--
-- Reglas:
--   * Expediente nuevo con estatus activo         -> se crea
--   * Llega con estatus final (Mesa de control…)  -> se cierra (o se ignora si no existía)
--   * Cambió de estatus                           -> se registra en historial
--   * Estaba cerrado y vuelve a aparecer activo   -> se reactiva
--   * Activo que ya no viene en el archivo        -> se cierra: "Salió del reporte"
-- =====================================================================

create or replace function public.procesar_carga(
  p_nombre_archivo text,
  p_filas          jsonb,
  p_aplicar        boolean default false
) returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_ahora        timestamptz := now();
  v_carga_id     uuid;
  v_claves       text[];
  v_activos_antes int;
  r              jsonb;
  d              public.expedientes%rowtype;   -- fila del archivo, ya tipada
  e              public.expedientes%rowtype;   -- fila existente en la base
  v_existe       boolean;
  v_final        boolean;
  v_item         jsonb;
  v_id           uuid;
  v_desde        timestamptz;
  v_nuevos       jsonb := '[]';
  v_cambios      jsonb := '[]';
  v_reactivados  jsonb := '[]';
  v_cerrados     jsonb := '[]';
  v_salen        jsonb := '[]';
  v_ignorados    jsonb := '[]';
  v_sin_cambio   int   := 0;
begin
  if p_filas is null or jsonb_typeof(p_filas) <> 'array' or jsonb_array_length(p_filas) = 0 then
    raise exception 'El archivo no contiene expedientes.';
  end if;

  select array_agg(x ->> 'clave') into v_claves from jsonb_array_elements(p_filas) x;

  if exists (select 1 from unnest(v_claves) c where c is null or c = '') then
    raise exception 'Hay filas sin clave de expediente.';
  end if;
  if (select count(distinct c) from unnest(v_claves) c) <> cardinality(v_claves) then
    raise exception 'El archivo contiene expedientes duplicados (misma clave).';
  end if;

  if p_aplicar then
    -- Evita que dos personas apliquen cargas al mismo tiempo
    perform pg_advisory_xact_lock(hashtext('controldigi.procesar_carga'));
    insert into cargas (nombre_archivo, total_filas)
      values (coalesce(nullif(trim(p_nombre_archivo), ''), 'sin nombre'), jsonb_array_length(p_filas))
      returning id into v_carga_id;
  end if;

  select count(*) into v_activos_antes from expedientes where cerrado_en is null;

  -- -------------------------------------------------------------------
  -- 1) Filas que vienen en el archivo
  -- -------------------------------------------------------------------
  for r in select * from jsonb_array_elements(p_filas) loop
    d := jsonb_populate_record(null::public.expedientes, r);
    if d.nombre is null or d.estatus is null then
      raise exception 'Fila sin nombre o sin estatus (clave %).', d.clave;
    end if;

    v_final := coalesce((select es_final from config_estatus where estatus = d.estatus), false);

    select * into e from expedientes where clave = d.clave;
    v_existe := found;

    v_item := jsonb_build_object('clave', d.clave, 'nombre', d.nombre, 'rfc', d.rfc, 'asesor', d.asesor,
                                 'de', case when v_existe then e.estatus end, 'a', d.estatus);

    -- ---- Clasificación -------------------------------------------------
    if not v_existe and v_final then
      v_ignorados := v_ignorados || v_item;
      continue;                                   -- nunca se dio de alta: no se guarda
    elsif not v_existe then
      v_nuevos := v_nuevos || v_item;
    elsif e.cerrado_en is null and v_final then
      v_cerrados := v_cerrados || v_item;
    elsif e.cerrado_en is null and d.estatus is distinct from e.estatus then
      v_cambios := v_cambios || v_item;
    elsif e.cerrado_en is null then
      v_sin_cambio := v_sin_cambio + 1;
    elsif not v_final then
      v_reactivados := v_reactivados || (v_item || jsonb_build_object('motivo_cierre', e.motivo_cierre));
    else
      v_ignorados := v_ignorados || v_item;       -- ya estaba cerrado y sigue en estatus final
    end if;

    if not p_aplicar then
      continue;
    end if;

    -- ---- Escritura -----------------------------------------------------
    if not v_existe then
      -- Si entra como "Nuevo", el reloj de alerta arranca en su fecha de ingreso;
      -- con cualquier otro estatus arranca hoy (no sabemos cuándo llegó a esa etapa).
      v_desde := case
        when d.estatus = 'Nuevo' and d.fecha_ingreso is not null
          then least(d.fecha_ingreso at time zone 'America/Mexico_City', v_ahora)
        else v_ahora
      end;

      insert into expedientes (
        clave, nombre, rfc, rfc_valido, producto, monto_solicitado, fecha_ingreso, fecha_comite,
        monto_aprobado, fecha_firma, estatus, asesor, analista, siac_aval_nuevo, siac_aval_existente,
        direccion, numero_exterior, colonia, municipio, ciudad, estado, codigo_postal,
        simulacion_cuotas, simulacion_monto_cuotas, simulacion_producto, porcentaje_completitud, folio_cdc,
        estatus_desde, primera_vez, ultima_vez_en_reporte, ultima_carga_id
      ) values (
        d.clave, d.nombre, d.rfc, coalesce(d.rfc_valido, true), d.producto, d.monto_solicitado, d.fecha_ingreso, d.fecha_comite,
        d.monto_aprobado, d.fecha_firma, d.estatus, d.asesor, d.analista, d.siac_aval_nuevo, d.siac_aval_existente,
        d.direccion, d.numero_exterior, d.colonia, d.municipio, d.ciudad, d.estado, d.codigo_postal,
        d.simulacion_cuotas, d.simulacion_monto_cuotas, d.simulacion_producto, d.porcentaje_completitud, d.folio_cdc,
        v_desde, v_ahora, v_ahora, v_carga_id
      ) returning id into v_id;

      insert into historial_estatus (expediente_id, estatus_anterior, estatus_nuevo, fecha, carga_id)
        values (v_id, null, d.estatus, v_desde, v_carga_id);
    else
      update expedientes set
        nombre = d.nombre, rfc = d.rfc, rfc_valido = coalesce(d.rfc_valido, true), producto = d.producto,
        monto_solicitado = d.monto_solicitado, fecha_ingreso = d.fecha_ingreso, fecha_comite = d.fecha_comite,
        monto_aprobado = d.monto_aprobado, fecha_firma = d.fecha_firma, asesor = d.asesor, analista = d.analista,
        siac_aval_nuevo = d.siac_aval_nuevo, siac_aval_existente = d.siac_aval_existente,
        direccion = d.direccion, numero_exterior = d.numero_exterior, colonia = d.colonia,
        municipio = d.municipio, ciudad = d.ciudad, estado = d.estado, codigo_postal = d.codigo_postal,
        simulacion_cuotas = d.simulacion_cuotas, simulacion_monto_cuotas = d.simulacion_monto_cuotas,
        simulacion_producto = d.simulacion_producto, porcentaje_completitud = d.porcentaje_completitud,
        folio_cdc = d.folio_cdc,
        estatus = d.estatus,
        estatus_desde = case when d.estatus is distinct from e.estatus then v_ahora else e.estatus_desde end,
        cerrado_en    = case when v_final then coalesce(e.cerrado_en, v_ahora) else null end,
        motivo_cierre = case when v_final then d.estatus else null end,
        ultima_vez_en_reporte = v_ahora,
        ultima_carga_id = v_carga_id
      where id = e.id;

      if e.cerrado_en is not null and not v_final then
        insert into historial_estatus (expediente_id, estatus_anterior, estatus_nuevo, fecha, carga_id)
          values (e.id, coalesce(e.motivo_cierre, 'Cerrado'), d.estatus, v_ahora, v_carga_id);
      elsif d.estatus is distinct from e.estatus then
        insert into historial_estatus (expediente_id, estatus_anterior, estatus_nuevo, fecha, carga_id)
          values (e.id, e.estatus, d.estatus, v_ahora, v_carga_id);
      end if;
    end if;
  end loop;

  -- -------------------------------------------------------------------
  -- 2) Activos que ya no vienen en el archivo -> "Salió del reporte"
  -- -------------------------------------------------------------------
  select coalesce(jsonb_agg(jsonb_build_object(
           'clave', x.clave, 'nombre', x.nombre, 'rfc', x.rfc, 'asesor', x.asesor,
           'de', x.estatus, 'a', 'Salió del reporte') order by x.nombre), '[]')
    into v_salen
    from expedientes x
   where x.cerrado_en is null and x.clave <> all (v_claves);

  if p_aplicar then
    insert into historial_estatus (expediente_id, estatus_anterior, estatus_nuevo, fecha, carga_id)
      select x.id, x.estatus, 'Salió del reporte', v_ahora, v_carga_id
        from expedientes x
       where x.cerrado_en is null and x.clave <> all (v_claves);

    update expedientes x
       set cerrado_en = v_ahora, motivo_cierre = 'Salió del reporte'
     where x.cerrado_en is null and x.clave <> all (v_claves);

    update cargas set
      nuevos          = jsonb_array_length(v_nuevos),
      cambios_estatus = jsonb_array_length(v_cambios),
      sin_cambio      = v_sin_cambio,
      salieron        = jsonb_array_length(v_salen) + jsonb_array_length(v_cerrados),
      reactivados     = jsonb_array_length(v_reactivados),
      ignorados       = jsonb_array_length(v_ignorados)
    where id = v_carga_id;
  end if;

  return jsonb_build_object(
    'aplicado',      p_aplicar,
    'carga_id',      v_carga_id,
    'total_filas',   jsonb_array_length(p_filas),
    'activos_antes', v_activos_antes,
    'nuevos',        v_nuevos,
    'cambios',       v_cambios,
    'reactivados',   v_reactivados,
    'cerrados',      v_cerrados,
    'salen',         v_salen,
    'ignorados',     v_ignorados,
    'sin_cambio',    v_sin_cambio
  );
end $$;

revoke all on function public.procesar_carga(text, jsonb, boolean) from public;
revoke all on function public.procesar_carga(text, jsonb, boolean) from anon;
grant execute on function public.procesar_carga(text, jsonb, boolean) to authenticated;
