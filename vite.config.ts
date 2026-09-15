import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import fs from 'fs';
import path from 'path';
import nodemailer from 'nodemailer';
import { evaluateChatContent } from './src/services/moderationAI.ts';

const DB_FILE_PATH = path.resolve(process.cwd(), 'data/database.json');

async function sendConfirmationEmail(toEmail: string, toName: string, code: string, readDb: () => any, writeDb: (data: any) => void) {
  try {
    let transporter: any;
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

    let info: any = null;
    try {
      info = await transporter.sendMail({
        from: '"Arkana Otaku" <noreply@arkanaotaku.com>',
        to: toEmail,
        subject: `⚡ ${code} é o seu código Arkana Otaku`,
        text: `Olá ${toName}! Seu código de confirmação na Arkana Otaku é: ${code}`,
        html: htmlContent,
      });
    } catch (e: any) {
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
  } catch (err: any) {
    console.error('[Arkana Mailer Error]', err);
    return { success: true, emailSent: false, error: err.message };
  }
}

function kizunaDbPlugin() {
  const sseClients = new Set<any>();

  const broadcastEvent = (eventType: string, data: any) => {
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

  const writeDb = (data: any) => {
    try {
      fs.writeFileSync(DB_FILE_PATH, JSON.stringify(data, null, 2), 'utf-8');
    } catch (e) {
      console.error('Error writing DB_FILE_PATH:', e);
    }
  };

  return {
    name: 'kizuna-internal-db-plugin',
    configureServer(server: any) {
      server.middlewares.use((req: any, res: any, next: any) => {
        const url = req.url?.split('?')[0];

        // Restart Server via Vite watcher
        if (req.method === 'POST' && url === '/api/restart') {
          try {
            // Updating the modified time of vite.config.ts will force Vite to restart the dev server
            const configPath = path.resolve('vite.config.ts');
            const now = new Date();
            fs.utimesSync(configPath, now, now);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, message: 'Server restarting...' }));
          } catch(e) {
            console.error(e);
            res.writeHead(500);
            res.end(JSON.stringify({ error: 'Failed' }));
          }
          return;
        }

        // 1. SSE Real-time Events Stream
        if (url === '/api/db/events') {
          res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*',
          });
          res.write(`data: ${JSON.stringify({ type: 'CONNECTED' })}\n\n`);
          sseClients.add(res);

          req.on('close', () => {
            sseClients.delete(res);
          });
          return;
        }

        // 2. GET /api/db (Full state from disk)
        if (req.method === 'GET' && url === '/api/db') {
          const db = readDb();
          res.writeHead(200, {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          });
          res.end(JSON.stringify(db));
          return;
        }

        // 2b. GET /api/ranking (Lightweight users stats)
        if (req.method === 'GET' && url === '/api/ranking') {
          const db = readDb();
          const usersObj = db.users || {};
          const ranked = Object.values(usersObj)
            .filter((u: any) => u.isEmailConfirmed && u.id)
            .map((u: any) => {
              const wins = u.diceDuelsWon || 0;
              const losses = u.diceDuelsLost || 0;
              const xp = u.xp || 0;
              return {
                id: u.id,
                name: u.name || "Anônimo",
                avatar: u.avatar || "",
                title: u.title || "Novato",
                level: u.level || 1,
                xp,
                diceDuelsWon: wins,
                diceDuelsLost: losses,
                rankScore: Math.round(xp * 0.4 + wins * 300 - losses * 80),
                isAdmin: u.isAdmin || false,
              };
            });
          res.writeHead(200, {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          });
          res.end(JSON.stringify(ranked));
          return;
        }

        // 2c-extra. POST /api/db/stat (Increment a stat for a user and persist to disk)
        if (req.method === 'POST' && url === '/api/db/stat') {
          let body = '';
          req.on('data', (chunk: any) => (body += chunk));
          req.on('end', () => {
            try {
              const { userId, key, amount = 1 } = JSON.parse(body);
              if (!userId || !key) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'userId and key required' }));
                return;
              }
              const db = readDb();
              db.users = db.users || {};
              if (!db.users[userId]) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'User not found' }));
                return;
              }
              db.users[userId].stats = db.users[userId].stats || {};
              db.users[userId].stats[key] = (db.users[userId].stats[key] || 0) + amount;
              writeDb(db);
              broadcastEvent('USER_UPDATE', { userId, user: db.users[userId] });
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: true, stats: db.users[userId].stats }));
            } catch (err: any) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: err.message }));
            }
          });
          return;
        }

        // 2c-extra2. PUT /api/db/full-write (Admin: overwrite full DB - use with care)
        if (req.method === 'PUT' && url === '/api/db/full-write') {
          let body = '';
          req.on('data', (chunk: any) => (body += chunk));
          req.on('end', () => {
            try {
              const newDb = JSON.parse(body);
              writeDb(newDb);
              broadcastEvent('FULL_DB_UPDATE', { timestamp: Date.now() });
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: true }));
            } catch (err: any) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: err.message }));
            }
          });
          return;
        }

        // 2c. POST /api/upload (Upload base64 image to public/uploads)
        if (req.method === 'POST' && url === '/api/upload') {
          let body = '';
          req.on('data', (chunk: any) => (body += chunk));
          req.on('end', () => {
            try {
              const data = JSON.parse(body);
              if (!data.base64 || !data.filename) {
                res.writeHead(400).end(JSON.stringify({ error: 'Missing base64 or filename' }));
                return;
              }
              const matches = data.base64.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
              if (!matches || matches.length !== 3) {
                res.writeHead(400).end(JSON.stringify({ error: 'Invalid base64 format' }));
                return;
              }
              const buffer = Buffer.from(matches[2], 'base64');
              const safeFilename = data.filename.replace(/[^a-zA-Z0-9.-]/g, '_');
              const finalFilename = `${Date.now()}-${safeFilename}`;
              const filePath = path.join(process.cwd(), 'public', 'uploads', finalFilename);
              
              if (!fs.existsSync(path.join(process.cwd(), 'public', 'uploads'))) {
                fs.mkdirSync(path.join(process.cwd(), 'public', 'uploads'), { recursive: true });
              }
              
              fs.writeFileSync(filePath, buffer);
              
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ url: `/uploads/${finalFilename}` }));
            } catch (err) {
              console.error('Upload Error:', err);
              res.writeHead(500).end(JSON.stringify({ error: 'Failed to upload' }));
            }
          });
          return;
        }

        // 3. POST /api/db/message (Append message to disk file & broadcast)
        if (req.method === 'POST' && url === '/api/db/message') {
          let body = '';
          req.on('data', (chunk: any) => (body += chunk));
          req.on('end', () => {
            try {
              const newMsg = JSON.parse(body);
              // Garante que reactions seja sempre um array
              if (!Array.isArray(newMsg.reactions)) newMsg.reactions = [];
              const db = readDb();
              db.messages = db.messages || [];
              db.messages.push(newMsg);

              broadcastEvent('NEW_MESSAGE', newMsg);

              // Avaliação pela I.A. Moderadora Autossuficiente (se não for mensagem da própria IA)
              if (newMsg.senderId !== 'ai_moderator') {
                try {
                  const modConfig = db.moderationConfig || {
                    enabled: true,
                    sensitivity: 'balanced',
                    activeAiName: 'Aegis AI',
                    autoMuteAfterWarnings: 3
                  };

                  // Contagem de advertências anteriores deste usuário
                  const userPreviousOffenses = (db.moderationLogs || []).filter(
                    (l: any) => l.userId === newMsg.senderId && l.actionTaken !== 'NONE'
                  ).length;

                  const verdict = evaluateChatContent(
                    newMsg.content,
                    newMsg.senderName || 'Jogador',
                    modConfig,
                    userPreviousOffenses
                  );

                  // Se a IA determinou ofensa em excesso, intervém no chat e registra log
                  if (verdict.isExcessive && verdict.aiResponseText) {
                    const personaName = modConfig.activeAiName || 'Aegis AI';
                    const isKuro = personaName === 'Kuro AI';
                    const aiMsg = {
                      id: 'msg-ai-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
                      channelId: newMsg.channelId,
                      senderId: 'ai_moderator',
                      senderName: personaName,
                      senderAvatar: isKuro
                        ? 'https://images.unsplash.com/photo-1563089145-599997674d42?w=150&auto=format&fit=crop&q=80'
                        : 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=150&auto=format&fit=crop&q=80',
                      senderTitle: isKuro ? 'I.A. Sentinela Sombra' : 'I.A. Guardiã da Arkana',
                      senderLevel: 99,
                      isAdmin: true,
                      content: verdict.aiResponseText,
                      timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
                      reactions: [{ emoji: '🛡️', count: 1, users: ['ai_moderator'] }],
                      hasSpoiler: false,
                      isAiModeration: true,
                      replyTo: {
                        id: newMsg.id,
                        senderName: newMsg.senderName,
                        content: newMsg.content.slice(0, 90)
                      }
                    };

                    db.messages.push(aiMsg);
                    broadcastEvent('NEW_MESSAGE', aiMsg);

                    // Salva ocorrência no log de moderação
                    db.moderationLogs = db.moderationLogs || [];
                    db.moderationLogs.unshift({
                      id: 'inc-' + Date.now(),
                      userId: newMsg.senderId,
                      userName: newMsg.senderName,
                      channelId: newMsg.channelId,
                      messageContent: newMsg.content,
                      toxicityScore: verdict.toxicityScore,
                      verdict: verdict.verdict,
                      reasons: verdict.reasons,
                      aiResponse: verdict.aiResponseText,
                      timestamp: new Date().toISOString(),
                      actionTaken: verdict.suggestedAction
                    });
                    if (db.moderationLogs.length > 100) db.moderationLogs = db.moderationLogs.slice(0, 100);
                  }
                } catch (modErr) {
                  console.error('[Moderation AI Error]', modErr);
                }
              }

              writeDb(db);

              res.writeHead(200, {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
              });
              res.end(JSON.stringify({ success: true, message: newMsg }));
            } catch (err: any) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: err.message }));
            }
          });
          return;
        }

        // 4. DELETE /api/db/message (Delete from disk file & broadcast)
        if (req.method === 'DELETE' && url === '/api/db/message') {
          const params = new URLSearchParams(req.url?.split('?')[1] || '');
          const id = params.get('id');
          if (id) {
            const db = readDb();
            db.messages = (db.messages || []).filter((m: any) => m.id !== id);
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
          req.on('data', (chunk: any) => (body += chunk));
          req.on('end', () => {
            try {
              const { id, content, duelChallenge } = JSON.parse(body);
              const db = readDb();
              db.messages = (db.messages || []).map((m: any) => {
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
            } catch (err: any) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: err.message }));
            }
          });
          return;
        }

        // 4c. POST /api/db/media (Create new media post)
        if (req.method === 'POST' && url === '/api/db/media') {
          let body = '';
          req.on('data', (chunk: any) => (body += chunk));
          req.on('end', () => {
            try {
              const item = JSON.parse(body);
              const db = readDb();
              db.media = db.media || [];
              // Avoid duplicates
              if (!db.media.some((m: any) => m.id === item.id)) {
                db.media.push(item);
              }
              writeDb(db);
              broadcastEvent('NEW_MEDIA', item);
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: true, item }));
            } catch (err: any) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: err.message }));
            }
          });
          return;
        }

        // 4d. PUT /api/db/media (Update existing media post)
        if (req.method === 'PUT' && url === '/api/db/media') {
          let body = '';
          req.on('data', (chunk: any) => (body += chunk));
          req.on('end', () => {
            try {
              const updated = JSON.parse(body);
              const db = readDb();
              db.media = (db.media || []).map((m: any) => (m.id === updated.id ? { ...m, ...updated } : m));
              writeDb(db);
              broadcastEvent('EDIT_MEDIA', updated);
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: true, item: updated }));
            } catch (err: any) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: err.message }));
            }
          });
          return;
        }

        // 4e. DELETE /api/db/media (Delete media post — SOME DEFINITIVAMENTE)
        if (req.method === 'DELETE' && url === '/api/db/media') {
          const params = new URLSearchParams(req.url?.split('?')[1] || '');
          const id = params.get('id');
          if (id) {
            const db = readDb();
            db.media = (db.media || []).filter((m: any) => m.id !== id);
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

        // 5. POST /api/db/channel (Add channel to disk file & broadcast)
        if (req.method === 'POST' && url === '/api/db/channel') {
          let body = '';
          req.on('data', (chunk: any) => (body += chunk));
          req.on('end', () => {
            try {
              const newChan = JSON.parse(body);
              const db = readDb();
              db.channels = db.channels || [];
              db.channels.push(newChan);
              writeDb(db);

              broadcastEvent('NEW_CHANNEL', newChan);

              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: true, channel: newChan }));
            } catch (err: any) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: err.message }));
            }
          });
          return;
        }

        // 5b. DELETE /api/db/channel (Delete channel from disk file & broadcast)
        if (req.method === 'DELETE' && url === '/api/db/channel') {
          const params = new URLSearchParams(req.url?.split('?')[1] || '');
          const id = params.get('id');
          if (id) {
            const db = readDb();
            db.channels = (db.channels || []).filter((c: any) => c.id !== id);
            writeDb(db);

            broadcastEvent('DELETE_CHANNEL', id);

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, id }));
            return;
          }
        }

        // 6a. GET /api/db/user?userId=X (Fetch single user profile)
        if (req.method === 'GET' && req.url?.startsWith('/api/db/user')) {
          const parsedUrl = new URL(req.url, 'http://localhost');
          const userId = parsedUrl.searchParams.get('userId');
          if (!userId) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'userId required' }));
            return;
          }
          const db = readDb();
          const user = db.users?.[userId];
          if (!user) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'User not found' }));
            return;
          }
          res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({ user }));
          return;
        }

        // 6. POST /api/db/user (Update user on disk file & broadcast)
        if (req.method === 'POST' && url === '/api/db/user') {
          let body = '';
          req.on('data', (chunk: any) => (body += chunk));
          req.on('end', () => {
            try {
              const { userId, updates } = JSON.parse(body);
              const db = readDb();
              db.users = db.users || {};
              db.users[userId] = { ...(db.users[userId] || {}), ...updates };
              writeDb(db);

              broadcastEvent('USER_UPDATE', { userId, user: db.users[userId] });

              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: true, user: db.users[userId] }));
            } catch (err: any) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: err.message }));
            }
          });
          return;
        }

        // 7. POST /api/db/title (Add custom title to disk file & broadcast)
        if (req.method === 'POST' && url === '/api/db/title') {
          let body = '';
          req.on('data', (chunk: any) => (body += chunk));
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
            } catch (err: any) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: err.message }));
            }
          });
          return;
        }

        // 8. POST /api/db/reaction (Toggle reaction on disk file & broadcast)
        if (req.method === 'POST' && url === '/api/db/reaction') {
          let body = '';
          req.on('data', (chunk: any) => (body += chunk));
          req.on('end', () => {
            try {
              const { messageId, emoji, userId } = JSON.parse(body);
              const db = readDb();
              let updatedReactions: any[] = [];
              db.messages = (db.messages || []).map((m: any) => {
                if (m.id !== messageId) return m;
                const reactions = m.reactions || [];
                const previousReaction = reactions.find((r: any) => r.users && r.users.includes(userId));
                const previousEmoji = previousReaction ? previousReaction.emoji : null;

                let nextReactions = reactions.map((r: any) => ({
                  emoji: r.emoji,
                  count: r.count,
                  users: [...(r.users || [])],
                }));

                if (previousEmoji === emoji) {
                  // Toggle off
                  nextReactions = nextReactions.map((r: any) => {
                    if (r.emoji === emoji) {
                      const nextUsers = r.users.filter((u: any) => u !== userId);
                      return { ...r, count: nextUsers.length, users: nextUsers };
                    }
                    return r;
                  });
                } else {
                  // Remove from previous emoji if any
                  if (previousEmoji) {
                    nextReactions = nextReactions.map((r: any) => {
                      if (r.emoji === previousEmoji) {
                        const nextUsers = r.users.filter((u: any) => u !== userId);
                        return { ...r, count: nextUsers.length, users: nextUsers };
                      }
                      return r;
                    });
                  }

                  // Add to new emoji
                  const target = nextReactions.find((r: any) => r.emoji === emoji);
                  if (target) {
                    if (!target.users.includes(userId)) {
                      target.users.push(userId);
                      target.count = target.users.length;
                    }
                  } else {
                    nextReactions.push({ emoji, count: 1, users: [userId] });
                  }
                }

                updatedReactions = nextReactions.filter((r: any) => r.count > 0 && r.users.length > 0);
                return { ...m, reactions: updatedReactions };
              });
              writeDb(db);
              broadcastEvent('REACTION_UPDATE', { messageId, reactions: updatedReactions, emoji, userId });
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: true, reactions: updatedReactions }));
            } catch (err: any) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: err.message }));
            }
          });
          return;
        }

        // 9. POST /api/db/media (Add media post to disk file & broadcast)
        if (req.method === 'POST' && url === '/api/db/media') {
          let body = '';
          req.on('data', (chunk: any) => (body += chunk));
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
            } catch (err: any) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: err.message }));
            }
          });
          return;
        }

        // 9b. PUT /api/db/media (Update media post on disk & broadcast)
        if (req.method === 'PUT' && url === '/api/db/media') {
          let body = '';
          req.on('data', (chunk: any) => (body += chunk));
          req.on('end', () => {
            try {
              const updatedItem = JSON.parse(body);
              const db = readDb();
              db.media = (db.media || []).map((m: any) => (m.id === updatedItem.id ? { ...m, ...updatedItem } : m));
              writeDb(db);

              broadcastEvent('EDIT_MEDIA', updatedItem);
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: true, media: updatedItem }));
            } catch (err: any) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: err.message }));
            }
          });
          return;
        }

        // 9c. DELETE /api/db/media (Delete media post from disk & broadcast)
        if (req.method === 'DELETE' && url === '/api/db/media') {
          const params = new URLSearchParams(req.url?.split('?')[1] || '');
          const id = params.get('id');
          if (id) {
            const db = readDb();
            db.media = (db.media || []).filter((m: any) => m.id !== id);
            writeDb(db);

            broadcastEvent('DELETE_MEDIA', id);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, id }));
            return;
          }
        }

        // 9d. POST /api/db/track (Add track to catalog & broadcast)
        if (req.method === 'POST' && url === '/api/db/track') {
          let body = '';
          req.on('data', (chunk: any) => (body += chunk));
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
            } catch (err: any) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: err.message }));
            }
          });
          return;
        }

        // 9e. DELETE /api/db/track (Remove track & broadcast)
        if (req.method === 'DELETE' && url === '/api/db/track') {
          const params = new URLSearchParams(req.url?.split('?')[1] || '');
          const id = params.get('id');
          if (id) {
            const db = readDb();
            db.tracks = (db.tracks || []).filter((t: any) => t.id !== id);
            writeDb(db);
            broadcastEvent('DELETE_TRACK', id);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, id }));
            return;
          }
        }

        // 9f. POST /api/db/playlist (Create playlist with 5-playlist limit per player)
        if (req.method === 'POST' && url === '/api/db/playlist') {
          let body = '';
          req.on('data', (chunk: any) => (body += chunk));
          req.on('end', () => {
            try {
              const { title, description, coverUrl, creatorId, creatorName, isOfficial, trackIds } = JSON.parse(body);
              const db = readDb();
              db.playlists = db.playlists || [];

              // Regra Estrita: Limite de 5 playlists por jogador (se não for admin criando oficial)
              const existingPlaylists = db.playlists.filter((p: any) => p.creatorId === creatorId);
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
            } catch (err: any) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: err.message }));
            }
          });
          return;
        }

        // 9g. PUT /api/db/playlist (Update playlist)
        if (req.method === 'PUT' && url === '/api/db/playlist') {
          let body = '';
          req.on('data', (chunk: any) => (body += chunk));
          req.on('end', () => {
            try {
              const updatedPl = JSON.parse(body);
              const db = readDb();
              db.playlists = (db.playlists || []).map((p: any) => (p.id === updatedPl.id ? { ...p, ...updatedPl } : p));
              writeDb(db);
              broadcastEvent('EDIT_PLAYLIST', updatedPl);
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: true, playlist: updatedPl }));
            } catch (err: any) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: err.message }));
            }
          });
          return;
        }

        // 9h. DELETE /api/db/playlist (Delete playlist)
        if (req.method === 'DELETE' && url === '/api/db/playlist') {
          const params = new URLSearchParams(req.url?.split('?')[1] || '');
          const id = params.get('id');
          if (id) {
            const db = readDb();
            db.playlists = (db.playlists || []).filter((p: any) => p.id !== id);
            writeDb(db);
            broadcastEvent('DELETE_PLAYLIST', id);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, id }));
            return;
          }
        }

        // 9i. POST /api/db/moderation/config (Update Moderation AI configuration)
        if (req.method === 'POST' && url === '/api/db/moderation/config') {
          let body = '';
          req.on('data', (chunk: any) => (body += chunk));
          req.on('end', () => {
            try {
              const { config } = JSON.parse(body);
              const db = readDb();
              db.moderationConfig = { ...(db.moderationConfig || {}), ...config };
              writeDb(db);
              broadcastEvent('MODERATION_CONFIG_UPDATE', db.moderationConfig);
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: true, config: db.moderationConfig }));
            } catch (err: any) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: err.message }));
            }
          });
          return;
        }

        // 9j. POST /api/db/moderation/test (Simulate AI moderation analysis)
        if (req.method === 'POST' && url === '/api/db/moderation/test') {
          let body = '';
          req.on('data', (chunk: any) => (body += chunk));
          req.on('end', () => {
            try {
              const { text, senderName, config } = JSON.parse(body);
              const verdict = evaluateChatContent(text, senderName || 'Teste', config);
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: true, verdict }));
            } catch (err: any) {
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
            const match = Object.values(activeDuels).find((d: any) =>
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
          req.on('data', (chunk: any) => (body += chunk));
          req.on('end', () => {
            try {
              const { messageId, channelId, challenger, opponent } = JSON.parse(body);
              if (!challenger?.id || !opponent?.id) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Desafiante e oponente são obrigatórios.' }));
                return;
              }

              if (challenger.id === opponent.id) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Você não pode aceitar seu próprio duelo!' }));
                return;
              }

              const db = readDb();
              
              // Validate message status
              if (db.messages) {
                const msg = db.messages.find((m: any) => m.id === messageId);
                if (msg && msg.duelChallenge && msg.duelChallenge.status !== 'open') {
                  res.writeHead(400, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ error: 'Este duelo já foi aceito ou expirou!' }));
                  return;
                }
              }

              db.activeDuels = db.activeDuels || {};

              // Check if duel already created for this message
              let duel = Object.values(db.activeDuels).find((d: any) => d.messageId === messageId) as any;
              if (!duel) {
                const duelId = `duel_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
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
                  status: 'in_progress',
                  history: [],
                  lastRoll: null,
                  winnerId: null,
                  winnerName: null
                };

                db.activeDuels[duelId] = duel;

                if (db.messages) {
                  const msg = db.messages.find((m: any) => m.id === messageId);
                  if (msg && msg.duelChallenge) {
                    msg.duelChallenge.status = 'accepted';
                  }
                }

                writeDb(db);
                broadcastEvent('DUEL_START', { match: duel });
                broadcastEvent('MESSAGE_UPDATE', { messageId, updates: { duelChallenge: { status: 'accepted' } } });
              }

              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: true, match: duel }));
            } catch (err: any) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: err.message }));
            }
          });
          return;
        }

        // 9m. POST /api/db/duel/play (Submit paced turn with prediction higher/lower)
        if (req.method === 'POST' && url === '/api/db/duel/play') {
          let body = '';
          req.on('data', (chunk: any) => (body += chunk));
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

              let winnerId: string | null = null;
              let winnerName: string | null = null;
              let loserId: string | null = null;

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
                db.users[winnerId].xp = (db.users[winnerId].xp || 0) + 400;
                // Also update nested diceStats object
                db.users[winnerId].diceStats = db.users[winnerId].diceStats || { wins: 0, losses: 0, diceRank: 'Novato dos Dados', dicePoints: 0 };
                db.users[winnerId].diceStats.wins = (db.users[winnerId].diceStats.wins || 0) + 1;
                db.users[winnerId].diceStats.dicePoints = (db.users[winnerId].diceStats.dicePoints || 0) + 100;
                // Also increment general stats
                db.users[winnerId].stats = db.users[winnerId].stats || {};
                db.users[winnerId].stats.diceDuelsWon = (db.users[winnerId].stats.diceDuelsWon || 0) + 1;
              }
              if (loserId && db.users[loserId]) {
                db.users[loserId].diceDuelsLost = (db.users[loserId].diceDuelsLost || 0) + 1;
                db.users[loserId].xp = (db.users[loserId].xp || 0) + 20;
                // Also update nested diceStats object
                db.users[loserId].diceStats = db.users[loserId].diceStats || { wins: 0, losses: 0, diceRank: 'Novato dos Dados', dicePoints: 0 };
                db.users[loserId].diceStats.losses = (db.users[loserId].diceStats.losses || 0) + 1;
                db.users[loserId].diceStats.dicePoints = Math.max(0, (db.users[loserId].diceStats.dicePoints || 0) - 20);
              }
              if (winnerId === 'tie') {
                [match.challenger.id, match.opponent.id].forEach(uid => {
                  if (db.users[uid]) {
                    db.users[uid].xp = (db.users[uid].xp || 0) + 30;
                    db.users[uid].diceStats = db.users[uid].diceStats || { wins: 0, losses: 0, diceRank: 'Novato dos Dados', dicePoints: 0 };
                  }
                });
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
              // Broadcast updated user profiles to all clients
              if (winnerId && winnerId !== 'tie' && db.users[winnerId]) broadcastEvent('USER_UPDATE', { userId: winnerId, user: db.users[winnerId] });
              if (loserId && db.users[loserId]) broadcastEvent('USER_UPDATE', { userId: loserId, user: db.users[loserId] });
              if (winnerId === 'tie') {
                if (db.users[match.challenger.id]) broadcastEvent('USER_UPDATE', { userId: match.challenger.id, user: db.users[match.challenger.id] });
                if (db.users[match.opponent.id]) broadcastEvent('USER_UPDATE', { userId: match.opponent.id, user: db.users[match.opponent.id] });
              }


              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: true, match }));
            } catch (err: any) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: err.message }));
            }
          });
          return;
        }

        // 9n. POST /api/db/duel/close (Close and cleanup finished duel)
        if (req.method === 'POST' && url === '/api/db/duel/close') {
          let body = '';
          req.on('data', (chunk: any) => (body += chunk));
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
            } catch (err: any) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: err.message }));
            }
          });
          return;
        }

        // 10. POST /api/auth/register (Create account, generate 6-digit code, save to disk)
        if (req.method === 'POST' && url === '/api/auth/register') {
          let body = '';
          req.on('data', (chunk: any) => (body += chunk));
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

              const emailExists = Object.values(db.users).some((u: any) => u.email?.toLowerCase() === lowerEmail);
              if (emailExists) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: 'Este e-mail já está cadastrado.' }));
                return;
              }

              const nameExists = Object.values(db.users).some((u: any) => u.name?.toLowerCase() === lowerName);
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
            } catch (err: any) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: false, error: err.message }));
            }
          });
          return;
        }

        // 11. POST /api/auth/confirm-email (Verify 6-digit code, confirm account, auto-login)
        if (req.method === 'POST' && url === '/api/auth/confirm-email') {
          let body = '';
          req.on('data', (chunk: any) => (body += chunk));
          req.on('end', () => {
            try {
              const { email, code } = JSON.parse(body);
              const db = readDb();
              db.users = db.users || {};

              const lowerEmail = (email || '').toLowerCase().trim();
              const userKey = Object.keys(db.users).find((k: string) => db.users[k].email?.toLowerCase() === lowerEmail);

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
            } catch (err: any) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: false, error: err.message }));
            }
          });
          return;
        }

        // 12. POST /api/auth/login (Verify login & password, check email confirmation, auto-login)
        if (req.method === 'POST' && url === '/api/auth/login') {
          let body = '';
          req.on('data', (chunk: any) => (body += chunk));
          req.on('end', () => {
            try {
              const { login, password } = JSON.parse(body);
              const db = readDb();
              db.users = db.users || {};

              const search = (login || '').toLowerCase().trim();
              const user = Object.values(db.users).find((u: any) =>
                u.email?.toLowerCase() === search || u.name?.toLowerCase() === search
              ) as any;

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
            } catch (err: any) {
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
          req.on('data', (chunk: any) => (body += chunk));
          req.on('end', () => {
            try {
              const { email } = JSON.parse(body);
              const db = readDb();
              db.users = db.users || {};

              const lowerEmail = (email || '').toLowerCase().trim();
              const userKey = Object.keys(db.users).find((k: string) => db.users[k].email?.toLowerCase() === lowerEmail);

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
            } catch (err: any) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: false, error: err.message }));
            }
          });
          return;
        }

        // 15. POST /api/auth/logout
        if (req.method === 'POST' && url === '/api/auth/logout') {
          let body = '';
          req.on('data', (chunk: any) => (body += chunk));
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
            } catch (err: any) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: false, error: err.message }));
            }
          });
          return;
        }

        next();
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  server: {
    host: true,
    port: 5175,
    strictPort: true,
    watch: {
      ignored: ['**/data/**', '**/database.json', '**/.git/**'],
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    kizunaDbPlugin(),
  ],
});
