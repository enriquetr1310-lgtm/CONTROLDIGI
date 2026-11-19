export default function Pendiente({ titulo, fase }: { titulo: string; fase: number }) {
  return (
    <div className="space-y-2">
      <h1 className="text-xl font-semibold text-slate-900">{titulo}</h1>
      <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
        Esta sección se construye en la Fase {fase}.
      </div>
    </div>
  )
}
