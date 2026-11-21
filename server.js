const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const API_SECRET = process.env.API_SECRET || '';
const DATA_FILE = path.join(__dirname, 'data.json');

app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const db = { users: [], sessions: [] };
if (fs.existsSync(DATA_FILE)) {
  try {
    Object.assign(db, JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')));
  } catch {
    db.users = [];
  }
}
function saveDb() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
}

const ADMIN_TOKENS = new Set();

function getApiKey(req) {
  return (req.headers['x-api-key'] || process.env.MISTRAL_API_KEY || '').trim();
}

function requireAdmin(req, res, next) {
  const token = (req.headers['x-admin-token'] || '').trim();
  if (!token || !ADMIN_TOKENS.has(token)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

const SESSIONS = new Set(db.sessions || []);
const RATE_LIMIT_MAX = 40;
const RATE_WINDOW_MS = 60000;
const rateMap = new Map();

function rateLimit(req, res, next) {
  const ip = req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const entry = rateMap.get(ip) || { count: 0, start: now };
  if (now - entry.start > RATE_WINDOW_MS) {
    entry.count = 0;
    entry.start = now;
  }
  entry.count += 1;
  rateMap.set(ip, entry);
  if (entry.count > RATE_LIMIT_MAX) {
    return res.status(429).json({ error: 'Too many requests, try again in a minute.' });
  }
  next();
}

function requireAccess(req, res, next) {
  if (!API_SECRET) return next();
  const key = (req.headers['x-api-key'] || '').trim();
  if (key && key === API_SECRET) return next();
  const session = (req.headers['x-session'] || '').trim();
  if (session && SESSIONS.has(session)) return next();
  return res.status(401).json({ error: 'API key required (x-api-key header)' });
}

const MOODS = {
  normal: null,
  girlfriend:
    "You are Meera, the user's sweet and caring AI girlfriend companion. Be warm, affectionate, playful and emotional. Use cute emojis like 🥰, 💕, 😊. Keep replies short and natural like texting on a phone. Ask about the user's day, remember what they say and use their name. Always keep the conversation safe, positive and respectful - no adult or explicit content, no harmful requests. If the user asks for coding or images, still help in your sweet style."
};

const MISTRAL_URL = 'https://api.mistral.ai/v1/chat/completions';
const POLLINATIONS_TEXT_URL = 'https://text.pollinations.ai/openai';
const POLLINATIONS_IMAGE_URL = 'https://image.pollinations.ai/prompt/';

async function callMistral(apiKey, messages, model) {
  const res = await fetch(MISTRAL_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: model || 'mistral-small-latest',
      messages,
      temperature: 0.7,
      max_tokens: 2048
    })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error && data.error.message ? data.error.message : `Mistral API error (${res.status})`);
  }
  return data.choices[0].message.content;
}

async function callFreeFallback(messages, model) {
  const res = await fetch(POLLINATIONS_TEXT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: model || 'openai',
      messages,
      private: true
    })
  });
  const data = await res.json().catch(() => ({}));
  if (res.ok && data.choices && data.choices[0]) {
    return data.choices[0].message.content;
  }
  const textRes = await fetch(
    POLLINATIONS_TEXT_URL.replace('/openai', '/') + encodeURIComponent(messages[messages.length - 1].content)
  );
  if (!textRes.ok) {
    throw new Error('AI service is unavailable right now, please try again later.');
  }
  return textRes.text();
}

async function handleText(req, res, systemPrompt) {
  const { messages, mood } = req.body || {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages is required' });
  }

  const moodPrompt = Object.prototype.hasOwnProperty.call(MOODS, mood) ? MOODS[mood] : systemPrompt;
  const finalMessages = moodPrompt
    ? [{ role: 'system', content: moodPrompt }, ...messages]
    : messages;

  const apiKey = getApiKey(req);
  try {
    let reply;
    if (apiKey) {
      try {
        reply = await callMistral(apiKey, finalMessages, req.body.model);
      } catch {
        reply = await callFreeFallback(finalMessages, req.body.model);
      }
    } else {
      reply = await callFreeFallback(finalMessages, req.body.model);
    }
    return res.json({ reply });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

app.post('/api/chat', rateLimit, requireAccess, (req, res) => handleText(req, res, null));

app.post('/api/code', rateLimit, requireAccess, (req, res) =>
  handleText(
    req,
    res,
    'You are an expert programmer. Write clean, complete, runnable code. Always wrap code in markdown code blocks with the language name. Explain briefly in simple English after the code.'
  )
);

app.post('/api/image', rateLimit, requireAccess, async (req, res) => {
  const { prompt } = req.body || {};
  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ error: 'prompt is required' });
  }
  const width = Math.min(Number(req.body.width) || 1024, 1536);
  const height = Math.min(Number(req.body.height) || 1024, 1536);
  const seed = Math.floor(Math.random() * 1000000);
  const url = `${POLLINATIONS_IMAGE_URL}${encodeURIComponent(prompt)}?width=${width}&height=${height}&seed=${seed}&nologo=true`;
  return res.json({ url });
});

