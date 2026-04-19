import { Component } from 'react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    if (import.meta.env.DEV) {
      console.error('ErrorBoundary caught an error:', error, info)
    }
  }

  handleReload = () => {
    window.location.reload()
  }

  render() {
    if (this.state.error) {
      return (
        <div
          role="alert"
          style={{
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
            textAlign: 'center',
            fontFamily: 'system-ui, sans-serif',
          }}
        >
          <h1 style={{ fontSize: '24px', marginBottom: '8px' }}>Something went wrong</h1>
          <p style={{ color: '#555', marginBottom: '16px' }}>
            The app hit an unexpected error. Please reload to continue.
          </p>
          {import.meta.env.DEV && (
            <pre
              style={{
                background: '#f5f5f5',
                padding: '12px',
                borderRadius: '6px',
                maxWidth: '100%',
                overflow: 'auto',
                fontSize: '12px',
                color: '#b00020',
              }}
            >
              {String(this.state.error?.stack || this.state.error)}
            </pre>
          )}
          <button
            type="button"
            onClick={this.handleReload}
            style={{
              marginTop: '16px',
              padding: '10px 20px',
              borderRadius: '6px',
              border: 'none',
              background: '#2563eb',
              color: 'white',
              cursor: 'pointer',
            }}
          >
            Reload
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
