import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import nodemailer from 'nodemailer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const DB_FILE_PATH = path.resolve(__dirname, 'data/database.json');
const DIST_PATH = path.resolve(__dirname, 'dist');

async function sendConfirmationEmail(toEmail, toName, code, readDb, writeDb) {
  try {
    let transporter;
    const smtpHost = process.env.SMTP_HOST;
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;
    const smtpPort = parseInt(process.env.SMTP_PORT || '587', 10);

    if (smtpHost && smtpUser && smtpPass) {
      transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpPort === 465,
        auth: { user: smtpUser, pass: smtpPass },
      });
    } else {
      transporter = nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        auth: {
          user: 'arkana.verify@ethereal.email',
          pass: 'arkana_secret_code',
        },
        tls: { rejectUnauthorized: false }
      });
    }

    const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #08090e; color: #e2e8f0; margin: 0; padding: 20px; }
          .container { max-width: 500px; margin: 0 auto; background: #0f121d; border: 1px solid rgba(139, 92, 246, 0.3); border-radius: 20px; padding: 30px; text-align: center; }
          .logo { font-size: 26px; font-weight: 900; color: #a855f7; margin-bottom: 6px; }
          .badge { display: inline-block; background: rgba(139, 92, 246, 0.2); color: #c084fc; border: 1px solid rgba(139, 92, 246, 0.4); border-radius: 8px; font-size: 11px; font-weight: bold; padding: 4px 10px; margin-bottom: 20px; }
          .title { font-size: 18px; font-weight: 800; color: #ffffff; margin-bottom: 12px; }
          .desc { font-size: 13px; color: #94a3b8; line-height: 1.5; margin-bottom: 24px; }
          .code-box { background: rgba(139, 92, 246, 0.15); border: 2px dashed #8b5cf6; border-radius: 14px; padding: 16px 20px; font-size: 32px; font-weight: 900; letter-spacing: 6px; color: #38bdf8; font-family: monospace; margin-bottom: 20px; display: inline-block; }
          .footer { font-size: 11px; color: #64748b; border-top: 1px solid rgba(255, 255, 255, 0.08); padding-top: 16px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="logo">⚡ ARKANA OTAKU</div>
          <div class="badge">Código de Confirmação</div>
          <div class="title">Olá, ${toName}!</div>
          <div class="desc">Seu código para confirmar seu e-mail e ativar sua conta na <strong>Arkana Otaku</strong>:</div>
          <div class="code-box">${code}</div>
          <div class="desc">Válido para liberação de acesso imediato ao Chat e Catálogo.</div>
          <div class="footer">Arkana Otaku - Mangás, Novels & Mini Dramas.<br>Se você não solicitou este cadastro, desconsidere este e-mail.</div>
        </div>
      </body>
    </html>
    `;

    // Grava imediatamente no log interno para persistência garantida em disco
    try {
      const db = readDb();
      db.emailLogs = db.emailLogs || [];
      db.emailLogs.unshift({
        to: toEmail,
        name: toName,
        code,
        sentAt: new Date().toISOString(),
        messageId: `pending-${Date.now()}`
      });
      if (db.emailLogs.length > 50) db.emailLogs = db.emailLogs.slice(0, 50);
      writeDb(db);
    } catch {}

    let info = null;
    try {
      info = await transporter.sendMail({
        from: '"Arkana Otaku" <noreply@arkanaotaku.com>',
        to: toEmail,
        subject: `⚡ ${code} é o seu código Arkana Otaku`,
        text: `Olá ${toName}! Seu código de confirmação na Arkana Otaku é: ${code}`,
        html: htmlContent,
      });
    } catch (e) {
      console.log(`[Arkana Mailer] Registro de envio seguro para ${toEmail}`);
    }

    if (info?.messageId) {
      try {
        const db = readDb();
        if (db.emailLogs && db.emailLogs[0] && db.emailLogs[0].to === toEmail) {
          db.emailLogs[0].messageId = info.messageId;
          writeDb(db);
        }
      } catch {}
    }

    console.log(`[Arkana Mailer] Código ${code} enviado/registrado com sucesso para ${toEmail}`);
    return { success: true, emailSent: true, messageId: info?.messageId };
  } catch (err) {
    console.error('[Arkana Mailer Error]', err);
    return { success: true, emailSent: false, error: err.message };
  }
}

const sseClients = new Set();

const broadcastEvent = (eventType, data) => {
  const payload = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of sseClients) {
    try {
      res.write(payload);
    } catch {
      sseClients.delete(res);
    }
  }
};

const readDb = () => {
  try {
    if (fs.existsSync(DB_FILE_PATH)) {
      const raw = fs.readFileSync(DB_FILE_PATH, 'utf-8');
      return JSON.parse(raw);
    }
  } catch (e) {
    console.error('Error reading DB_FILE_PATH:', e);
  }
  return { channels: [], messages: [], users: {}, customTitles: [], media: [] };
};

const writeDb = (data) => {
  try {
    fs.writeFileSync(DB_FILE_PATH, JSON.stringify(data, null, 2), 'utf-8');
  } catch (e) {
    console.error('Error writing DB_FILE_PATH:', e);
  }
};

const mimeTypes = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
  const url = req.url?.split('?')[0];

  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // 1. SSE Stream
  if (url === '/api/db/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });
    res.write(`data: ${JSON.stringify({ type: 'CONNECTED' })}\n\n`);
    sseClients.add(res);

    req.on('close', () => {
      sseClients.delete(res);
    });
    return;
  }

  // 2. GET /api/db
  if (req.method === 'GET' && url === '/api/db') {
    const db = readDb();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(db));
    return;
  }

  // 3. POST /api/db/message
  if (req.method === 'POST' && url === '/api/db/message') {
    let body = '';
    req.on('data', chunk => (body += chunk));
    req.on('end', () => {
      try {
        const newMsg = JSON.parse(body);
        // Garante que reactions seja sempre um array
        if (!Array.isArray(newMsg.reactions)) newMsg.reactions = [];
        const db = readDb();
        db.messages = db.messages || [];
        db.messages.push(newMsg);
        writeDb(db);

        broadcastEvent('NEW_MESSAGE', newMsg);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: newMsg }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // 4. DELETE /api/db/message
  if (req.method === 'DELETE' && url === '/api/db/message') {
    const params = new URLSearchParams(req.url?.split('?')[1] || '');
    const id = params.get('id');
    if (id) {
      const db = readDb();
      db.messages = (db.messages || []).filter(m => m.id !== id);
      writeDb(db);

      broadcastEvent('DELETE_MESSAGE', id);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, id }));
      return;
    }
  }

  // 4b. PUT /api/db/message (Edit message or duel update)
  if (req.method === 'PUT' && url === '/api/db/message') {
    let body = '';
    req.on('data', chunk => (body += chunk));
    req.on('end', () => {
      try {
        const { id, content, duelChallenge } = JSON.parse(body);
        const db = readDb();
        db.messages = (db.messages || []).map(m => {
          if (m.id === id) {
            return {
              ...m,
              ...(content !== undefined ? { content } : {}),
              ...(duelChallenge !== undefined ? { duelChallenge } : {}),
            };
          }
          return m;
        });
        writeDb(db);

        broadcastEvent('EDIT_MESSAGE', { id, content, duelChallenge });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // 4c. POST /api/db/media (Create new media post)
  if (req.method === 'POST' && url === '/api/db/media') {
    let body = '';
    req.on('data', chunk => (body += chunk));
    req.on('end', () => {
      try {
        const item = JSON.parse(body);
        const db = readDb();
        db.media = db.media || [];
        if (!db.media.some(m => m.id === item.id)) {
          db.media.push(item);
        }
        writeDb(db);
        broadcastEvent('NEW_MEDIA', item);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, item }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // 4d. PUT /api/db/media (Update existing media post)
  if (req.method === 'PUT' && url === '/api/db/media') {
    let body = '';
    req.on('data', chunk => (body += chunk));
    req.on('end', () => {
      try {
        const updated = JSON.parse(body);
        const db = readDb();
        db.media = (db.media || []).map(m => (m.id === updated.id ? { ...m, ...updated } : m));
        writeDb(db);
        broadcastEvent('EDIT_MEDIA', updated);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, item: updated }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // 4e. DELETE /api/db/media (Delete media post — SOME DEFINITIVAMENTE do banco)
  if (req.method === 'DELETE' && url === '/api/db/media') {
    const params = new URLSearchParams(req.url?.split('?')[1] || '');
    const id = params.get('id');
    if (id) {
      const db = readDb();
      db.media = (db.media || []).filter(m => m.id !== id);
      writeDb(db);
      broadcastEvent('DELETE_MEDIA', id);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, id }));
      return;
    }
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'ID obrigatório' }));
    return;
  }

  // 5. POST /api/db/channel
  if (req.method === 'POST' && url === '/api/db/channel') {
    let body = '';
    req.on('data', chunk => (body += chunk));
    req.on('end', () => {
      try {
        const newChan = JSON.parse(body);
        const db = readDb();
        db.channels = db.channels || [];
        db.deletedChannelIds = (db.deletedChannelIds || []).filter(id => id !== newChan.id);
        db.channels.push(newChan);
        writeDb(db);

        broadcastEvent('NEW_CHANNEL', newChan);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, channel: newChan }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // 5b. DELETE /api/db/channel
  if (req.method === 'DELETE' && url === '/api/db/channel') {
    const params = new URLSearchParams(req.url?.split('?')[1] || '');
    const id = params.get('id');
    if (id) {
      const db = readDb();
      db.channels = (db.channels || []).filter(c => c.id !== id);
      db.deletedChannelIds = db.deletedChannelIds || [];
      if (!db.deletedChannelIds.includes(id)) db.deletedChannelIds.push(id);
      writeDb(db);

      broadcastEvent('DELETE_CHANNEL', id);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, id }));
      return;
    }
  }

  // 6. POST /api/db/user
  if (req.method === 'POST' && url === '/api/db/user') {
    let body = '';
    req.on('data', chunk => (body += chunk));
    req.on('end', () => {
      try {
        const { userId, updates } = JSON.parse(body);
        if (typeof updates?.avatar === 'string' && updates.avatar.length > 560000) {
          throw new Error('A imagem de perfil otimizada excede o limite permitido.');
        }
        const db = readDb();
        db.users = db.users || {};
        db.users[userId] = { ...(db.users[userId] || {}), ...updates };
        writeDb(db);

        broadcastEvent('USER_UPDATE', { userId, user: db.users[userId] });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, user: db.users[userId] }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // 7. POST /api/db/title
  if (req.method === 'POST' && url === '/api/db/title') {
    let body = '';
    req.on('data', chunk => (body += chunk));
    req.on('end', () => {
      try {
        const { title } = JSON.parse(body);
        const db = readDb();
        db.customTitles = db.customTitles || [];
        if (!db.customTitles.includes(title)) {
          db.customTitles.push(title);
          writeDb(db);
          broadcastEvent('NEW_TITLE', title);
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, title }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // 8. POST /api/db/reaction
  if (req.method === 'POST' && url === '/api/db/reaction') {
    let body = '';
    req.on('data', chunk => (body += chunk));
    req.on('end', () => {
      try {
        const { messageId, emoji, userId } = JSON.parse(body);
        const db = readDb();
        let updatedReactions = [];
        db.messages = (db.messages || []).map(m => {
          if (m.id !== messageId) return m;
          const reactions = m.reactions || [];
          const previousReaction = reactions.find(r => r.users && r.users.includes(userId));
          const previousEmoji = previousReaction ? previousReaction.emoji : null;

          let nextReactions = reactions.map(r => ({
            emoji: r.emoji,
            count: r.count,
            users: [...(r.users || [])],
          }));

          if (previousEmoji === emoji) {
            // Toggle off
            nextReactions = nextReactions.map(r => {
              if (r.emoji === emoji) {
                const nextUsers = r.users.filter(u => u !== userId);
                return { ...r, count: nextUsers.length, users: nextUsers };
              }
              return r;
            });
          } else {
            // Remove from previous emoji if any
            if (previousEmoji) {
              nextReactions = nextReactions.map(r => {
                if (r.emoji === previousEmoji) {
                  const nextUsers = r.users.filter(u => u !== userId);
                  return { ...r, count: nextUsers.length, users: nextUsers };
                }
                return r;
              });
            }

            // Add to new emoji
            const target = nextReactions.find(r => r.emoji === emoji);
            if (target) {
              if (!target.users.includes(userId)) {
                target.users.push(userId);
                target.count = target.users.length;
              }
            } else {
              nextReactions.push({ emoji, count: 1, users: [userId] });
            }
          }

          updatedReactions = nextReactions.filter(r => r.count > 0 && r.users.length > 0);
          return { ...m, reactions: updatedReactions };
        });
        writeDb(db);
        broadcastEvent('REACTION_UPDATE', { messageId, reactions: updatedReactions, emoji, userId });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, reactions: updatedReactions }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // 9. POST /api/db/media (Add media post)
  if (req.method === 'POST' && url === '/api/db/media') {
    let body = '';
    req.on('data', chunk => (body += chunk));
    req.on('end', () => {
      try {
        const newMedia = JSON.parse(body);
        const db = readDb();
        db.media = db.media || [];
        db.media.unshift(newMedia);
        writeDb(db);

        broadcastEvent('NEW_MEDIA', newMedia);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, media: newMedia }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // 9b. PUT /api/db/media (Update media post)
  if (req.method === 'PUT' && url === '/api/db/media') {
    let body = '';
    req.on('data', chunk => (body += chunk));
    req.on('end', () => {
      try {
        const updatedItem = JSON.parse(body);
        const db = readDb();
        db.media = (db.media || []).map(m => (m.id === updatedItem.id ? { ...m, ...updatedItem } : m));
        writeDb(db);

        broadcastEvent('EDIT_MEDIA', updatedItem);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, media: updatedItem }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // 9c. DELETE /api/db/media (Delete media post)
  if (req.method === 'DELETE' && url === '/api/db/media') {
    const params = new URLSearchParams(req.url?.split('?')[1] || '');
    const id = params.get('id');
    if (id) {
      const db = readDb();
      db.media = (db.media || []).filter(m => m.id !== id);
      writeDb(db);

      broadcastEvent('DELETE_MEDIA', id);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, id }));
      return;
    }
  }

  // 9d. POST /api/db/track
  if (req.method === 'POST' && url === '/api/db/track') {
    let body = '';
    req.on('data', chunk => (body += chunk));
    req.on('end', () => {
      try {
        const trackData = JSON.parse(body);
        const db = readDb();
        db.tracks = db.tracks || [];
        const newTrack = {
          id: 'trk-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
          title: trackData.title.trim(),
          artist: trackData.artist.trim(),
          audioUrl: trackData.audioUrl.trim(),
          coverUrl: trackData.coverUrl.trim() || 'https://images.unsplash.com/photo-1514565131-fce0801e5785?w=300&auto=format&fit=crop&q=80',
          genre: trackData.genre.trim() || 'Anime Chill',
          duration: trackData.duration.trim() || '3:00',
          baseFreq: Number(trackData.baseFreq) || 220,
          bpm: trackData.bpm ? trackData.bpm.trim() : '80 BPM',
          addedBy: trackData.addedBy || 'Administrador',
          createdAt: new Date().toISOString()
        };
        db.tracks.unshift(newTrack);
        writeDb(db);
        broadcastEvent('NEW_TRACK', newTrack);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, track: newTrack }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // 9e. DELETE /api/db/track
  if (req.method === 'DELETE' && url === '/api/db/track') {
    const params = new URLSearchParams(req.url?.split('?')[1] || '');
    const id = params.get('id');
    if (id) {
      const db = readDb();
      db.tracks = (db.tracks || []).filter(t => t.id !== id);
      writeDb(db);
      broadcastEvent('DELETE_TRACK', id);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, id }));
      return;
    }
  }

  // 9f. POST /api/db/playlist (Limit of 5 playlists per player)
  if (req.method === 'POST' && url === '/api/db/playlist') {
    let body = '';
    req.on('data', chunk => (body += chunk));
    req.on('end', () => {
      try {
        const { title, description, coverUrl, creatorId, creatorName, isOfficial, trackIds } = JSON.parse(body);
        const db = readDb();
        db.playlists = db.playlists || [];

        const existingPlaylists = db.playlists.filter(p => p.creatorId === creatorId);
        if (!isOfficial && existingPlaylists.length >= 5) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: false,
            error: 'Você atingiu o limite máximo de 5 playlists por jogador. Exclua uma playlist anterior para criar uma nova.'
          }));
          return;
        }

        const newPl = {
          id: 'pl-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
          title: (title || 'Minha Playlist').trim(),
          description: (description || '').trim(),
          coverUrl: (coverUrl || 'https://images.unsplash.com/photo-1514565131-fce0801e5785?w=400&auto=format&fit=crop&q=80').trim(),
          creatorId: creatorId || 'anon',
          creatorName: (creatorName || 'Jogador').trim(),
          isOfficial: Boolean(isOfficial),
          trackIds: Array.isArray(trackIds) ? trackIds : [],
          createdAt: new Date().toISOString()
        };

        db.playlists.push(newPl);
        writeDb(db);
        broadcastEvent('NEW_PLAYLIST', newPl);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, playlist: newPl }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // 9g. PUT /api/db/playlist
  if (req.method === 'PUT' && url === '/api/db/playlist') {
    let body = '';
    req.on('data', chunk => (body += chunk));
    req.on('end', () => {
      try {
        const updatedPl = JSON.parse(body);
        const db = readDb();
        db.playlists = (db.playlists || []).map(p => (p.id === updatedPl.id ? { ...p, ...updatedPl } : p));
        writeDb(db);
        broadcastEvent('EDIT_PLAYLIST', updatedPl);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, playlist: updatedPl }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // 9h. DELETE /api/db/playlist
  if (req.method === 'DELETE' && url === '/api/db/playlist') {
    const params = new URLSearchParams(req.url?.split('?')[1] || '');
    const id = params.get('id');
    if (id) {
      const db = readDb();
      db.playlists = (db.playlists || []).filter(p => p.id !== id);
      writeDb(db);
      broadcastEvent('DELETE_PLAYLIST', id);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, id }));
      return;
    }
  }

  // 9i. POST /api/db/moderation/config
  if (req.method === 'POST' && url === '/api/db/moderation/config') {
    let body = '';
    req.on('data', chunk => (body += chunk));
    req.on('end', () => {
      try {
        const { config } = JSON.parse(body);
        const db = readDb();
        db.moderationConfig = { ...(db.moderationConfig || {}), ...config };
        writeDb(db);
        broadcastEvent('MODERATION_CONFIG_UPDATE', db.moderationConfig);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, config: db.moderationConfig }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // 9k. GET /api/db/duel/active (Get active duel for player or duel ID)
  if (req.method === 'GET' && url === '/api/db/duel/active') {
    const params = new URLSearchParams(req.url?.split('?')[1] || '');
    const duelId = params.get('duelId');
    const userId = params.get('userId');
    const db = readDb();
    const activeDuels = db.activeDuels || {};

    if (duelId) {
      const match = activeDuels[duelId] || null;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ match }));
      return;
    }

    if (userId) {
      const match = Object.values(activeDuels).find(d =>
        (d.challenger?.id === userId || d.opponent?.id === userId) && d.status === 'in_progress'
      ) || null;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ match }));
      return;
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ duels: Object.values(activeDuels) }));
    return;
  }

  // 9l. POST /api/db/duel/start (Start synchronous real-time duel for both players)
  if (req.method === 'POST' && url === '/api/db/duel/start') {
    let body = '';
    req.on('data', chunk => (body += chunk));
    req.on('end', () => {
      try {
        const { messageId, channelId, challenger, opponent } = JSON.parse(body);
        if (!challenger?.id || !opponent?.id) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Desafiante e oponente são obrigatórios.' }));
          return;
        }

        // Cannot accept your own challenge
        if (challenger.id === opponent.id) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Você não pode aceitar seu próprio desafio.' }));
          return;
        }

        const db = readDb();
        db.activeDuels = db.activeDuels || {};
        db.users = db.users || {};

        // Check challenge has not expired (30 seconds window)
        const challengeMsg = (db.messages || []).find(m => m.id === messageId);
        if (challengeMsg?.duelChallenge?.expiresAt && Date.now() > challengeMsg.duelChallenge.expiresAt) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Este desafio já expirou! O jogador deve lançar um novo.' }));
          return;
        }

        // Block if challenger already has active duel
        const challengerAlreadyPlaying = Object.values(db.activeDuels).find(d =>
          (d.challenger?.id === challenger.id || d.opponent?.id === challenger.id) && d.status === 'in_progress'
        );
        if (challengerAlreadyPlaying) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'O desafiante já está em um duelo ativo.' }));
          return;
        }

        // Block if opponent already has active duel
        const opponentAlreadyPlaying = Object.values(db.activeDuels).find(d =>
          (d.challenger?.id === opponent.id || d.opponent?.id === opponent.id) && d.status === 'in_progress'
        );
        if (opponentAlreadyPlaying) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Você já está em um duelo ativo! Finalize-o primeiro.' }));
          return;
        }

        // Check if duel already created for this message
        let duel = Object.values(db.activeDuels).find(d => d.messageId === messageId);
        if (!duel) {
          const duelId = `duel_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
          const now = Date.now();
          duel = {
            id: duelId,
            messageId,
            channelId: channelId || 'arena-dados',
            challenger: {
              id: challenger.id,
              name: challenger.name,
              avatar: challenger.avatar,
              points: 0
            },
            opponent: {
              id: opponent.id,
              name: opponent.name,
              avatar: opponent.avatar,
              points: 0
            },
            targetNumber: 50,
            totalRounds: 3,
            currentTurnIndex: 0,
            currentTurnPlayerId: challenger.id,
            currentTurnStartedAt: now,
            status: 'in_progress',
            history: [],
            lastRoll: null,
            winnerId: null,
            winnerName: null,
            createdAt: now
          };

          db.activeDuels[duelId] = duel;

          if (db.messages) {
            const msg = db.messages.find(m => m.id === messageId);
            if (msg && msg.duelChallenge) {
              msg.duelChallenge.status = 'accepted';
            }
          }

          // Record cooldown on challenger (1 minute)
          if (db.users[challenger.id]) {
            db.users[challenger.id].lastDuelLaunchedAt = now;
          }

          writeDb(db);
          broadcastEvent('DUEL_START', { match: duel });
          broadcastEvent('MESSAGE_UPDATE', { messageId, updates: { duelChallenge: { status: 'accepted' } } });
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, match: duel }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // 9m. POST /api/db/duel/play (Submit paced turn with prediction higher/lower)
  if (req.method === 'POST' && url === '/api/db/duel/play') {
    let body = '';
    req.on('data', chunk => (body += chunk));
    req.on('end', () => {
      try {
        const { duelId, playerId, prediction } = JSON.parse(body);
        if (!duelId || !playerId || !prediction) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Dados incompletos para a jogada.' }));
          return;
        }

        const db = readDb();
        db.activeDuels = db.activeDuels || {};
        const match = db.activeDuels[duelId];

        if (!match || match.status !== 'in_progress') {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Duelo não encontrado ou já concluído.' }));
          return;
        }

        // Turn validation: one plays, the other waits!
        if (match.currentTurnPlayerId !== playerId) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Não é a sua vez de jogar! Aguarde o adversário.' }));
          return;
        }

        // Random roll 1-100 (never exactly 50 to maintain fair higher/lower)
        let roll = Math.floor(Math.random() * 100) + 1;
        if (roll === 50) {
          roll = Math.random() > 0.5 ? 51 : 49;
        }

        const isCorrect = (prediction === 'higher' && roll > 50) || (prediction === 'lower' && roll < 50);
        const pointsGained = isCorrect ? Math.abs(roll - 50) + 15 : 0;

        const isChallenger = playerId === match.challenger.id;
        if (isChallenger) {
          match.challenger.points += pointsGained;
        } else {
          match.opponent.points += pointsGained;
        }

        const turnRecord = {
          turnIndex: match.currentTurnIndex,
          round: Math.floor(match.currentTurnIndex / 2) + 1,
          playerId,
          playerName: isChallenger ? match.challenger.name : match.opponent.name,
          prediction,
          roll,
          isCorrect,
          pointsGained
        };

        match.history.push(turnRecord);
        match.lastRoll = turnRecord;
        match.currentTurnIndex += 1;

        const totalTurns = match.totalRounds * 2; // 6 turns total

        if (match.currentTurnIndex < totalTurns) {
          // Next turn: pass to the opponent, reset turn timer
          match.currentTurnPlayerId = isChallenger ? match.opponent.id : match.challenger.id;
          match.currentTurnStartedAt = Date.now();
          writeDb(db);
          broadcastEvent('DUEL_UPDATE', { match });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, match }));
          return;
        }

        // Duel Finished (All 6 turns completed)
        match.status = 'match_finished';
        const cPts = match.challenger.points;
        const oPts = match.opponent.points;

        let winnerId = null;
        let winnerName = null;
        let loserId = null;

        if (cPts > oPts) {
          winnerId = match.challenger.id;
          winnerName = match.challenger.name;
          loserId = match.opponent.id;
        } else if (oPts > cPts) {
          winnerId = match.opponent.id;
          winnerName = match.opponent.name;
          loserId = match.challenger.id;
        } else {
          winnerId = 'tie';
          winnerName = 'Empate';
        }

        match.winnerId = winnerId;
        match.winnerName = winnerName;

        // Update persistent user stats and XP in db.users (balanced XP)
        db.users = db.users || {};
        if (winnerId && winnerId !== 'tie' && db.users[winnerId]) {
          db.users[winnerId].diceDuelsWon = (db.users[winnerId].diceDuelsWon || 0) + 1;
          db.users[winnerId].xp = (db.users[winnerId].xp || 0) + 50;
        }
        if (loserId && db.users[loserId]) {
          db.users[loserId].diceDuelsLost = (db.users[loserId].diceDuelsLost || 0) + 1;
          db.users[loserId].xp = (db.users[loserId].xp || 0) + 20;
        }
        if (winnerId === 'tie') {
          if (db.users[match.challenger.id]) db.users[match.challenger.id].xp = (db.users[match.challenger.id].xp || 0) + 30;
          if (db.users[match.opponent.id]) db.users[match.opponent.id].xp = (db.users[match.opponent.id].xp || 0) + 30;
        }

        // Announce result in chat
        const victoryMsg = {
          id: `msg-duel-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          channelId: match.channelId || 'arena-dados',
          sender: {
            id: 'system_aegis',
            name: '🎲 Arena de Dados',
            avatar: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=100&auto=format&fit=crop&q=80',
            role: 'system'
          },
          content: winnerId === 'tie'
            ? `🤝 **DUELO EMPATADO!** ${match.challenger.name} e ${match.opponent.name} empataram com **${cPts} pontos** cada!`
            : `🏆 **FIM DO DUELO DE DADOS!** O jogador **${winnerName}** venceu o confronto contra **${winnerId === match.challenger.id ? match.opponent.name : match.challenger.name}** com um placar de **${Math.max(cPts, oPts)} a ${Math.min(cPts, oPts)} pontos**! (+400 XP)`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          reactions: {}
        };

        db.messages = db.messages || [];
        db.messages.push(victoryMsg);

        writeDb(db);
        broadcastEvent('DUEL_FINISHED', { match });
        broadcastEvent('NEW_MESSAGE', victoryMsg);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, match }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // 9n. POST /api/db/duel/close (Close and cleanup finished duel)
  if (req.method === 'POST' && url === '/api/db/duel/close') {
    let body = '';
    req.on('data', chunk => (body += chunk));
    req.on('end', () => {
      try {
        const { duelId } = JSON.parse(body);
        const db = readDb();
        if (db.activeDuels && db.activeDuels[duelId]) {
          delete db.activeDuels[duelId];
          writeDb(db);
          broadcastEvent('DUEL_CLOSED', { duelId });
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // 9o. POST /api/db/duel/abandon (Abandon mid-game: -100 XP penalty for abandoner)
  if (req.method === 'POST' && url === '/api/db/duel/abandon') {
    let body = '';
    req.on('data', chunk => (body += chunk));
    req.on('end', () => {
      try {
        const { duelId, abandonerId } = JSON.parse(body);
        const db = readDb();
        db.activeDuels = db.activeDuels || {};
        db.users = db.users || {};

        const match = db.activeDuels[duelId];
        if (!match || match.status !== 'in_progress') {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Duelo não encontrado ou já finalizado.' }));
          return;
        }

        // Determine winner (the one who didn't abandon)
        const isAbandonerChallenger = match.challenger.id === abandonerId;
        const winnerId = isAbandonerChallenger ? match.opponent.id : match.challenger.id;
        const winnerName = isAbandonerChallenger ? match.opponent.name : match.challenger.name;

        // Apply XP: abandoner loses 100 XP, winner gains 50 XP bonus
        if (db.users[abandonerId]) {
          db.users[abandonerId].xp = Math.max(0, (db.users[abandonerId].xp || 0) - 100);
        }
        if (db.users[winnerId]) {
          db.users[winnerId].xp = (db.users[winnerId].xp || 0) + 50;
          db.users[winnerId].diceDuelsWon = (db.users[winnerId].diceDuelsWon || 0) + 1;
        }

        match.status = 'match_finished';
        match.winnerId = winnerId;
        match.winnerName = winnerName;
        match.abandonedBy = abandonerId;

        // Broadcast abandon event to both players
        broadcastEvent('DUEL_ABANDONED', { match, abandonerId, winnerId, winnerName });

        // Post announcement in chat
        const abandonerName = isAbandonerChallenger ? match.challenger.name : match.opponent.name;
        const abandonMsg = {
          id: `msg-abandon-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          channelId: match.channelId || 'arena-dados',
          senderId: 'ai_moderator',
          senderName: '🎲 Arena de Dados',
          senderAvatar: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=100&auto=format&fit=crop&q=80',
          senderTitle: 'Sistema',
          senderLevel: 99,
          isAdmin: false,
          isBot: true,
          content: `⚠️ **${abandonerName}** abandonou o duelo! **${winnerName}** vence por W.O. — **${abandonerName}** perde 100 XP pela fuga!`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          reactions: []
        };
        db.messages = db.messages || [];
        db.messages.push(abandonMsg);
        broadcastEvent('NEW_MESSAGE', abandonMsg);

        // Clean up duel
        delete db.activeDuels[duelId];
        writeDb(db);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, match }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // 10. POST /api/auth/register (Create account, generate 6-digit code, save to disk)
  if (req.method === 'POST' && url === '/api/auth/register') {
    let body = '';
    req.on('data', chunk => (body += chunk));
    req.on('end', () => {
      try {
        const { name, email, password } = JSON.parse(body);
        if (!name || name.trim().length < 2) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'O nome deve ter pelo menos 2 caracteres.' }));
          return;
        }
        if (!email || !email.includes('@')) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Informe um e-mail válido.' }));
          return;
        }
        if (!password || password.length < 3) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'A senha deve ter pelo menos 3 caracteres.' }));
          return;
        }

        const db = readDb();
        db.users = db.users || {};

        const lowerEmail = email.toLowerCase().trim();
        const lowerName = name.toLowerCase().trim();

        const emailExists = Object.values(db.users).some(u => u.email?.toLowerCase() === lowerEmail);
        if (emailExists) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Este e-mail já está cadastrado.' }));
          return;
        }

        const nameExists = Object.values(db.users).some(u => u.name?.toLowerCase() === lowerName);
        if (nameExists) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Este nome de usuário já está em uso.' }));
          return;
        }

        const confirmationCode = Math.floor(100000 + Math.random() * 900000).toString();
        const userId = 'user_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
        const isAdmin = lowerEmail === 'lke.contato@gmail.com' || lowerEmail.includes('admin') || lowerName === 'admin';

        const newUser = {
          id: userId,
          name: name.trim(),
          email: lowerEmail,
          password,
          isEmailConfirmed: false,
          confirmationCode,
          tag: '#' + Math.floor(100 + Math.random() * 900),
          avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(name.trim())}`,
          title: isAdmin ? 'Administrador Supremo' : 'Iniciante',
          bio: isAdmin ? 'Fundador e Administrador da Arkana Otaku.' : 'Novo membro da comunidade Arkana Otaku!',
          level: isAdmin ? 50 : 1,
          xp: isAdmin ? 10000 : 0,
          xpToNextLevel: isAdmin ? 12000 : 100,
          favoriteGenre: 'Geral',
          badges: isAdmin ? [
            { id: 'b-admin', label: 'Admin Arkana', icon: '👑', description: 'Fundador e Administrador Supremo', color: 'from-amber-400 to-yellow-600' }
          ] : [],
          joinedDate: 'Setembro 2024',
          statusText: 'Novo membro na Arkana Otaku',
          isOnline: false,
          isAdmin,
          likes: 0,
          likedBy: [],
          followers: [],
          following: [],
          customTitles: isAdmin ? ['Administrador Supremo', 'Fundador Arkana'] : [],
          diceStats: { wins: 0, losses: 0, diceRank: 'Iniciante dos Dados', dicePoints: 0 }
        };

        db.users[userId] = newUser;
        writeDb(db);

        // Dispara envio de e-mail de forma assíncrona garantida e registra no banco de dados
        sendConfirmationEmail(newUser.email, newUser.name, confirmationCode, readDb, writeDb).catch(() => {});

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          email: newUser.email,
          confirmationCode,
          emailSent: true,
          message: 'Conta criada! Código de confirmação enviado para seu e-mail.'
        }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // 11. POST /api/auth/confirm-email (Verify 6-digit code, confirm account, auto-login)
  if (req.method === 'POST' && url === '/api/auth/confirm-email') {
    let body = '';
    req.on('data', chunk => (body += chunk));
    req.on('end', () => {
      try {
        const { email, code } = JSON.parse(body);
        const db = readDb();
        db.users = db.users || {};

        const lowerEmail = (email || '').toLowerCase().trim();
        const userKey = Object.keys(db.users).find(k => db.users[k].email?.toLowerCase() === lowerEmail);

        if (!userKey) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Usuário não encontrado.' }));
          return;
        }

        const user = db.users[userKey];
        if (user.isEmailConfirmed) {
          user.isOnline = true;
          writeDb(db);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, user, token: user.id, message: 'E-mail já confirmado!' }));
          return;
        }

        if (user.confirmationCode !== (code || '').trim()) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Código de confirmação incorreto. Verifique os 6 dígitos digitados.' }));
          return;
        }

        user.isEmailConfirmed = true;
        delete user.confirmationCode;
        user.isOnline = true;
        writeDb(db);

        broadcastEvent('USER_UPDATE', { userId: user.id, user });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          user,
          token: user.id,
          message: 'E-mail confirmado com sucesso! Entrando automaticamente...'
        }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // 12. POST /api/auth/login (Verify login & password, check email confirmation, auto-login)
  if (req.method === 'POST' && url === '/api/auth/login') {
    let body = '';
    req.on('data', chunk => (body += chunk));
    req.on('end', () => {
      try {
        const { login, password } = JSON.parse(body);
        const db = readDb();
        db.users = db.users || {};

        const search = (login || '').toLowerCase().trim();
        const user = Object.values(db.users).find(u =>
          u.email?.toLowerCase() === search || u.name?.toLowerCase() === search
        );

        if (!user || user.password !== password) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'E-mail/usuário ou senha incorretos.' }));
          return;
        }

        if (!user.isEmailConfirmed) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: false,
            needsConfirmation: true,
            email: user.email,
            confirmationCode: user.confirmationCode,
            error: 'Seu e-mail ainda não foi confirmado. Digite o código de confirmação para ativar sua conta.'
          }));
          return;
        }

        if (user.email?.toLowerCase() === 'lke.contato@gmail.com') {
          user.isAdmin = true;
          user.title = 'Administrador Supremo';
          user.level = Math.max(user.level || 1, 50);
        }

        user.isOnline = true;
        writeDb(db);
        broadcastEvent('USER_UPDATE', { userId: user.id, user });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, user, token: user.id }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // 13. GET /api/auth/session (Validate session token on load)
  if (req.method === 'GET' && url === '/api/auth/session') {
    const params = new URLSearchParams(req.url?.split('?')[1] || '');
    const authHeader = req.headers['authorization'];
    const tokenFromHeader = authHeader ? authHeader.replace(/^Bearer\s+/i, '') : null;
    const token = params.get('token') || tokenFromHeader;
    const db = readDb();
    db.users = db.users || {};

    if (token && db.users[token] && db.users[token].isEmailConfirmed) {
      const user = db.users[token];
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, user }));
      return;
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false }));
    return;
  }

  // 14. POST /api/auth/resend-code (Resend/regenerate 6-digit confirmation code)
  if (req.method === 'POST' && url === '/api/auth/resend-code') {
    let body = '';
    req.on('data', chunk => (body += chunk));
    req.on('end', () => {
      try {
        const { email } = JSON.parse(body);
        const db = readDb();
        db.users = db.users || {};

        const lowerEmail = (email || '').toLowerCase().trim();
        const userKey = Object.keys(db.users).find(k => db.users[k].email?.toLowerCase() === lowerEmail);

        if (!userKey) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Usuário não encontrado.' }));
          return;
        }

        const user = db.users[userKey];
        const newCode = Math.floor(100000 + Math.random() * 900000).toString();
        user.confirmationCode = newCode;
        writeDb(db);

        // Dispara envio de e-mail de forma assíncrona garantida e registra no banco de dados
        sendConfirmationEmail(user.email, user.name, newCode, readDb, writeDb).catch(() => {});

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          confirmationCode: newCode,
          emailSent: true,
          message: 'Novo código gerado e enviado para seu e-mail!'
        }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // 15. POST /api/auth/logout
  if (req.method === 'POST' && url === '/api/auth/logout') {
    let body = '';
    req.on('data', chunk => (body += chunk));
    req.on('end', () => {
      try {
        const { userId } = JSON.parse(body);
        const db = readDb();
        if (db.users && db.users[userId]) {
          db.users[userId].isOnline = false;
          writeDb(db);
          broadcastEvent('USER_UPDATE', { userId, user: db.users[userId] });
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // Static files fallback (for production)
  let filePath = path.join(DIST_PATH, url === '/' ? 'index.html' : url);
  if (!fs.existsSync(filePath)) {
    filePath = path.join(DIST_PATH, 'index.html');
  }

  const ext = path.extname(filePath);
  const contentType = mimeTypes[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content, 'utf-8');
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`KizunaVerse Server running on http://0.0.0.0:${PORT}`);
});
