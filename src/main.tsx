import React from 'react';
import ReactDOM from 'react-dom/client';

const titles = [
  { title: 'Solo Leveling', type: 'Manhwa', status: 'Em alta', color: '#f59e0b' },
  { title: 'The Beginning After the End', type: 'Novel', status: 'Atualizado', color: '#38bdf8' },
  { title: 'Demon Slayer', type: 'Mangá', status: 'Completo', color: '#f43f5e' },
  { title: 'My Happy Marriage', type: 'Mini drama', status: 'Novo episódio', color: '#a78bfa' },
];

const App = () => {
  const [query, setQuery] = React.useState('');
  const [activeTab, setActiveTab] = React.useState('Início');
  const filteredTitles = titles.filter((item) => item.title.toLowerCase().includes(query.toLowerCase()));

  return (
    <main style={{ minHeight: '100vh', background: '#090b12', color: '#f8fafc', fontFamily: 'Outfit, sans-serif' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '20px', padding: '22px max(24px, 6vw)', borderBottom: '1px solid #202536', background: '#0d101a' }}>
        <strong style={{ fontSize: '1.35rem', letterSpacing: '0.04em' }}>⚡ ARKANA <span style={{ color: '#a78bfa' }}>OTAKU</span></strong>
        <nav style={{ display: 'flex', gap: '8px' }} aria-label="Navegação principal">
          {['Início', 'Catálogo', 'Comunidade'].map((tab) => (
            <button key={tab} onClick={() => setActiveTab(tab)} style={{ border: 0, borderRadius: '8px', padding: '9px 12px', background: activeTab === tab ? '#312e81' : 'transparent', color: activeTab === tab ? '#fff' : '#94a3b8', cursor: 'pointer' }}>{tab}</button>
          ))}
        </nav>
      </header>

      <section style={{ maxWidth: '1120px', margin: '0 auto', padding: '72px max(24px, 5vw) 56px' }}>
        <div style={{ maxWidth: '700px' }}>
          <p style={{ color: '#a78bfa', fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', fontSize: '0.78rem' }}>Seu próximo universo começa aqui</p>
          <h1 style={{ fontSize: 'clamp(2.5rem, 7vw, 5.4rem)', lineHeight: 0.98, margin: '14px 0 22px', letterSpacing: '-0.03em' }}>Histórias para quem vive além da realidade.</h1>
          <p style={{ color: '#a8b0c2', fontSize: '1.08rem', lineHeight: 1.7, maxWidth: '590px' }}>Explore mangás, novels e mini dramas selecionados pela comunidade Arkana Otaku.</p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '42px 0 32px', maxWidth: '580px' }}>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar uma história..." aria-label="Buscar uma história" style={{ flex: 1, minWidth: 0, padding: '15px 17px', borderRadius: '10px', border: '1px solid #30384d', background: '#121624', color: '#fff', outline: 'none', fontSize: '1rem' }} />
          <button onClick={() => setQuery(query.trim())} style={{ padding: '15px 18px', border: 0, borderRadius: '10px', background: '#8b5cf6', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>Buscar</button>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', gap: '16px', marginBottom: '18px' }}>
          <div><p style={{ color: '#64748b', margin: 0, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.12em' }}>{activeTab}</p><h2 style={{ margin: '5px 0 0', fontSize: '1.65rem' }}>Destaques da semana</h2></div>
          <span style={{ color: '#64748b', fontSize: '0.9rem' }}>{filteredTitles.length} títulos</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
          {filteredTitles.map((item) => <article key={item.title} style={{ minHeight: '190px', padding: '20px', borderRadius: '12px', border: '1px solid #242b3c', background: 'linear-gradient(145deg, #151a28, #0f121c)', display: 'flex', flexDirection: 'column', justifyContent: 'end', boxShadow: `inset 0 3px 0 ${item.color}` }}><span style={{ color: item.color, fontSize: '0.78rem', fontWeight: 700 }}>{item.status}</span><h3 style={{ fontSize: '1.2rem', margin: '8px 0 5px' }}>{item.title}</h3><p style={{ color: '#8b95aa', margin: 0 }}>{item.type}</p></article>)}
        </div>
      </section>
    </main>
  );
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
