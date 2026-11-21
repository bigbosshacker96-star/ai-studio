const state = {
  username: localStorage.getItem('ai_username') || '',
  password: localStorage.getItem('ai_pass') || '',
  mood: localStorage.getItem('ai_mood') || 'normal',
  voiceOn: localStorage.getItem('ai_voice') === '1',
  chatHistory: [],
  sessions: [],
  currentSessionId: null,
  lastImage: null
};

const $ = (id) => document.getElementById(id);

function showToast(text) {
  const toast = $('toast');
  toast.textContent = text;
  toast.hidden = false;
  setTimeout(() => (toast.hidden = true), 2200);
}

async function api(url, body, extra = {}) {
  const headers = { 'Content-Type': 'application/json', ...extra };
  const session = localStorage.getItem('ai_session');
  if (session) headers['x-session'] = session;
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

/* ---------- theme ---------- */

function setTheme(theme) {
  document.body.dataset.theme = theme;
  localStorage.setItem('ai_theme', theme);
}
setTheme(localStorage.getItem('ai_theme') || 'cyberpunk');

/* ---------- chat sessions (like ChatGPT) ---------- */

function loadSessions() {
  try {
    state.sessions = JSON.parse(localStorage.getItem('ai_chat_sessions') || '[]');
  } catch {
    state.sessions = [];
  }
}

function saveSessions() {
  localStorage.setItem('ai_chat_sessions', JSON.stringify(state.sessions.slice(0, 50)));
}

function getCurrentSession() {
  return state.sessions.find((s) => s.id === state.currentSessionId) || null;
}

function newChat() {
  state.chatHistory = [];
  state.currentSessionId = null;
  renderMessages('chatBox', []);
  closeDrawer();
  renderHistory();
  $('chatInput').focus();
}

function openOrCreateSession() {
  let s = getCurrentSession();
  if (!s) {
    s = { id: `${Date.now()}`, title: 'New Chat', messages: [] };
    state.sessions.unshift(s);
    state.currentSessionId = s.id;
    saveSessions();
  }
  return s;
}

function renderHistory() {
  const list = $('historyList');
  list.innerHTML = '';
  if (state.sessions.length === 0) {
    list.innerHTML = '<p class="hint empty">No chats yet — send your first message!</p>';
    return;
  }
  state.sessions.forEach((s) => {
    const item = document.createElement('button');
    item.className = 'history-item' + (s.id === state.currentSessionId ? ' active' : '');
    const title = document.createElement('span');
    title.textContent = s.title.length > 34 ? s.title.slice(0, 34) + '…' : s.title;
    const del = document.createElement('span');
    del.className = 'history-del';
    del.textContent = '🗑';
    del.title = 'Delete';
    del.addEventListener('click', (e) => {
      e.stopPropagation();
      state.sessions = state.sessions.filter((x) => x.id !== s.id);
      if (state.currentSessionId === s.id) {
        state.currentSessionId = null;
        state.chatHistory = [];
        renderMessages('chatBox', []);
      }
      saveSessions();
      renderHistory();
    });
    item.appendChild(title);
    item.appendChild(del);
    item.addEventListener('click', () => {
      state.currentSessionId = s.id;
      state.chatHistory = s.messages.map((m) => ({ role: m.role, content: m.content }));
      renderMessages('chatBox', s.messages);
      document.querySelector('.tab[data-tab="chat"]').click();
      closeDrawer();
      renderHistory();
    });
    list.appendChild(item);
  });
}

/* ---------- rendering ---------- */

function renderMarkdown(text) {
  const div = document.createElement('div');
  const parts = [];
  const regex = /```(\w*)\n([\s\S]*?)```/g;
  let match;
  let lastIndex = 0;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push({ type: 'text', value: text.slice(lastIndex, match.index) });
    parts.push({ type: 'code', lang: match[1], value: match[2] });
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) parts.push({ type: 'text', value: text.slice(lastIndex) });

  parts.forEach((part) => {
    if (part.type === 'text') {
      div.appendChild(document.createTextNode(part.value));
    } else {
      const pre = document.createElement('div');
      pre.className = 'msg code';
      pre.textContent = part.lang ? `[${part.lang}]\n${part.value}` : part.value;
      div.appendChild(pre);
    }
  });
  return div;
}

function renderMessages(boxId, messages) {
  const box = $(boxId);
  box.innerHTML = '';
  const hello = state.mood === 'girlfriend'
    ? `🥰 Hi ${state.username || 'cutie'}! I'm Meera, your AI companion. How was your day? 💕`
    : `👋 Hello ${state.username || ''}! Ask me anything — I'm listening.`;
  if (messages.length === 0) {
    addMsg(boxId, 'bot', hello);
    return;
  }
  messages.forEach((m) => addMsg(boxId, m.role === 'assistant' ? 'bot' : 'user', m.content, true));
}

function addMsg(boxId, role, content, asMarkdown) {
  const box = $(boxId);
  const el = document.createElement('div');
  el.className = `msg ${role}`;
  if (asMarkdown && role === 'bot') {
    el.appendChild(renderMarkdown(content));
  } else {
    el.textContent = content;
  }
  box.appendChild(el);
  box.scrollTop = box.scrollHeight;
  return el;
}

