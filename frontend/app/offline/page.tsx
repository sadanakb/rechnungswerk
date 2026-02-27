'use client'

export default function OfflinePage() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '24px',
        backgroundColor: 'rgb(var(--background))',
        color: 'rgb(var(--foreground))',
        textAlign: 'center',
        padding: '24px',
      }}
    >
      <div style={{ fontSize: 64 }}>📶</div>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Sie sind offline</h1>
      <p style={{ color: 'rgb(var(--foreground-muted))', maxWidth: 360 }}>
        Bitte prüfen Sie Ihre Internetverbindung und versuchen Sie es erneut.
      </p>
      <button
        onClick={() => window.location.reload()}
        style={{
          padding: '10px 24px',
          borderRadius: 8,
          backgroundColor: 'rgb(var(--primary))',
          color: 'white',
          border: 'none',
          cursor: 'pointer',
          fontWeight: 600,
        }}
      >
        Erneut versuchen
      </button>
    </div>
  )
}
