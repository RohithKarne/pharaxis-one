import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './shared/context/AuthContext'
import './index.css'
import App from './App.jsx'

// BrowserRouter enables URL-based routing (e.g. /login, /dashboard, /inbox)
// AuthProvider wraps everything so any page can access the logged-in user
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
