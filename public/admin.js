const $ = (id) => document.getElementById(id);
let token = sessionStorage.getItem('admin_token') || '';
let allUsers = [];

function showToast(text) {
  const toast = $('toast');
  toast.textContent = text;
  toast.hidden = false;
  setTimeout(() => (toast.hidden = true), 2200);
}

async function adminApi(url, body, method) {
  const headers = { 'Content-Type': 'application/json', 'x-admin-token': token };
  const res = await fetch(url, {
    method: method || (body ? 'POST' : 'GET'),
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && url !== '/api/admin/login') {
    logout();
    throw new Error('Session expired, please login again.');
  }
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function fmtDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function renderRows(filter) {
  const tbody = $('userRows');
  tbody.innerHTML = '';
  const q = (filter || '').toLowerCase();
  const users = allUsers.filter((u) => !q || u.username.toLowerCase().includes(q));
  users.forEach((u) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${u.username.replace(/[<>&]/g, '')}</td>
      <td>${fmtDate(u.createdAt)}</td>
      <td>${u.chats}</td>
      <td>${u.images}</td>
      <td>${u.codes}</td>
      <td><button class="row-btn" data-id="${u.id}">Delete</button></td>`;
    tbody.appendChild(tr);
  });
  $('userCount').textContent = `Showing ${users.length} of ${allUsers.length} users`;
  tbody.querySelectorAll('.row-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this user?')) return;
      try {
        await adminApi('/api/admin/users/delete', { id: btn.dataset.id });
        showToast('✅ User deleted');
        await loadAll();
      } catch (err) {
        showToast('⚠️ ' + err.message);
      }
    });
  });
}

async function loadAll() {
  const stats = await adminApi('/api/admin/stats');
  $('statUsers').textContent = stats.totalUsers;
  $('statChats').textContent = stats.chats;
  $('statImages').textContent = stats.images;
  $('statCodes').textContent = stats.codes;

  const { users } = await adminApi('/api/admin/users');
  allUsers = users;
  renderRows($('refreshInput').value.trim());
}

function logout() {
  if (token) adminApi('/api/admin/logout', {}).catch(() => {});
  sessionStorage.removeItem('admin_token');
  token = '';
  $('adminWrap').hidden = true;
  $('logoutBtn').hidden = true;
  $('loginWrap').style.display = 'flex';
}

async function login() {
  const password = $('adminPass').value;
  if (!password) {
    $('loginError').textContent = 'Please enter the password.';
    return;
  }
  try {
    const data = await adminApi('/api/admin/login', { password });
    token = data.token;
    sessionStorage.setItem('admin_token', token);
    $('loginError').textContent = '';
    $('adminPass').value = '';
    enterAdmin();
  } catch (err) {
    $('loginError').textContent = err.message;
  }
}

async function enterAdmin() {
  $('loginWrap').style.display = 'none';
  $('adminWrap').hidden = false;
  $('logoutBtn').hidden = false;
  try {
    await loadAll();
  } catch (err) {
    showToast('⚠️ ' + err.message);
  }
}

$('loginBtn').addEventListener('click', login);
$('adminPass').addEventListener('keydown', (e) => e.key === 'Enter' && login());
$('logoutBtn').addEventListener('click', logout);
$('refreshBtn').addEventListener('click', () => renderRows($('refreshInput').value.trim()));
$('refreshInput').addEventListener('keydown', (e) => e.key === 'Enter' && renderRows($('refreshInput').value.trim()));

if (token) {
  enterAdmin();
}
