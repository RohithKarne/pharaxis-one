import React from 'react'

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    // eslint-disable-next-line no-console
    console.error('Vault App Uncaught UI Error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: '40px',
          margin: '40px auto',
          maxWidth: '600px',
          background: '#fff',
          borderRadius: '8px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          color: '#1e293b'
        }}>
          <h2 style={{ marginTop: 0, color: '#e11d48' }}>Something went wrong</h2>
          <p style={{ color: '#64748b', lineHeight: 1.6 }}>
            An unexpected error occurred in Pharaxis Vault interface. The error has been logged.
          </p>
          <div style={{
            padding: '12px',
            background: '#f8fafc',
            borderRadius: '6px',
            fontFamily: 'monospace',
            fontSize: '13px',
            color: '#334155',
            overflowX: 'auto',
            marginBottom: '20px'
          }}>
            {this.state.error?.message || 'Unknown render error'}
          </div>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '10px 18px',
              background: '#2563eb',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            Reload Workspace
          </button>
        </div>
      )
    }

    return this.props.children
  }
}

export default ErrorBoundary
