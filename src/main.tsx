import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// HashRouter (#/ruta): GitHub Pages no puede redirigir rutas al index.html
import { HashRouter } from 'react-router-dom'
import './index.css'
import App from './App'
import { AuthProvider } from './lib/auth'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </HashRouter>
  </StrictMode>,
)
