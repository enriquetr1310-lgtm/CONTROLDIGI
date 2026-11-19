const COLORES: Record<string, string> = {
  Nuevo: 'bg-sky-100 text-sky-800',
  'Alta de solicitud': 'bg-indigo-100 text-indigo-800',
  'Análisis de crédito': 'bg-violet-100 text-violet-800',
  'En revisión': 'bg-amber-100 text-amber-800',
  Comité: 'bg-orange-100 text-orange-800',
  'Mesa de control': 'bg-emerald-100 text-emerald-800',
  Cancelado: 'bg-slate-200 text-slate-700',
  Rechazado: 'bg-rose-100 text-rose-800',
  'Salió del reporte': 'bg-slate-200 text-slate-700',
}

export default function EstatusBadge({ estatus }: { estatus: string }) {
  return (
    <span
      className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${
        COLORES[estatus] ?? 'bg-slate-100 text-slate-700'
      }`}
    >
      {estatus}
    </span>
  )
}
