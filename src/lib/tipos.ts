export interface ItemCarga {
  clave: string
  nombre: string
  rfc: string | null
  asesor: string | null
  de: string | null
  a: string
  motivo_cierre?: string | null
}

/** Respuesta de la función procesar_carga */
export interface ResultadoCarga {
  aplicado: boolean
  carga_id: string | null
  total_filas: number
  activos_antes: number
  nuevos: ItemCarga[]
  cambios: ItemCarga[]
  reactivados: ItemCarga[]
  cerrados: ItemCarga[]
  salen: ItemCarga[]
  ignorados: ItemCarga[]
  sin_cambio: number
}

export interface ConfigEstatus {
  estatus: string
  orden: number
  dias_alerta: number | null
  es_final: boolean
}

export interface Carga {
  id: string
  nombre_archivo: string
  cargado_por_email: string | null
  created_at: string
  total_filas: number
  nuevos: number
  cambios_estatus: number
  sin_cambio: number
  salieron: number
  reactivados: number
  ignorados: number
}
