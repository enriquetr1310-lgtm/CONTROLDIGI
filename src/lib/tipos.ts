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

export interface Expediente {
  id: string
  clave: string
  nombre: string
  rfc: string | null
  rfc_valido: boolean
  producto: string | null
  monto_solicitado: number | null
  fecha_ingreso: string | null
  fecha_comite: string | null
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
  estatus_desde: string
  primera_vez: string
  ultima_vez_en_reporte: string
  cerrado_en: string | null
  motivo_cierre: string | null
}

export interface EventoHistorial {
  id: number
  estatus_anterior: string | null
  estatus_nuevo: string
  fecha: string
  carga_id: string | null
  usuario_email: string | null
}

export interface Nota {
  id: number
  texto: string
  autor_email: string
  created_at: string
}

/** Motivos que el equipo puede asignar a un expediente cerrado */
export const MOTIVOS_CIERRE = ['Salió del reporte', 'Mesa de control', 'Cancelado', 'Rechazado'] as const

/** Días naturales que un expediente cerrado permanece antes de eliminarse */
export const DIAS_RETENCION = 3
