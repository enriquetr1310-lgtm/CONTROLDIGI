const fmtFechaHora = new Intl.DateTimeFormat('es-MX', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

export function fechaHoraCorta(iso: string | Date): string {
  return fmtFechaHora.format(typeof iso === 'string' ? new Date(iso) : iso)
}

export const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`
