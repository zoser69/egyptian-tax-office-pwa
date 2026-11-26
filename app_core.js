'use strict';

const STORAGE_KEY = 'egyptian_tax_office_companion_v2';
const THEME_KEY = 'egyptian_tax_office_theme_v1';
const AUTH_KEY = 'egyptian_tax_office_auth_v1';
const AUTH_SESSION_KEY = 'egyptian_tax_office_supabase_session_v1';
const UNDO_STORAGE_KEY = 'egyptian_tax_office_undo_v1';
const CHECKPOINTS_STORAGE_KEY = 'egyptian_tax_office_checkpoints_v1';
const DEVICE_ID_KEY = 'egyptian_tax_office_device_id_v1';
const PENDING_SYNC_KEY = 'pendingSync';
const NOTIF_LOG_KEY = 'egyptian_tax_office_notif_log_v1';
const SEED_APPLIED_KEY = 'egyptian_tax_office_seed_v3_applied';
const SEED_EPOCH_ISO = '2026-11-25T00:00:00.000Z';
const DB_NAME = 'EgyptianTaxOfficeDB';
const DB_STORE = 'app_state';
const DB_CHECKPOINTS_STORE = 'checkpoints';
const MAX_UNDO_STEPS = 30;
const MAX_CHECKPOINTS = 50;

// Supabase Cloud Sync Configuration (Offline-First + Realtime + Entity-Level Merge)
const SUPABASE_URL = 'https://ssptmcbkrmgvalffcesp.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNzcHRtY2Jrcm1ndmFsZmZjZXNwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTUyNTQwOTQsImV4cCI6MjExMDgzMDA5NH0.3xAdPzlQtRkSIQJwvtU9LdNS5E7lyJ8LI0FAEkBySY8';

const BASE_CATEGORIES = [
  'فحص ولجان وطعون',
  'عقارات (استثمار/تصرفات/ثروة)',
  'توقف وورثة وأطباء'
];
const BASE_STATUSES = [
  'عاجل / طعن',
  'قيد المتابعة',
  'منتهي'
];
const BASE_TASK_TYPES = [
  'جلسة لجنة داخلية',
  'جلسة لجنة طعن',
  'جلسة محكمة / خبير',
  'لجنة إنهاء منازعات',
  'مناقشة فحص بالمأمورية'
];

let monotonicTimeCursor = 0;
let entitySeqCounter = 0;

function parseIsoMs(isoStr) {
  if (!isoStr || typeof isoStr !== 'string') return 0;
  const ms = Date.parse(isoStr.trim());
  return Number.isFinite(ms) ? ms : 0;
}

function getNextMonotonicIso() {
  const prevSavedMs = (typeof appState !== 'undefined' && appState && appState.lastSaved)
    ? parseIsoMs(appState.lastSaved)
    : 0;
  const baseMs = Math.max(Date.now(), prevSavedMs, monotonicTimeCursor);
  monotonicTimeCursor = baseMs + 1;
  return new Date(monotonicTimeCursor).toISOString();
}

function generateUniqueEntityId(prefix) {
  entitySeqCounter = (entitySeqCounter + 1) % 100000;
  return String(prefix || 'id') + '_' + Date.now() + '_' + entitySeqCounter;
}

let appState = {
  version: 3,
  seedVersion: 3,
  lastSaved: SEED_EPOCH_ISO,
  clients: JSON.parse(JSON.stringify(DEFAULT_CLIENTS)),
  tasks: JSON.parse(JSON.stringify(DEFAULT_SESSIONS || [])),
  deletedIds: {
    clients: {},
    tasks: {}
  },
  taskFilter: 'OPEN',
  customLists: {
    categories: [],
    statuses: [],
    taskTypes: []
  }
};

let undoStack = [];
let redoStack = [];
let checkpointsList = [];
let myDeviceId = getOrCreateDeviceId();
let realtimeSocket = null;
let realtimeHeartbeatTimer = null;
let realtimeReconnectTimer = null;
let isSyncInFlight = false;
let cloudTableMissingWarned = false;

function getOrCreateDeviceId() {
  try {
    let existing = window.localStorage.getItem(DEVICE_ID_KEY);
    if (existing) return existing;
    existing = 'dev_' + Date.now().toString(36).slice(-4) + '_' + Math.random().toString(36).slice(2, 6);
    window.localStorage.setItem(DEVICE_ID_KEY, existing);
    return existing;
  } catch (e) {
    return 'dev_local_session';
  }
}

function isPendingSync() {
  try {
    return window.localStorage.getItem(PENDING_SYNC_KEY) === 'true';
  } catch (e) {
    return false;
  }
}

function setPendingSync(flag) {
  try {
    window.localStorage.setItem(PENDING_SYNC_KEY, flag ? 'true' : 'false');
  } catch (e) {}
}

function updateStorageStatusBadge(stateMode) {
  const badge = document.getElementById('storageStatusBadge');
  if (!badge) return;
  badge.classList.remove('safe', 'brass', 'urgent');
  if (stateMode === 'SYNCED') {
    badge.textContent = 'متزامن سحابياً ومحلياً';
    badge.classList.add('safe');
  } else if (stateMode === 'OFFLINE') {
    badge.textContent = 'محفوظ محلياً (أوفلاين)';
    badge.classList.add('brass');
  } else if (stateMode === 'TABLE_MISSING') {
    badge.textContent = 'محفوظ محلياً (تفعيل جدول السحابة مطلوب)';
    badge.classList.add('brass');
  } else if (stateMode === 'SYNCING') {
    badge.textContent = 'جاري المزامنة...';
    badge.classList.add('brass');
  } else {
    badge.textContent = isPendingSync() ? 'محفوظ محلياً (بانتظار المزامنة)' : 'محفوظ تلقائياً';
    badge.classList.add(isPendingSync() ? 'brass' : 'safe');
  }
}

let authRefreshPromise = null;

function getStoredAuthSession() {
  const parseSession = (raw) => {
    if (!raw) return null;
    try {
      const obj = JSON.parse(raw);
      if (obj && typeof obj.access_token === 'string' && obj.access_token.length > 20 && typeof obj.refresh_token === 'string' && obj.refresh_token.length > 5) {
        return obj;
      }
    } catch (e) {}
    return null;
  };
  try {
    const s1 = parseSession(window.localStorage.getItem(AUTH_SESSION_KEY));
    if (s1) return s1;
  } catch (e) {}
  try {
    const s2 = parseSession(window.sessionStorage.getItem(AUTH_SESSION_KEY));
    if (s2) return s2;
  } catch (e) {}
  return null;
}

function saveAuthSession(sessionObj, rememberDevice) {
  const raw = JSON.stringify(sessionObj);
  try { window.sessionStorage.setItem(AUTH_SESSION_KEY, raw); } catch (e) {}
  try {
    if (rememberDevice) {
      window.localStorage.setItem(AUTH_SESSION_KEY, raw);
    } else {
      window.localStorage.removeItem(AUTH_SESSION_KEY);
    }
  } catch (e) {}
  try { window.localStorage.removeItem(AUTH_KEY); } catch (e) {}
  try { window.sessionStorage.removeItem(AUTH_KEY); } catch (e) {}
}

function clearAuthSession() {
  try { window.localStorage.removeItem(AUTH_SESSION_KEY); } catch (e) {}
  try { window.sessionStorage.removeItem(AUTH_SESSION_KEY); } catch (e) {}
  try { window.localStorage.removeItem(AUTH_KEY); } catch (e) {}
  try { window.sessionStorage.removeItem(AUTH_KEY); } catch (e) {}
}

async function signInWithSupabaseEmail(email, password, rememberDevice) {
  if (typeof window.fetch !== 'function' || navigator.onLine === false) {
    return { ok: false, error: 'تعذر الاتصال بالإنترنت. يرجى الاتصال بالإنترنت لتسجيل الدخول أول مرة على هذا الجهاز.' };
  }
  try {
    const res = await window.fetch(SUPABASE_URL + '/auth/v1/token?grant_type=password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY
      },
      body: JSON.stringify({
        email: String(email || '').trim(),
        password: String(password || '')
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data || !data.access_token || !data.refresh_token) {
      const msg = String(data.error_description || data.msg || data.message || '').toLowerCase();
      if (msg.indexOf('invalid login') !== -1 || res.status === 400 || res.status === 401) {
        return { ok: false, error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة.' };
      }
      if (msg.indexOf('email not confirmed') !== -1) {
        return { ok: false, error: 'الحساب غير مؤكد في لوحة Supabase. فعّل Auto Confirm للحساب أولاً.' };
      }
      return { ok: false, error: 'تعذر تسجيل الدخول حالياً. حاول مرة أخرى.' };
    }
    const expiresInSec = Number(data.expires_in) || 3600;
    const sessionObj = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: Date.now() + (expiresInSec * 1000),
      user_email: (data.user && data.user.email) || String(email || '').trim()
    };
    saveAuthSession(sessionObj, Boolean(rememberDevice));
    return { ok: true, session: sessionObj };
  } catch (err) {
    return { ok: false, error: 'تعذر الوصول إلى خادم المصادقة. تأكد من اتصال الإنترنت.' };
  }
}

async function refreshSupabaseSession() {
  if (authRefreshPromise) return authRefreshPromise;
  authRefreshPromise = (async () => {
    const current = getStoredAuthSession();
    if (!current || !current.refresh_token) return null;
    if (typeof window.fetch !== 'function' || navigator.onLine === false) return null;
    const wasRemembered = (() => {
      try { return Boolean(window.localStorage.getItem(AUTH_SESSION_KEY)); } catch (e) { return false; }
    })();
    try {
      const res = await window.fetch(SUPABASE_URL + '/auth/v1/token?grant_type=refresh_token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY
        },
        body: JSON.stringify({ refresh_token: current.refresh_token })
      });
      if (res.status === 400 || res.status === 401 || res.status === 403) {
        clearAuthSession();
        applyAuthLockState();
        showToast('انتهت صلاحية جلسة الدخول. يرجى تسجيل الدخول مجدداً.');
        return null;
      }
      if (!res.ok) return null;
      const data = await res.json().catch(() => null);
      if (!data || !data.access_token || !data.refresh_token) return null;
      const expiresInSec = Number(data.expires_in) || 3600;
      const updated = {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_at: Date.now() + (expiresInSec * 1000),
        user_email: (data.user && data.user.email) || current.user_email || ''
      };
      saveAuthSession(updated, wasRemembered);
      return updated.access_token;
    } catch (e) {
      return null;
    }
  })().finally(() => {
    authRefreshPromise = null;
  });
  return authRefreshPromise;
}

