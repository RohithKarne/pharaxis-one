import React from 'react';
import { sendClientError } from '../observability/clientTelemetry';

export default class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error('AppErrorBoundary caught error:', error, info)
    sendClientError({
      app: this.props.app || 'mims',
      severity: 'error',
      message: error?.message || 'React render error',
      stack: `${error?.stack || ''}\n${info?.componentStack || ''}`.trim(),
      route: window.location.pathname,
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 24 }}>
          <h2>Something went wrong</h2>
          <p>Please refresh the page. If this repeats, contact support with the current timestamp.</p>
        </div>
      );
    }
    return this.props.children;
  }
}
