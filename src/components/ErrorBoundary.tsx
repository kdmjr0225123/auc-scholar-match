import { Component, ReactNode } from 'react';

interface Props { children: ReactNode; }
interface State { hasError: boolean; error?: Error; }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '60vh', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', padding: '2rem', textAlign: 'center',
          fontFamily: "'DM Sans', sans-serif"
        }}>
          <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>⚠️</div>
          <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#111', marginBottom: '0.5rem' }}>
            Something went wrong
          </div>
          <div style={{ fontSize: '0.85rem', color: '#999', marginBottom: '1.5rem', maxWidth: 380 }}>
            We had trouble loading your scholarships. Check your connection and try again.
          </div>
          <button
            onClick={() => { this.setState({ hasError: false }); window.location.reload(); }}
            style={{
              background: '#1a1a3e', color: '#fff', border: 'none',
              borderRadius: 9, padding: '0.7rem 1.5rem',
              fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer',
              fontFamily: "'DM Sans', sans-serif"
            }}
          >
            Try Again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
