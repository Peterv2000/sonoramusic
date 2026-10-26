import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div style={{ padding: '24px', color: '#fff', minHeight: '40vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
          <h2 style={{ marginBottom: 8 }}>Algo salió mal</h2>
          <p style={{ opacity: 0.7, marginBottom: 16 }}>Recarga la página o vuelve a intentarlo.</p>
          <button onClick={() => window.location.reload()} style={{ padding: '10px 16px', borderRadius: 10, background: 'var(--accent, #1db954)', color: '#000', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Recargar</button>
        </div>
      );
    }
    return this.props.children;
  }
}