async function getValidSupabaseAccessToken() {
  const session = getStoredAuthSession();
  if (!session) return null;
  if (session.expires_at && Date.now() < Number(session.expires_at) - 60000) {
    return session.access_token;
  }
  const refreshed = await refreshSupabaseSession();
  return refreshed || null;
}

function isAppUnlocked() {
  return Boolean(getStoredAuthSession());
}

function isAppLocked() {
  return !isAppUnlocked();
}

function applyAuthLockState() {
  const lockScreen = document.getElementById('authLockScreen');
  const appShell = document.querySelector('.app-shell');
  if (!lockScreen) return;
  const unlocked = isAppUnlocked();
  if (unlocked) {
    lockScreen.classList.add('unlocked');
    lockScreen.setAttribute('aria-hidden', 'true');
    if (appShell) {
      appShell.inert = false;
      appShell.removeAttribute('aria-hidden');
    }
  } else {
    lockScreen.classList.remove('unlocked');
    lockScreen.setAttribute('aria-hidden', 'false');
    if (appShell) {
      appShell.inert = true;
      appShell.setAttribute('aria-hidden', 'true');
    }
    ['clientModalBackdrop', 'backupModalBackdrop', 'taskModalBackdrop', 'postponeModalBackdrop'].forEach(id => {
      const m = document.getElementById(id);
      if (m) m.classList.remove('open');
    });
    const emailInput = document.getElementById('authEmailInput');
    const passInput = document.getElementById('authPasswordInput');
    if (passInput) passInput.value = '';
    setTimeout(() => {
      if (emailInput && !emailInput.value.trim()) {
        emailInput.focus();
      } else if (passInput) {
        passInput.focus();
      }
    }, 50);
  }
}

function unlockApp() {
  const errEl = document.getElementById('authErrorMsg');
  if (errEl) {
    errEl.style.display = 'none';
    errEl.textContent = '';
  }
  applyAuthLockState();
  showToast('تم تسجيل الدخول وفتح دفتر المكتب الضريبي');
  pullFromSupabase(false);
  evaluateAndFireScheduledNotifications(false);
  initSupabaseRealtimeSocket();
}

function lockApp() {
  const session = getStoredAuthSession();
  if (session && session.access_token && typeof window.fetch === 'function' && navigator.onLine !== false) {
    window.fetch(SUPABASE_URL + '/auth/v1/logout', {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + session.access_token
      }
    }).catch(() => {});
  }
  clearAuthSession();
  if (realtimeHeartbeatTimer) {
    clearInterval(realtimeHeartbeatTimer);
    realtimeHeartbeatTimer = null;
  }
  if (realtimeReconnectTimer) {
    clearTimeout(realtimeReconnectTimer);
    realtimeReconnectTimer = null;
  }
  if (realtimeSocket) {
    try { realtimeSocket.close(); } catch (e) {}
    realtimeSocket = null;
  }
  const errEl = document.getElementById('authErrorMsg');
  if (errEl) {
    errEl.style.display = 'none';
    errEl.textContent = '';
  }
  applyAuthLockState();
  showToast('تم تسجيل الخروج وقفل التطبيق بنجاح');
}

function applyTheme(themeName) {
  const t = (themeName === 'dark') ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', t);
  const sun = document.getElementById('iconSun');
  const moon = document.getElementById('iconMoon');
  const metaTheme = document.getElementById('metaThemeColor');
  if (sun && moon) {
    sun.style.display = (t === 'dark') ? 'block' : 'none';
    moon.style.display = (t === 'dark') ? 'none' : 'block';
  }
  if (metaTheme) {
    metaTheme.setAttribute('content', t === 'dark' ? '#000000' : '#1E3A5F');
  }
  try { window.localStorage.setItem(THEME_KEY, t); } catch (e) {}
}

function initTheme() {
  let saved = 'light';
  try {
    const s = window.localStorage.getItem(THEME_KEY);
    if (s === 'dark' || s === 'light') saved = s;
  } catch (e) {}
  applyTheme(saved);
}

function ensureDeletedIdsShape(stateObj) {
  const target = stateObj || appState;
  if (!target.deletedIds || typeof target.deletedIds !== 'object') {
    target.deletedIds = { clients: {}, tasks: {} };
  }
  if (!target.deletedIds.clients || typeof target.deletedIds.clients !== 'object') {
    target.deletedIds.clients = {};
  }
  if (!target.deletedIds.tasks || typeof target.deletedIds.tasks !== 'object') {
    target.deletedIds.tasks = {};
  }
}

function ensureCustomListsShape() {
  ensureDeletedIdsShape(appState);
  if (!appState.customLists || typeof appState.customLists !== 'object') {
    appState.customLists = { categories: [], statuses: [], taskTypes: [] };
  }
  if (!Array.isArray(appState.customLists.categories)) appState.customLists.categories = [];
  if (!Array.isArray(appState.customLists.statuses)) appState.customLists.statuses = [];
  if (!Array.isArray(appState.customLists.taskTypes)) appState.customLists.taskTypes = [];
  if (!Array.isArray(appState.clients)) appState.clients = [];
  if (!Array.isArray(appState.tasks)) appState.tasks = [];

  appState.clients.forEach(c => {
    if (c.category && BASE_CATEGORIES.indexOf(c.category) === -1 && appState.customLists.categories.indexOf(c.category) === -1) {
      appState.customLists.categories.push(c.category);
    }
    if (c.status && BASE_STATUSES.indexOf(c.status) === -1 && appState.customLists.statuses.indexOf(c.status) === -1) {
      appState.customLists.statuses.push(c.status);
    }
  });
}

function normalizeTimeHHMM(val) {
  const s = String(val || '').trim();
  if (!s) return '';
  const m = s.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  if (!m) return '';
  return String(m[1]).padStart(2, '0') + ':' + m[2];
}

function formatArabicTime12h(hhmm) {
  const norm = normalizeTimeHHMM(hhmm);
  if (!norm) return '';
  const parts = norm.split(':');
  let h = parseInt(parts[0], 10);
  const m = parts[1];
  const suffix = h >= 12 ? 'م' : 'ص';
  if (h === 0) h = 12;
  else if (h > 12) h -= 12;
  return h + ':' + m + ' ' + suffix;
}

function addLocalDaysToIso(dateStr, days) {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const m = dateStr.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const year = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  const day = parseInt(m[3], 10);
  const baseDt = new Date(year, month - 1, day);
  if (
    isNaN(baseDt.getTime()) ||
    baseDt.getFullYear() !== year ||
    baseDt.getMonth() !== month - 1 ||
    baseDt.getDate() !== day
  ) {
    return null;
  }
  const offset = Number(days || 0);
  if (!Number.isFinite(offset)) return null;
  const dt = new Date(year, month - 1, day + offset);
  if (isNaN(dt.getTime())) return null;
  const y = dt.getFullYear();
  const mo = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return y + '-' + mo + '-' + d;
}

function hasTargetTimeArrived(hhmm) {
  const norm = normalizeTimeHHMM(hhmm);
  if (!norm) return true;
  const parts = norm.split(':');
  const targetMins = parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
  const now = new Date();
  const nowMins = now.getHours() * 60 + now.getMinutes();
  return nowMins >= targetMins;
}

function normalizeClientDates(client) {
  if (!client) return [];
  if (Array.isArray(client.dates) && client.dates.length > 0) {
    client.dates = client.dates
      .filter(d => d && (d.date || d.label))
      .map((d, idx) => ({
        id: d.id || ('d_' + (idx + 1)),
        label: String(d.label || 'تاريخ ملف').trim(),
        date: String(d.date || '').trim(),
        time: normalizeTimeHHMM(d.time || ''),
        hasAppeal30: Boolean(d.hasAppeal30)
      }));
  } else if (client.noticeDate && String(client.noticeDate).trim()) {
    client.dates = [{
      id: 'd_1',
      label: 'استلام نموذج 19/15',
      date: String(client.noticeDate).trim(),
      time: '',
      hasAppeal30: true
    }];
  } else {
    client.dates = [];
  }
  const firstWithDate = client.dates.find(d => d.date);
  client.noticeDate = firstWithDate ? firstWithDate.date : '';
  if (!client.updatedAt) {
    client.updatedAt = SEED_EPOCH_ISO;
  }
  return client.dates;
}

function normalizeSessionItem(session) {
  if (!session || typeof session !== 'object') return null;
  const sDate = String(session.sessionDate || session.due || '').trim();
  const sTime = normalizeTimeHHMM(session.sessionTime || session.time || '');
  const detailsStr = String(session.details || session.title || '').trim();
  const appealNumStr = String(session.appealNum || '').trim();
  const clientNameStr = String(session.clientName || '').trim();
  const clientIdStr = String(session.clientId || '').trim();
  const historyArr = Array.isArray(session.history)
    ? session.history
        .filter(h => h && (h.fromDate || h.toDate))
        .map((h, idx) => ({
          id: h.id || ('h_' + (idx + 1)),
          fromDate: String(h.fromDate || '').trim(),
          toDate: String(h.toDate || '').trim(),
          note: String(h.note || '').trim(),
          changedAt: String(h.changedAt || SEED_EPOCH_ISO).trim()
        }))
    : [];

  // Mutate in-place so existing array references remain valid across normalizeAllClientsDates()
  session.id = String(session.id || generateUniqueEntityId('s'));
  session.clientId = clientIdStr;
  session.clientName = clientNameStr || 'ممول غير محدد';
  session.appealNum = appealNumStr;
  session.sessionDate = sDate;
  session.due = sDate;
  session.sessionTime = sTime;
  session.details = detailsStr;
  session.title = detailsStr || ('جلسة طعن ' + (appealNumStr || clientNameStr));
  session.history = historyArr;
  session.done = Boolean(session.done);
  session.updatedAt = String(session.updatedAt || SEED_EPOCH_ISO);
  return session;
}

function normalizeAllClientsDates() {
  if (!Array.isArray(appState.clients)) appState.clients = [];
  appState.clients.forEach(c => normalizeClientDates(c));
  if (!Array.isArray(appState.tasks)) appState.tasks = [];
  appState.tasks = appState.tasks.map(t => normalizeSessionItem(t)).filter(Boolean);
}

