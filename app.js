// LYKAN Miner — Mini App frontend logic

const BACKEND_URL = 'https://lykanbackend-5vzx27er.b4a.run'; // Back4app temporary URL — update if it changes

const tg = window.Telegram?.WebApp;
tg?.ready();
tg?.expand();

const initData = tg?.initData || '';
const startParam = tg?.initDataUnsafe?.start_param || null;

let state = {
  coins: 0,
  claim_amount: 1000,
  last_claim_ts: null,
  referral_count: 0,
  referral_earnings: 0,
};

let countdownInterval = null;

// ---------- API helpers ----------
async function api(path, body = {}) {
  const res = await fetch(`${BACKEND_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ initData, ...body }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Request failed');
  }
  return res.json();
}

async function apiGet(path) {
  const res = await fetch(`${BACKEND_URL}${path}`);
  return res.json();
}

// ---------- Render ----------
function formatNum(n) {
  return Math.floor(n).toLocaleString('en-US');
}

function formatCountdown(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const h = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
  const m = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
  const s = String(totalSeconds % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function render() {
  document.getElementById('balance').textContent = formatNum(state.coins);
  document.getElementById('claimAmount').textContent = formatNum(state.claim_amount);
  document.getElementById('refCount').textContent = formatNum(state.referral_count);
  document.getElementById('refEarnings').textContent = formatNum(state.referral_earnings);
  updateClaimButton();
}

function updateClaimButton() {
  const btn = document.getElementById('claimBtn');
  const timerEl = document.getElementById('claimTimer');
  const cooldownMs = 24 * 60 * 60 * 1000;
  const last = state.last_claim_ts ? new Date(state.last_claim_ts).getTime() : 0;
  const remaining = last ? cooldownMs - (Date.now() - last) : 0;

  clearInterval(countdownInterval);

  if (remaining > 0) {
    btn.disabled = true;
    btn.textContent = 'Already Claimed';
    timerEl.textContent = `Next claim in ${formatCountdown(remaining)}`;
    countdownInterval = setInterval(() => {
      const msLeft = cooldownMs - (Date.now() - last);
      if (msLeft <= 0) {
        clearInterval(countdownInterval);
        updateClaimButton();
      } else {
        timerEl.textContent = `Next claim in ${formatCountdown(msLeft)}`;
      }
    }, 1000);
  } else {
    btn.disabled = false;
    btn.innerHTML = `Claim <span id="claimAmount">${formatNum(state.claim_amount)}</span> $LYKAN`;
    timerEl.textContent = '';
  }
}

// ---------- Claim ----------
async function handleClaim() {
  try {
    const updated = await api('/api/claim');
    state = { ...state, ...updated };
    tg?.HapticFeedback?.notificationOccurred('success');
    render();
  } catch (e) {
    tg?.HapticFeedback?.notificationOccurred('error');
    tg?.showAlert ? tg.showAlert(e.message) : alert(e.message);
    render();
  }
}

// ---------- Tasks ----------
async function loadTasks() {
  const tasks = await apiGet('/api/tasks');
  const list = document.getElementById('taskList');
  list.innerHTML = '';
  tasks.forEach((task) => {
    const el = document.createElement('div');
    el.className = 'task-item';
    el.innerHTML = `
      <div>
        <div class="task-item-title">${task.title}</div>
        <div class="task-item-reward">+${formatNum(task.reward)} $LYKAN</div>
      </div>
      <button class="task-btn" data-id="${task.id}" data-link="${task.link || ''}">Go</button>
    `;
    list.appendChild(el);
  });

  list.querySelectorAll('.task-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const link = btn.dataset.link;
      if (link) tg?.openLink ? tg.openLink(link) : window.open(link, '_blank');
      try {
        const updated = await api('/api/tasks/complete', { taskId: Number(btn.dataset.id) });
        state = { ...state, ...updated };
        render();
        btn.textContent = 'Done';
        btn.classList.add('done');
        btn.disabled = true;
      } catch (e) {
        console.error(e);
      }
    });
  });
}

// ---------- Leaderboard ----------
async function loadLeaderboard() {
  const data = await apiGet('/api/leaderboard');
  const list = document.getElementById('leaderboardList');
  list.innerHTML = '';
  data.forEach((u, i) => {
    const li = document.createElement('li');
    li.innerHTML = `<span><span class="rank">#${i + 1}</span>${u.first_name || u.username || 'Miner'}</span><span class="coins">${formatNum(u.coins)}</span>`;
    list.appendChild(li);
  });
}

// ---------- Referral ----------
function setupReferral() {
  document.getElementById('copyReferral').addEventListener('click', () => {
    const botUsername = 'YOUR_BOT_USERNAME'; // set this to your bot's username
    const link = `https://t.me/${botUsername}?start=${tg?.initDataUnsafe?.user?.id || ''}`;
    navigator.clipboard?.writeText(link);
    tg?.showAlert ? tg.showAlert('Referral link copied!') : alert('Link copied: ' + link);
  });
}

// ---------- Navigation ----------
function setupNav() {
  document.querySelectorAll('.dock-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.dock-btn').forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('main').forEach((m) => m.classList.add('hidden'));
      btn.classList.add('active');
      document.getElementById(`view-${btn.dataset.view}`).classList.remove('hidden');
      if (btn.dataset.view === 'tasks') loadTasks();
      if (btn.dataset.view === 'leaderboard') loadLeaderboard();
    });
  });
}

// ---------- Init ----------
async function init() {
  try {
    const data = await api('/api/auth', { startParam });
    state = { ...state, ...data };
    render();
  } catch (e) {
    console.error('Auth failed', e);
  }

  document.getElementById('claimBtn').addEventListener('click', handleClaim);
  setupReferral();
  setupNav();

  // Periodic sync to keep claim countdown accurate if user leaves app open
  setInterval(async () => {
    try {
      const updated = await api('/api/state');
      state = { ...state, ...updated };
      render();
    } catch (e) {
      /* ignore transient errors */
    }
  }, 15000);
}

init();
