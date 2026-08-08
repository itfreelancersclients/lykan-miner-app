// LYKAN Miner — Mini App frontend logic

const BACKEND_URL = 'https://lykanbackend-u3q9zyh2.b4a.run'; // Back4app temporary URL — update if it changes

const tg = window.Telegram?.WebApp;
tg?.ready();
tg?.expand();

const initData = tg?.initData || '';
const startParam = tg?.initDataUnsafe?.start_param || null;

const RING_CIRCUMFERENCE = 628;

let state = {
  coins: 0,
  energy: 1000,
  max_energy: 1000,
  tap_power: 1,
  tap_level: 1,
  mine_rate: 0,
  mine_level: 0,
  referral_count: 0,
  referral_earnings: 0,
};

let pendingTaps = 0;
let tapFlushTimer = null;

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

function render() {
  document.getElementById('balance').textContent = formatNum(state.coins);
  document.getElementById('mineRate').textContent = `+${formatNum(state.mine_rate)} / hr`;
  document.getElementById('energyVal').textContent = formatNum(state.energy);
  document.getElementById('energyMax').textContent = formatNum(state.max_energy);

  const fraction = state.max_energy > 0 ? state.energy / state.max_energy : 0;
  const offset = RING_CIRCUMFERENCE * (1 - fraction);
  document.getElementById('ringFill').style.strokeDashoffset = offset;

  document.getElementById('tapPowerSub').textContent = `Lv ${state.tap_level} · +${state.tap_power} / tap`;
  document.getElementById('mineRateSub').textContent = `Lv ${state.mine_level} · +${formatNum(state.mine_rate)} / hr`;
  document.getElementById('tapCost').textContent = formatNum(Math.floor(500 * Math.pow(1.6, state.tap_level)));
  document.getElementById('mineCost').textContent = formatNum(Math.floor(1000 * Math.pow(1.7, state.mine_level)));

  document.getElementById('refCount').textContent = formatNum(state.referral_count);
  document.getElementById('refEarnings').textContent = formatNum(state.referral_earnings);
}

// ---------- Tap handling (batched for performance) ----------
function handleTap() {
  if (state.energy <= 0) {
    tg?.HapticFeedback?.notificationOccurred('error');
    return;
  }
  state.energy -= 1;
  state.coins += state.tap_power;
  pendingTaps += 1;
  tg?.HapticFeedback?.impactOccurred('light');
  render();

  clearTimeout(tapFlushTimer);
  tapFlushTimer = setTimeout(flushTaps, 600);
}

async function flushTaps() {
  if (pendingTaps === 0) return;
  const taps = pendingTaps;
  pendingTaps = 0;
  try {
    const updated = await api('/api/tap', { taps });
    state = { ...state, ...updated };
    render();
  } catch (e) {
    console.error('Tap sync failed', e);
  }
}

// ---------- Upgrades ----------
async function buyUpgrade(type) {
  try {
    const updated = await api('/api/upgrade', { type });
    state = { ...state, ...updated };
    render();
    tg?.HapticFeedback?.notificationOccurred('success');
  } catch (e) {
    tg?.showAlert ? tg.showAlert(e.message) : alert(e.message);
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

  document.getElementById('coinOrb').addEventListener('click', handleTap);
  document.getElementById('upgradeTap').addEventListener('click', () => buyUpgrade('tap'));
  document.getElementById('upgradeMine').addEventListener('click', () => buyUpgrade('mine'));
  setupReferral();
  setupNav();

  // Periodic sync to keep passive mining + energy accurate even without taps
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