// =========================================================================
// Entity-Level Conflict-Free Merge (Clients & Sessions + Postponement History)
// =========================================================================
function sanitizeLegacySeedState(stateObj) {
  if (!stateObj || typeof stateObj !== 'object') return stateObj;
  if (Number(stateObj.seedVersion || 0) >= 3) return stateObj;
  const approvedMap = new Map(DEFAULT_CLIENTS.map(c => [c.id, c]));
  const oldRemovedClientIds = new Set(['c13', 'c16', 'c19']);
  const oldDummyTaskIds = new Set(['t1','t2','t3','t4','t5','t6','t7','t8','t9','t10','t11','t12']);

  const extraClients = (Array.isArray(stateObj.clients) ? stateObj.clients : [])
    .filter(c => c && c.id && !approvedMap.has(c.id) && !oldRemovedClientIds.has(c.id));
  stateObj.clients = JSON.parse(JSON.stringify(DEFAULT_CLIENTS)).concat(extraClients);
  stateObj.tasks = (Array.isArray(stateObj.tasks) ? stateObj.tasks : [])
    .filter(t => t && t.id && !oldDummyTaskIds.has(t.id));
  stateObj.seedVersion = 3;
  return stateObj;
}

function mergeSessionHistories(histA, histB) {
  const listA = Array.isArray(histA) ? histA : [];
  const listB = Array.isArray(histB) ? histB : [];
  const map = new Map();
  listA.concat(listB).forEach(h => {
    if (!h || (!h.fromDate && !h.toDate)) return;
    const key = (h.fromDate || '') + '->' + (h.toDate || '');
    if (!map.has(key)) {
      map.set(key, JSON.parse(JSON.stringify(h)));
    } else {
      const existing = map.get(key);
      if ((h.note && !existing.note) || (parseIsoMs(h.changedAt) > parseIsoMs(existing.changedAt))) {
        map.set(key, JSON.parse(JSON.stringify(h)));
      }
    }
  });
  return Array.from(map.values()).sort((a, b) => {
    return parseIsoMs(a.changedAt) - parseIsoMs(b.changedAt);
  });
}

function mergeTwoAppStates(localObj, remoteObj) {
  const localBase = (localObj && typeof localObj === 'object') ? JSON.parse(JSON.stringify(localObj)) : {
    version: 3,
    seedVersion: 3,
    lastSaved: SEED_EPOCH_ISO,
    clients: [],
    tasks: [],
    deletedIds: { clients: {}, tasks: {} },
    customLists: { categories: [], statuses: [], taskTypes: [] }
  };
  if (!remoteObj || typeof remoteObj !== 'object') return localBase;
  const remoteBase = JSON.parse(JSON.stringify(remoteObj));

  sanitizeLegacySeedState(localBase);
  sanitizeLegacySeedState(remoteBase);
  ensureDeletedIdsShape(localBase);
  ensureDeletedIdsShape(remoteBase);

  const mergedDeletedClients = Object.assign({}, localBase.deletedIds.clients, remoteBase.deletedIds.clients);
  Object.keys(mergedDeletedClients).forEach(id => {
    const tA = localBase.deletedIds.clients[id] || '';
    const tB = remoteBase.deletedIds.clients[id] || '';
    mergedDeletedClients[id] = parseIsoMs(tA) >= parseIsoMs(tB) ? tA : tB;
  });

  const mergedDeletedTasks = Object.assign({}, localBase.deletedIds.tasks, remoteBase.deletedIds.tasks);
  Object.keys(mergedDeletedTasks).forEach(id => {
    const tA = localBase.deletedIds.tasks[id] || '';
    const tB = remoteBase.deletedIds.tasks[id] || '';
    mergedDeletedTasks[id] = parseIsoMs(tA) >= parseIsoMs(tB) ? tA : tB;
  });

  // 1. Merge Clients by ID (preserve local ordering first, then merge remote updates/additions)
  const clientMap = new Map();
  const localClients = Array.isArray(localBase.clients) ? localBase.clients : [];
  const remoteClients = Array.isArray(remoteBase.clients) ? remoteBase.clients : [];

  localClients.forEach(lc => {
    if (!lc || !lc.id) return;
    const delTime = mergedDeletedClients[lc.id];
    const lcTime = lc.updatedAt || SEED_EPOCH_ISO;
    const delMs = parseIsoMs(delTime);
    const lcMs = parseIsoMs(lcTime);
    if (delTime && delMs >= lcMs) return;
    if (delTime && lcMs > delMs) delete mergedDeletedClients[lc.id];
    const copy = JSON.parse(JSON.stringify(lc));
    normalizeClientDates(copy);
    clientMap.set(copy.id, copy);
  });

  remoteClients.forEach(rc => {
    if (!rc || !rc.id) return;
    const delTime = mergedDeletedClients[rc.id];
    const rcTime = rc.updatedAt || SEED_EPOCH_ISO;
    const delMs = parseIsoMs(delTime);
    const rcMs = parseIsoMs(rcTime);
    if (delTime && delMs >= rcMs) return;
    if (delTime && rcMs > delMs) delete mergedDeletedClients[rc.id];
    const copy = JSON.parse(JSON.stringify(rc));
    normalizeClientDates(copy);
    if (!clientMap.has(copy.id)) {
      clientMap.set(copy.id, copy);
    } else {
      const lc = clientMap.get(copy.id);
      const lcMs = parseIsoMs(lc.updatedAt || SEED_EPOCH_ISO);
      if (rcMs > lcMs) {
        clientMap.set(copy.id, copy);
      }
    }
  });

  // 2. Merge Sessions (tasks) by ID + union of postponement history
  const taskMap = new Map();
  const localTasks = Array.isArray(localBase.tasks) ? localBase.tasks : [];
  const remoteTasks = Array.isArray(remoteBase.tasks) ? remoteBase.tasks : [];

  localTasks.forEach(ltRaw => {
    if (!ltRaw || typeof ltRaw !== 'object') return;
    const lt = normalizeSessionItem(JSON.parse(JSON.stringify(ltRaw)));
    if (!lt || !lt.id) return;
    const delTime = mergedDeletedTasks[lt.id];
    const ltTime = lt.updatedAt || localBase.lastSaved || SEED_EPOCH_ISO;
    const delMs = parseIsoMs(delTime);
    const ltMs = parseIsoMs(ltTime);
    if (delTime && delMs >= ltMs) return;
    if (delTime && ltMs > delMs) delete mergedDeletedTasks[lt.id];
    taskMap.set(lt.id, lt);
  });

  remoteTasks.forEach(rtRaw => {
    if (!rtRaw || typeof rtRaw !== 'object') return;
    const rt = normalizeSessionItem(JSON.parse(JSON.stringify(rtRaw)));
    if (!rt || !rt.id) return;
    const delTime = mergedDeletedTasks[rt.id];
    const rtTime = rt.updatedAt || remoteBase.lastSaved || SEED_EPOCH_ISO;
    const delMs = parseIsoMs(delTime);
    const rtMs = parseIsoMs(rtTime);
    if (delTime && delMs >= rtMs) return;
    if (delTime && rtMs > delMs) delete mergedDeletedTasks[rt.id];
    if (!taskMap.has(rt.id)) {
      taskMap.set(rt.id, rt);
    } else {
      const lt = taskMap.get(rt.id);
      const ltMs = parseIsoMs(lt.updatedAt || localBase.lastSaved || SEED_EPOCH_ISO);
      const winner = (ltMs >= rtMs) ? JSON.parse(JSON.stringify(lt)) : JSON.parse(JSON.stringify(rt));
      winner.history = mergeSessionHistories(lt.history, rt.history);
      if (winner.history.length > 0) {
        const lastHist = winner.history[winner.history.length - 1];
        if (lastHist.toDate && parseIsoMs(lastHist.changedAt) > parseIsoMs(winner.updatedAt)) {
          winner.sessionDate = lastHist.toDate;
          winner.due = lastHist.toDate;
        }
      }
      taskMap.set(rt.id, winner);
    }
  });

  // 3. Merge Custom Lists
  const mergedCustomLists = {
    categories: [],
    statuses: [],
    taskTypes: []
  };
  ['categories', 'statuses', 'taskTypes'].forEach(k => {
    const a = (localBase.customLists && Array.isArray(localBase.customLists[k])) ? localBase.customLists[k] : [];
    const b = (remoteBase.customLists && Array.isArray(remoteBase.customLists[k])) ? remoteBase.customLists[k] : [];
    const set = new Set(a.concat(b).filter(Boolean));
    mergedCustomLists[k] = Array.from(set);
  });

  const latestSaved = (parseIsoMs(remoteBase.lastSaved) > parseIsoMs(localBase.lastSaved))
    ? remoteBase.lastSaved
    : localBase.lastSaved;

  return {
    version: 3,
    seedVersion: 3,
    lastSaved: latestSaved || SEED_EPOCH_ISO,
    clients: Array.from(clientMap.values()),
    tasks: Array.from(taskMap.values()),
    deletedIds: {
      clients: mergedDeletedClients,
      tasks: mergedDeletedTasks
    },
    taskFilter: localBase.taskFilter || 'OPEN',
    customLists: mergedCustomLists
  };
}

// =========================================================================
// IndexedDB Layer
// =========================================================================
function openIdb() {
  return new Promise((resolve) => {
    if (!window.indexedDB) return resolve(null);
    try {
      const req = window.indexedDB.open(DB_NAME, 2);
      req.onupgradeneeded = function(e) {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(DB_STORE)) {
          db.createObjectStore(DB_STORE);
        }
        if (!db.objectStoreNames.contains(DB_CHECKPOINTS_STORE)) {
          db.createObjectStore(DB_CHECKPOINTS_STORE, { keyPath: 'id' });
        }
      };
      req.onsuccess = function(e) {
        const db = e.target.result;
        db.onversionchange = function() {
          try { db.close(); } catch (err) {}
        };
        resolve(db);
      };
      req.onerror = function() {
        resolve(null);
      };
      req.onblocked = function() {
        resolve(null);
      };
    } catch (err) {
      resolve(null);
    }
  });
}

// =========================================================================
// 1. Undo / Redo Engine
// =========================================================================
function getDeepStateSnapshotString(stateTarget) {
  const s = stateTarget || appState;
  return JSON.stringify({
    clients: s.clients,
    tasks: s.tasks,
    deletedIds: s.deletedIds,
    customLists: s.customLists
  });
}

function persistUndoHistory() {
  const payload = JSON.stringify({
    undoStack: undoStack.slice(-MAX_UNDO_STEPS),
    redoStack: redoStack.slice(-MAX_UNDO_STEPS)
  });
  try {
    window.localStorage.setItem(UNDO_STORAGE_KEY, payload);
  } catch (e) {}
  openIdb().then(db => {
    if (!db) return;
    try {
      const tx = db.transaction(DB_STORE, 'readwrite');
      tx.objectStore(DB_STORE).put(payload, 'undo_history');
      const closeDb = () => { try { db.close(); } catch (e) {} };
      tx.oncomplete = closeDb;
      tx.onerror = closeDb;
      tx.onabort = closeDb;
    } catch (e) {
      try { db.close(); } catch (err) {}
    }
  });
}

