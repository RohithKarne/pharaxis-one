import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import AppErrorBoundary from '../../shared/components/AppErrorBoundary'
import { initClientObservability } from '../../shared/observability/clientTelemetry'
import '../../index.css'

initClientObservability({ app: 'mims-superadmin' })

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AppErrorBoundary app="mims-superadmin">
      <App />
    </AppErrorBoundary>
  </React.StrictMode>
)
