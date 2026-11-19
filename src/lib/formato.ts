const fmtFechaHora = new Intl.DateTimeFormat('es-MX', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})
const fmtFecha = new Intl.DateTimeFormat('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
const fmtDinero = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 })

const DIA_MS = 86_400_000

/**
 * Convierte a Date. Las fechas sin hora ('2026-11-17') se interpretan como fecha local,
 * no UTC (si no, en México se mostrarían un día antes).
 */
export function aFecha(v: string | Date): Date {
  if (v instanceof Date) return v
  const soloFecha = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v)
  if (soloFecha) return new Date(+soloFecha[1], +soloFecha[2] - 1, +soloFecha[3])
  return new Date(v)
}

export function fechaHoraCorta(v: string | Date): string {
  return fmtFechaHora.format(aFecha(v))
}

export function fechaCorta(v: string | Date | null | undefined): string {
  return v ? fmtFecha.format(aFecha(v)) : '—'
}

export function dinero(n: number | null | undefined): string {
  return n == null ? '—' : fmtDinero.format(n)
}

/** Días completos transcurridos desde la fecha (0 = menos de 24 h). */
export function diasDesde(v: string | Date, ahora: Date = new Date()): number {
  return Math.max(0, Math.floor((ahora.getTime() - aFecha(v).getTime()) / DIA_MS))
}

export function sumarDias(v: string | Date, dias: number): Date {
  return new Date(aFecha(v).getTime() + dias * DIA_MS)
}

export function textoDias(n: number): string {
  if (n === 0) return 'Hoy'
  return n === 1 ? '1 día' : `${n} días`
}

export const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`