async function loadUndoHistory() {
  let parsed = null;
  try {
    const raw = window.localStorage.getItem(UNDO_STORAGE_KEY);
    if (raw) parsed = JSON.parse(raw);
  } catch (e) {}
  if (!parsed) {
    try {
      const db = await openIdb();
      if (db) {
        const idbRaw = await new Promise((res) => {
          const tx = db.transaction(DB_STORE, 'readonly');
          const req = tx.objectStore(DB_STORE).get('undo_history');
          req.onsuccess = () => res(req.result);
          req.onerror = () => res(null);
          tx.onerror = () => res(null);
          tx.onabort = () => res(null);
        });
        try { db.close(); } catch (e) {}
        if (idbRaw) parsed = JSON.parse(idbRaw);
      }
    } catch (e) {}
  }
  if (parsed && Array.isArray(parsed.undoStack)) {
    undoStack = parsed.undoStack.slice(-MAX_UNDO_STEPS);
    redoStack = Array.isArray(parsed.redoStack) ? parsed.redoStack.slice(-MAX_UNDO_STEPS) : [];
  } else {
    undoStack = [];
    redoStack = [];
  }
  updateUndoRedoButtons();
}

function updateUndoRedoButtons() {
  const btnUndo = document.getElementById('btnUndoAction');
  const btnRedo = document.getElementById('btnRedoAction');
  if (btnUndo) {
    btnUndo.disabled = undoStack.length === 0;
    if (undoStack.length > 0) {
      const lastLabel = undoStack[undoStack.length - 1].label || 'آخر خطوة';
      btnUndo.setAttribute('title', 'تراجع عن: ' + lastLabel + ' (Ctrl+Z)');
    } else {
      btnUndo.setAttribute('title', 'تراجع عن آخر خطوة (Ctrl+Z)');
    }
  }
  if (btnRedo) {
    btnRedo.disabled = redoStack.length === 0;
    if (redoStack.length > 0) {
      const nextLabel = redoStack[redoStack.length - 1].label || 'الخطوة';
      btnRedo.setAttribute('title', 'إعادة: ' + nextLabel + ' (Ctrl+Y)');
    } else {
      btnRedo.setAttribute('title', 'إعادة الخطوة (Ctrl+Y)');
    }
  }
}

function pushUndoState(actionLabel) {
  ensureCustomListsShape();
  normalizeAllClientsDates();
  const snapshotStr = getDeepStateSnapshotString();
  undoStack.push({
    label: String(actionLabel || 'تعديل بيانات'),
    timestamp: getNextMonotonicIso(),
    snapshotStr: snapshotStr
  });
  if (undoStack.length > MAX_UNDO_STEPS) {
    undoStack.shift();
  }
  redoStack = [];
  persistUndoHistory();
  updateUndoRedoButtons();
}

function sortObjectKeysDeep(val) {
  if (Array.isArray(val)) return val.map(sortObjectKeysDeep);
  if (val && typeof val === 'object') {
    const sorted = {};
    Object.keys(val).sort().forEach(k => {
      sorted[k] = sortObjectKeysDeep(val[k]);
    });
    return sorted;
  }
  return val;
}

function entityContentSignature(obj) {
  if (!obj || typeof obj !== 'object') return '';
  const clone = Object.assign({}, obj);
  delete clone.updatedAt;
  return JSON.stringify(sortObjectKeysDeep(clone));
}

function reviveRestoredEntities(prevClientsMap, prevTasksMap, prevDeletedClients, prevDeletedTasks) {
  ensureDeletedIdsShape(appState);
  const reviveIso = getNextMonotonicIso();
  const currentClientIds = new Set();
  (appState.clients || []).forEach(c => {
    if (!c || !c.id) return;
    currentClientIds.add(c.id);
    const prev = prevClientsMap.get(c.id);
    const wasDeletedOrMissing = !prev || Boolean(prevDeletedClients[c.id]);
    const wasModified = prev && entityContentSignature(c) !== entityContentSignature(prev);
    if (wasDeletedOrMissing || wasModified) {
      c.updatedAt = reviveIso;
      delete appState.deletedIds.clients[c.id];
    }
  });
  prevClientsMap.forEach((_, prevId) => {
    if (!currentClientIds.has(prevId)) {
      appState.deletedIds.clients[prevId] = reviveIso;
    }
  });

  const currentTaskIds = new Set();
  (appState.tasks || []).forEach(t => {
    if (!t || !t.id) return;
    currentTaskIds.add(t.id);
    const prev = prevTasksMap.get(t.id);
    const wasDeletedOrMissing = !prev || Boolean(prevDeletedTasks[t.id]);
    const wasModified = prev && entityContentSignature(t) !== entityContentSignature(prev);
    if (wasDeletedOrMissing || wasModified) {
      t.updatedAt = reviveIso;
      delete appState.deletedIds.tasks[t.id];
    }
  });
  prevTasksMap.forEach((_, prevId) => {
    if (!currentTaskIds.has(prevId)) {
      appState.deletedIds.tasks[prevId] = reviveIso;
    }
  });
}

function applySnapshotStringToAppState(snapshotStr, options) {
  const opts = options || {};
  const prevClientsMap = new Map((appState.clients || []).filter(c => c && c.id).map(c => [c.id, JSON.parse(JSON.stringify(c))]));
  const prevTasksMap = new Map((appState.tasks || []).filter(t => t && t.id).map(t => [t.id, JSON.parse(JSON.stringify(t))]));
  const prevDeletedClients = Object.assign({}, (appState.deletedIds && appState.deletedIds.clients) || {});
  const prevDeletedTasks = Object.assign({}, (appState.deletedIds && appState.deletedIds.tasks) || {});

  const parsed = typeof snapshotStr === 'string' ? JSON.parse(snapshotStr) : snapshotStr;
  if (!parsed) return false;
  if (Array.isArray(parsed.clients)) {
    appState.clients = JSON.parse(JSON.stringify(parsed.clients));
  }
  if (Array.isArray(parsed.tasks)) {
    appState.tasks = JSON.parse(JSON.stringify(parsed.tasks));
  }
  if (parsed.deletedIds && typeof parsed.deletedIds === 'object') {
    appState.deletedIds = JSON.parse(JSON.stringify(parsed.deletedIds));
  }
  if (parsed.customLists && typeof parsed.customLists === 'object') {
    appState.customLists = JSON.parse(JSON.stringify(parsed.customLists));
  }
  ensureCustomListsShape();
  normalizeAllClientsDates();
  if (opts.reviveDeleted) {
    reviveRestoredEntities(prevClientsMap, prevTasksMap, prevDeletedClients, prevDeletedTasks);
  }
  syncCustomDropdowns();
  return true;
}

let isUndoRedoInFlight = false;
async function performUndo() {
  if (isUndoRedoInFlight) return;
  if (undoStack.length === 0) {
    showToast('لا توجد خطوات سابقة للتراجع عنها');
    return;
  }
  isUndoRedoInFlight = true;
  try {
    const entry = undoStack.pop();
    const currentSnapshotStr = getDeepStateSnapshotString();
    const applied = applySnapshotStringToAppState(entry.snapshotStr, { reviveDeleted: true });
    if (!applied) {
      undoStack.push(entry);
      showToast('تعذر استرجاع الخطوة السابقة');
      return;
    }
    redoStack.push({
      label: entry.label,
      timestamp: getNextMonotonicIso(),
      snapshotStr: currentSnapshotStr
    });
    if (redoStack.length > MAX_UNDO_STEPS) {
      redoStack.shift();
    }
    persistUndoHistory();
    updateUndoRedoButtons();
    await saveState(true, 'تراجع عن: ' + entry.label);
    renderClients();
    renderTasks();
    renderCheckpointsTimeline();
    showToast('تم التراجع عن: ' + entry.label, { canUndo: false });
  } finally {
    isUndoRedoInFlight = false;
  }
}

async function performRedo() {
  if (isUndoRedoInFlight) return;
  if (redoStack.length === 0) {
    showToast('لا توجد خطوات لإعادتها');
    return;
  }
  isUndoRedoInFlight = true;
  try {
    const entry = redoStack.pop();
    const currentSnapshotStr = getDeepStateSnapshotString();
    const applied = applySnapshotStringToAppState(entry.snapshotStr, { reviveDeleted: true });
    if (!applied) {
      redoStack.push(entry);
      showToast('تعذر إعادة الخطوة');
      return;
    }
    undoStack.push({
      label: entry.label,
      timestamp: getNextMonotonicIso(),
      snapshotStr: currentSnapshotStr
    });
    if (undoStack.length > MAX_UNDO_STEPS) {
      undoStack.shift();
    }
    persistUndoHistory();
    updateUndoRedoButtons();
    await saveState(true, 'إعادة: ' + entry.label);
    renderClients();
    renderTasks();
    renderCheckpointsTimeline();
    showToast('تمت إعادة: ' + entry.label, { canUndo: true });
  } finally {
    isUndoRedoInFlight = false;
  }
}

// =========================================================================
// 2. Git-like Checkpoints Engine
// =========================================================================
let cpSeqCounter = 0;
function generateShortCheckpointId() {
  cpSeqCounter = (cpSeqCounter + 1) % 1296;
  return 'cp_' + Date.now().toString(36).slice(-3) + cpSeqCounter.toString(36).padStart(2, '0') + Math.random().toString(36).slice(2, 4);
}

function pruneCheckpointsArray(list) {
  while (list.length > MAX_CHECKPOINTS) {
    let oldestAutoIdx = -1;
    for (let i = list.length - 1; i >= 0; i--) {
      if (!list[i].isManual) {
        oldestAutoIdx = i;
        break;
      }
    }
    if (oldestAutoIdx !== -1) {
      list.splice(oldestAutoIdx, 1);
    } else {
      list.pop();
    }
  }
  return list;
}

async function persistCheckpoints() {
  pruneCheckpointsArray(checkpointsList);
  const raw = JSON.stringify(checkpointsList);
  try {
    window.localStorage.setItem(CHECKPOINTS_STORAGE_KEY, raw);
  } catch (e) {}
  try {
    const db = await openIdb();
    if (db) {
      const storeNames = [DB_STORE];
      if (db.objectStoreNames.contains(DB_CHECKPOINTS_STORE)) {
        storeNames.push(DB_CHECKPOINTS_STORE);
      }
      const tx = db.transaction(storeNames, 'readwrite');
      tx.objectStore(DB_STORE).put(raw, 'checkpoints_list');
      if (storeNames.indexOf(DB_CHECKPOINTS_STORE) !== -1) {
        const cpStore = tx.objectStore(DB_CHECKPOINTS_STORE);
        cpStore.clear();
        checkpointsList.forEach((cpItem, idx) => {
          cpStore.put(Object.assign({}, cpItem, { orderIndex: idx }));
        });
      }
      await new Promise((res) => {
        tx.oncomplete = () => res();
        tx.onerror = () => res();
        tx.onabort = () => res();
      });
      try { db.close(); } catch (e) {}
    }
  } catch (e) {}
}

