const username = localStorage.getItem('ai_username') || '';
const state = { username, chatHistory: [] };

const $ = (id) => document.getElementById(id);

function showToast(text) {
  const toast = $('toast');
  toast.textContent = text;
  toast.hidden = false;
  setTimeout(() => (toast.hidden = true), 2200);
}

async function api(url, body, keyHeader) {
  const headers = { 'Content-Type': 'application/json' };
  if (keyHeader) headers['x-api-key'] = keyHeader;
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
    const data = await api(endpoint, { messages: [...state.chatHistory, { role: 'user', content: prompt }] }, apiKey);
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
    const link = document.createElement('a');
    link.href = data.url;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = 'Open full size';
    link.className = 'hint';
    result.appendChild(img);
    result.appendChild(link);
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
    await api('/api/users/register', { username: name });
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
}

$('loginBtn').addEventListener('click', login);
$('loginInput').addEventListener('keydown', (e) => e.key === 'Enter' && login());

$('chatSend').addEventListener('click', () => runChat({ box: 'chatBox', input: $('chatInput'), send: $('chatSend'), endpoint: '/api/chat' }));
$('chatInput').addEventListener('keydown', (e) => e.key === 'Enter' && runChat({ box: 'chatBox', input: $('chatInput'), send: $('chatSend'), endpoint: '/api/chat' }));

$('codeSend').addEventListener('click', () => runChat({ box: 'codeBox', input: $('codeInput'), send: $('codeSend'), endpoint: '/api/code' }));
$('codeInput').addEventListener('keydown', (e) => e.key === 'Enter' && runChat({ box: 'codeBox', input: $('codeInput'), send: $('codeSend'), endpoint: '/api/code' }));

$('imageBtn').addEventListener('click', generateImage);

$('mistralKey').value = localStorage.getItem('mistral_key') || '';
$('saveKey').addEventListener('click', () => {
  const key = $('mistralKey').value.trim();
  if (key) localStorage.setItem('mistral_key', key);
  else localStorage.removeItem('mistral_key');
  showToast('✅ Settings saved');
});

if (state.username) {
  api('/api/users/register', { username: state.username })
    .then(enterApp)
    .catch(() => {});
}
