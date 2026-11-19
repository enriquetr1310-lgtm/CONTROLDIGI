# Control de Expedientes (CONTROLDIGI)

Aplicación web para dar seguimiento diario a los expedientes de crédito a partir del
CSV que exporta el sistema (`legajos-DD-MM-AAAA-HH-MM.csv`).

- **Frontend:** React + TypeScript + Vite + Tailwind CSS
- **Backend:** Supabase (Postgres, inicio de sesión, tareas programadas)
- **Publicación:** GitHub Pages, automática con GitHub Actions al actualizar `main`

## Reglas del negocio

| Tema | Regla |
|---|---|
| Identificador del expediente | **RFC (10 primeros caracteres, sin homoclave) + fecha/hora de ingreso**. Un cliente puede tener varios expedientes a la vez, y la homoclave a veces llega incompleta (`XXX`) |
| Archivo diario | CSV filtrado **sin** "Mesa de control" (si llegan filas en Mesa de control, la app las trata como cerradas) |
| Expediente que deja de aparecer | Se mueve a *Cerrados* ("Salió del reporte"); el equipo puede anotar el motivo. Si reaparece, se reactiva |
| Eliminación | 3 días naturales después de cerrado |
| Reloj de alerta | Para expedientes que entran como *Nuevo* arranca en su fecha de ingreso; con otro estatus, desde la primera carga en que aparecen |
| Protección | Si una carga cerraría ≥30 % de los activos, o el archivo es más antiguo que el último cargado, se pide confirmación |
| Alertas (días sin cambio de estatus) | Nuevo 1 · Alta de solicitud 3 · Análisis de crédito 2 · En revisión 2 · Comité 2 (editable) |
| Documentos | Checklist con el mismo catálogo para todos los expedientes |
| Usuarios | Equipo con cuenta propia; todos ven todo |

## Avance

- [x] **Fase 1** – Base del proyecto, esquema de base de datos, inicio de sesión
- [x] **Fase 2** – Carga diaria del CSV (vista previa, cambios, ausentes)
- [x] **Fase 3** – Lista de expedientes (activos/cerrados, filtros, búsqueda), ficha con línea de tiempo, notas y motivo de cierre
- [ ] Fase 4 – Alertas y configuración de días
- [ ] Fase 5 – Checklist de documentos
- [ ] Fase 6 – Limpieza automática (3 días)
- [x] **Fase 7** – Publicación en GitHub Pages (adelantada)

## Configuración inicial

### 1. Crear las tablas en Supabase
1. Entra a tu proyecto en [supabase.com](https://supabase.com) → **SQL Editor** → **New query**.
2. Pega el contenido completo de [`supabase/migrations/001_esquema_inicial.sql`](supabase/migrations/001_esquema_inicial.sql) y pulsa **Run**.
   Se puede volver a ejecutar sin problema.

   Después ejecuta de la misma forma, en orden, los demás scripts de esa carpeta
   (`002_procesar_carga.sql`, `003_notas_expediente.sql`, …) conforme se vayan agregando en cada fase.

### 2. Crear los usuarios del equipo
1. **Authentication → Sign In / Providers → Email**: desactiva **Allow new users to sign up**
   (así nadie externo puede registrarse).
2. **Authentication → Users → Add user → Create new user**: captura correo y contraseña de cada
   integrante y marca **Auto Confirm User**.

### 3. Conectar la app
1. Copia `.env.example` como `.env.local`.
2. Llena `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` con los valores de
   **Project Settings → API** (clave pública *anon/publishable*; **nunca** la *service_role/secret*).

### 4. Ejecutar en tu computadora
Requiere [Node.js](https://nodejs.org) 20 o superior.

```bash
npm install
npm run dev
```

Abre la dirección que aparece (normalmente http://localhost:5173), inicia sesión y en **Inicio**
debe aparecer "Conexión con Supabase correcta" con las tarjetas de cada estatus.

## Publicación (GitHub Pages)

Cada vez que se actualiza la rama `main`, el flujo `.github/workflows/deploy.yml` corre las
pruebas, compila y publica en `https://enriquetr1310-lgtm.github.io/CONTROLDIGI/`.

Configuración (una sola vez):
1. **Settings → Pages → Build and deployment → Source:** *GitHub Actions*.
2. **Settings → Secrets and variables → Actions → pestaña Variables → New repository variable:**
   `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` (la clave pública).
3. **Actions → Publicar en GitHub Pages → Run workflow** (o cualquier cambio en `main`).

Las direcciones de la app usan `#` (ej. `…/CONTROLDIGI/#/cargar`) porque GitHub Pages no
puede redirigir rutas.

## Pruebas

```bash
npm test
```

Prueban la lectura del CSV y la función `procesar_carga` contra un Postgres en memoria (PGlite).
Usan datos inventados; no se guardan datos reales de clientes en el repositorio.