async function loadCheckpoints() {
  let loadedList = null;
  try {
    const db = await openIdb();
    if (db) {
      const idbRaw = await new Promise((res) => {
        const tx = db.transaction(DB_STORE, 'readonly');
        const req = tx.objectStore(DB_STORE).get('checkpoints_list');
        req.onsuccess = () => res(req.result);
        req.onerror = () => res(null);
        tx.onerror = () => res(null);
        tx.onabort = () => res(null);
      });
      if (idbRaw) {
        loadedList = typeof idbRaw === 'string' ? JSON.parse(idbRaw) : idbRaw;
      }
      try { db.close(); } catch (e) {}
    }
  } catch (e) {}
  if (!Array.isArray(loadedList)) {
    try {
      const localRaw = window.localStorage.getItem(CHECKPOINTS_STORAGE_KEY);
      if (localRaw) loadedList = JSON.parse(localRaw);
    } catch (e) {}
  }
  if (Array.isArray(loadedList) && loadedList.length > 0) {
    checkpointsList = pruneCheckpointsArray(loadedList);
  } else {
    checkpointsList = [];
    await createLocalCheckpoint('نقطة الأساس الأولية للدفتر الضريبي (21 ممول)', false);
  }
  renderCheckpointsTimeline();
}

async function createLocalCheckpoint(commitMessage, isManual) {
  ensureCustomListsShape();
  normalizeAllClientsDates();
  const cp = {
    id: generateShortCheckpointId(),
    timestamp: getNextMonotonicIso(),
    message: String(commitMessage || 'تحديث بيانات المكتب').trim(),
    isManual: Boolean(isManual),
    clientsCount: Array.isArray(appState.clients) ? appState.clients.length : 0,
    tasksCount: Array.isArray(appState.tasks) ? appState.tasks.length : 0,
    snapshot: JSON.parse(JSON.stringify({
      clients: appState.clients,
      tasks: appState.tasks,
      deletedIds: appState.deletedIds,
      customLists: appState.customLists
    }))
  };
  checkpointsList.unshift(cp);
  pruneCheckpointsArray(checkpointsList);
  await persistCheckpoints();
  renderCheckpointsTimeline();
  return cp;
}

function renderCheckpointsTimeline() {
  const container = document.getElementById('checkpointsTimelineContainer');
  if (!container) return;
  if (!Array.isArray(checkpointsList) || checkpointsList.length === 0) {
    container.innerHTML = '<div style="padding:14px; text-align:center; color:var(--ink-secondary); font-size:0.85rem;">لا توجد نقاط استرجاع مسجلة بعد.</div>';
    return;
  }
  container.innerHTML = checkpointsList.map((cp, index) => {
    let timeFormatted = '';
    try {
      const dt = new Date(cp.timestamp);
      timeFormatted = dt.toLocaleDateString('ar-EG', { month: 'short', day: 'numeric' }) + ' - ' +
                      dt.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch (e) {
      timeFormatted = cp.timestamp || '';
    }
    const badgeHtml = cp.isManual
      ? '<span class="tag-inline safe">يدوي</span>'
      : (index === 0 ? '<span class="tag-inline brass">الأحدث</span>' : '<span class="tag-inline">تلقائي</span>');
    return '<div class="checkpoint-card" data-checkpoint-row="' + escapeHtml(cp.id) + '">' +
      '<div class="checkpoint-info">' +
        '<div class="checkpoint-top-line">' +
          '<span class="checkpoint-sha">' + escapeHtml(cp.id) + '</span>' +
          badgeHtml +
          '<span class="checkpoint-msg">' + escapeHtml(cp.message) + '</span>' +
        '</div>' +
        '<div class="checkpoint-meta">' +
          '<span>' + escapeHtml(timeFormatted) + '</span>' +
          ' · <span><strong class="num-tabular">' + Number(cp.clientsCount || 0) + '</strong> ممول</span>' +
          ' · <span><strong class="num-tabular">' + Number(cp.tasksCount || 0) + '</strong> جلسة</span>' +
        '</div>' +
      '</div>' +
      '<div class="checkpoint-actions">' +
        '<button type="button" class="btn btn-sm btn-soft" data-action="restore-checkpoint" data-cp-id="' + escapeHtml(cp.id) + '" title="استرجاع الحالة إلى هذه النقطة">استرجاع</button>' +
        '<button type="button" class="btn btn-sm" data-action="download-checkpoint" data-cp-id="' + escapeHtml(cp.id) + '" title="تنزيل هذه النقطة كملف JSON">تحميل ملف</button>' +
      '</div>' +
    '</div>';
  }).join('');
}

async function restoreCheckpointById(cpId) {
  if (isUndoRedoInFlight) return;
  const cp = checkpointsList.find(item => item.id === cpId);
  if (!cp || !cp.snapshot) {
    showToast('لم يتم العثور على نقطة الاسترجاع المطلوبة');
    return;
  }
  isUndoRedoInFlight = true;
  try {
    pushUndoState('استرجاع نقطة حفظ: ' + cp.id);
    const applied = applySnapshotStringToAppState(cp.snapshot, { reviveDeleted: true });
    if (!applied) {
      undoStack.pop();
      persistUndoHistory();
      updateUndoRedoButtons();
      showToast('تعذر استرجاع نقطة الحفظ المطلوبة');
      return;
    }
    await saveState(true, 'استرجاع نقطة حفظ (' + cp.id + '): ' + cp.message);
    renderClients();
    renderTasks();
    renderCheckpointsTimeline();
    showToast('تم استرجاع نقطة الحفظ (' + cp.id + ') بنجاح', { canUndo: true });
  } finally {
    isUndoRedoInFlight = false;
  }
}

function downloadCheckpointById(cpId) {
  const cp = checkpointsList.find(item => item.id === cpId);
  if (!cp || !cp.snapshot) return;
  const payload = {
    version: 3,
    checkpointId: cp.id,
    checkpointMessage: cp.message,
    lastSaved: cp.timestamp,
    clients: cp.snapshot.clients || [],
    tasks: cp.snapshot.tasks || [],
    customLists: cp.snapshot.customLists || { categories: [], statuses: [], taskTypes: [] }
  };
  const dataStr = JSON.stringify(payload, null, 2);
  const blob = new Blob([dataStr], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const datePart = (cp.timestamp || new Date().toISOString()).slice(0, 10);
  a.href = url;
  a.download = 'tax_checkpoint_' + cp.id + '_' + datePart + '.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
  showToast('تم تحميل ملف نقطة الاسترجاع (' + cp.id + ')');
}

// =========================================================================
// 3. Smart Notification & Date-Alert Engine (Mobile & Desktop PWA + Sync)
// =========================================================================
function getNotifSentLog() {
  try {
    const raw = window.localStorage.getItem(NOTIF_LOG_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return parsed;
    }
  } catch (e) {}
  return {};
}

function markNotifKeySent(key) {
  try {
    const log = getNotifSentLog();
    log[key] = getNextMonotonicIso();
    const keys = Object.keys(log);
    if (keys.length > 300) {
      keys.slice(0, 100).forEach(k => delete log[k]);
    }
    window.localStorage.setItem(NOTIF_LOG_KEY, JSON.stringify(log));
  } catch (e) {}
}

function clearNotifKeysForEntity(entityId) {
  if (!entityId) return;
  try {
    const log = getNotifSentLog();
    let changed = false;
    const p1 = 'sess_' + entityId + '_';
    const p2 = 'client30_' + entityId + '_';
    const p3 = 'clientdate_' + entityId + '_';
    Object.keys(log).forEach(k => {
      if (k.indexOf(p1) === 0 || k.indexOf(p2) === 0 || k.indexOf(p3) === 0) {
        delete log[k];
        changed = true;
      }
    });
    if (changed) {
      window.localStorage.setItem(NOTIF_LOG_KEY, JSON.stringify(log));
    }
  } catch (e) {}
}

function updateNotificationUiBar() {
  const statusBadge = document.getElementById('notifPermissionBadge');
  const btnEnable = document.getElementById('btnEnableNotifications');
  const btnTest = document.getElementById('btnSendTestNotification');
  if (!statusBadge) return;

  if (!('Notification' in window)) {
    statusBadge.textContent = 'الإشعارات غير مدعومة في هذا المتصفح';
    statusBadge.className = 'tag-inline urgent';
    if (btnEnable) btnEnable.style.display = 'none';
    if (btnTest) btnTest.style.display = 'inline-flex';
    return;
  }

  const perm = Notification.permission;
  if (perm === 'granted') {
    statusBadge.textContent = 'الإشعارات مفعلة على هذا الجهاز';
    statusBadge.className = 'tag-inline safe';
    if (btnEnable) {
      btnEnable.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="20 6 9 17 4 12"/></svg><span>تمت الموافقة على الإشعارات</span>';
      btnEnable.classList.remove('btn-primary');
      btnEnable.classList.add('btn-soft');
    }
    if (btnTest) btnTest.style.display = 'inline-flex';
  } else if (perm === 'denied') {
    statusBadge.textContent = 'الإشعارات محظورة من إعدادات المتصفح';
    statusBadge.className = 'tag-inline urgent';
    if (btnEnable) {
      btnEnable.innerHTML = '<span>تفعيل الإشعارات (محظورة حالياً)</span>';
    }
    if (btnTest) btnTest.style.display = 'inline-flex';
  } else {
    statusBadge.textContent = 'اضغط للموافقة على استلام إشعارات الجلسات';
    statusBadge.className = 'tag-inline brass';
    if (btnTest) btnTest.style.display = 'inline-flex';
  }
}

async function sendLocalDeviceNotification(title, body, tag, targetUrl) {
  const notifTitle = String(title || 'دفتر المكتب الضريبي');
  const notifBody = String(body || '');
  const notifTag = String(tag || ('tax-notif-' + Date.now()));
  const url = String(targetUrl || './index.html#view-tasks');

  if (!('Notification' in window) || Notification.permission !== 'granted') {
    return false;
  }

  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg && typeof reg.showNotification === 'function') {
        await reg.showNotification(notifTitle, {
          body: notifBody,
          icon: './icon.svg',
          badge: './icon.svg',
          dir: 'rtl',
          lang: 'ar',
          tag: notifTag,
          renotify: true,
          vibrate: [180, 80, 180],
          data: { url: url }
        });
        return true;
      }
      if (navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
          type: 'SHOW_LOCAL_NOTIFICATION',
          title: notifTitle,
          url: url,
          options: {
            body: notifBody,
            tag: notifTag
          }
        });
        return true;
      }
    }
  } catch (e) {}

  try {
    const n = new Notification(notifTitle, {
      body: notifBody,
      icon: './icon.svg',
      dir: 'rtl',
      lang: 'ar',
      tag: notifTag
    });
    n.onclick = function() {
      window.focus();
      n.close();
    };
    return true;
  } catch (e) {
    return false;
  }
}