function speak(text) {
  if (!state.voiceOn || !('speechSynthesis' in window)) return;
  const clean = text
    .replace(/```[\s\S]*?```/g, ' code block ')
    .replace(/[*_#`>-]/g, '')
    .slice(0, 300);
  const u = new SpeechSynthesisUtterance(clean);
  u.lang = 'bn-BD';
  u.rate = 1;
  speechSynthesis.speak(u);
}

/* ---------- chat send ---------- */

async function runChat({ box, input, send, endpoint, moodEnabled }) {
  const prompt = input.value.trim();
  if (!prompt) return;
  input.value = '';
  addMsg(box, 'user', prompt);
  const loadingEl = addMsg(box, 'bot', '⏳ Thinking...');
  loadingEl.classList.add('loading');
  send.disabled = true;

  const session = openOrCreateSession();
  if (session.messages.length === 0) {
    session.title = prompt.slice(0, 40);
  }

  try {
    const apiKey = localStorage.getItem('mistral_key') || '';
    const extra = apiKey ? { 'x-api-key': apiKey } : {};
    const body = { messages: [...state.chatHistory, { role: 'user', content: prompt }] };
    if (moodEnabled) body.mood = state.mood;
    const data = await api(endpoint, body, extra);
    loadingEl.remove();
    addMsg(box, 'bot', data.reply, true);
    speak(data.reply);
    session.messages.push({ role: 'user', content: prompt }, { role: 'assistant', content: data.reply });
    state.chatHistory = session.messages.slice(-20).map((m) => ({ role: m.role, content: m.content }));
    saveSessions();
    renderHistory();
    api('/api/usage', { username: state.username, type: endpoint.split('/').pop() }).catch(() => {});
  } catch (err) {
    loadingEl.remove();
    addMsg(box, 'bot', `⚠️ ${err.message}`);
  } finally {
    send.disabled = false;
    input.focus();
  }
}

/* ---------- image ---------- */

async function generateImage() {
  const prompt = $('imagePrompt').value.trim();
  if (!prompt) return;
  const result = $('imageResult');
  result.innerHTML = '<p class="hint">⏳ Generating your image...</p>';
  $('imageBtn').disabled = true;

  try {
    const apiKey = localStorage.getItem('mistral_key') || '';
    const extra = apiKey ? { 'x-api-key': apiKey } : {};
    const data = await api('/api/image', {
      prompt,
      width: Number($('imgWidth').value) || 1024,
      height: Number($('imgHeight').value) || 1024
    }, extra);
    result.innerHTML = '';
    const img = document.createElement('img');
    img.src = data.url;
    img.alt = prompt;
    result.appendChild(img);
    state.lastImage = data.url;
    $('downloadRow').hidden = false;
    $('openFull').href = data.url;
    api('/api/usage', { username: state.username, type: 'image' }).catch(() => {});
  } catch (err) {
    result.innerHTML = `<p class="error">⚠️ ${err.message}</p>`;
  } finally {
    $('imageBtn').disabled = false;
  }
}

/* ---------- drawer ---------- */

let deferredInstall = null;

function openDrawer() {
  $('drawer').classList.add('open');
  $('drawer').setAttribute('aria-hidden', 'false');
  $('overlay').hidden = false;
  renderHistory();
}

function closeDrawer() {
  $('drawer').classList.remove('open');
  $('drawer').setAttribute('aria-hidden', 'true');
  $('overlay').hidden = true;
}

/* ---------- voice input ---------- */

function setupVoice() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    $('micBtn').classList.add('off');
    return;
  }
  const rec = new SpeechRecognition();
  rec.lang = navigator.language && navigator.language.startsWith('bn') ? 'bn-BD' : 'en-US';
  rec.interimResults = false;
  rec.maxAlternatives = 1;
  let listening = false;

  $('micBtn').addEventListener('click', () => {
    if (listening) return;
    try {
      rec.start();
      listening = true;
      $('micBtn').classList.add('listening');
      showToast('🎤 Listening... speak now');
    } catch {
      listening = false;
    }
  });

  rec.onresult = (e) => {
    const text = e.results[0][0].transcript;
    $('chatInput').value = text;
  };
  rec.onend = () => {
    listening = false;
    $('micBtn').classList.remove('listening');
  };
  rec.onerror = () => {
    listening = false;
    $('micBtn').classList.remove('listening');
  };
}

/* ---------- login ---------- */

async function login() {
  const name = $('loginInput').value.trim();
  const pass = $('loginPass').value;
  if (name.length < 3) {
    $('loginError').textContent = 'Name must be at least 3 characters.';
    return;
  }
  if (pass.length < 4) {
    $('loginError').textContent = 'Password must be at least 4 characters.';
    return;
  }
  try {
    const data = await api('/api/login', { username: name, password: pass });
    if (data.session) localStorage.setItem('ai_session', data.session);
    localStorage.setItem('ai_username', name);
    localStorage.setItem('ai_pass', pass);
    state.username = name;
    state.password = pass;
    $('loginError').textContent = '';
    enterApp();
  } catch (err) {
    $('loginError').textContent = err.message;
  }
}

