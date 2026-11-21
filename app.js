'use strict';

function getBackupPayloadString() {
  return JSON.stringify(appState, null, 2);
}
function downloadBackupFile() {
  const dataStr = getBackupPayloadString();
  const blob = new Blob([dataStr], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const datePart = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = 'tax_office_backup_' + datePart + '.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
  showToast('تم تحميل ملف النسخة الاحتياطية (.json) على جهازك');
}
async function shareBackupFile() {
  const dataStr = getBackupPayloadString();
  const datePart = new Date().toISOString().slice(0, 10);
  const fileName = 'tax_office_backup_' + datePart + '.json';
  try {
    const file = new File([dataStr], fileName, { type: 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({
        title: 'نسخة احتياطية - دفتر المكتب الضريبي',
        text: 'نسخة احتياطية لملفات الممولين والمهام الضريبية (' + datePart + ')',
        files: [file]
      });
      showToast('تمت مشاركة ملف النسخة الاحتياطية');
      return;
    }
  } catch (e) {}
  downloadBackupFile();
}
function copyTextToClipboard(text, msg) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => showToast(msg)).catch(() => fallbackCopy(text, msg));
  } else {
    fallbackCopy(text, msg);
  }
}
function fallbackCopy(text, msg) {
  const ta = document.createElement('textarea');
  ta.value = text;
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); showToast(msg); } catch (e) {}
  document.body.removeChild(ta);
}
function previewRestoreJson(rawText) {
  const previewEl = document.getElementById('restorePreviewBox');
  if (!rawText || !rawText.trim()) {
    previewEl.textContent = '';
    return null;
  }
  try {
    const parsed = JSON.parse(rawText);
    if (!parsed || !Array.isArray(parsed.clients) || !Array.isArray(parsed.tasks)) {
      previewEl.style.color = 'var(--status-urgent)';
      previewEl.textContent = 'ملف غير صالح: يجب أن يحتوي على مصفوفة الممولين (clients) والمهام (tasks).';
      return null;
    }
    previewEl.style.color = 'var(--status-safe)';
    previewEl.textContent = 'الملف جاهز للاسترجاع: يحتوي على (' + parsed.clients.length + ' ممول) و (' + parsed.tasks.length + ' مهمة).';
    return parsed;
  } catch (err) {
    previewEl.style.color = 'var(--status-urgent)';
    previewEl.textContent = 'خطأ في صيغة ملف JSON. تأكد من اختيار ملف النسخة الاحتياطية الصحيح.';
    return null;
  }
}
async function executeRestore() {
  const rawText = document.getElementById('restoreJsonTextarea').value;
  const parsed = previewRestoreJson(rawText);
  if (!parsed) return;
  pushUndoState('استرجاع نسخة احتياطية من ملف');
  const mode = document.getElementById('restoreModeSelect').value;
  if (mode === 'REPLACE') {
    appState.clients = parsed.clients;
    appState.tasks = parsed.tasks;
    if (parsed.customLists) appState.customLists = parsed.customLists;
  } else {
    const clientMap = new Map(appState.clients.map(c => [c.id, c]));
    parsed.clients.forEach(c => {
      if (c && c.id) clientMap.set(c.id, c);
    });
    appState.clients = Array.from(clientMap.values());
    const taskMap = new Map(appState.tasks.map(t => [t.id, t]));
    parsed.tasks.forEach(t => {
      if (t && t.id) taskMap.set(t.id, t);
    });
    appState.tasks = Array.from(taskMap.values());
    if (parsed.customLists && typeof parsed.customLists === 'object') {
      ensureCustomListsShape();
      ['categories', 'statuses', 'taskTypes'].forEach(k => {
        if (Array.isArray(parsed.customLists[k])) {
          parsed.customLists[k].forEach(val => {
            if (val && appState.customLists[k].indexOf(val) === -1) {
              appState.customLists[k].push(val);
            }
          });
        }
      });
    }
  }
  ensureCustomListsShape();
  normalizeAllClientsDates();
  syncCustomDropdowns();
  await saveState(true, 'استرجاع نسخة احتياطية (' + appState.clients.length + ' ممول)');
  renderClients();
  renderTasks();
  document.getElementById('backupModalBackdrop').classList.remove('open');
  showToast('تم استرجاع النسخة الاحتياطية بنجاح (' + appState.clients.length + ' ممول)', { canUndo: true });
}
function exportClientsCsv() {
  normalizeAllClientsDates();
  const headers = ['الاسم', 'المأمورية', 'النشاط', 'القسم', 'الحالة', 'التواريخ والمواعيد', 'تفاصيل المشكلة', 'الإجراء المطلوب'];
  const rows = appState.clients.map(c => {
    const datesSummary = (c.dates || []).map(d => (d.label || '') + ': ' + (d.date || '')).join(' | ');
    return [
      c.name, c.office, c.activity, c.category, c.status, datesSummary || c.noticeDate || '', c.problem, c.action
    ].map(v => '"' + String(v || '').replace(/"/g, '""') + '"').join(',');
  });
  const csv = '\uFEFF' + headers.join(',') + '\n' + rows.join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'office_clients_cases.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  showToast('تم تحميل جدول العملاء بصيغة CSV');
}
function openClientModal(clientId) {
  syncCustomDropdowns();
  closeCustomValueAdder('clientFormCategory');
  closeCustomValueAdder('clientFormStatus');
  const modal = document.getElementById('clientModalBackdrop');
  const delBtn = document.getElementById('btnDeleteClientInModal');
  if (clientId) {
    const c = appState.clients.find(item => item.id === clientId);
    if (!c) return;
    normalizeClientDates(c);
    document.getElementById('clientModalTitle').textContent = 'تعديل ملف: ' + c.name;
    document.getElementById('clientFormId').value = c.id;
    document.getElementById('clientFormName').value = c.name;
    document.getElementById('clientFormOffice').value = c.office || '';
    document.getElementById('clientFormActivity').value = c.activity || '';
    document.getElementById('clientFormCategory').value = c.category || BASE_CATEGORIES[0];
    document.getElementById('clientFormStatus').value = c.status || BASE_STATUSES[1];
    document.getElementById('clientFormProblem').value = c.problem || '';
    document.getElementById('clientFormAction').value = c.action || '';
    renderClientDateRowsInModal(c.dates);
    delBtn.style.display = 'inline-flex';
  } else {
    document.getElementById('clientModalTitle').textContent = 'إضافة ملف ممول جديد';
    document.getElementById('clientForm').reset();
    document.getElementById('clientFormId').value = '';
    document.getElementById('clientFormCategory').value = BASE_CATEGORIES[0];
    document.getElementById('clientFormStatus').value = BASE_STATUSES[0];
    renderClientDateRowsInModal([]);
    delBtn.style.display = 'none';
  }
  modal.classList.add('open');
}
function openTaskModal(taskId) {
  syncCustomDropdowns();
  closeCustomValueAdder('taskFormType');
  const t = appState.tasks.find(item => item.id === taskId);
  if (!t) return;
  document.getElementById('taskFormId').value = t.id;
  document.getElementById('taskFormTitle').value = t.title || '';
  document.getElementById('taskFormClient').value = t.clientId || '';
  const typeSelect = document.getElementById('taskFormType');
  const taskType = t.type || BASE_TASK_TYPES[0];
  if (BASE_TASK_TYPES.indexOf(taskType) === -1 && appState.customLists.taskTypes.indexOf(taskType) === -1) {
    appState.customLists.taskTypes.push(taskType);
    syncCustomDropdowns();
  }
  typeSelect.value = taskType;
  document.getElementById('taskFormDue').value = t.due || '';
  document.getElementById('taskFormPriority').value = t.priority || 'عادي';
  document.getElementById('taskModalBackdrop').classList.add('open');
}
function switchMainTab(targetId) {
  document.querySelectorAll('.nav-tab').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-tab') === targetId);
  });
  document.querySelectorAll('.view-section').forEach(sec => {
    sec.classList.toggle('active', sec.id === targetId);
  });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
window.addEventListener('DOMContentLoaded', async () => {
  initTheme();
  applyAuthLockState();
  await loadState();
  await loadUndoHistory();
  await loadCheckpoints();
  syncCustomDropdowns();
  initEventListeners();
  renderClients();
  renderTasks();
  if (typeof initCalcYearMonthOptions === "function") initCalcYearMonthOptions();
  runInspectionCalculator();
  runInvoiceCalculator();
  runPayrollCalculator();
  runRealEstateCalculator();
  runPenaltyCalculator();
  renderReferenceList();
  updateHeaderSaveTime();
  updateUndoRedoButtons();
  updateStorageStatusBadge();
  if (isAppUnlocked()) {
    pullFromSupabase(false);
  }
  initSupabaseRealtimeSocket();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
});