async function requestNotificationPermissionAndSendWelcome() {
  if (!('Notification' in window)) {
    showToast('هذا المتصفح لا يدعم إشعارات النظام المباشرة');
    return false;
  }
  try {
    const perm = await Notification.requestPermission();
    updateNotificationUiBar();
    if (perm === 'granted') {
      await sendLocalDeviceNotification(
        'تم تفعيل إشعارات دفتر المكتب الضريبي بنجاح',
        'إشعار تجريبي تلقائي: سيصلك تنبيه بمواعيد الجلسات والطعون وأي تأجيل أو تعديل يتم على التواريخ.',
        'tax-welcome-test-' + Date.now(),
        './index.html#view-tasks'
      );
      showToast('تم تفعيل الإشعارات وإرسال الإشعار التجريبي لجهازك بنجاح');
      evaluateAndFireScheduledNotifications(false);
      return true;
    } else if (perm === 'denied') {
      showToast('تم رفض الإشعارات من المتصفح. يمكنك السماح بها من علامة القفل بجوار الرابط بالأعلى.');
      return false;
    } else {
      showToast('لم يتم تأكيد الموافقة على الإشعارات بعد');
      return false;
    }
  } catch (err) {
    showToast('تعذر طلب صلاحية الإشعارات على هذا المتصفح');
    return false;
  }
}

async function triggerManualTestNotification() {
  if (!('Notification' in window)) {
    showToast('إشعار تجريبي داخل التطبيق: المتصفح الحالي لا يدعم إشعارات النظام الخارجية');
    return;
  }
  if (Notification.permission !== 'granted') {
    const granted = await requestNotificationPermissionAndSendWelcome();
    if (!granted) return;
    return;
  }
  const openSessionsCount = Array.isArray(appState.tasks) ? appState.tasks.filter(s => !s.done).length : 0;
  const clientsCount = Array.isArray(appState.clients) ? appState.clients.length : 0;
  const sent = await sendLocalDeviceNotification(
    'إشعار تجريبي - دفتر المكتب الضريبي شغال',
    'الإشعارات تعمل بنجاح على جهازك الآن. لديك (' + clientsCount + ' ممول) و (' + openSessionsCount + ' جلسة نشطة).',
    'tax-manual-test-' + Date.now(),
    './index.html#view-tasks'
  );
  if (sent) {
    showToast('تم إرسال الإشعار التجريبي إلى جهازك بنجاح');
  } else {
    showToast('تم تفعيل التنبيه، تأكد من عدم تفعيل وضع عدم الإزعاج على جهازك');
  }
}

function getLocalTodayIso() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + d;
}

function computeDaysDiffFromToday(targetDateStr) {
  if (!targetDateStr || typeof targetDateStr !== 'string') return null;
  const todayIso = getLocalTodayIso();
  const t0 = new Date(todayIso + 'T00:00:00');
  const t1 = new Date(targetDateStr.trim() + 'T00:00:00');
  if (isNaN(t0.getTime()) || isNaN(t1.getTime())) return null;
  return Math.round((t1.getTime() - t0.getTime()) / (24 * 60 * 60 * 1000));
}

let notifEvalDepth = 0;
async function evaluateAndFireScheduledNotifications(forceNotifyForEntityId) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  if (notifEvalDepth > 0 && !forceNotifyForEntityId) return;
  notifEvalDepth += 1;
  try {
    const todayIso = getLocalTodayIso();
    const sentLog = getNotifSentLog();

    // 1. Check active Sessions (الجلسات)
    const sessions = Array.isArray(appState.tasks) ? appState.tasks : [];
    for (let i = 0; i < sessions.length; i++) {
      const s = sessions[i];
      if (!s || s.done || !s.sessionDate) continue;
      const diff = computeDaysDiffFromToday(s.sessionDate);
      if (diff === null) continue;

      const isForced = Boolean(forceNotifyForEntityId && forceNotifyForEntityId === s.id);
      if (!isForced && diff > 3) continue;
      if (!isForced && diff === 0 && !hasTargetTimeArrived(s.sessionTime)) continue;

      const timeTag = normalizeTimeHHMM(s.sessionTime) || '0000';
      const notifKey = 'sess_' + s.id + '_' + s.sessionDate + '_' + timeTag + '_' + todayIso;
      if (!isForced && sentLog[notifKey]) continue;

      let timingLabel = '';
      if (diff === 0) timingLabel = 'اليوم (' + s.sessionDate + ')';
      else if (diff === 1) timingLabel = 'غداً (' + s.sessionDate + ')';
      else if (diff > 1) timingLabel = 'خلال ' + diff + ' أيام (' + s.sessionDate + ')';
      else timingLabel = 'موعد جلسة مستحق (' + s.sessionDate + ')';

      const timeDisplay = s.sessionTime ? (' الساعة ' + formatArabicTime12h(s.sessionTime)) : '';
      const appealLabel = s.appealNum ? (' - طعن رقم ' + s.appealNum) : '';
      const prevInfo = (Array.isArray(s.history) && s.history.length > 0)
        ? (' (مؤجلة من ' + s.history[s.history.length - 1].fromDate + ')')
        : '';

      const sentSession = await sendLocalDeviceNotification(
        'تنبيه جلسة: ' + s.clientName + appealLabel,
        'موعد الجلسة: ' + timingLabel + timeDisplay + prevInfo + (s.details ? ' - ' + s.details : ''),
        notifKey,
        './index.html#view-tasks'
      );
      if (sentSession) {
        markNotifKeySent(notifKey);
        sentLog[notifKey] = true;
      }
    }

    // 2. Check Client 30-day appeal deadlines & custom dates
    const clients = Array.isArray(appState.clients) ? appState.clients : [];
    for (let i = 0; i < clients.length; i++) {
      const c = clients[i];
      if (!c || c.status === 'منتهي' || !Array.isArray(c.dates)) continue;
      const isClientForced = Boolean(forceNotifyForEntityId && forceNotifyForEntityId === c.id);

      for (let j = 0; j < c.dates.length; j++) {
        const d = c.dates[j];
        if (!d || !d.date) continue;
        const timeTag = normalizeTimeHHMM(d.time) || '0000';
        const timeDisplay = d.time ? (' الساعة ' + formatArabicTime12h(d.time)) : '';

        if (d.hasAppeal30) {
          const deadlineIso = addLocalDaysToIso(d.date, 30);
          if (deadlineIso) {
            const diffDeadline = computeDaysDiffFromToday(deadlineIso);
            if (diffDeadline !== null && diffDeadline >= 0 && (diffDeadline <= 7 || isClientForced)) {
              if (!isClientForced && diffDeadline === 0 && !hasTargetTimeArrived(d.time)) continue;
              const key = 'client30_' + c.id + '_' + d.id + '_' + d.date + '_' + timeTag + '_' + todayIso;
              if (!isClientForced && sentLog[key]) continue;
              const remainingLabel = diffDeadline === 0
                ? ('اليوم آخر ميعاد للطعن (' + deadlineIso + ')' + timeDisplay)
                : ('متبقي ' + diffDeadline + ' يوم (آخر ميعاد ' + deadlineIso + ')' + timeDisplay);
              const sent30 = await sendLocalDeviceNotification(
                'مهلة طعن 30 يوم: ' + c.name,
                (d.label || 'استلام نموذج') + ' بتاريخ ' + d.date + ' - ' + remainingLabel,
                key,
                './index.html#view-clients'
              );
              if (sent30) {
                markNotifKeySent(key);
                sentLog[key] = true;
              }
            }
          }
        } else {
          const diffDate = computeDaysDiffFromToday(d.date);
          if (diffDate !== null && diffDate >= 0 && (diffDate <= 2 || isClientForced)) {
            if (!isClientForced && diffDate === 0 && !hasTargetTimeArrived(d.time)) continue;
            const key = 'clientdate_' + c.id + '_' + d.id + '_' + d.date + '_' + timeTag + '_' + todayIso;
            if (!isClientForced && sentLog[key]) continue;
            const sentDate = await sendLocalDeviceNotification(
              'ميعاد ملف ممول: ' + c.name,
              (d.label || 'ميعاد') + ' بتاريخ ' + d.date + timeDisplay + (diffDate === 0 ? ' (اليوم)' : (' (خلال ' + diffDate + ' يوم)')),
              key,
              './index.html#view-clients'
            );
            if (sentDate) {
              markNotifKeySent(key);
              sentLog[key] = true;
            }
          }
        }
      }
    }
  } finally {
    notifEvalDepth = Math.max(0, notifEvalDepth - 1);
  }
}

// =========================================================================
// 4. Supabase Cloud Sync (Offline-First + Smart Conflict-Free Merge)
// =========================================================================
function setSyncButtonSpinning(spinning) {
  const btn = document.getElementById('btnSyncNow');
  if (!btn) return;
  btn.classList.toggle('sync-spinning', Boolean(spinning));
}

async function persistAppStateLocallyOnly() {
  const raw = JSON.stringify(appState);
  try { window.localStorage.setItem(STORAGE_KEY, raw); } catch (err) {}
  try {
    const db = await openIdb();
    if (db) {
      const tx = db.transaction(DB_STORE, 'readwrite');
      tx.objectStore(DB_STORE).put(raw, 'main');
      const closeDb = () => { try { db.close(); } catch (e) {} };
      tx.oncomplete = closeDb;
      tx.onerror = closeDb;
      tx.onabort = closeDb;
    }
  } catch (err) {}
}