function enterApp() {
  $('loginView').hidden = true;
  $('appView').hidden = false;
  const chip = $('userName');
  chip.textContent = state.username;
  chip.hidden = false;
  loadSessions();
  const session = getCurrentSession();
  renderMessages('chatBox', session ? session.messages : []);
  if (session) {
    state.chatHistory = session.messages.slice(-20).map((m) => ({ role: m.role, content: m.content }));
  }
  renderHistory();
  setupVoice();
}

function logout() {
  api('/api/logout', {}).catch(() => {});
  localStorage.removeItem('ai_session');
  localStorage.removeItem('ai_username');
  localStorage.removeItem('ai_pass');
  state.username = '';
  state.password = '';
  location.reload();
}

/* ---------- events ---------- */

$('loginBtn').addEventListener('click', login);
$('loginPass').addEventListener('keydown', (e) => e.key === 'Enter' && login());

$('menuBtn').addEventListener('click', openDrawer);
$('drawerClose').addEventListener('click', closeDrawer);
$('overlay').addEventListener('click', closeDrawer);

$('newChatBtn').addEventListener('click', newChat);
$('logoutBtn').addEventListener('click', logout);

const voiceOutBtn = $('voiceOutBtn');
voiceOutBtn.classList.toggle('active', state.voiceOn);
voiceOutBtn.addEventListener('click', () => {
  state.voiceOn = !state.voiceOn;
  localStorage.setItem('ai_voice', state.voiceOn ? '1' : '0');
  voiceOutBtn.classList.toggle('active', state.voiceOn);
  if (!state.voiceOn && 'speechSynthesis' in window) speechSynthesis.cancel();
  showToast(state.voiceOn ? '🔊 Voice replies ON' : '🔇 Voice replies OFF');
});

$('chatSend').addEventListener('click', () => runChat({ box: 'chatBox', input: $('chatInput'), send: $('chatSend'), endpoint: '/api/chat', moodEnabled: true }));
$('chatInput').addEventListener('keydown', (e) => e.key === 'Enter' && runChat({ box: 'chatBox', input: $('chatInput'), send: $('chatSend'), endpoint: '/api/chat', moodEnabled: true }));

$('codeSend').addEventListener('click', () => runChat({ box: 'codeBox', input: $('codeInput'), send: $('codeSend'), endpoint: '/api/code', moodEnabled: false }));
$('codeInput').addEventListener('keydown', (e) => e.key === 'Enter' && runChat({ box: 'codeBox', input: $('codeInput'), send: $('codeSend'), endpoint: '/api/code', moodEnabled: false }));

$('imageBtn').addEventListener('click', generateImage);

$('downloadBtn').addEventListener('click', async () => {
  if (!state.lastImage) return;
  try {
    const res = await fetch(state.lastImage);
    if (!res.ok) throw new Error('download failed');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ai-image-${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast('✅ Image downloaded');
  } catch {
    window.open(state.lastImage, '_blank');
  }
});

document.querySelectorAll('.theme-grid button').forEach((opt) => {
  opt.addEventListener('click', () => {
    setTheme(opt.dataset.themeSet);
    showToast('✨ Design changed: ' + opt.textContent.trim());
  });
});

function setMood(mood) {
  state.mood = mood;
  localStorage.setItem('ai_mood', mood);
  state.chatHistory = [];
  document.querySelectorAll('.mood-pill').forEach((p) => p.classList.toggle('active', p.dataset.moodSet === mood));
  state.currentSessionId = null;
  renderMessages('chatBox', []);
  renderHistory();
}

document.querySelectorAll('.mood-pill').forEach((p) => p.classList.toggle('active', p.dataset.moodSet === state.mood));

document.querySelectorAll('[data-mood-set]').forEach((pill) => {
  pill.addEventListener('click', () => {
    setMood(pill.dataset.moodSet);
    showToast(pill.dataset.moodSet === 'girlfriend' ? '🥰 Girlfriend mood ON' : '💬 Normal mood');
  });
});

document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
    document.querySelectorAll('.panel').forEach((p) => p.classList.remove('active'));
    tab.classList.add('active');
    $(`tab-${tab.dataset.tab}`).classList.add('active');
  });
});

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstall = e;
});

$('installBtn').addEventListener('click', async () => {
  if (deferredInstall) {
    deferredInstall.prompt();
    const { outcome } = await deferredInstall.userChoice;
    if (outcome === 'accepted') showToast('📲 App installed!');
    deferredInstall = null;
    return;
  }
  showToast('📲 Chrome menu (⋮) → "Add to Home screen" tap korun — app er moto install hobe');
});

/* ---------- auto login ---------- */

async function autoLogin() {
  if (!state.username || !state.password) return;
  try {
    const data = await api('/api/login', { username: state.username, password: state.password });
    if (data.session) localStorage.setItem('ai_session', data.session);
    enterApp();
  } catch {
    localStorage.removeItem('ai_session');
  }
}

autoLogin();
