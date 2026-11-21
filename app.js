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
function initEventListeners() {
  // 0. Mobile Header Menu Toggle
  const btnMobileMenuToggle = document.getElementById('btnMobileMenuToggle');
  const headerActionsMenu = document.getElementById('headerActionsMenu');
  function setMobileMenuOpen(isOpen) {
    if (!headerActionsMenu || !btnMobileMenuToggle) return;
    headerActionsMenu.classList.toggle('open', isOpen);
    btnMobileMenuToggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    const openIcon = document.getElementById('iconMenuOpen');
    const closeIcon = document.getElementById('iconMenuClose');
    if (openIcon) openIcon.style.display = isOpen ? 'none' : 'block';
    if (closeIcon) closeIcon.style.display = isOpen ? 'block' : 'none';
  }
  if (btnMobileMenuToggle && headerActionsMenu) {
    btnMobileMenuToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      setMobileMenuOpen(!headerActionsMenu.classList.contains('open'));
    });
    document.addEventListener('click', (e) => {
      if (headerActionsMenu.classList.contains('open') &&
          !headerActionsMenu.contains(e.target) &&
          !btnMobileMenuToggle.contains(e.target)) {
        setMobileMenuOpen(false);
      }
    });
    ['btnSyncNow', 'btnLockApp', 'btnToggleTheme', 'btnInstallPwa', 'btnOpenBackupModal'].forEach(btnId => {
      const b = document.getElementById(btnId);
      if (b) {
        b.addEventListener('click', () => setMobileMenuOpen(false));
      }
    });
  }

  // 1. Auth Lock Screen Listeners
  const authForm = document.getElementById('authLockForm');
  if (authForm) {
    authForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const passInput = document.getElementById('authPasswordInput');
      const rememberCheck = document.getElementById('authRememberCheck');
      const errEl = document.getElementById('authErrorMsg');
      const entered = (passInput ? passInput.value : '');
      if (entered === OFFICE_PIN) {
        unlockApp(rememberCheck ? rememberCheck.checked : true);
      } else {
        if (errEl) {
          errEl.textContent = 'كلمة المرور غير صحيحة. تأكد من إدخال كلمة مرور المكتب المعتمدة.';
          errEl.style.display = 'block';
        }
        if (passInput) {
          passInput.select();
        }
      }
    });
  }
  const btnToggleAuthPass = document.getElementById('btnToggleAuthPass');
  if (btnToggleAuthPass) {
    btnToggleAuthPass.addEventListener('click', () => {
      const inp = document.getElementById('authPasswordInput');
      const showIcon = document.getElementById('iconPassShow');
      const hideIcon = document.getElementById('iconPassHide');
      if (!inp) return;
      const isPass = inp.getAttribute('type') === 'password';
      inp.setAttribute('type', isPass ? 'text' : 'password');
      if (showIcon && hideIcon) {
        showIcon.style.display = isPass ? 'none' : 'block';
        hideIcon.style.display = isPass ? 'block' : 'none';
      }
    });
  }
  const btnLockApp = document.getElementById('btnLockApp');
  if (btnLockApp) {
    btnLockApp.addEventListener('click', lockApp);
  }
  // 1b. Undo / Redo & Toast Undo & Sync Now Buttons
  const btnUndoAction = document.getElementById('btnUndoAction');
  if (btnUndoAction) {
    btnUndoAction.addEventListener('click', performUndo);
  }
  const btnRedoAction = document.getElementById('btnRedoAction');
  if (btnRedoAction) {
    btnRedoAction.addEventListener('click', performRedo);
  }
  const btnToastUndo = document.getElementById('btnToastUndo');
  if (btnToastUndo) {
    btnToastUndo.addEventListener('click', () => {
      const box = document.getElementById('toastBox');
      if (box) box.classList.remove('show');
      btnToastUndo.style.display = 'none';
      performUndo();
    });
  }
  const btnSyncNow = document.getElementById('btnSyncNow');
  if (btnSyncNow) {
    btnSyncNow.addEventListener('click', () => {
      pullFromSupabase(true);
    });
  }
  // 1c. Checkpoints Listeners in Backup Modal
  const btnCreateManualCheckpoint = document.getElementById('btnCreateManualCheckpoint');
  if (btnCreateManualCheckpoint) {
    btnCreateManualCheckpoint.addEventListener('click', async () => {
      const inp = document.getElementById('manualCheckpointMsg');
      const customMsg = (inp ? inp.value : '').trim() || 'نقطة استرجاع يدوية للمكتب';
      const cp = await createLocalCheckpoint(customMsg, true);
      if (inp) inp.value = '';
      syncToSupabase('نقطة حفظ يدوية: ' + customMsg);
      showToast('تم حفظ نقطة الاسترجاع (' + cp.id + ') بنجاح');
    });
  }
  const manualCheckpointMsg = document.getElementById('manualCheckpointMsg');
  if (manualCheckpointMsg) {
    manualCheckpointMsg.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (btnCreateManualCheckpoint) btnCreateManualCheckpoint.click();
      }
    });
  }
  const checkpointsContainer = document.getElementById('checkpointsTimelineContainer');
  if (checkpointsContainer) {
    checkpointsContainer.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-action]');
      if (!btn) return;
      const action = btn.getAttribute('data-action');
      const cpId = btn.getAttribute('data-cp-id');
      if (!cpId) return;
      if (action === 'restore-checkpoint') {
        restoreCheckpointById(cpId);
      } else if (action === 'download-checkpoint') {
        downloadCheckpointById(cpId);
      }
    });
  }
  // 2. Custom Values Listeners (+ مخصص & __ADD_CUSTOM__)
  document.querySelectorAll('.btn-inline-custom').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetSelectId = btn.getAttribute('data-target-select');
      openCustomValueAdder(targetSelectId);
    });
  });
  ['clientFormCategory', 'clientFormStatus', 'newTaskType', 'taskFormType'].forEach(selectId => {
    const sel = document.getElementById(selectId);
    if (!sel) return;
    sel.addEventListener('change', () => {
      if (sel.value === '__ADD_CUSTOM__') {
        openCustomValueAdder(selectId);
      } else {
        const box = document.getElementById('customAdder_' + selectId);
        if (box) box.style.display = 'none';
      }
    });
  });
  document.querySelectorAll('.custom-adder-save').forEach(btn => {
    btn.addEventListener('click', () => {
      const listKey = btn.getAttribute('data-list-key');
      const selectId = btn.getAttribute('data-select-id');
      saveCustomValueFromAdder(listKey, selectId);
    });
  });
  document.querySelectorAll('.custom-adder-cancel').forEach(btn => {
    btn.addEventListener('click', () => {
      const selectId = btn.getAttribute('data-select-id');
      closeCustomValueAdder(selectId);
    });
  });
  document.querySelectorAll('.custom-adder-input').forEach(inp => {
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const saveBtn = inp.parentElement.querySelector('.custom-adder-save');
        if (saveBtn) saveBtn.click();
      }
    });
  });
  // 3. Multi-Date Row Button
  const btnAddClientDateRow = document.getElementById('btnAddClientDateRow');
  if (btnAddClientDateRow) {
    btnAddClientDateRow.addEventListener('click', () => {
      const container = document.getElementById('clientDatesContainer');
      if (!container) return;
      const row = createClientDateRowElement({
        id: 'd_' + Date.now(),
        label: '',
        date: '',
        hasAppeal30: false
      });
      container.appendChild(row);
      const labelInput = row.querySelector('.date-row-label');
      if (labelInput) labelInput.focus();
    });
  }
  // 4. Print Button
  const btnPrintOfficeReport = document.getElementById('btnPrintOfficeReport');
  if (btnPrintOfficeReport) {
    btnPrintOfficeReport.addEventListener('click', renderAndPrintOfficeReport);
  }
  window.addEventListener('beforeprint', () => {
    if (currentPrintMode === 'MEMO') {
      populatePrintLegalMemo();
    } else {
      populatePrintOfficeReport();
    }
  });
  window.addEventListener('afterprint', () => {
    currentPrintMode = 'REPORT';
  });
  document.getElementById('btnToggleTheme').addEventListener('click', () => {
    const curr = document.documentElement.getAttribute('data-theme');
    const next = (curr === 'dark') ? 'light' : 'dark';
    applyTheme(next);
    showToast(next === 'dark' ? 'تم تفعيل الوضع الليلي' : 'تم تفعيل الوضع النهاري');
  });
  document.addEventListener('keydown', (e) => {
    if (!isAppUnlocked()) return;
    const activeEl = document.activeElement;
    const isEditingText = activeEl && (
      activeEl.tagName === 'INPUT' ||
      activeEl.tagName === 'TEXTAREA' ||
      activeEl.tagName === 'SELECT' ||
      activeEl.isContentEditable
    );
    if ((e.ctrlKey || e.metaKey) && !isEditingText && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) {
        performRedo();
      } else {
        performUndo();
      }
      return;
    }
    if ((e.ctrlKey || e.metaKey) && !isEditingText && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      performRedo();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      switchMainTab('view-clients');
      document.getElementById('clientSearchInput').focus();
    } else if (e.key === 'Escape') {
      if (typeof setMobileMenuOpen === 'function') setMobileMenuOpen(false);
      document.getElementById('clientModalBackdrop').classList.remove('open');
      document.getElementById('backupModalBackdrop').classList.remove('open');
      document.getElementById('taskModalBackdrop').classList.remove('open');
    }
  });
  document.querySelectorAll('.nav-tab').forEach(btn => {
    btn.addEventListener('click', () => switchMainTab(btn.getAttribute('data-tab')));
  });
  const toggleFiltersBtn = document.getElementById('btnToggleFilters');
  const filterDrawer = document.getElementById('filterDrawer');
  if (toggleFiltersBtn && filterDrawer) {
    toggleFiltersBtn.addEventListener('click', () => {
      const isOpen = filterDrawer.classList.toggle('open');
      toggleFiltersBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    });
  }
  document.getElementById('clientSearchInput').addEventListener('input', renderClients);
  document.getElementById('clientCategoryFilter').addEventListener('change', renderClients);
  document.getElementById('clientStatusFilter').addEventListener('change', renderClients);
  document.getElementById('btnResetFilters').addEventListener('click', () => {
    document.getElementById('clientSearchInput').value = '';
    document.getElementById('clientCategoryFilter').value = 'ALL';
    document.getElementById('clientStatusFilter').value = 'ALL';
    renderClients();
  });
  document.getElementById('btnExportClientsCsv').addEventListener('click', exportClientsCsv);
  document.getElementById('btnQuickAddClient').addEventListener('click', () => openClientModal(null));
  document.getElementById('btnCloseClientModal').addEventListener('click', () => {
    document.getElementById('clientModalBackdrop').classList.remove('open');
  });
  document.getElementById('clientForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('clientFormId').value;
    const clientName = document.getElementById('clientFormName').value.trim();
    const actionMsg = (id ? 'تعديل ملف: ' : 'إضافة ممول: ') + clientName;
    pushUndoState(actionMsg);
    const categoryVal = resolveSelectOrPendingCustomValue('clientFormCategory', 'categories', BASE_CATEGORIES[0]);
    const statusVal = resolveSelectOrPendingCustomValue('clientFormStatus', 'statuses', BASE_STATUSES[0]);
    const collectedDates = collectClientDatesFromModal();
    const firstDateObj = collectedDates.find(d => d.date);
    const record = {
      id: id || ('c_' + Date.now()),
      name: clientName,
      office: document.getElementById('clientFormOffice').value.trim(),
      activity: document.getElementById('clientFormActivity').value.trim(),
      category: categoryVal,
      status: statusVal,
      dates: collectedDates,
      noticeDate: firstDateObj ? firstDateObj.date : '',
      problem: document.getElementById('clientFormProblem').value.trim(),
      action: document.getElementById('clientFormAction').value.trim()
    };
    normalizeClientDates(record);
    if (id) {
      const idx = appState.clients.findIndex(c => c.id === id);
      if (idx !== -1) appState.clients[idx] = record;
    } else {
      appState.clients.unshift(record);
    }
    await saveState(false, actionMsg);
    renderClients();
    document.getElementById('clientModalBackdrop').classList.remove('open');
  });
  document.getElementById('btnDeleteClientInModal').addEventListener('click', async () => {
    const id = document.getElementById('clientFormId').value;
    if (!id) return;
    const targetClient = appState.clients.find(c => c.id === id);
    const delMsg = 'حذف ملف: ' + (targetClient ? targetClient.name : id);
    pushUndoState(delMsg);
    appState.clients = appState.clients.filter(c => c.id !== id);
    await saveState(true, delMsg);
    renderClients();
    document.getElementById('clientModalBackdrop').classList.remove('open');
    showToast('تم ' + delMsg, { canUndo: true });
  });
  document.getElementById('clientsListContainer').addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const action = btn.getAttribute('data-action');
    const id = btn.getAttribute('data-id');
    const client = appState.clients.find(c => c.id === id);
    if (!client) return;
    if (action === 'edit-client') {
      openClientModal(id);
    } else if (action === 'client-to-task') {
      const targetClientId = client.id;
      const existingOpen = appState.tasks.find(t => !t.done && t.clientId === targetClientId);
      if (existingOpen) {
        appState.taskFilter = 'OPEN';
        document.querySelectorAll('.task-filter-btn').forEach(b => {
          b.classList.toggle('btn-primary', b.getAttribute('data-filter') === 'OPEN');
        });
        renderTasks();
        switchMainTab('view-tasks');
        showToast('يوجد بالفعل مهمة مفتوحة لهذا الممول في الأجندة (يمكنك تعديلها من هنا)');
        return;
      }
      const newTask = {
        id: 't_' + Date.now(),
        title: client.action || ('متابعة ملف ' + client.name),
        clientId: client.id,
        clientName: client.name,
        type: client.category,
        due: new Date().toISOString().slice(0, 10),
        priority: client.status === 'عاجل / طعن' ? 'عاجل' : 'عادي',
        done: false
      };
      const commitMsg = 'إضافة مهمة: ' + newTask.title;
      pushUndoState(commitMsg);
      appState.tasks.unshift(newTask);
      await saveState(true, commitMsg);
      renderTasks();
      switchMainTab('view-tasks');
      showToast('تمت إضافة إجراء (' + client.name + ') إلى الأجندة', { canUndo: true });
    } else if (action === 'client-to-memo') {
      switchMainTab('view-reference');
      const memoSelect = document.getElementById('memoClientSelect');
      memoSelect.value = client.id;
      generateLegalMemo();
      showToast('تم تجهيز المذكرة القانونية لملف: ' + client.name);
    }
  });
  document.getElementById('btnAddTask').addEventListener('click', async () => {
    const titleInput = document.getElementById('newTaskTitle');
    const title = titleInput.value.trim();
    if (!title) {
      showToast('اكتب عنوان المهمة أولاً');
      return;
    }
    const clientId = document.getElementById('newTaskClient').value;
    if (clientId) {
      const targetClientId = clientId;
      const existingOpen = appState.tasks.find(t => !t.done && t.clientId === targetClientId);
      if (existingOpen) {
        appState.taskFilter = 'OPEN';
        document.querySelectorAll('.task-filter-btn').forEach(b => {
          b.classList.toggle('btn-primary', b.getAttribute('data-filter') === 'OPEN');
        });
        renderTasks();
        switchMainTab('view-tasks');
        showToast('يوجد بالفعل مهمة مفتوحة لهذا الممول في الأجندة (يمكنك تعديلها من هنا)');
        return;
      }
    }
    const commitMsg = 'إضافة مهمة: ' + title;
    pushUndoState(commitMsg);
    const clientObj = appState.clients.find(c => c.id === clientId);
    const taskTypeVal = resolveSelectOrPendingCustomValue('newTaskType', 'taskTypes', BASE_TASK_TYPES[0]);
    const task = {
      id: 't_' + Date.now(),
      title: title,
      clientId: clientId,
      clientName: clientObj ? clientObj.name : '',
      type: taskTypeVal,
      due: document.getElementById('newTaskDue').value || new Date().toISOString().slice(0, 10),
      priority: document.getElementById('newTaskPriority').value,
      done: false
    };
    appState.tasks.unshift(task);
    titleInput.value = '';
    await saveState(false, commitMsg);
    renderTasks();
  });
  document.querySelectorAll('.task-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      appState.taskFilter = btn.getAttribute('data-filter');
      document.querySelectorAll('.task-filter-btn').forEach(b => b.classList.remove('btn-primary'));
      btn.classList.add('btn-primary');
      renderTasks();
    });
  });
  document.getElementById('tasksListContainer').addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const action = btn.getAttribute('data-action');
    const id = btn.getAttribute('data-id');
    if (action === 'toggle-task') {
      const t = appState.tasks.find(item => item.id === id);
      if (t) {
        const toggleMsg = (t.done ? 'إعادة فتح مهمة: ' : 'إنجاز مهمة: ') + t.title;
        pushUndoState(toggleMsg);
        t.done = !t.done;
        await saveState(true, toggleMsg);
        renderTasks();
        showToast('تم ' + toggleMsg, { canUndo: true });
      }
    } else if (action === 'edit-task') {
      openTaskModal(id);
    } else if (action === 'delete-task') {
      const targetTask = appState.tasks.find(item => item.id === id);
      const delMsg = 'حذف مهمة: ' + (targetTask ? targetTask.title : id);
      pushUndoState(delMsg);
      appState.tasks = appState.tasks.filter(item => item.id !== id);
      await saveState(true, delMsg);
      renderTasks();
      showToast('تم ' + delMsg, { canUndo: true });
    }
  });
  document.getElementById('btnCloseTaskModal').addEventListener('click', () => {
    document.getElementById('taskModalBackdrop').classList.remove('open');
  });
  document.getElementById('taskForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('taskFormId').value;
    const t = appState.tasks.find(item => item.id === id);
    if (!t) return;
    const newTitle = document.getElementById('taskFormTitle').value.trim();
    const editMsg = 'تعديل مهمة: ' + newTitle;
    pushUndoState(editMsg);
    const clientId = document.getElementById('taskFormClient').value;
    const clientObj = appState.clients.find(c => c.id === clientId);
    const taskTypeVal = resolveSelectOrPendingCustomValue('taskFormType', 'taskTypes', BASE_TASK_TYPES[0]);
    t.title = newTitle;
    t.clientId = clientId;
    t.clientName = clientObj ? clientObj.name : '';
    t.type = taskTypeVal;
    t.due = document.getElementById('taskFormDue').value;
    t.priority = document.getElementById('taskFormPriority').value;
    await saveState(false, editMsg);
    renderTasks();
    document.getElementById('taskModalBackdrop').classList.remove('open');
  });
  document.querySelectorAll('.calc-mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-mode');
      document.querySelectorAll('.calc-mode-btn').forEach(b => b.classList.remove('btn-primary'));
      btn.classList.add('btn-primary');
      document.querySelectorAll('.calc-pane').forEach(p => {
        p.style.display = (p.id === target) ? 'block' : 'none';
      });
    });
  });
  ['inspInputMethod', 'inspEntityType', 'inspDailyRev', 'inspWorkDays', 'inspTurnover', 'inspProfitMargin', 'inspReturnTax', 'inspWhtPaid'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', runInspectionCalculator);
      el.addEventListener('change', runInspectionCalculator);
    }
  });
  document.getElementById('btnPresetAudio1').addEventListener('click', () => {
    document.getElementById('inspInputMethod').value = 'DIRECT';
    document.getElementById('inspTurnover').value = '4561230';
    document.getElementById('inspProfitMargin').value = '20';
    document.getElementById('inspReturnTax').value = '0';
    runInspectionCalculator();
  });
  document.getElementById('btnPresetAudio2').addEventListener('click', () => {
    document.getElementById('inspInputMethod').value = 'DIRECT';
    document.getElementById('inspTurnover').value = '4561230';
    document.getElementById('inspProfitMargin').value = '5';
    document.getElementById('inspReturnTax').value = '0';
    runInspectionCalculator();
  });
  document.getElementById('btnPresetAudio3').addEventListener('click', () => {
    document.getElementById('inspInputMethod').value = 'DAILY';
    document.getElementById('inspDailyRev').value = '1000';
    document.getElementById('inspWorkDays').value = '310';
    document.getElementById('inspProfitMargin').value = '20';
    document.getElementById('inspReturnTax').value = '5000';
    runInspectionCalculator();
  });
  ['invNetAmount', 'invVatRate', 'invWhtRate', 'invRole'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', runInvoiceCalculator);
      el.addEventListener('change', runInvoiceCalculator);
    }
  });
  ['payGrossMonthly', 'payInsWage'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', runPayrollCalculator);
  });
  ['reSaleValue', 'reProfitMargin'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', runRealEstateCalculator);
  });
  ['memoClientSelect', 'memoTemplateType', 'memoFormNum'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('change', generateLegalMemo);
      el.addEventListener('input', generateLegalMemo);
    }
  });
  document.getElementById('btnCopyMemo').addEventListener('click', () => {
    copyTextToClipboard(document.getElementById('memoOutputArea').value, 'تم نسخ نص المذكرة القانونية للحافظة');
  });
  const btnPrintMemo = document.getElementById('btnPrintMemo');
  if (btnPrintMemo) {
    btnPrintMemo.addEventListener('click', renderAndPrintLegalMemo);
  }
  document.getElementById('refSearchInput').addEventListener('input', renderReferenceList);
  document.getElementById('refCategorySelect').addEventListener('change', renderReferenceList);
  document.getElementById('btnOpenBackupModal').addEventListener('click', () => {
    renderCheckpointsTimeline();
    document.getElementById('backupModalBackdrop').classList.add('open');
  });
  document.getElementById('btnCloseBackupModal').addEventListener('click', () => {
    document.getElementById('backupModalBackdrop').classList.remove('open');
  });
  document.getElementById('btnDownloadBackupFile').addEventListener('click', downloadBackupFile);
  document.getElementById('btnShareBackupFile').addEventListener('click', shareBackupFile);
  document.getElementById('btnCopyBackupJson').addEventListener('click', () => {
    copyTextToClipboard(getBackupPayloadString(), 'تم نسخ كود النسخة الاحتياطية بالكامل');
  });
  document.getElementById('restoreFileInput').addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(evt) {
      const content = evt.target.result;
      document.getElementById('restoreJsonTextarea').value = content;
      previewRestoreJson(content);
    };
    reader.readAsText(file, 'UTF-8');
  });
  document.getElementById('restoreJsonTextarea').addEventListener('input', (e) => {
    previewRestoreJson(e.target.value);
  });
  document.getElementById('btnExecuteRestore').addEventListener('click', executeRestore);
  document.getElementById('btnResetToDefaultData').addEventListener('click', async () => {
    pushUndoState('استعادة البيانات الأصلية للـ 20 عميلاً');
    appState.clients = JSON.parse(JSON.stringify(DEFAULT_CLIENTS));
    appState.tasks = JSON.parse(JSON.stringify(DEFAULT_TASKS));
    appState.customLists = { categories: [], statuses: [], taskTypes: [] };
    normalizeAllClientsDates();
    syncCustomDropdowns();
    await saveState(true, 'استعادة البيانات الأصلية للـ 20 عميلاً');
    renderClients();
    renderTasks();
    document.getElementById('backupModalBackdrop').classList.remove('open');
    showToast('تمت استعادة قائمة الـ 20 عميلاً والمهام الأصلية من الريكورد', { canUndo: true });
  });
  // Cloud Sync Event Listeners (Online/Offline/Focus + 25s Smart Polling)
  window.addEventListener('online', () => {
    if (isPendingSync()) {
      syncToSupabase('مزامنة تلقائية للتعديلات المعلقة بعد عودة الإنترنت');
    } else {
      pullFromSupabase(false);
    }
    initSupabaseRealtimeSocket();
  });
  window.addEventListener('offline', () => {
    updateStorageStatusBadge('OFFLINE');
  });
  window.addEventListener('focus', () => {
    if (isAppUnlocked()) {
      pullFromSupabase(false);
    }
  });
  setInterval(() => {
    if (isAppUnlocked() && navigator.onLine !== false) {
      pullFromSupabase(false);
    }
  }, 25000);
  let deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    const installBtn = document.getElementById('btnInstallPwa');
    if (installBtn) installBtn.style.display = 'inline-flex';
  });
  document.getElementById('btnInstallPwa').addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    document.getElementById('btnInstallPwa').style.display = 'none';
  });
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
  runInspectionCalculator();
  runInvoiceCalculator();
  runPayrollCalculator();
  runRealEstateCalculator();
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