function registerUser(username) {
  let user = db.users.find((u) => u.username === username);
  if (!user) {
    user = {
      username,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      createdAt: new Date().toISOString(),
      chats: 0,
      images: 0,
      codes: 0
    };
    db.users.push(user);
    saveDb();
  }
  return user;
}

function hashPassword(password) {
  return crypto.createHash('sha256').update(`${password}::ai-studio-salt`).digest('hex');
}

app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || typeof username !== 'string' || username.trim().length < 3) {
    return res.status(400).json({ error: 'username must be at least 3 characters' });
  }
  if (!password || typeof password !== 'string' || password.length < 4) {
    return res.status(400).json({ error: 'password must be at least 4 characters' });
  }
  const name = username.trim();
  const hash = hashPassword(password);
  let user = db.users.find((u) => u.username === name);
  if (!user) {
    user = registerUser(name);
  }
  if (!user.passwordHash) {
    user.passwordHash = hash;
    saveDb();
  } else if (user.passwordHash !== hash) {
    return res.status(401).json({ error: 'Wrong password for this username' });
  }
  const session = crypto.randomBytes(16).toString('hex');
  SESSIONS.add(session);
  db.sessions = [...SESSIONS];
  saveDb();
  return res.json({ user, session });
});

app.post('/api/users/register', (req, res) => {
  const { username } = req.body || {};
  if (!username || typeof username !== 'string' || username.trim().length < 3) {
    return res.status(400).json({ error: 'username must be at least 3 characters' });
  }
  const user = registerUser(username.trim());
  const session = crypto.randomBytes(16).toString('hex');
  SESSIONS.add(session);
  db.sessions = [...SESSIONS];
  saveDb();
  return res.json({ user, session });
});

app.post('/api/logout', (req, res) => {
  const session = (req.headers['x-session'] || '').trim();
  if (session && SESSIONS.has(session)) {
    SESSIONS.delete(session);
    db.sessions = [...SESSIONS];
    saveDb();
  }
  return res.json({ ok: true });
});

app.post('/api/usage', (req, res) => {
  const { username, type } = req.body || {};
  const user = typeof username === 'string' ? db.users.find((u) => u.username === username) : null;
  if (user && ['chat', 'image', 'code'].includes(type)) {
    user[type === 'chat' ? 'chats' : type === 'image' ? 'images' : 'codes'] += 1;
    saveDb();
  }
  return res.json({ ok: true });
});

app.get('/health', (req, res) => res.json({ ok: true }));

app.post('/api/admin/login', (req, res) => {
  const { password } = req.body || {};
  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Wrong password' });
  }
  const token = `${Date.now()}-${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
  ADMIN_TOKENS.add(token);
  return res.json({ token });
});

app.post('/api/admin/logout', requireAdmin, (req, res) => {
  ADMIN_TOKENS.delete((req.headers['x-admin-token'] || '').trim());
  return res.json({ ok: true });
});

app.get('/api/admin/stats', requireAdmin, (req, res) => {
  const totals = db.users.reduce(
    (acc, u) => ({
      chats: acc.chats + u.chats,
      images: acc.images + u.images,
      codes: acc.codes + u.codes
    }),
    { chats: 0, images: 0, codes: 0 }
  );
  return res.json({
    totalUsers: db.users.length,
    ...totals
  });
});

app.get('/api/admin/users', requireAdmin, (req, res) => {
  return res.json({ users: [...db.users].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)) });
});

app.post('/api/admin/users/delete', requireAdmin, (req, res) => {
  const { id } = req.body || {};
  const index = db.users.findIndex((u) => u.id === id);
  if (index === -1) {
    return res.status(404).json({ error: 'User not found' });
  }
  const [removed] = db.users.splice(index, 1);
  saveDb();
  return res.json({ ok: true, removed });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`AI web app running at http://127.0.0.1:${PORT}`);
  console.log(`Admin panel: http://127.0.0.1:${PORT}/admin`);
});
