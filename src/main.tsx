import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext' // <-- IMPORTANT : On importe le Provider
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>   {/* <-- C'est ici qu'on enveloppe toute l'app */}
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)