let pendingResyncMessage = null;
let pendingResyncOpts = null;
async function syncToSupabase(commitMsg, syncOpts) {
  const sOpts = syncOpts || {};
  const message = String(commitMsg || 'تحديث تلقائي للدفتر').trim();
  if (typeof window.fetch !== 'function' || navigator.onLine === false) {
    setPendingSync(true);
    updateStorageStatusBadge('OFFLINE');
    return false;
  }
  if (isSyncInFlight) {
    pendingResyncMessage = message;
    pendingResyncOpts = Object.assign({}, pendingResyncOpts || {}, sOpts, {
      forceReplaceCloud: Boolean((pendingResyncOpts && pendingResyncOpts.forceReplaceCloud) || sOpts.forceReplaceCloud)
    });
    setPendingSync(true);
    return false;
  }
  isSyncInFlight = true;
  setSyncButtonSpinning(true);
  try {
    let accessToken = await getValidSupabaseAccessToken();
    if (!accessToken) {
      setPendingSync(true);
      updateStorageStatusBadge('OFFLINE');
      return false;
    }
    // 1. Fetch current remote record first to perform conflict-free entity merge before pushing
    let getRes = await window.fetch(
      SUPABASE_URL + '/rest/v1/tax_office_state?id=eq.main_office&select=id,state_json,updated_at,last_commit_msg,device_id',
      {
        method: 'GET',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': 'Bearer ' + accessToken
        }
      }
    );
    if (getRes.status === 401 || getRes.status === 403) {
      const refreshed = await refreshSupabaseSession();
      if (refreshed) {
        accessToken = refreshed;
        getRes = await window.fetch(
          SUPABASE_URL + '/rest/v1/tax_office_state?id=eq.main_office&select=id,state_json,updated_at,last_commit_msg,device_id',
          {
            method: 'GET',
            headers: {
              'apikey': SUPABASE_ANON_KEY,
              'Authorization': 'Bearer ' + accessToken
            }
          }
        );
      }
    }

    if (!getRes.ok) {
      let errBody = null;
      try { errBody = await getRes.json(); } catch (e) {}
      setPendingSync(true);
      if (errBody && errBody.code === 'PGRST205') {
        updateStorageStatusBadge('TABLE_MISSING');
        const banner = document.getElementById('supabaseSetupAlertBanner');
        if (banner) banner.style.display = 'block';
      } else {
        updateStorageStatusBadge('OFFLINE');
      }
      setSyncButtonSpinning(false);
      return false;
    }

    const banner = document.getElementById('supabaseSetupAlertBanner');
    if (banner) banner.style.display = 'none';

    const existingRows = await getRes.json();
    let mergedFromRemote = false;
    if (!sOpts.forceReplaceCloud && Array.isArray(existingRows) && existingRows.length > 0) {
      const remoteRec = existingRows[0];
      if (remoteRec && remoteRec.state_json) {
        const remoteStateObj = typeof remoteRec.state_json === 'string'
          ? JSON.parse(remoteRec.state_json)
          : remoteRec.state_json;
        const beforeSnap = getDeepStateSnapshotString(appState);
        appState = mergeTwoAppStates(appState, remoteStateObj);
        ensureCustomListsShape();
        normalizeAllClientsDates();
        const afterSnap = getDeepStateSnapshotString(appState);
        if (beforeSnap !== afterSnap) {
          mergedFromRemote = true;
          appState.lastSaved = getNextMonotonicIso();
        }
      }
    }

    if (mergedFromRemote) {
      await persistAppStateLocallyOnly();
      if (typeof syncCustomDropdowns === 'function') syncCustomDropdowns();
      if (typeof renderClients === 'function') renderClients();
      if (typeof renderTasks === 'function') renderTasks();
      if (isAppUnlocked()) {
        evaluateAndFireScheduledNotifications(false);
      }
    }

    const statePayload = {
      id: 'main_office',
      state_json: appState,
      updated_at: appState.lastSaved,
      last_commit_msg: message,
      device_id: myDeviceId
    };

    const res = await window.fetch(SUPABASE_URL + '/rest/v1/tax_office_state?on_conflict=id', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + accessToken,
        'Prefer': 'resolution=merge-duplicates,return=minimal'
      },
      body: JSON.stringify(statePayload)
    });

    if (!res.ok) {
      setPendingSync(true);
      updateStorageStatusBadge('OFFLINE');
      setSyncButtonSpinning(false);
      return false;
    }

    setPendingSync(false);
    updateStorageStatusBadge('SYNCED');

    const latestCpId = (checkpointsList[0] && checkpointsList[0].id) ? checkpointsList[0].id : generateShortCheckpointId();
    window.fetch(SUPABASE_URL + '/rest/v1/tax_sync_commits', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + accessToken,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({
        commit_id: latestCpId,
        message: message,
        device_id: myDeviceId,
        clients_count: Array.isArray(appState.clients) ? appState.clients.length : 0,
        tasks_count: Array.isArray(appState.tasks) ? appState.tasks.length : 0,
        created_at: appState.lastSaved
      })
    }).catch(() => {});

    return true;
  } catch (err) {
    setPendingSync(true);
    updateStorageStatusBadge('OFFLINE');
    return false;
  } finally {
    isSyncInFlight = false;
    setSyncButtonSpinning(false);
    if (pendingResyncMessage !== null) {
      const nextMsg = pendingResyncMessage;
      const nextOpts = pendingResyncOpts;
      pendingResyncMessage = null;
      pendingResyncOpts = null;
      syncToSupabase(nextMsg, nextOpts);
    }
  }
}

async function applyIncomingRemoteState(remoteRecord) {
  if (!remoteRecord || !remoteRecord.state_json) return false;
  const remoteState = typeof remoteRecord.state_json === 'string'
    ? JSON.parse(remoteRecord.state_json)
    : remoteRecord.state_json;
  if (!remoteState || !Array.isArray(remoteState.clients)) {
    return false;
  }
  const remoteTime = remoteRecord.updated_at || remoteState.lastSaved || '';
  const localTime = appState.lastSaved || '';
  const remoteMs = parseIsoMs(remoteTime);
  const localMs = parseIsoMs(localTime);
  if (remoteMs && localMs && remoteMs <= localMs && !isPendingSync()) {
    return false;
  }

  // Record current dates per entity so we can clear notification keys for any entity whose date changed
  const oldSessionDates = new Map((appState.tasks || []).map(s => [s.id, s.sessionDate]));
  const oldClientDates = new Map((appState.clients || []).map(c => [c.id, JSON.stringify(c.dates || [])]));

  // Merge entity-by-entity so no local or remote addition/postponement is ever lost
  const beforeSnap = getDeepStateSnapshotString(appState);
  const mergedState = mergeTwoAppStates(appState, remoteState);
  const afterSnap = getDeepStateSnapshotString(mergedState);
  const remoteNormalized = mergeTwoAppStates(remoteState, remoteState);
  const hasLocalUnpushedDiff = afterSnap !== getDeepStateSnapshotString(remoteNormalized);

  if (beforeSnap === afterSnap && !hasLocalUnpushedDiff) {
    appState.lastSaved = remoteMs > localMs ? remoteTime : appState.lastSaved;
    await persistAppStateLocallyOnly();
    updateHeaderSaveTime();
    updateStorageStatusBadge('SYNCED');
    return false;
  }

  if (beforeSnap !== afterSnap) {
    pushUndoState('مزامنة واردة من جهاز آخر');
    await createLocalCheckpoint('نقطة حفظ تلقائية قبل مزامنة واردة من جهاز آخر', false);
  }

  appState = mergedState;
  appState.lastSaved = remoteMs > localMs ? remoteTime : getNextMonotonicIso();

  ensureCustomListsShape();
  normalizeAllClientsDates();
  syncCustomDropdowns();

  // Clear notification keys for any session or client whose dates changed remotely
  (appState.tasks || []).forEach(s => {
    if (oldSessionDates.get(s.id) !== s.sessionDate) {
      clearNotifKeysForEntity(s.id);
    }
  });
  (appState.clients || []).forEach(c => {
    if (oldClientDates.get(c.id) !== JSON.stringify(c.dates || [])) {
      clearNotifKeysForEntity(c.id);
    }
  });

  await saveState(true, null, { skipRemoteSync: !hasLocalUnpushedDiff, skipCheckpoint: true, keepLastSaved: !hasLocalUnpushedDiff });
  const commitDesc = remoteRecord.last_commit_msg || 'تحديث سحابي';
  await createLocalCheckpoint('تحديث وارد من جهاز آخر: ' + commitDesc, false);

  renderClients();
  renderTasks();
  renderCheckpointsTimeline();
  updateStorageStatusBadge('SYNCED');
  showToast('تمت مزامنة تحديث جديد من جهاز آخر: ' + commitDesc);

  // Fire device notification if remote change involved sessions or dates
  if (remoteRecord.device_id && remoteRecord.device_id !== myDeviceId) {
    await sendLocalDeviceNotification(
      'تحديث متزامن من جهاز آخر',
      commitDesc,
      'remote-sync-' + (remoteTime || Date.now()),
      './index.html#view-tasks'
    );
    evaluateAndFireScheduledNotifications(false);
  }
  return true;
}

