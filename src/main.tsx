import React from 'react';
import ReactDOM from 'react-dom/client';

const App = () => {
  return (
    <main style={{
      minHeight: '100vh',
      display: 'grid',
      placeItems: 'center',
      background: 'radial-gradient(circle at top, #1e1b4b, #0b0c10 55%)',
      color: '#f8fafc',
      fontFamily: 'Outfit, sans-serif',
      padding: '24px',
      textAlign: 'center'
    }}>
      <div style={{
        maxWidth: '760px',
        padding: '40px 32px',
        borderRadius: '24px',
        background: 'rgba(15, 23, 42, 0.8)',
        border: '1px solid rgba(168, 85, 247, 0.4)',
        boxShadow: '0 20px 80px rgba(76,29,149,0.5)'
      }}>
        <div style={{ fontSize: '2.7rem', fontWeight: 900, letterSpacing: '0.06em' }}>⚡ ARKANA OTAKU</div>
        <p style={{ marginTop: '18px', fontSize: '1.1rem', color: '#cbd5e1' }}>
          Plataforma em manutenção de deploy. A aplicação principal já está pronta para ser publicada no Render.
        </p>
        <div style={{ marginTop: '22px', display: 'flex', justifyContent: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <span style={{ padding: '8px 14px', borderRadius: '999px', background: 'rgba(168,85,247,0.15)', border: '1px solid rgba(168,85,247,0.35)', color: '#e9d5ff' }}>React + Vite</span>
          <span style={{ padding: '8px 14px', borderRadius: '999px', background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.3)', color: '#dbeafe' }}>Node + API</span>
          <span style={{ padding: '8px 14px', borderRadius: '999px', background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)', color: '#d1fae5' }}>Render ready</span>
        </div>
      </div>
    </main>
  );
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
