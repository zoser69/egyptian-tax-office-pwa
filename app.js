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
        text: 'نسخة احتياطية لملفات الممولين والجلسات الضريبية (' + datePart + ')',
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
    if (!parsed || !Array.isArray(parsed.clients)) {
      previewEl.style.color = 'var(--status-urgent)';
      previewEl.textContent = 'ملف غير صالح: يجب أن يحتوي على مصفوفة الممولين (clients).';
      return null;
    }
    const sessionsArr = Array.isArray(parsed.tasks) ? parsed.tasks : (Array.isArray(parsed.sessions) ? parsed.sessions : []);
    previewEl.style.color = 'var(--status-safe)';
    previewEl.textContent = 'الملف جاهز للاسترجاع: يحتوي على (' + parsed.clients.length + ' ممول) و (' + sessionsArr.length + ' جلسة).';
    parsed.tasks = sessionsArr;
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
    appState.tasks = parsed.tasks || [];
    appState.deletedIds = { clients: {}, tasks: {} };
    if (parsed.customLists) appState.customLists = parsed.customLists;
  } else {
    appState = mergeTwoAppStates(appState, parsed);
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
  populateClientDropdowns();
  const s = appState.tasks.find(item => item.id === taskId);
  if (!s) return;
  document.getElementById('taskFormId').value = s.id;
  const sel = document.getElementById('taskFormClient');
  if (sel) sel.value = s.clientId || '';
  const nameInp = document.getElementById('taskFormClientName');
  if (nameInp) nameInp.value = s.clientName || '';
  const appealInp = document.getElementById('taskFormAppealNum');
  if (appealInp) appealInp.value = s.appealNum || '';
  const dateInp = document.getElementById('taskFormDue');
  if (dateInp) dateInp.value = s.sessionDate || s.due || '';
  const detailsInp = document.getElementById('taskFormTitle');
  if (detailsInp) detailsInp.value = s.details || s.title || '';
  document.getElementById('taskModalBackdrop').classList.add('open');
}

function openPostponeModal(sessionId) {
  const s = appState.tasks.find(item => item.id === sessionId);
  if (!s) return;
  document.getElementById('postponeSessionId').value = s.id;
  document.getElementById('postponeClientNameDisplay').textContent = s.clientName + (s.appealNum ? (' (طعن رقم: ' + s.appealNum + ')') : '');
  document.getElementById('postponeOldDateDisplay').textContent = s.sessionDate || 'غير محدد';
  const newDateInput = document.getElementById('postponeNewDateInput');
  if (newDateInput) {
    newDateInput.value = '';
  }
  const noteInput = document.getElementById('postponeReasonInput');
  if (noteInput) {
    noteInput.value = '';
  }
  const historyPreview = document.getElementById('postponeModalHistoryPreview');
  if (historyPreview) {
    historyPreview.innerHTML = renderSessionPostponementTimelineHtml(s.history);
  }
  document.getElementById('postponeModalBackdrop').classList.add('open');
  if (newDateInput) setTimeout(() => newDateInput.focus(), 40);
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
  updateNotificationUiBar();
  if (typeof initCalcYearMonthOptions === 'function') initCalcYearMonthOptions();
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
    evaluateAndFireScheduledNotifications(false);
  }
  initSupabaseRealtimeSocket();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').then(() => {
      updateNotificationUiBar();
    }).catch(() => {});
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data && event.data.type === 'NOTIFICATION_CLICKED') {
        switchMainTab('view-tasks');
      }
    });
  }
});