async function pullFromSupabase(isManualTrigger) {
  if (isSyncInFlight) return false;
  if (typeof window.fetch !== 'function' || navigator.onLine === false) {
    updateStorageStatusBadge('OFFLINE');
    if (isManualTrigger) {
      showToast('محفوظ محلياً (أوفلاين) - سيتم الرفع تلقائياً فور توفر الإنترنت');
    }
    return false;
  }

  if (isPendingSync()) {
    const pushed = await syncToSupabase('مزامنة أحدث التعديلات المحلية المعلقة');
    if (pushed && isManualTrigger) {
      showToast('تم دمج ورفع أحدث التعديلات المحلية إلى السحابة بنجاح');
    }
    return pushed;
  }

  isSyncInFlight = true;
  setSyncButtonSpinning(true);
  try {
    let accessToken = await getValidSupabaseAccessToken();
    if (!accessToken) {
      updateStorageStatusBadge('OFFLINE');
      return false;
    }
    let res = await window.fetch(
      SUPABASE_URL + '/rest/v1/tax_office_state?id=eq.main_office&select=id,state_json,updated_at,last_commit_msg,device_id',
      {
        method: 'GET',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': 'Bearer ' + accessToken
        }
      }
    );
    if (res.status === 401 || res.status === 403) {
      const refreshed = await refreshSupabaseSession();
      if (refreshed) {
        accessToken = refreshed;
        res = await window.fetch(
          SUPABASE_URL + '/rest/v1/tax_office_state?id=eq.main_office&select=id,state_json,updated_at,last_commit_msg,device_id',
          {
            method: 'GET',
            headers: {
              'apikey': SUPABASE_ANON_KEY,
              'Authorization': 'Bearer ' + accessToken
            }
          }
        );
      }
    }
    if (!res.ok) {
      let errBody = null;
      try { errBody = await res.json(); } catch (e) {}
      if (errBody && errBody.code === 'PGRST205') {
        updateStorageStatusBadge('TABLE_MISSING');
        const banner = document.getElementById('supabaseSetupAlertBanner');
        if (banner) banner.style.display = 'block';
        if (isManualTrigger) {
          showToast('لتفعيل المزامنة السحابية: انسخ أوامر إعداد قاعدة البيانات من نافذة النسخة الاحتياطية ونفذها في لوحة إعداد قاعدة البيانات');
        }
      } else {
        updateStorageStatusBadge('OFFLINE');
        if (isManualTrigger) {
          showToast('محفوظ محلياً - تعذر الاتصال بقاعدة بيانات السحابة حالياً');
        }
      }
      return false;
    }

    const banner = document.getElementById('supabaseSetupAlertBanner');
    if (banner) banner.style.display = 'none';

    const rows = await res.json();
    if (!Array.isArray(rows) || rows.length === 0) {
      isSyncInFlight = false;
      setSyncButtonSpinning(false);
      const pushed = await syncToSupabase('تهيئة أولية لبيانات الـ 21 ممولاً على السحابة');
      if (pushed && isManualTrigger) showToast('تم رفع وتهيئة بيانات الـ 21 ممولاً على السحابة بنجاح');
      return pushed;
    }

    const remote = rows[0];
    const remoteUpdatedAt = remote.updated_at || (remote.state_json && remote.state_json.lastSaved) || '';
    const localUpdatedAt = appState.lastSaved || '';
    const remoteMs = parseIsoMs(remoteUpdatedAt);
    const localMs = parseIsoMs(localUpdatedAt);

    if (remote.device_id !== myDeviceId && remoteMs > localMs) {
      isSyncInFlight = false;
      setSyncButtonSpinning(false);
      await applyIncomingRemoteState(remote);
    } else if (localMs > remoteMs) {
      isSyncInFlight = false;
      setSyncButtonSpinning(false);
      const pushed = await syncToSupabase('مزامنة أحدث التعديلات المحلية');
      if (pushed && isManualTrigger) showToast('تم رفع أحدث التعديلات المحلية إلى السحابة');
      return pushed;
    } else {
      setPendingSync(false);
      updateStorageStatusBadge('SYNCED');
      if (isManualTrigger) showToast('البيانات متطابقة ومتزامنة بين جهازك والسحابة');
    }
    return true;
  } catch (err) {
    updateStorageStatusBadge('OFFLINE');
    if (isManualTrigger) {
      showToast('محفوظ محلياً (أوفلاين) - تعذر الوصول للسحابة حالياً');
    }
    return false;
  } finally {
    isSyncInFlight = false;
    setSyncButtonSpinning(false);
  }
}

async function initSupabaseRealtimeSocket() {
  if (isAppLocked() || typeof window.WebSocket !== 'function' || navigator.onLine === false) return;
  try {
    if (realtimeSocket && (realtimeSocket.readyState === 0 || realtimeSocket.readyState === 1)) {
      return;
    }
    const accessToken = await getValidSupabaseAccessToken();
    if (!accessToken) return;
    const wsUrl = 'wss://ssptmcbkrmgvalffcesp.supabase.co/realtime/v1/websocket?apikey=' +
      encodeURIComponent(SUPABASE_ANON_KEY) + '&vsn=1.0.0';
    realtimeSocket = new window.WebSocket(wsUrl);
    realtimeSocket.onopen = function() {
      try {
        const joinMsg = {
          topic: 'realtime:public:tax_office_state',
          event: 'phx_join',
          payload: {
            access_token: accessToken,
            config: {
              broadcast: { self: false },
              presence: { key: '' },
              postgres_changes: [
                { event: '*', schema: 'public', table: 'tax_office_state' }
              ]
            }
          },
          ref: '1'
        };
        realtimeSocket.send(JSON.stringify(joinMsg));
        if (realtimeHeartbeatTimer) clearInterval(realtimeHeartbeatTimer);
        realtimeHeartbeatTimer = setInterval(() => {
          if (realtimeSocket && realtimeSocket.readyState === 1) {
            realtimeSocket.send(JSON.stringify({
              topic: 'phoenix',
              event: 'heartbeat',
              payload: {},
              ref: String(Date.now())
            }));
          }
        }, 30000);
      } catch (e) {}
    };
    realtimeSocket.onmessage = function(event) {
      try {
        const msg = JSON.parse(event.data);
        if (!msg || msg.topic === 'phoenix' || msg.event === 'heartbeat' || msg.event === 'phx_reply') return;
        if (isPendingSync()) {
          syncToSupabase('مزامنة أحدث التعديلات المحلية المعلقة');
          return;
        }
        if (!msg.payload) return;
        const data = msg.payload.data || msg.payload;
        const record = data.record || data.new;
        if (record && record.id === 'main_office' && record.device_id !== myDeviceId) {
          if (record.updated_at && parseIsoMs(record.updated_at) > parseIsoMs(appState.lastSaved)) {
            applyIncomingRemoteState(record);
          }
        }
      } catch (e) {}
    };
    realtimeSocket.onerror = function() {};
    realtimeSocket.onclose = function() {
      if (realtimeHeartbeatTimer) {
        clearInterval(realtimeHeartbeatTimer);
        realtimeHeartbeatTimer = null;
      }
      if (realtimeReconnectTimer) clearTimeout(realtimeReconnectTimer);
      realtimeReconnectTimer = setTimeout(() => {
        if (navigator.onLine !== false && !isAppLocked()) initSupabaseRealtimeSocket();
      }, 30000);
    };
  } catch (e) {}
}

// =========================================================================
// Core State Persistence
// =========================================================================
async function saveState(silent, commitMessage, options) {
  const opts = options || {};
  ensureCustomListsShape();
  normalizeAllClientsDates();
  syncCustomDropdowns();
  if (!opts.keepLastSaved) {
    appState.lastSaved = getNextMonotonicIso();
  }
  appState.version = 3;
  appState.seedVersion = 3;

  await persistAppStateLocallyOnly();

  updateHeaderSaveTime();
  const effectiveCommitMsg = String(commitMessage || 'تحديث بيانات المكتب').trim();
  if (!opts.skipCheckpoint) {
    await createLocalCheckpoint(effectiveCommitMsg, Boolean(opts.isManualCheckpoint));
  }
  if (!opts.skipRemoteSync) {
    setPendingSync(true);
    await syncToSupabase(effectiveCommitMsg, { forceReplaceCloud: Boolean(opts.forceReplaceCloud) });
  }
  if (opts.notifyEntityId) {
    clearNotifKeysForEntity(opts.notifyEntityId);
    await evaluateAndFireScheduledNotifications(opts.notifyEntityId);
  }
  if (!silent) {
    showToast(
      commitMessage ? ('تم الحفظ: ' + commitMessage) : 'تم حفظ التعديلات تلقائياً على جهازك',
      { canUndo: Boolean(opts.canUndo !== false && undoStack.length > 0) }
    );
  }
}

async function loadState() {
  let loaded = null;
  try {
    const rawLocal = window.localStorage.getItem(STORAGE_KEY);
    if (rawLocal) loaded = JSON.parse(rawLocal);
  } catch (err) {}
  try {
    const db = await openIdb();
    if (db) {
      const idbRaw = await new Promise((res) => {
        const tx = db.transaction(DB_STORE, 'readonly');
        const req = tx.objectStore(DB_STORE).get('main');
        req.onsuccess = () => res(req.result);
        req.onerror = () => res(null);
        tx.onerror = () => res(null);
        tx.onabort = () => res(null);
      });
      try { db.close(); } catch (e) {}
      if (idbRaw) {
        const idbParsed = JSON.parse(idbRaw);
        if (!loaded || parseIsoMs(idbParsed.lastSaved) > parseIsoMs(loaded.lastSaved)) {
          loaded = idbParsed;
        }
      }
    }
  } catch (err) {}

  let seedAlreadyApplied = false;
  try {
    seedAlreadyApplied = window.localStorage.getItem(SEED_APPLIED_KEY) === 'true';
  } catch (e) {}

  if (loaded && Array.isArray(loaded.clients)) {
    appState = loaded;
    ensureDeletedIdsShape(appState);

    // One-time automatic migration to user's approved 21-client backup (SEED_CLIENTS_VERSION = 3)
    if (!seedAlreadyApplied || Number(appState.seedVersion || 0) < 3) {
      sanitizeLegacySeedState(appState);
      appState.version = 3;
      if (!appState.lastSaved) appState.lastSaved = SEED_EPOCH_ISO;
      try { window.localStorage.setItem(SEED_APPLIED_KEY, 'true'); } catch (e) {}
      ensureCustomListsShape();
      normalizeAllClientsDates();
      await saveState(true, 'تثبيت بيانات الـ 21 ممولاً المعتمدة من ملف النسخة الاحتياطية', { skipRemoteSync: true, keepLastSaved: true });
    } else {
      ensureCustomListsShape();
      normalizeAllClientsDates();
    }
  } else {
    appState.clients = JSON.parse(JSON.stringify(DEFAULT_CLIENTS));
    appState.tasks = [];
    appState.seedVersion = 3;
    appState.version = 3;
    appState.lastSaved = SEED_EPOCH_ISO;
    try { window.localStorage.setItem(SEED_APPLIED_KEY, 'true'); } catch (e) {}
    ensureCustomListsShape();
    normalizeAllClientsDates();
    await saveState(true, 'تثبيت بيانات الـ 21 ممولاً المعتمدة', { skipRemoteSync: true, skipCheckpoint: true, keepLastSaved: true });
  }

  if (navigator.storage && navigator.storage.persist) {
    try { navigator.storage.persist(); } catch (e) {}
  }
}

function updateHeaderSaveTime() {
  const el = document.getElementById('lastSavedText');
  if (!el) return;
  try {
    const ms = parseIsoMs(appState.lastSaved);
    if (!ms) {
      el.textContent = 'محفوظ تلقائياً';
      return;
    }
    const dt = new Date(ms);
    el.textContent = 'آخر حفظ: ' + dt.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
  } catch (e) {
    el.textContent = 'محفوظ تلقائياً';
  }
}

let toastTimer = null;
function showToast(msg, options) {
  const opts = options || {};
  const box = document.getElementById('toastBox');
  const txt = document.getElementById('toastMessage');
  const undoBtn = document.getElementById('btnToastUndo');
  if (!box || !txt) return;
  txt.textContent = msg;
  const showUndo = Boolean(opts.canUndo && undoStack.length > 0);
  if (undoBtn) {
    undoBtn.style.display = showUndo ? 'inline-flex' : 'none';
  }
  box.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  const duration = showUndo ? 5000 : 3400;
  toastTimer = setTimeout(() => {
    box.classList.remove('show');
    if (undoBtn) undoBtn.style.display = 'none';
  }, duration);
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatMoney(num) {
  const n = Number(num) || 0;
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
}
