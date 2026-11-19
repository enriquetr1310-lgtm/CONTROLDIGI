export default function SinConfigurar() {
  return (
    <div className="mx-auto max-w-xl space-y-3 px-4 py-16">
      <h1 className="text-xl font-semibold text-slate-900">Falta conectar Supabase</h1>
      <p className="text-sm text-slate-600">
        Crea un archivo <code className="rounded bg-slate-200 px-1">.env.local</code> en la raíz del proyecto
        (puedes copiar <code className="rounded bg-slate-200 px-1">.env.example</code>) con estas variables y
        reinicia la app:
      </p>
      <pre className="overflow-x-auto rounded-lg bg-slate-900 p-4 text-xs text-slate-100">
        {`VITE_SUPABASE_URL=https://TU-PROYECTO.supabase.co\nVITE_SUPABASE_ANON_KEY=tu-clave-publica`}
      </pre>
      <p className="text-sm text-slate-600">
        Los valores están en Supabase → Project Settings → API. Usa la clave pública (anon / publishable), nunca la
        secreta.
      </p>
    </div>
  )
}
