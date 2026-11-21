'use strict';

const STORAGE_KEY = 'egyptian_tax_office_companion_v2';
const THEME_KEY = 'egyptian_tax_office_theme_v1';
const AUTH_KEY = 'egyptian_tax_office_auth_v1';
const UNDO_STORAGE_KEY = 'egyptian_tax_office_undo_v1';
const CHECKPOINTS_STORAGE_KEY = 'egyptian_tax_office_checkpoints_v1';
const DEVICE_ID_KEY = 'egyptian_tax_office_device_id_v1';
const PENDING_SYNC_KEY = 'pendingSync';
const OFFICE_PIN = 'Aa12345@';
const DB_NAME = 'EgyptianTaxOfficeDB';
const DB_STORE = 'app_state';
const DB_CHECKPOINTS_STORE = 'checkpoints';
const MAX_UNDO_STEPS = 30;
const MAX_CHECKPOINTS = 50;
// Supabase Cloud Sync Configuration (Offline-First + Realtime + Polling Fallback)
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
  'طعن 30 يوم / نموذج 19 و15',
  'لجنة داخلية / مختصة / فض منازعات',
  'محضر حجز إداري وفتح باب الطعن',
  'شهادة موقف ضريبي / تسوية / حفظ',
  'إقرار ضريبي / اعتماد محاسب'
];
let appState = {
  version: 2,
  lastSaved: new Date().toISOString(),
  clients: JSON.parse(JSON.stringify(DEFAULT_CLIENTS)),
  tasks: JSON.parse(JSON.stringify(DEFAULT_TASKS)),
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
  } else if (stateMode === 'SYNCING') {
    badge.textContent = 'جاري المزامنة...';
    badge.classList.add('brass');
  } else {
    badge.textContent = isPendingSync() ? 'محفوظ محلياً (أوفلاين)' : 'محفوظ تلقائياً';
    badge.classList.add(isPendingSync() ? 'brass' : 'safe');
  }
}
function isAppUnlocked() {
  try {
    if (window.localStorage.getItem(AUTH_KEY) === 'UNLOCKED') return true;
  } catch (e) {}
  try {
    if (window.sessionStorage.getItem(AUTH_KEY) === 'UNLOCKED') return true;
  } catch (e) {}
  return false;
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
    ['clientModalBackdrop', 'backupModalBackdrop', 'taskModalBackdrop'].forEach(id => {
      const m = document.getElementById(id);
      if (m) m.classList.remove('open');
    });
    const passInput = document.getElementById('authPasswordInput');
    if (passInput) {
      passInput.value = '';
      setTimeout(() => passInput.focus(), 50);
    }
  }
}
function unlockApp(rememberDevice) {
  try {
    window.sessionStorage.setItem(AUTH_KEY, 'UNLOCKED');
  } catch (e) {}
  try {
    if (rememberDevice) {
      window.localStorage.setItem(AUTH_KEY, 'UNLOCKED');
    } else {
      window.localStorage.removeItem(AUTH_KEY);
    }
  } catch (e) {}
  const errEl = document.getElementById('authErrorMsg');
  if (errEl) {
    errEl.style.display = 'none';
    errEl.textContent = '';
  }
  applyAuthLockState();
  showToast('تم فتح دفتر المكتب الضريبي');
  pullFromSupabase(false);
}
function lockApp() {
  try { window.localStorage.removeItem(AUTH_KEY); } catch (e) {}
  try { window.sessionStorage.removeItem(AUTH_KEY); } catch (e) {}
  const errEl = document.getElementById('authErrorMsg');
  if (errEl) {
    errEl.style.display = 'none';
    errEl.textContent = '';
  }
  applyAuthLockState();
  showToast('تم قفل التطبيق بنجاح');
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
function ensureCustomListsShape() {
  if (!appState.customLists || typeof appState.customLists !== 'object') {
    appState.customLists = { categories: [], statuses: [], taskTypes: [] };
  }
  if (!Array.isArray(appState.customLists.categories)) appState.customLists.categories = [];
  if (!Array.isArray(appState.customLists.statuses)) appState.customLists.statuses = [];
  if (!Array.isArray(appState.customLists.taskTypes)) appState.customLists.taskTypes = [];
  appState.clients.forEach(c => {
    if (c.category && BASE_CATEGORIES.indexOf(c.category) === -1 && appState.customLists.categories.indexOf(c.category) === -1) {
      appState.customLists.categories.push(c.category);
    }
    if (c.status && BASE_STATUSES.indexOf(c.status) === -1 && appState.customLists.statuses.indexOf(c.status) === -1) {
      appState.customLists.statuses.push(c.status);
    }
  });
  appState.tasks.forEach(t => {
    if (t.type && BASE_TASK_TYPES.indexOf(t.type) === -1 && appState.customLists.taskTypes.indexOf(t.type) === -1) {
      appState.customLists.taskTypes.push(t.type);
    }
  });
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
        hasAppeal30: Boolean(d.hasAppeal30)
      }));
  } else if (client.noticeDate && String(client.noticeDate).trim()) {
    client.dates = [{
      id: 'd_1',
      label: 'استلام نموذج 19/15',
      date: String(client.noticeDate).trim(),
      hasAppeal30: true
    }];
  } else {
    client.dates = [];
  }
  const firstWithDate = client.dates.find(d => d.date);
  client.noticeDate = firstWithDate ? firstWithDate.date : '';
  return client.dates;
}
function normalizeAllClientsDates() {
  if (!Array.isArray(appState.clients)) return;
  appState.clients.forEach(c => normalizeClientDates(c));
}
// =========================================================================
// IndexedDB Layer (Supports v2 + 'checkpoints_list' inside 'app_state')
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
        try {
          const fallbackReq = window.indexedDB.open(DB_NAME);
          fallbackReq.onsuccess = function(ev) {
            const db = ev.target.result;
            db.onversionchange = function() {
              try { db.close(); } catch (err) {}
            };
            resolve(db);
          };
          fallbackReq.onerror = function() { resolve(null); };
        } catch (err) {
          resolve(null);
        }
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
// 1. Undo / Redo Engine (Max 30 steps, persisted in localStorage + IDB)
// =========================================================================
function getDeepStateSnapshotString() {
  return JSON.stringify({
    clients: appState.clients,
    tasks: appState.tasks,
    customLists: appState.customLists
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
      tx.oncomplete = () => { try { db.close(); } catch (e) {} };
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
    timestamp: new Date().toISOString(),
    snapshotStr: snapshotStr
  });
  if (undoStack.length > MAX_UNDO_STEPS) {
    undoStack.shift();
  }
  redoStack = [];
  persistUndoHistory();
  updateUndoRedoButtons();
}
function applySnapshotStringToAppState(snapshotStr) {
  const parsed = typeof snapshotStr === 'string' ? JSON.parse(snapshotStr) : snapshotStr;
  if (!parsed) return false;
  if (Array.isArray(parsed.clients)) {
    appState.clients = JSON.parse(JSON.stringify(parsed.clients));
  }
  if (Array.isArray(parsed.tasks)) {
    appState.tasks = JSON.parse(JSON.stringify(parsed.tasks));
  }
  if (parsed.customLists && typeof parsed.customLists === 'object') {
    appState.customLists = JSON.parse(JSON.stringify(parsed.customLists));
  }
  ensureCustomListsShape();
  normalizeAllClientsDates();
  syncCustomDropdowns();
  return true;
}
async function performUndo() {
  if (undoStack.length === 0) {
    showToast('لا توجد خطوات سابقة للتراجع عنها');
    return;
  }
  const entry = undoStack.pop();
  const currentSnapshotStr = getDeepStateSnapshotString();
  redoStack.push({
    label: entry.label,
    timestamp: new Date().toISOString(),
    snapshotStr: currentSnapshotStr
  });
  if (redoStack.length > MAX_UNDO_STEPS) {
    redoStack.shift();
  }
  applySnapshotStringToAppState(entry.snapshotStr);
  persistUndoHistory();
  updateUndoRedoButtons();
  await saveState(true, 'تراجع عن: ' + entry.label);
  renderClients();
  renderTasks();
  renderCheckpointsTimeline();
  showToast('تم التراجع عن: ' + entry.label, { canUndo: false });
}
async function performRedo() {
  if (redoStack.length === 0) {
    showToast('لا توجد خطوات لإعادتها');
    return;
  }
  const entry = redoStack.pop();
  const currentSnapshotStr = getDeepStateSnapshotString();
  undoStack.push({
    label: entry.label,
    timestamp: new Date().toISOString(),
    snapshotStr: currentSnapshotStr
  });
  if (undoStack.length > MAX_UNDO_STEPS) {
    undoStack.shift();
  }
  applySnapshotStringToAppState(entry.snapshotStr);
  persistUndoHistory();
  updateUndoRedoButtons();
  await saveState(true, 'إعادة: ' + entry.label);
  renderClients();
  renderTasks();
  renderCheckpointsTimeline();
  showToast('تمت إعادة: ' + entry.label, { canUndo: true });
}
// =========================================================================
// 2. Git-like Checkpoints Engine (Max 50 in IndexedDB 'checkpoints_list')
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
      });
      if (idbRaw) {
        loadedList = typeof idbRaw === 'string' ? JSON.parse(idbRaw) : idbRaw;
      } else if (db.objectStoreNames.contains(DB_CHECKPOINTS_STORE)) {
        const allItems = await new Promise((res) => {
          const tx = db.transaction(DB_CHECKPOINTS_STORE, 'readonly');
          const req = tx.objectStore(DB_CHECKPOINTS_STORE).getAll();
          req.onsuccess = () => res(req.result || []);
          req.onerror = () => res([]);
        });
        if (Array.isArray(allItems) && allItems.length > 0) {
          allItems.sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
          loadedList = allItems;
        }
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
    await createLocalCheckpoint('نقطة الأساس الأولية للدفتر الضريبي', false);
  }
  renderCheckpointsTimeline();
}
async function createLocalCheckpoint(commitMessage, isManual) {
  ensureCustomListsShape();
  normalizeAllClientsDates();
  const cp = {
    id: generateShortCheckpointId(),
    timestamp: new Date().toISOString(),
    message: String(commitMessage || 'تحديث بيانات المكتب').trim(),
    isManual: Boolean(isManual),
    clientsCount: Array.isArray(appState.clients) ? appState.clients.length : 0,
    tasksCount: Array.isArray(appState.tasks) ? appState.tasks.length : 0,
    snapshot: JSON.parse(JSON.stringify({
      clients: appState.clients,
      tasks: appState.tasks,
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
      : (index === 0 ? '<span class="tag-inline brass">الأحدث (HEAD)</span>' : '<span class="tag-inline">تلقائي</span>');
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
          ' · <span><strong class="num-tabular">' + Number(cp.tasksCount || 0) + '</strong> مهمة</span>' +
        '</div>' +
      '</div>' +
      '<div class="checkpoint-actions">' +
        '<button type="button" class="btn btn-sm btn-soft" data-action="restore-checkpoint" data-cp-id="' + escapeHtml(cp.id) + '" title="استرجاع الحالة إلى هذه النقطة">استرجاع (Checkout)</button>' +
        '<button type="button" class="btn btn-sm" data-action="download-checkpoint" data-cp-id="' + escapeHtml(cp.id) + '" title="تنزيل هذه النقطة كملف JSON">تحميل ملف</button>' +
      '</div>' +
    '</div>';
  }).join('');
}
async function restoreCheckpointById(cpId) {
  const cp = checkpointsList.find(item => item.id === cpId);
  if (!cp || !cp.snapshot) {
    showToast('لم يتم العثور على نقطة الاسترجاع المطلوبة');
    return;
  }
  // 1. Push current state to undoStack so Checkout itself can be undone!
  pushUndoState('استرجاع نقطة حفظ: ' + cp.id);
  // 2. Restore snapshot
  applySnapshotStringToAppState(cp.snapshot);
  // 3. Save state, create checkpoint, and sync
  await saveState(true, 'استرجاع نقطة حفظ (' + cp.id + '): ' + cp.message);
  renderClients();
  renderTasks();
  renderCheckpointsTimeline();
  showToast('تم استرجاع نقطة الحفظ (' + cp.id + ') بنجاح', { canUndo: true });
}
function downloadCheckpointById(cpId) {
  const cp = checkpointsList.find(item => item.id === cpId);
  if (!cp || !cp.snapshot) return;
  const payload = {
    version: 2,
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
// 3. Supabase Cloud Sync (Offline-First + Realtime WebSocket + Polling)
// =========================================================================
function setSyncButtonSpinning(spinning) {
  const btn = document.getElementById('btnSyncNow');
  if (!btn) return;
  btn.classList.toggle('sync-spinning', Boolean(spinning));
}
async function syncToSupabase(commitMsg) {
  const message = String(commitMsg || 'تحديث تلقائي للدفتر').trim();
  if (typeof window.fetch !== 'function' || navigator.onLine === false) {
    setPendingSync(true);
    updateStorageStatusBadge('OFFLINE');
    return false;
  }
  setSyncButtonSpinning(true);
  try {
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
        'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
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
    // Record lightweight commit log in tax_sync_commits (non-blocking)
    const latestCpId = (checkpointsList[0] && checkpointsList[0].id) ? checkpointsList[0].id : generateShortCheckpointId();
    window.fetch(SUPABASE_URL + '/rest/v1/tax_sync_commits', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
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
    setSyncButtonSpinning(false);
    return true;
  } catch (err) {
    setPendingSync(true);
    updateStorageStatusBadge('OFFLINE');
    setSyncButtonSpinning(false);
    return false;
  }
}
async function applyIncomingRemoteState(remoteRecord) {
  if (isPendingSync()) {
    await syncToSupabase('مزامنة أحدث التعديلات المحلية المعلقة');
    return false;
  }
  if (!remoteRecord || !remoteRecord.state_json) return false;
  const remoteState = typeof remoteRecord.state_json === 'string'
    ? JSON.parse(remoteRecord.state_json)
    : remoteRecord.state_json;
  if (!remoteState || !Array.isArray(remoteState.clients) || !Array.isArray(remoteState.tasks)) {
    return false;
  }
  const remoteTime = remoteRecord.updated_at || remoteState.lastSaved || '';
  const localTime = appState.lastSaved || '';
  if (remoteTime && localTime && remoteTime <= localTime) {
    return false;
  }
  // Push current state to undoStack and create local checkpoint before applying incoming remote state
  pushUndoState('مزامنة واردة من جهاز آخر');
  await createLocalCheckpoint('نقطة حفظ تلقائية قبل مزامنة واردة من جهاز آخر', false);
  appState = {
    version: 2,
    lastSaved: remoteTime || new Date().toISOString(),
    clients: remoteState.clients,
    tasks: remoteState.tasks,
    taskFilter: appState.taskFilter || 'OPEN',
    customLists: remoteState.customLists || appState.customLists
  };
  ensureCustomListsShape();
  normalizeAllClientsDates();
  syncCustomDropdowns();
  // Save locally without echoing back to Supabase
  await saveState(true, null, { skipRemoteSync: true, skipCheckpoint: true });
  await createLocalCheckpoint('تحديث وارد من جهاز آخر: ' + (remoteRecord.last_commit_msg || 'مزامنة سحابية'), false);
  renderClients();
  renderTasks();
  renderCheckpointsTimeline();
  updateStorageStatusBadge('SYNCED');
  showToast('تم تحديث البيانات تلقائياً من جهاز آخر');
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
  // Critical Offline-First Guard: Never pull stale remote state over unsynced local changes
  if (isPendingSync()) {
    isSyncInFlight = true;
    const pushed = await syncToSupabase('مزامنة أحدث التعديلات المحلية المعلقة');
    isSyncInFlight = false;
    if (pushed && isManualTrigger) {
      showToast('تم رفع أحدث التعديلات المحلية إلى السحابة');
    }
    return pushed;
  }
  isSyncInFlight = true;
  setSyncButtonSpinning(true);
  try {
    // If we have pending local changes and user clicked manual sync, push first if local is newer
    const res = await window.fetch(
      SUPABASE_URL + '/rest/v1/tax_office_state?id=eq.main_office&select=id,state_json,updated_at,last_commit_msg,device_id',
      {
        method: 'GET',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': 'Bearer ' + SUPABASE_ANON_KEY
        }
      }
    );
    if (!res.ok) {
      updateStorageStatusBadge('OFFLINE');
      isSyncInFlight = false;
      setSyncButtonSpinning(false);
      if (isManualTrigger) {
        showToast('محفوظ محلياً (جدول السحابة غير مفعل بعد أو الاتصال غير متاح)');
      }
      return false;
    }
    const rows = await res.json();
    if (!Array.isArray(rows) || rows.length === 0) {
      // Initialize remote row with our local state
      await syncToSupabase('تهيئة أولية لبيانات المكتب على السحابة');
      isSyncInFlight = false;
      setSyncButtonSpinning(false);
      if (isManualTrigger) showToast('تم رفع ومزامنة بيانات المكتب سحابياً بنجاح');
      return true;
    }
    const remote = rows[0];
    const remoteUpdatedAt = remote.updated_at || (remote.state_json && remote.state_json.lastSaved) || '';
    const localUpdatedAt = appState.lastSaved || '';
    if (remote.device_id !== myDeviceId && remoteUpdatedAt > localUpdatedAt && !isPendingSync()) {
      await applyIncomingRemoteState(remote);
    } else if (isPendingSync() || localUpdatedAt > remoteUpdatedAt) {
      await syncToSupabase('مزامنة أحدث التعديلات المحلية');
      if (isManualTrigger) showToast('تم رفع أحدث التعديلات المحلية إلى السحابة');
    } else {
      setPendingSync(false);
      updateStorageStatusBadge('SYNCED');
      if (isManualTrigger) showToast('البيانات متطابقة ومتزامنة سحابياً ومحلياً');
    }
    isSyncInFlight = false;
    setSyncButtonSpinning(false);
    return true;
  } catch (err) {
    updateStorageStatusBadge('OFFLINE');
    isSyncInFlight = false;
    setSyncButtonSpinning(false);
    if (isManualTrigger) {
      showToast('محفوظ محلياً (أوفلاين) - تعذر الوصول للسحابة حالياً');
    }
    return false;
  }
}
function initSupabaseRealtimeSocket() {
  if (typeof window.WebSocket !== 'function' || navigator.onLine === false) return;
  try {
    if (realtimeSocket && (realtimeSocket.readyState === 0 || realtimeSocket.readyState === 1)) {
      return;
    }
    const wsUrl = 'wss://ssptmcbkrmgvalffcesp.supabase.co/realtime/v1/websocket?apikey=' +
      encodeURIComponent(SUPABASE_ANON_KEY) + '&vsn=1.0.0';
    realtimeSocket = new window.WebSocket(wsUrl);
    realtimeSocket.onopen = function() {
      try {
        const joinMsg = {
          topic: 'realtime:public:tax_office_state',
          event: 'phx_join',
          payload: {
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
        if (isPendingSync()) {
          syncToSupabase('مزامنة أحدث التعديلات المحلية المعلقة');
          return;
        }
        const msg = JSON.parse(event.data);
        if (!msg || !msg.payload) return;
        const data = msg.payload.data || msg.payload;
        const record = data.record || data.new;
        if (record && record.id === 'main_office' && record.device_id !== myDeviceId) {
          if (record.updated_at && record.updated_at > appState.lastSaved) {
            applyIncomingRemoteState(record);
          }
        }
      } catch (e) {}
    };
    realtimeSocket.onerror = function() {
      // Silent in offline/sandbox mode
    };
    realtimeSocket.onclose = function() {
      if (realtimeHeartbeatTimer) {
        clearInterval(realtimeHeartbeatTimer);
        realtimeHeartbeatTimer = null;
      }
      if (realtimeReconnectTimer) clearTimeout(realtimeReconnectTimer);
      realtimeReconnectTimer = setTimeout(() => {
        if (navigator.onLine !== false) initSupabaseRealtimeSocket();
      }, 30000);
    };
  } catch (e) {}
}
// =========================================================================
// Core State Persistence (Local-First + Checkpoints + Background Cloud Sync)
// =========================================================================
async function saveState(silent, commitMessage, options) {
  const opts = options || {};
  ensureCustomListsShape();
  normalizeAllClientsDates();
  syncCustomDropdowns();
  const prevMs = appState.lastSaved ? Date.parse(appState.lastSaved) : 0;
  const nowMs = Math.max(Date.now(), (isNaN(prevMs) ? 0 : prevMs) + 1);
  appState.lastSaved = new Date(nowMs).toISOString();
  const raw = JSON.stringify(appState);
  try { window.localStorage.setItem(STORAGE_KEY, raw); } catch (err) {}
  try {
    const db = await openIdb();
    if (db) {
      const tx = db.transaction(DB_STORE, 'readwrite');
      tx.objectStore(DB_STORE).put(raw, 'main');
      tx.oncomplete = () => { try { db.close(); } catch (e) {} };
    }
  } catch (err) {}
  updateHeaderSaveTime();
  const effectiveCommitMsg = String(commitMessage || 'تحديث بيانات المكتب').trim();
  if (!opts.skipCheckpoint) {
    await createLocalCheckpoint(effectiveCommitMsg, Boolean(opts.isManualCheckpoint));
  }
  if (!opts.skipRemoteSync) {
    setPendingSync(true);
    await syncToSupabase(effectiveCommitMsg);
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
      });
      try { db.close(); } catch (e) {}
      if (idbRaw) {
        const idbParsed = JSON.parse(idbRaw);
        if (!loaded || (idbParsed.lastSaved > loaded.lastSaved)) {
          loaded = idbParsed;
        }
      }
    }
  } catch (err) {}
  if (loaded && Array.isArray(loaded.clients) && Array.isArray(loaded.tasks)) {
    appState = loaded;
    ensureCustomListsShape();
    normalizeAllClientsDates();
  } else {
    ensureCustomListsShape();
    normalizeAllClientsDates();
    await saveState(true, null, { skipRemoteSync: true, skipCheckpoint: true });
  }
  if (navigator.storage && navigator.storage.persist) {
    try { navigator.storage.persist(); } catch (e) {}
  }
}
function updateHeaderSaveTime() {
  const el = document.getElementById('lastSavedText');
  if (!el) return;
  try {
    const dt = new Date(appState.lastSaved);
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
  const duration = showUndo ? 5000 : 3200;
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
    .replace(/"/g, '&quot;');
}
function formatMoney(num) {
  const n = Number(num) || 0;
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
}
