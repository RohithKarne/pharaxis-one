// Production API path shim
if (import.meta.env.VITE_API_URL) {
  const _apiBase = import.meta.env.VITE_API_URL
  const _origFetch = window.fetch.bind(window)
  window.fetch = (url, opts) => {
    if (typeof url === 'string' && url.startsWith('/api')) {
      url = _apiBase + url.slice(4)
    }
    return _origFetch(url, opts)
  }
}

import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
)
