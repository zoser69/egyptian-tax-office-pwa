'use strict';

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

  // 1c. Notification Permission & Test Notification Buttons
  const btnEnableNotifications = document.getElementById('btnEnableNotifications');
  if (btnEnableNotifications) {
    btnEnableNotifications.addEventListener('click', () => {
      if ('Notification' in window && Notification.permission === 'granted') {
        showToast('الإشعارات مفعلة بالفعل على هذا الجهاز. اضغط على «إرسال إشعار تجريبي» للتجربة.');
        return;
      }
      return requestNotificationPermissionAndSendWelcome();
    });
  }
  const btnSendTestNotification = document.getElementById('btnSendTestNotification');
  if (btnSendTestNotification) {
    btnSendTestNotification.addEventListener('click', () => {
      return triggerManualTestNotification();
    });
  }

  // Copy SQL setup button if cloud table is not yet created
  const btnCopySupabaseSql = document.getElementById('btnCopySupabaseSql');
  if (btnCopySupabaseSql) {
    btnCopySupabaseSql.addEventListener('click', async () => {
      try {
        const resp = await window.fetch('./supabase_setup.sql');
        if (resp.ok) {
          const sqlText = await resp.text();
          copyTextToClipboard(sqlText, 'تم نسخ أوامر إعداد قاعدة البيانات بالكامل - الصقها في لوحة إعداد قاعدة البيانات ثم نفذها');
          return;
        }
      } catch (e) {}
      showToast('افتح ملف إعداد قاعدة البيانات وانسخ محتواه إلى لوحة إعداد قاعدة البيانات');
    });
  }

  // 1d. Checkpoints Listeners in Backup Modal
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
  ['clientFormCategory', 'clientFormStatus'].forEach(selectId => {
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
        id: generateUniqueEntityId('d'),
        label: '',
        date: '',
        time: '',
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

  const btnToggleTheme = document.getElementById('btnToggleTheme');
  if (btnToggleTheme) btnToggleTheme.addEventListener('click', () => {
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
      const searchEl = document.getElementById('clientSearchInput');
      if (searchEl) searchEl.focus();
    } else if (e.key === 'Escape') {
      if (typeof setMobileMenuOpen === 'function') setMobileMenuOpen(false);
      ['clientModalBackdrop', 'backupModalBackdrop', 'taskModalBackdrop', 'postponeModalBackdrop'].forEach(id => {
        const m = document.getElementById(id);
        if (m) m.classList.remove('open');
      });
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

  const clientSearchInputEl = document.getElementById('clientSearchInput');
  if (clientSearchInputEl) clientSearchInputEl.addEventListener('input', renderClients);
  const clientCategoryFilterEl = document.getElementById('clientCategoryFilter');
  if (clientCategoryFilterEl) clientCategoryFilterEl.addEventListener('change', renderClients);
  const clientStatusFilterEl = document.getElementById('clientStatusFilter');
  if (clientStatusFilterEl) clientStatusFilterEl.addEventListener('change', renderClients);
  const btnResetFiltersEl = document.getElementById('btnResetFilters');
  if (btnResetFiltersEl) btnResetFiltersEl.addEventListener('click', () => {
    if (clientSearchInputEl) clientSearchInputEl.value = '';
    if (clientCategoryFilterEl) clientCategoryFilterEl.value = 'ALL';
    if (clientStatusFilterEl) clientStatusFilterEl.value = 'ALL';
    renderClients();
  });

  const btnExportClientsCsvEl = document.getElementById('btnExportClientsCsv');
  if (btnExportClientsCsvEl) btnExportClientsCsvEl.addEventListener('click', exportClientsCsv);
  const btnQuickAddClientEl = document.getElementById('btnQuickAddClient');
  if (btnQuickAddClientEl) btnQuickAddClientEl.addEventListener('click', () => openClientModal(null));
  const btnCloseClientModalEl = document.getElementById('btnCloseClientModal');
  if (btnCloseClientModalEl) btnCloseClientModalEl.addEventListener('click', () => {
    const modal = document.getElementById('clientModalBackdrop');
    if (modal) modal.classList.remove('open');
  });

  const clientFormEl = document.getElementById('clientForm');
  if (clientFormEl) clientFormEl.addEventListener('submit', async (e) => {
    e.preventDefault();
    const idEl = document.getElementById('clientFormId');
    const nameEl = document.getElementById('clientFormName');
    const id = idEl ? idEl.value : '';
    const clientName = (nameEl ? nameEl.value : '').trim();
    if (!clientName) {
      showToast('يرجى إدخال اسم الممول أولاً');
      if (nameEl) nameEl.focus();
      return;
    }
    const actionMsg = (id ? 'تعديل ملف: ' : 'إضافة ممول: ') + clientName;
    pushUndoState(actionMsg);
    const categoryVal = resolveSelectOrPendingCustomValue('clientFormCategory', 'categories', BASE_CATEGORIES[0]);
    const statusVal = resolveSelectOrPendingCustomValue('clientFormStatus', 'statuses', BASE_STATUSES[0]);
    const collectedDates = collectClientDatesFromModal();
    const firstDateObj = collectedDates.find(d => d.date);
    const nowIso = getNextMonotonicIso();
    const record = {
      id: id || generateUniqueEntityId('c'),
      name: clientName,
      office: document.getElementById('clientFormOffice').value.trim(),
      activity: document.getElementById('clientFormActivity').value.trim(),
      category: categoryVal,
      status: statusVal,
      dates: collectedDates,
      noticeDate: firstDateObj ? firstDateObj.date : '',
      problem: document.getElementById('clientFormProblem').value.trim(),
      action: document.getElementById('clientFormAction').value.trim(),
      updatedAt: nowIso
    };
    normalizeClientDates(record);
    record.updatedAt = nowIso;
    if (id) {
      const idx = appState.clients.findIndex(c => c.id === id);
      if (idx !== -1) appState.clients[idx] = record;
      // Keep linked sessions clientName in sync if renamed
      (appState.tasks || []).forEach(s => {
        if (s.clientId === id) {
          s.clientName = clientName;
          s.updatedAt = nowIso;
        }
      });
    } else {
      appState.clients.unshift(record);
    }
    ensureDeletedIdsShape(appState);
    delete appState.deletedIds.clients[record.id];
    await saveState(false, actionMsg, { notifyEntityId: record.id });
    renderClients();
    renderTasks();
    document.getElementById('clientModalBackdrop').classList.remove('open');
  });

  const btnDeleteClientInModalEl = document.getElementById('btnDeleteClientInModal');
  if (btnDeleteClientInModalEl) btnDeleteClientInModalEl.addEventListener('click', async () => {
    const id = document.getElementById('clientFormId').value;
    if (!id) return;
    const targetClient = appState.clients.find(c => c.id === id);
    const delMsg = 'حذف ملف: ' + (targetClient ? targetClient.name : id);
    pushUndoState(delMsg);
    ensureDeletedIdsShape(appState);
    appState.deletedIds.clients[id] = getNextMonotonicIso();
    appState.clients = appState.clients.filter(c => c.id !== id);
    clearNotifKeysForEntity(id);
    await saveState(true, delMsg);
    renderClients();
    document.getElementById('clientModalBackdrop').classList.remove('open');
    showToast('تم ' + delMsg, { canUndo: true });
  });

  const clientsListContainerEl = document.getElementById('clientsListContainer');
  if (clientsListContainerEl) clientsListContainerEl.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const action = btn.getAttribute('data-action');
    const id = btn.getAttribute('data-id');
    const client = appState.clients.find(c => c.id === id);
    if (!client) return;
    if (action === 'edit-client') {
      openClientModal(id);
    } else if (action === 'client-to-task') {
      switchMainTab('view-tasks');
      const sel = document.getElementById('newSessionClientSelect');
      const nameInput = document.getElementById('newSessionClientName');
      const detailsInput = document.getElementById('newTaskTitle');
      const appealInput = document.getElementById('newSessionAppealNum');
      if (sel) sel.value = client.id;
      if (nameInput) nameInput.value = client.name;
      if (detailsInput && !detailsInput.value.trim()) {
        detailsInput.value = client.action || ('جلسة متابعة ملف ' + client.name);
      }
      if (appealInput) appealInput.focus();
      showToast('تم تجهيز بيانات (' + client.name + ') لإضافة جلسة جديدة');
    } else if (action === 'client-to-memo') {
      switchMainTab('view-reference');
      const memoSelect = document.getElementById('memoClientSelect');
      memoSelect.value = client.id;
      generateLegalMemo();
      showToast('تم تجهيز المذكرة القانونية لملف: ' + client.name);
    }
  });

  // =========================================================================
  // SESSIONS (الجلسات) LISTENERS: Add, Filter, Search, Postpone, Edit, Delete
  // =========================================================================
  const newSessionClientSelect = document.getElementById('newSessionClientSelect');
  if (newSessionClientSelect) {
    newSessionClientSelect.addEventListener('change', () => {
      const clientId = newSessionClientSelect.value;
      const clientObj = appState.clients.find(c => c.id === clientId);
      const nameInput = document.getElementById('newSessionClientName');
      if (clientObj && nameInput) {
        nameInput.value = clientObj.name;
      }
    });
  }

  const taskFormClient = document.getElementById('taskFormClient');
  if (taskFormClient) {
    taskFormClient.addEventListener('change', () => {
      const clientId = taskFormClient.value;
      const clientObj = appState.clients.find(c => c.id === clientId);
      const nameInput = document.getElementById('taskFormClientName');
      if (clientObj && nameInput) {
        nameInput.value = clientObj.name;
      }
    });
  }

  const sessionSearchInput = document.getElementById('sessionSearchInput');
  if (sessionSearchInput) {
    sessionSearchInput.addEventListener('input', renderTasks);
  }

  const btnAddTaskEl = document.getElementById('btnAddTask');
  if (btnAddTaskEl) btnAddTaskEl.addEventListener('click', async () => {
    const sel = document.getElementById('newSessionClientSelect');
    const nameInput = document.getElementById('newSessionClientName');
    const appealInput = document.getElementById('newSessionAppealNum');
    const dateInput = document.getElementById('newTaskDue');
    const timeInput = document.getElementById('newTaskTime');
    const detailsInput = document.getElementById('newTaskTitle');

    let clientId = sel ? sel.value : '';
    let clientName = (nameInput ? nameInput.value : '').trim();
    const clientObj = clientId ? appState.clients.find(c => c.id === clientId) : appState.clients.find(c => c.name === clientName);
    if (clientObj) {
      clientId = clientObj.id;
      if (!clientName) clientName = clientObj.name;
    }

    if (!clientName) {
      showToast('اختر اسم الممول أو اكتبه أولاً');
      if (nameInput) nameInput.focus();
      return;
    }

    const appealNum = (appealInput ? appealInput.value : '').trim();
    const sessionDate = (dateInput && dateInput.value) ? dateInput.value : getLocalTodayIso();
    const sessionTime = (timeInput && timeInput.value) ? normalizeTimeHHMM(timeInput.value) : '';
    const details = (detailsInput ? detailsInput.value : '').trim();

    const commitMsg = 'إضافة جلسة: ' + clientName + (appealNum ? (' (طعن ' + appealNum + ')') : '');
    pushUndoState(commitMsg);

    const nowIso = getNextMonotonicIso();
    const newSession = normalizeSessionItem({
      id: generateUniqueEntityId('s'),
      clientId: clientId,
      clientName: clientName,
      appealNum: appealNum,
      sessionDate: sessionDate,
      sessionTime: sessionTime,
      details: details,
      history: [],
      done: false,
      updatedAt: nowIso
    });

    ensureDeletedIdsShape(appState);
    delete appState.deletedIds.tasks[newSession.id];
    appState.tasks.unshift(newSession);

    if (nameInput) nameInput.value = '';
    if (sel) sel.value = '';
    if (appealInput) appealInput.value = '';
    if (timeInput) timeInput.value = '';
    if (detailsInput) detailsInput.value = '';

    await saveState(false, commitMsg, { notifyEntityId: newSession.id });
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

  const tasksListContainerEl = document.getElementById('tasksListContainer');
  if (tasksListContainerEl) tasksListContainerEl.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const action = btn.getAttribute('data-action');
    const id = btn.getAttribute('data-id');
    if (action === 'toggle-task') {
      const targetBefore = appState.tasks.find(item => item.id === id);
      if (targetBefore) {
        const toggleMsg = (targetBefore.done ? 'إعادة فتح جلسة: ' : 'إنهاء جلسة: ') + targetBefore.clientName;
        pushUndoState(toggleMsg);
        const s = appState.tasks.find(item => item.id === id);
        if (!s) return;
        s.done = !s.done;
        s.updatedAt = getNextMonotonicIso();
        clearNotifKeysForEntity(s.id);
        await saveState(true, toggleMsg, { notifyEntityId: s.done ? null : s.id });
        renderTasks();
        showToast('تم ' + toggleMsg, { canUndo: true });
      }
    } else if (action === 'postpone-task') {
      openPostponeModal(id);
    } else if (action === 'edit-task') {
      openTaskModal(id);
    } else if (action === 'delete-task') {
      const targetSession = appState.tasks.find(item => item.id === id);
      const delMsg = 'حذف جلسة: ' + (targetSession ? targetSession.clientName : id);
      pushUndoState(delMsg);
      ensureDeletedIdsShape(appState);
      appState.deletedIds.tasks[id] = getNextMonotonicIso();
      appState.tasks = appState.tasks.filter(item => item.id !== id);
      clearNotifKeysForEntity(id);
      await saveState(true, delMsg);
      renderTasks();
      showToast('تم ' + delMsg, { canUndo: true });
    }
  });

  // Postpone Session Modal Listeners (Supports unlimited consecutive postponements)
  const btnClosePostponeModal = document.getElementById('btnClosePostponeModal');
  if (btnClosePostponeModal) {
    btnClosePostponeModal.addEventListener('click', () => {
      document.getElementById('postponeModalBackdrop').classList.remove('open');
    });
  }

  const postponeForm = document.getElementById('postponeForm');
  if (postponeForm) {
    postponeForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = document.getElementById('postponeSessionId').value;
      const targetBefore = appState.tasks.find(item => item.id === id);
      if (!targetBefore) return;
      const newDateVal = (document.getElementById('postponeNewDateInput').value || '').trim();
      const newTimeEl = document.getElementById('postponeNewTimeInput');
      const newTimeVal = newTimeEl ? normalizeTimeHHMM(newTimeEl.value || '') : '';
      const reasonVal = (document.getElementById('postponeReasonInput').value || '').trim();
      if (!newDateVal) {
        showToast('اختر التاريخ الجديد للجلسة أولاً');
        return;
      }
      const prevDate = targetBefore.sessionDate || targetBefore.due || 'غير محدد';
      if (newDateVal === prevDate) {
        showToast('التاريخ الجديد مطابق للتاريخ الحالي، اختر تاريخ التأجيل الجديد');
        return;
      }
      const commitMsg = 'تأجيل جلسة ' + targetBefore.clientName + ' من ' + prevDate + ' إلى ' + newDateVal;
      pushUndoState(commitMsg);

      const s = appState.tasks.find(item => item.id === id);
      if (!s) return;
      if (!Array.isArray(s.history)) s.history = [];
      const nowIso = getNextMonotonicIso();
      s.history.push({
        id: generateUniqueEntityId('h'),
        fromDate: prevDate,
        toDate: newDateVal,
        note: reasonVal,
        changedAt: nowIso
      });
      s.sessionDate = newDateVal;
      s.due = newDateVal;
      s.sessionTime = newTimeVal;
      if (reasonVal) {
        s.details = s.details ? (s.details + ' | تأجيل (' + newDateVal + '): ' + reasonVal) : ('تأجيل (' + newDateVal + '): ' + reasonVal);
        s.title = s.details;
      }
      s.done = false;
      s.updatedAt = nowIso;

      document.getElementById('postponeModalBackdrop').classList.remove('open');
      await saveState(false, commitMsg, { notifyEntityId: s.id });
      renderTasks();
    });
  }

  // Edit Session Modal Listeners
  const btnCloseTaskModalEl = document.getElementById('btnCloseTaskModal');
  if (btnCloseTaskModalEl) btnCloseTaskModalEl.addEventListener('click', () => {
    const modal = document.getElementById('taskModalBackdrop');
    if (modal) modal.classList.remove('open');
  });

  const taskFormEl = document.getElementById('taskForm');
  if (taskFormEl) taskFormEl.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('taskFormId').value;
    const targetBefore = appState.tasks.find(item => item.id === id);
    if (!targetBefore) return;

    const selClientId = document.getElementById('taskFormClient').value;
    let typedName = (document.getElementById('taskFormClientName').value || '').trim();
    const clientObj = selClientId ? appState.clients.find(c => c.id === selClientId) : appState.clients.find(c => c.name === typedName);
    if (clientObj && !typedName) typedName = clientObj.name;
    if (!typedName) {
      showToast('اكتب اسم الممول أولاً');
      return;
    }

    const newAppealNum = (document.getElementById('taskFormAppealNum').value || '').trim();
    const newDate = (document.getElementById('taskFormDue').value || '').trim();
    const newTimeEl = document.getElementById('taskFormTime');
    const newTime = newTimeEl ? normalizeTimeHHMM(newTimeEl.value || '') : '';
    const newDetails = (document.getElementById('taskFormTitle').value || '').trim();

    const editMsg = 'تعديل جلسة: ' + typedName;
    pushUndoState(editMsg);

    const s = appState.tasks.find(item => item.id === id);
    if (!s) return;
    s.clientId = clientObj ? clientObj.id : selClientId;
    s.clientName = typedName;
    s.appealNum = newAppealNum;
    s.sessionDate = newDate;
    s.due = newDate;
    s.sessionTime = newTime;
    s.details = newDetails;
    s.title = newDetails || ('جلسة طعن ' + (newAppealNum || typedName));
    s.updatedAt = getNextMonotonicIso();

    await saveState(false, editMsg, { notifyEntityId: s.id });
    renderTasks();
    document.getElementById('taskModalBackdrop').classList.remove('open');
  });

  // =========================================================================
  // CALCULATORS LISTENERS
  // =========================================================================
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
  ['inspTaxYear', 'inspMonthFrom', 'inspMonthTo', 'inspNoExemption', 'inspInputMethod', 'inspEntityType', 'inspDailyRev', 'inspWorkDays', 'inspTurnover', 'inspProfitMargin', 'inspReturnTax', 'inspWhtPaid'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', runInspectionCalculator);
      el.addEventListener('change', runInspectionCalculator);
    }
  });
  const btnPresetAudio1El = document.getElementById('btnPresetAudio1');
  if (btnPresetAudio1El) btnPresetAudio1El.addEventListener('click', () => {
    document.getElementById('inspInputMethod').value = 'DIRECT';
    document.getElementById('inspTurnover').value = '4561230';
    document.getElementById('inspProfitMargin').value = '20';
    document.getElementById('inspReturnTax').value = '';
    initCalcYearMonthOptions();
    runInspectionCalculator();
  });
  const btnPresetAudio2El = document.getElementById('btnPresetAudio2');
  if (btnPresetAudio2El) btnPresetAudio2El.addEventListener('click', () => {
    document.getElementById('inspInputMethod').value = 'DIRECT';
    document.getElementById('inspTurnover').value = '4561230';
    document.getElementById('inspProfitMargin').value = '5';
    document.getElementById('inspReturnTax').value = '';
    runInspectionCalculator();
  });
  const btnResetInsp = document.getElementById('btnResetInspCalc');
  if (btnResetInsp) btnResetInsp.addEventListener('click', resetInspectionCalculator);
  const btnPresetAudio3El = document.getElementById('btnPresetAudio3');
  if (btnPresetAudio3El) btnPresetAudio3El.addEventListener('click', () => {
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
  ['penTaxAmount', 'penDelayMonths', 'penCbeRate', 'penReturnTax', 'penStage'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', runPenaltyCalculator);
      el.addEventListener('change', runPenaltyCalculator);
    }
  });
  document.querySelectorAll('#view-calc input[type="number"]').forEach(inp => {
    inp.addEventListener('focus', () => {
      if (inp.value === '0') {
        inp.value = '';
      }
    });
  });

  // Invoice Calculator Presets & Reset
  const btnPresetInv1 = document.getElementById('btnPresetInv1');
  if (btnPresetInv1) btnPresetInv1.addEventListener('click', () => {
    document.getElementById('invNetAmount').value = '100000';
    document.getElementById('invVatRate').value = '14';
    document.getElementById('invWhtRate').value = '1';
    document.getElementById('invRole').value = 'BUYER';
    runInvoiceCalculator();
  });
  const btnPresetInv2 = document.getElementById('btnPresetInv2');
  if (btnPresetInv2) btnPresetInv2.addEventListener('click', () => {
    document.getElementById('invNetAmount').value = '50000';
    document.getElementById('invVatRate').value = '14';
    document.getElementById('invWhtRate').value = '3';
    document.getElementById('invRole').value = 'BUYER';
    runInvoiceCalculator();
  });
  const btnPresetInv3 = document.getElementById('btnPresetInv3');
  if (btnPresetInv3) btnPresetInv3.addEventListener('click', () => {
    document.getElementById('invNetAmount').value = '20000';
    document.getElementById('invVatRate').value = '0';
    document.getElementById('invWhtRate').value = '5';
    document.getElementById('invRole').value = 'SELLER';
    runInvoiceCalculator();
  });
  const btnResetInv = document.getElementById('btnResetInvCalc');
  if (btnResetInv) btnResetInv.addEventListener('click', resetInvoiceCalculator);

  // Payroll Calculator Presets & Reset
  const btnPresetPay1 = document.getElementById('btnPresetPay1');
  if (btnPresetPay1) btnPresetPay1.addEventListener('click', () => {
    document.getElementById('payGrossMonthly').value = '10000';
    document.getElementById('payInsWage').value = '6000';
    runPayrollCalculator();
  });
  const btnPresetPay2 = document.getElementById('btnPresetPay2');
  if (btnPresetPay2) btnPresetPay2.addEventListener('click', () => {
    document.getElementById('payGrossMonthly').value = '25000';
    document.getElementById('payInsWage').value = '16700';
    runPayrollCalculator();
  });
  const btnPresetPay3 = document.getElementById('btnPresetPay3');
  if (btnPresetPay3) btnPresetPay3.addEventListener('click', () => {
    document.getElementById('payGrossMonthly').value = '4000';
    document.getElementById('payInsWage').value = '2700';
    runPayrollCalculator();
  });
  const btnResetPay = document.getElementById('btnResetPayCalc');
  if (btnResetPay) btnResetPay.addEventListener('click', resetPayrollCalculator);

  // Real Estate Calculator Presets & Reset
  const btnPresetRe1 = document.getElementById('btnPresetRe1');
  if (btnPresetRe1) btnPresetRe1.addEventListener('click', () => {
    document.getElementById('reSaleValue').value = '2000000';
    document.getElementById('reProfitMargin').value = '20';
    runRealEstateCalculator();
  });
  const btnPresetRe2 = document.getElementById('btnPresetRe2');
  if (btnPresetRe2) btnPresetRe2.addEventListener('click', () => {
    document.getElementById('reSaleValue').value = '5000000';
    document.getElementById('reProfitMargin').value = '30';
    runRealEstateCalculator();
  });
  const btnResetRe = document.getElementById('btnResetReCalc');
  if (btnResetRe) btnResetRe.addEventListener('click', resetRealEstateCalculator);

  // Penalty Calculator Presets & Reset
  const btnPresetPen1 = document.getElementById('btnPresetPen1');
  if (btnPresetPen1) btnPresetPen1.addEventListener('click', () => {
    document.getElementById('penTaxAmount').value = '100000';
    document.getElementById('penDelayMonths').value = '24';
    document.getElementById('penCbeRate').value = '20.5';
    document.getElementById('penReturnTax').value = '20000';
    document.getElementById('penStage').value = 'INTERNAL_COMMITTEE';
    runPenaltyCalculator();
  });
  const btnPresetPen2 = document.getElementById('btnPresetPen2');
  if (btnPresetPen2) btnPresetPen2.addEventListener('click', () => {
    document.getElementById('penTaxAmount').value = '50000';
    document.getElementById('penDelayMonths').value = '60';
    document.getElementById('penCbeRate').value = '20.5';
    document.getElementById('penReturnTax').value = '';
    document.getElementById('penStage').value = 'APPEAL_COMMITTEE';
    runPenaltyCalculator();
  });
  const btnPresetPen3 = document.getElementById('btnPresetPen3');
  if (btnPresetPen3) btnPresetPen3.addEventListener('click', () => {
    document.getElementById('penTaxAmount').value = '200';
    document.getElementById('penDelayMonths').value = '12';
    document.getElementById('penCbeRate').value = '20.5';
    document.getElementById('penReturnTax').value = '';
    document.getElementById('penStage').value = 'DIRECT_AGREEMENT';
    runPenaltyCalculator();
  });
  const btnResetPen = document.getElementById('btnResetPenCalc');
  if (btnResetPen) btnResetPen.addEventListener('click', resetPenaltyCalculator);

  ['memoClientSelect', 'memoTemplateType', 'memoFormNum'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('change', generateLegalMemo);
      el.addEventListener('input', generateLegalMemo);
    }
  });
  const btnCopyMemoEl = document.getElementById('btnCopyMemo');
  if (btnCopyMemoEl) btnCopyMemoEl.addEventListener('click', () => {
    const area = document.getElementById('memoOutputArea');
    if (area) copyTextToClipboard(area.value, 'تم نسخ نص المذكرة القانونية للحافظة');
  });
  const btnPrintMemo = document.getElementById('btnPrintMemo');
  if (btnPrintMemo) {
    btnPrintMemo.addEventListener('click', renderAndPrintLegalMemo);
  }
  const refSearchInputEl = document.getElementById('refSearchInput');
  if (refSearchInputEl) refSearchInputEl.addEventListener('input', renderReferenceList);
  const refCategorySelectEl = document.getElementById('refCategorySelect');
  if (refCategorySelectEl) refCategorySelectEl.addEventListener('change', renderReferenceList);
  const btnOpenBackupModalEl = document.getElementById('btnOpenBackupModal');
  if (btnOpenBackupModalEl) btnOpenBackupModalEl.addEventListener('click', () => {
    renderCheckpointsTimeline();
    const modal = document.getElementById('backupModalBackdrop');
    if (modal) modal.classList.add('open');
  });
  const btnCloseBackupModalEl = document.getElementById('btnCloseBackupModal');
  if (btnCloseBackupModalEl) btnCloseBackupModalEl.addEventListener('click', () => {
    const modal = document.getElementById('backupModalBackdrop');
    if (modal) modal.classList.remove('open');
  });
  const btnDownloadBackupFileEl = document.getElementById('btnDownloadBackupFile');
  if (btnDownloadBackupFileEl) btnDownloadBackupFileEl.addEventListener('click', downloadBackupFile);
  const btnShareBackupFileEl = document.getElementById('btnShareBackupFile');
  if (btnShareBackupFileEl) btnShareBackupFileEl.addEventListener('click', shareBackupFile);
  const btnCopyBackupJsonEl = document.getElementById('btnCopyBackupJson');
  if (btnCopyBackupJsonEl) btnCopyBackupJsonEl.addEventListener('click', () => {
    copyTextToClipboard(getBackupPayloadString(), 'تم نسخ كود النسخة الاحتياطية بالكامل');
  });
  const restoreFileInputEl = document.getElementById('restoreFileInput');
  if (restoreFileInputEl) restoreFileInputEl.addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(evt) {
      const content = evt.target.result;
      const ta = document.getElementById('restoreJsonTextarea');
      if (ta) ta.value = content;
      previewRestoreJson(content);
    };
    reader.readAsText(file, 'UTF-8');
  });
  const restoreJsonTextareaEl = document.getElementById('restoreJsonTextarea');
  if (restoreJsonTextareaEl) restoreJsonTextareaEl.addEventListener('input', (e) => {
    previewRestoreJson(e.target.value);
  });
  const btnExecuteRestoreEl = document.getElementById('btnExecuteRestore');
  if (btnExecuteRestoreEl) btnExecuteRestoreEl.addEventListener('click', executeRestore);
  const btnResetToDefaultDataEl = document.getElementById('btnResetToDefaultData');
  if (btnResetToDefaultDataEl) btnResetToDefaultDataEl.addEventListener('click', async () => {
    pushUndoState('استعادة البيانات المعتمدة للـ 21 ممولاً');
    const resetIso = getNextMonotonicIso();
    appState.clients = JSON.parse(JSON.stringify(DEFAULT_CLIENTS)).map(c => {
      c.updatedAt = resetIso;
      return c;
    });
    appState.tasks = [];
    appState.deletedIds = { clients: {}, tasks: {} };
    appState.customLists = { categories: [], statuses: [], taskTypes: [] };
    normalizeAllClientsDates();
    syncCustomDropdowns();
    await saveState(true, 'استعادة البيانات المعتمدة للـ 21 ممولاً', { forceReplaceCloud: true });
    renderClients();
    renderTasks();
    document.getElementById('backupModalBackdrop').classList.remove('open');
    showToast('تمت استعادة قائمة الـ 21 ممولاً المعتمدة بنجاح', { canUndo: true });
  });

  // Cloud Sync Event Listeners (Online/Offline/Focus + 25s Smart Polling + Notification Check)
  window.addEventListener('online', () => {
    if (isPendingSync()) {
      syncToSupabase('مزامنة تلقائية للتعديلات المعلقة بعد عودة الإنترنت');
    } else {
      pullFromSupabase(false);
    }
    if (!isAppLocked()) {
      initSupabaseRealtimeSocket();
      evaluateAndFireScheduledNotifications(false);
    }
  });
  window.addEventListener('offline', () => {
    updateStorageStatusBadge('OFFLINE');
  });
  window.addEventListener('focus', () => {
    updateNotificationUiBar();
    if (isAppUnlocked()) {
      if (navigator.onLine !== false) pullFromSupabase(false);
      evaluateAndFireScheduledNotifications(false);
    }
  });
  setInterval(() => {
    if (isAppUnlocked()) {
      if (navigator.onLine !== false) {
        pullFromSupabase(false);
      }
      evaluateAndFireScheduledNotifications(false);
    }
  }, 25000);

  let deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    const installBtn = document.getElementById('btnInstallPwa');
    if (installBtn) installBtn.style.display = 'inline-flex';
  });
  const btnInstallPwaEl = document.getElementById('btnInstallPwa');
  if (btnInstallPwaEl) btnInstallPwaEl.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    btnInstallPwaEl.style.display = 'none';
  });
}
