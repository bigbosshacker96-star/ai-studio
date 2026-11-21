const username = localStorage.getItem('ai_username') || '';
const state = {
  username,
  chatHistory: [],
  mood: localStorage.getItem('ai_mood') || 'normal',
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

async function runChat({ box, input, send, endpoint }) {
  const prompt = input.value.trim();
  if (!prompt) return;
  input.value = '';
  addMsg(box, 'user', prompt);
  const loadingEl = addMsg(box, 'bot', '⏳ Thinking...');
  loadingEl.classList.add('loading');
  send.disabled = true;

  try {
    const apiKey = $('mistralKey') ? $('mistralKey').value.trim() : '';
    const extra = apiKey ? { 'x-api-key': apiKey } : {};
    const data = await api(endpoint, { messages: [...state.chatHistory, { role: 'user', content: prompt }], mood: state.mood }, extra);
    loadingEl.remove();
    addMsg(box, 'bot', data.reply, true);
    state.chatHistory.push({ role: 'user', content: prompt });
    state.chatHistory.push({ role: 'assistant', content: data.reply });
    if (state.chatHistory.length > 20) state.chatHistory = state.chatHistory.slice(-20);
    api('/api/usage', { username: state.username, type: endpoint.split('/').pop() }).catch(() => {});
  } catch (err) {
    loadingEl.remove();
    addMsg(box, 'bot', `⚠️ ${err.message}`);
  } finally {
    send.disabled = false;
    input.focus();
  }
}

async function generateImage() {
  const prompt = $('imagePrompt').value.trim();
  if (!prompt) return;
  const result = $('imageResult');
  result.innerHTML = '<p class="hint">⏳ Generating your image...</p>';
  $('imageBtn').disabled = true;

  try {
    const data = await api('/api/image', {
      prompt,
      width: Number($('imgWidth').value) || 1024,
      height: Number($('imgHeight').value) || 1024
    });
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

document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
    document.querySelectorAll('.panel').forEach((p) => p.classList.remove('active'));
    tab.classList.add('active');
    $(`tab-${tab.dataset.tab}`).classList.add('active');
  });
});

async function login() {
  const name = $('loginInput').value.trim();
  if (name.length < 3) {
    $('loginError').textContent = 'Please enter at least 3 characters.';
    return;
  }
  try {
    const data = await api('/api/users/register', { username: name });
    if (data.session) localStorage.setItem('ai_session', data.session);
    localStorage.setItem('ai_username', name);
    state.username = name;
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
  const greeting = document.querySelector('#chatBox .msg.bot b');
  if (greeting) greeting.textContent = state.username;
  if (state.mood === 'girlfriend') {
    const box = $('chatBox');
    box.innerHTML = '';
    addMsg('chatBox', 'bot', `🥰 Hi ${state.username}! I'm Meera, your AI companion. How was your day? 💕`);
  }
}

$('loginBtn').addEventListener('click', login);
$('loginInput').addEventListener('keydown', (e) => e.key === 'Enter' && login());

$('chatSend').addEventListener('click', () => runChat({ box: 'chatBox', input: $('chatInput'), send: $('chatSend'), endpoint: '/api/chat' }));
$('chatInput').addEventListener('keydown', (e) => e.key === 'Enter' && runChat({ box: 'chatBox', input: $('chatInput'), send: $('chatSend'), endpoint: '/api/chat' }));

$('codeSend').addEventListener('click', () => runChat({ box: 'codeBox', input: $('codeInput'), send: $('codeSend'), endpoint: '/api/code' }));
$('codeInput').addEventListener('keydown', (e) => e.key === 'Enter' && runChat({ box: 'codeBox', input: $('codeInput'), send: $('codeSend'), endpoint: '/api/code' }));

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

const moodDefault = document.querySelector(`.mood-pill[data-mood="${state.mood}"]`) || document.querySelector('.mood-pill');
document.querySelectorAll('.mood-pill').forEach((p) => p.classList.remove('active'));
if (moodDefault) moodDefault.classList.add('active');

document.querySelectorAll('.mood-pill').forEach((pill) => {
  pill.addEventListener('click', () => {
    document.querySelectorAll('.mood-pill').forEach((p) => p.classList.remove('active'));
    pill.classList.add('active');
    state.mood = pill.dataset.mood;
    localStorage.setItem('ai_mood', state.mood);
    state.chatHistory = [];
    const box = $('chatBox');
    box.innerHTML = '';
    const hello = state.mood === 'girlfriend'
      ? `🥰 Hi ${state.username || 'cutie'}! I'm Meera, your AI companion. How was your day? 💕`
      : `👋 Hello! Ask me anything.`;
    addMsg('chatBox', 'bot', hello);
    showToast(state.mood === 'girlfriend' ? '🥰 Girlfriend mood ON' : '💬 Normal mood');
  });
});

function applyGreeting() {
  if (state.mood === 'girlfriend') {
    addMsg('chatBox', 'bot', `🥰 Hi ${state.username || 'cutie'}! I'm Meera, your AI companion. How was your day? 💕`);
  }
}

$('mistralKey').value = localStorage.getItem('mistral_key') || '';
$('saveKey').addEventListener('click', () => {
  const key = $('mistralKey').value.trim();
  if (key) localStorage.setItem('mistral_key', key);
  else localStorage.removeItem('mistral_key');
  showToast('✅ Settings saved');
});

if (state.username) {
  api('/api/users/register', { username: state.username })
    .then((data) => {
      if (data.session) localStorage.setItem('ai_session', data.session);
      enterApp();
    })
    .catch(() => {});
}

function setTheme(theme) {
  document.body.dataset.theme = theme;
  localStorage.setItem('ai_theme', theme);
}

setTheme(localStorage.getItem('ai_theme') || 'cyberpunk');

const themeBtn = $('themeBtn');
const themeMenu = $('themeMenu');
if (themeBtn && themeMenu) {
  themeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    themeMenu.hidden = !themeMenu.hidden;
  });
  themeMenu.querySelectorAll('button').forEach((opt) => {
    opt.addEventListener('click', () => {
      setTheme(opt.dataset.themeSet);
      themeMenu.hidden = true;
      showToast('✨ Design changed: ' + opt.textContent.trim());
    });
  });
  document.addEventListener('click', () => (themeMenu.hidden = true));
}
