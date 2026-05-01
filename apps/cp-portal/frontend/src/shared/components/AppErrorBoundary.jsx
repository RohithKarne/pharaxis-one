import React from 'react'

export default class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    window.dispatchEvent(new CustomEvent('cp-client-error', { detail: { message: error.message, stack: info?.componentStack } }))
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 32, fontFamily: 'sans-serif' }}>
          <h1>Something went wrong</h1>
          <p>Please refresh the page. If it continues, check the browser console and backend service logs.</p>
        </div>
      )
    }
    return this.props.children
  }
}
