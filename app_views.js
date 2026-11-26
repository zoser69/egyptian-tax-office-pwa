'use strict';

function syncCustomDropdowns() {
  ensureCustomListsShape();
  const allCategories = BASE_CATEGORIES.concat(appState.customLists.categories.filter(x => BASE_CATEGORIES.indexOf(x) === -1));
  const allStatuses = BASE_STATUSES.concat(appState.customLists.statuses.filter(x => BASE_STATUSES.indexOf(x) === -1));

  // 1. clientCategoryFilter
  const catFilterEl = document.getElementById('clientCategoryFilter');
  if (catFilterEl) {
    const prev = catFilterEl.value || 'ALL';
    catFilterEl.innerHTML = '<option value="ALL">كل الأقسام</option>' +
      allCategories.map(c => '<option value="' + escapeHtml(c) + '">' + escapeHtml(c) + '</option>').join('');
    catFilterEl.value = (prev === 'ALL' || allCategories.indexOf(prev) !== -1) ? prev : 'ALL';
  }
  // 2. clientStatusFilter
  const statusFilterEl = document.getElementById('clientStatusFilter');
  if (statusFilterEl) {
    const prev = statusFilterEl.value || 'ALL';
    statusFilterEl.innerHTML = '<option value="ALL">كل الحالات</option>' +
      allStatuses.map(s => '<option value="' + escapeHtml(s) + '">' + escapeHtml(s) + '</option>').join('');
    statusFilterEl.value = (prev === 'ALL' || allStatuses.indexOf(prev) !== -1) ? prev : 'ALL';
  }
  // 3. clientFormCategory
  const formCatEl = document.getElementById('clientFormCategory');
  if (formCatEl) {
    const prev = formCatEl.value;
    formCatEl.innerHTML = allCategories.map(c => '<option value="' + escapeHtml(c) + '">' + escapeHtml(c) + '</option>').join('') +
      '<option value="__ADD_CUSTOM__">+ إضافة قيمة جديدة...</option>';
    if (prev && prev !== '__ADD_CUSTOM__' && allCategories.indexOf(prev) !== -1) {
      formCatEl.value = prev;
    } else {
      formCatEl.value = allCategories[0];
    }
  }
  // 4. clientFormStatus
  const formStatusEl = document.getElementById('clientFormStatus');
  if (formStatusEl) {
    const prev = formStatusEl.value;
    formStatusEl.innerHTML = allStatuses.map(s => '<option value="' + escapeHtml(s) + '">' + escapeHtml(s) + '</option>').join('') +
      '<option value="__ADD_CUSTOM__">+ إضافة قيمة جديدة...</option>';
    if (prev && prev !== '__ADD_CUSTOM__' && allStatuses.indexOf(prev) !== -1) {
      formStatusEl.value = prev;
    } else {
      formStatusEl.value = allStatuses[0];
    }
  }
}

function openCustomValueAdder(selectId) {
  const box = document.getElementById('customAdder_' + selectId);
  if (!box) return;
  box.style.display = 'flex';
  const inp = box.querySelector('.custom-adder-input');
  if (inp) {
    inp.value = '';
    setTimeout(() => inp.focus(), 20);
  }
}

function closeCustomValueAdder(selectId) {
  const box = document.getElementById('customAdder_' + selectId);
  if (box) box.style.display = 'none';
  const selectEl = document.getElementById(selectId);
  if (selectEl && selectEl.value === '__ADD_CUSTOM__') {
    selectEl.selectedIndex = 0;
  }
}

function resolveSelectOrPendingCustomValue(selectId, listKey, fallbackVal) {
  ensureCustomListsShape();
  const box = document.getElementById('customAdder_' + selectId);
  const selectEl = document.getElementById(selectId);
  if (box && box.style.display !== 'none') {
    const inp = box.querySelector('.custom-adder-input');
    const typed = (inp ? inp.value : '').trim();
    if (typed) {
      if (appState.customLists[listKey].indexOf(typed) === -1) {
        appState.customLists[listKey].push(typed);
      }
      syncCustomDropdowns();
      if (selectEl) selectEl.value = typed;
      box.style.display = 'none';
      return typed;
    }
  }
  let val = selectEl ? selectEl.value : fallbackVal;
  if (!val || val === '__ADD_CUSTOM__') return fallbackVal;
  return val;
}

async function saveCustomValueFromAdder(listKey, selectId) {
  const box = document.getElementById('customAdder_' + selectId);
  if (!box) return;
  const inp = box.querySelector('.custom-adder-input');
  const val = (inp ? inp.value : '').trim();
  if (!val) {
    showToast('اكتب القيمة الجديدة أولاً');
    return;
  }
  pushUndoState('إضافة تصنيف: ' + val);
  ensureCustomListsShape();
  const targetList = appState.customLists[listKey];
  if (Array.isArray(targetList) && targetList.indexOf(val) === -1) {
    targetList.push(val);
  }
  syncCustomDropdowns();
  const selectEl = document.getElementById(selectId);
  if (selectEl) {
    selectEl.value = val;
  }
  box.style.display = 'none';
  await saveState(true, 'إضافة تصنيف مخصص: ' + val);
  renderClients();
  renderTasks();
  showToast('تمت إضافة «' + val + '» للقوائم بنجاح', { canUndo: true });
}

function getSingleDateBadgeHtml(dateEntry) {
  if (!dateEntry || (!dateEntry.date && !dateEntry.label)) return '';
  const labelStr = escapeHtml(dateEntry.label || 'تاريخ ملف');
  const dateStr = escapeHtml(dateEntry.date || '');
  const timeStr = dateEntry.time ? (' · ' + escapeHtml(formatArabicTime12h(dateEntry.time))) : '';
  if (!dateEntry.date) {
    return '<span class="tag-inline">' + labelStr + '</span>';
  }
  if (dateEntry.hasAppeal30) {
    const deadlineFormatted = addLocalDaysToIso(dateEntry.date, 30);
    if (deadlineFormatted) {
      const diffDays = computeDaysDiffFromToday(deadlineFormatted);
      if (diffDays < 0) {
        return '<span class="tag-inline urgent">' + labelStr + ' (<span class="num-tabular">' + dateStr + timeStr + '</span>) · انتهت مهلة الـ 30 يوم (<span class="num-tabular">' + deadlineFormatted + '</span>)</span>';
      } else if (diffDays <= 10) {
        return '<span class="tag-inline urgent">' + labelStr + ' (<span class="num-tabular">' + dateStr + timeStr + '</span>) · متبقي للطعن ' + diffDays + ' يوم (آخره <span class="num-tabular">' + deadlineFormatted + '</span>)</span>';
      }
      return '<span class="tag-inline brass">' + labelStr + ' (<span class="num-tabular">' + dateStr + timeStr + '</span>) · مهلة 30 يوم: متبقي ' + diffDays + ' يوم (آخره <span class="num-tabular">' + deadlineFormatted + '</span>)</span>';
    }
  }
  return '<span class="tag-inline">' + labelStr + ': <span class="num-tabular">' + dateStr + timeStr + '</span></span>';
}

function getClientDatesBadgesHtml(client) {
  const dates = normalizeClientDates(client);
  if (!dates || dates.length === 0) return '';
  return dates.map(d => getSingleDateBadgeHtml(d)).filter(Boolean).join('');
}

function createClientDateRowElement(dateObj) {
  const item = dateObj || { id: 'd_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), label: '', date: '', time: '', hasAppeal30: false };
  const row = document.createElement('div');
  row.className = 'client-date-row';
  row.setAttribute('data-date-id', item.id || ('d_' + Date.now()));
  row.innerHTML =
    '<input type="text" class="input-field date-row-label" list="clientDateLabelsList" aria-label="مسمى التاريخ أو الميعاد" placeholder="المسمى (مثال: استلام نموذج 19 / جلسة لجنة...)" value="' + escapeHtml(item.label || '') + '">' +
    '<input type="date" dir="ltr" class="input-field date-row-value" aria-label="التاريخ" value="' + escapeHtml(item.date || '') + '">' +
    '<input type="time" dir="ltr" class="input-field date-row-time" aria-label="وقت الإشعار" title="وقت الإشعار (اختياري - الافتراضي 12:00 منتصف الليل)" value="' + escapeHtml(item.time || '') + '">' +
    '<label class="checkbox-inline-label" title="حساب مهلة الطعن 30 يوماً تلقائياً">' +
      '<input type="checkbox" class="date-row-appeal30" aria-label="حساب مهلة الطعن 30 يوماً"' + (item.hasAppeal30 ? ' checked' : '') + '>' +
      '<span>مهلة 30 يوم</span>' +
    '</label>' +
    '<button type="button" class="btn btn-danger btn-remove-date-row" title="حذف التاريخ" aria-label="حذف التاريخ">&times;</button>';
  row.querySelector('.btn-remove-date-row').addEventListener('click', () => {
    row.remove();
  });
  return row;
}

function renderClientDateRowsInModal(datesArray) {
  const container = document.getElementById('clientDatesContainer');
  if (!container) return;
  container.innerHTML = '';
  const list = (Array.isArray(datesArray) && datesArray.length > 0)
    ? datesArray
    : [{ id: 'd_1', label: '', date: '', hasAppeal30: true }];
  list.forEach(d => {
    container.appendChild(createClientDateRowElement(d));
  });
}

function collectClientDatesFromModal() {
  const container = document.getElementById('clientDatesContainer');
  if (!container) return [];
  const rows = Array.from(container.querySelectorAll('.client-date-row'));
  const collected = [];
  rows.forEach((row, idx) => {
    const id = row.getAttribute('data-date-id') || ('d_' + (idx + 1));
    const label = (row.querySelector('.date-row-label').value || '').trim();
    const date = (row.querySelector('.date-row-value').value || '').trim();
    const timeEl = row.querySelector('.date-row-time');
    const time = timeEl ? normalizeTimeHHMM(timeEl.value || '') : '';
    const hasAppeal30 = Boolean(row.querySelector('.date-row-appeal30').checked);
    if (date || label) {
      collected.push({
        id: id,
        label: label || 'استلام نموذج 19/15',
        date: date,
        time: time,
        hasAppeal30: hasAppeal30
      });
    }
  });
  return collected;
}

function renderClients() {
  normalizeAllClientsDates();
  const container = document.getElementById('clientsListContainer');
  if (!container) return;
  const q = (document.getElementById('clientSearchInput').value || '').trim().toLowerCase();
  const catFilter = document.getElementById('clientCategoryFilter').value;
  const statusFilter = document.getElementById('clientStatusFilter').value;
  const total = appState.clients.length;
  const urgentCount = appState.clients.filter(c => c.status === 'عاجل / طعن').length;
  const reCount = appState.clients.filter(c => (c.category || '').indexOf('عقارات') !== -1).length;
  document.getElementById('statTotalClients').textContent = total;
  document.getElementById('navClientsCount').textContent = total;
  document.getElementById('statUrgentClients').textContent = urgentCount;
  document.getElementById('statRealEstateClients').textContent = reCount;
  const filtered = appState.clients.filter(c => {
    if (catFilter !== 'ALL' && c.category !== catFilter) return false;
    if (statusFilter !== 'ALL' && c.status !== statusFilter) return false;
    if (q) {
      const datesText = (c.dates || []).map(d => (d.label || '') + ' ' + (d.date || '')).join(' ');
      const hay = (c.name + ' ' + c.office + ' ' + c.activity + ' ' + c.category + ' ' + c.status + ' ' + c.problem + ' ' + c.action + ' ' + datesText).toLowerCase();
      if (hay.indexOf(q) === -1) return false;
    }
    return true;
  });
  if (filtered.length === 0) {
    container.innerHTML = '<div class="ledger-panel" style="padding:32px 20px; text-align:center; color:var(--ink-secondary);">لا توجد ملفات مطابقة للبحث الحالي. اضغط «مسح الفلتر» أو أضف ممولاً جديداً.</div>';
    populatePrintOfficeReport();
    return;
  }
  container.innerHTML = filtered.map((c) => {
    let statusClass = 'brass';
    let cardStateClass = '';
    if (c.status === 'عاجل / طعن') {
      statusClass = 'urgent';
      cardStateClass = 'status-urgent';
    } else if (c.status === 'منتهي') {
      statusClass = 'safe';
      cardStateClass = 'status-safe';
    }
    const datesBadgesHtml = getClientDatesBadgesHtml(c);
    const metaLine = [c.office, c.category].filter(Boolean).map(escapeHtml).join(' · ');
    return '<article class="client-card ' + cardStateClass + '" data-client-id="' + escapeHtml(c.id) + '">' +
      '<div class="client-card-top">' +
        '<div>' +
          '<h3 class="client-name">' +
            (c.status === 'عاجل / طعن' ? '<span class="urgent-dot" aria-hidden="true"></span>' : '') +
            '<span>' + escapeHtml(c.name) + '</span>' +
            '<span class="tag-inline ' + statusClass + '">' + escapeHtml(c.status) + '</span>' +
          '</h3>' +
          '<p class="client-sub">' + escapeHtml(c.activity) + '</p>' +
          (metaLine ? '<p class="client-meta-line">' + metaLine + '</p>' : '') +
        '</div>' +
        (datesBadgesHtml ? '<div class="client-tags">' + datesBadgesHtml + '</div>' : '') +
      '</div>' +
      '<div class="case-problem-wrap">' +
        '<p class="case-problem">' + escapeHtml(c.problem) + '</p>' +
      '</div>' +
      '<div class="case-action-box">' +
        '<p class="case-action"><span class="case-action-label">المطلوب:</span> ' + escapeHtml(c.action) + '</p>' +
      '</div>' +
      '<div class="client-card-footer">' +
        '<div class="row-actions-secondary">' +
          '<button type="button" class="btn btn-icon" data-action="edit-client" data-id="' + escapeHtml(c.id) + '" title="تعديل بيانات الممول" aria-label="تعديل بيانات الممول">' +
            '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>' +
          '</button>' +
          '<button type="button" class="btn btn-icon" data-action="client-to-task" data-id="' + escapeHtml(c.id) + '" title="إضافة جلسة لهذا الممول" aria-label="إضافة جلسة لهذا الممول">' +
            '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>' +
          '</button>' +
        '</div>' +
        '<button type="button" class="btn btn-sm btn-soft" data-action="client-to-memo" data-id="' + escapeHtml(c.id) + '">صياغة طعن/طلب</button>' +
      '</div>' +
    '</article>';
  }).join('');
  populateClientDropdowns();
  populatePrintOfficeReport();
}

function populateClientDropdowns() {
  const sessionClientSelect = document.getElementById('newSessionClientSelect');
  const sessionFormClientSelect = document.getElementById('taskFormClient');
  const datalistEl = document.getElementById('clientsNamesDatalist');
  const memoSelect = document.getElementById('memoClientSelect');

  const opts = appState.clients.map(c => '<option value="' + escapeHtml(c.id) + '">' + escapeHtml(c.name) + ' (' + escapeHtml(c.office || c.activity) + ')</option>').join('');
  if (sessionClientSelect) {
    const prev = sessionClientSelect.value;
    sessionClientSelect.innerHTML = '<option value="">اختر من قائمة الممولين أو اكتب الاسم...</option>' + opts;
    if (prev && appState.clients.some(c => c.id === prev)) sessionClientSelect.value = prev;
  }
  if (sessionFormClientSelect) {
    const prev = sessionFormClientSelect.value;
    sessionFormClientSelect.innerHTML = '<option value="">اختر من قائمة الممولين أو اكتب الاسم...</option>' + opts;
    if (prev && appState.clients.some(c => c.id === prev)) sessionFormClientSelect.value = prev;
  }
  if (datalistEl) {
    datalistEl.innerHTML = appState.clients.map(c => '<option value="' + escapeHtml(c.name) + '"></option>').join('');
  }
  if (memoSelect) {
    const currentVal = memoSelect.value;
    memoSelect.innerHTML = appState.clients.map(c => '<option value="' + escapeHtml(c.id) + '">' + escapeHtml(c.name) + ' (' + escapeHtml(c.activity) + ')</option>').join('');
    if (currentVal && appState.clients.some(c => c.id === currentVal)) {
      memoSelect.value = currentVal;
    }
    generateLegalMemo();
  }
}

function getSessionTimingBadgeHtml(session) {
  if (!session || !session.sessionDate) return '<span class="tag-inline">بدون تاريخ</span>';
  const timeSuffix = session.sessionTime ? (' · ' + escapeHtml(formatArabicTime12h(session.sessionTime))) : '';
  if (session.done) {
    return '<span class="tag-inline safe">جلسة منتهية (<span class="num-tabular">' + escapeHtml(session.sessionDate) + timeSuffix + '</span>)</span>';
  }
  const diff = computeDaysDiffFromToday(session.sessionDate);
  if (diff === null) {
    return '<span class="tag-inline"><span class="num-tabular">' + escapeHtml(session.sessionDate) + timeSuffix + '</span></span>';
  }
  if (diff === 0) {
    return '<span class="tag-inline urgent">جلسة اليوم (<span class="num-tabular">' + escapeHtml(session.sessionDate) + timeSuffix + '</span>)</span>';
  } else if (diff === 1) {
    return '<span class="tag-inline urgent">جلسة غداً (<span class="num-tabular">' + escapeHtml(session.sessionDate) + timeSuffix + '</span>)</span>';
  } else if (diff > 1 && diff <= 7) {
    return '<span class="tag-inline brass">خلال ' + diff + ' أيام (<span class="num-tabular">' + escapeHtml(session.sessionDate) + timeSuffix + '</span>)</span>';
  } else if (diff < 0) {
    return '<span class="tag-inline urgent">فات موعدها منذ ' + Math.abs(diff) + ' يوم (<span class="num-tabular">' + escapeHtml(session.sessionDate) + timeSuffix + '</span>) · تحتاج تأجيل أو إنهاء</span>';
  }
  return '<span class="tag-inline safe">جلسة قادمة: <span class="num-tabular">' + escapeHtml(session.sessionDate) + timeSuffix + '</span> (بعد ' + diff + ' يوم)</span>';
}

function renderSessionPostponementTimelineHtml(history) {
  if (!Array.isArray(history) || history.length === 0) return '';
  const itemsHtml = history.map((h, idx) => {
    const stepNum = idx + 1;
    const fromStr = escapeHtml(h.fromDate || 'غير محدد');
    const toStr = escapeHtml(h.toDate || 'غير محدد');
    const noteStr = h.note ? (' — <span class="postpone-note">' + escapeHtml(h.note) + '</span>') : '';
    return '<div class="postpone-history-item">' +
      '<span class="postpone-step-badge">تأجيل ' + stepNum + '</span>' +
      '<span>التاريخ السابق: <strong class="num-tabular postpone-old-date">' + fromStr + '</strong></span>' +
      '<span class="postpone-arrow">&larr;</span>' +
      '<span>تأجلت إلى: <strong class="num-tabular postpone-new-date">' + toStr + '</strong></span>' +
      noteStr +
    '</div>';
  }).join('');

  const lastEntry = history[history.length - 1];
  return '<div class="session-history-box">' +
    '<div class="session-history-header">' +
      '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>' +
      '<span>سجل التأجيلات (' + history.length + ' مرة) · آخر تاريخ سابق: <strong class="num-tabular">' + escapeHtml(lastEntry.fromDate || '-') + '</strong></span>' +
    '</div>' +
    '<div class="session-history-list">' + itemsHtml + '</div>' +
  '</div>';
}

function renderTasks() {
  normalizeAllClientsDates();
  const container = document.getElementById('tasksListContainer');
  if (!container) return;

  const sessions = Array.isArray(appState.tasks) ? appState.tasks : [];
  const openCount = sessions.filter(s => !s.done).length;
  const postponedCount = sessions.filter(s => !s.done && Array.isArray(s.history) && s.history.length > 0).length;
  const doneCount = sessions.filter(s => s.done).length;

  const statOpenEl = document.getElementById('statOpenTasks');
  const navCountEl = document.getElementById('navTasksCount');
  const statPostponedEl = document.getElementById('statHighPriorityTasks');
  const statDoneEl = document.getElementById('statCompletedTasks');

  if (statOpenEl) statOpenEl.textContent = openCount;
  if (navCountEl) navCountEl.textContent = openCount;
  if (statPostponedEl) statPostponedEl.textContent = postponedCount;
  if (statDoneEl) statDoneEl.textContent = doneCount;

  const qInput = document.getElementById('sessionSearchInput');
  const q = (qInput ? qInput.value : '').trim().toLowerCase();

  const filtered = sessions
    .filter(s => {
      if (appState.taskFilter === 'OPEN') return !s.done;
      if (appState.taskFilter === 'URGENT' || appState.taskFilter === 'POSTPONED') {
        return !s.done && Array.isArray(s.history) && s.history.length > 0;
      }
      if (appState.taskFilter === 'DONE') return s.done;
      return true;
    })
    .filter(s => {
      if (!q) return true;
      const histDates = (s.history || []).map(h => (h.fromDate || '') + ' ' + (h.toDate || '') + ' ' + (h.note || '')).join(' ');
      const hay = ((s.clientName || '') + ' ' + (s.appealNum || '') + ' ' + (s.sessionDate || '') + ' ' + (s.details || '') + ' ' + histDates).toLowerCase();
      return hay.indexOf(q) !== -1;
    })
    .sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      return String(a.sessionDate || '9999-99-99').localeCompare(String(b.sessionDate || '9999-99-99'));
    });

  if (filtered.length === 0) {
    container.innerHTML = '<div style="padding:32px 20px; text-align:center; color:var(--ink-secondary);">لا توجد جلسات مسجلة في هذا التصنيف حالياً. أضف جلسة جديدة من النموذج بالأعلى لتفعيل المتابعة والتنبيهات.</div>';
    populatePrintOfficeReport();
    return;
  }

  container.innerHTML = filtered.map((s) => {
    const timingBadge = getSessionTimingBadgeHtml(s);
    const appealBadge = s.appealNum
      ? '<span class="tag-inline appeal-num-badge">طعن رقم: <strong class="num-tabular">' + escapeHtml(s.appealNum) + '</strong></span>'
      : '';
    const historyHtml = renderSessionPostponementTimelineHtml(s.history);

    return '<div class="task-row session-card-row ' + (s.done ? 'done' : '') + '" data-session-id="' + escapeHtml(s.id) + '">' +
      '<div class="task-main">' +
        '<button type="button" class="task-check-btn" data-action="toggle-task" data-id="' + escapeHtml(s.id) + '" title="' + (s.done ? 'إعادة فتح الجلسة' : 'تحديد الجلسة كمنتهية') + '" aria-label="تغيير حالة الجلسة">' +
          (s.done
            ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>'
            : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" opacity="0.45"><rect x="3" y="3" width="18" height="18" rx="4"/></svg>') +
        '</button>' +
        '<div class="session-content-col">' +
          '<div class="session-header-line">' +
            '<h3 class="task-title session-client-title">' + escapeHtml(s.clientName) + '</h3>' +
            appealBadge +
            timingBadge +
          '</div>' +
          (s.details ? '<p class="session-details-text">' + escapeHtml(s.details) + '</p>' : '') +
          historyHtml +
        '</div>' +
      '</div>' +
      '<div class="session-actions-col">' +
        '<button type="button" class="btn btn-sm btn-soft" data-action="postpone-task" data-id="' + escapeHtml(s.id) + '" title="تأجيل الجلسة لتاريخ جديد مع حفظ التاريخ السابق">' +
          '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="M12 14l4 4m0-4l-4 4"/></svg>' +
          '<span>تأجيل الجلسة</span>' +
        '</button>' +
        '<div class="row-actions-secondary">' +
          '<button type="button" class="btn btn-icon" data-action="edit-task" data-id="' + escapeHtml(s.id) + '" title="تعديل بيانات الجلسة" aria-label="تعديل بيانات الجلسة">' +
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>' +
          '</button>' +
          '<button type="button" class="btn btn-icon btn-danger" data-action="delete-task" data-id="' + escapeHtml(s.id) + '" title="حذف الجلسة" aria-label="حذف الجلسة">' +
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>' +
          '</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  }).join('');

  populatePrintOfficeReport();
}

function populatePrintOfficeReport() {
  normalizeAllClientsDates();
  const container = document.getElementById('printReportContainer');
  if (!container) return;
  const activeClients = appState.clients.filter(c => c.status !== 'منتهي');
  const openSessions = (appState.tasks || []).filter(t => !t.done);
  const now = new Date();
  const dateFormatted = now.toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' });
  const timeFormatted = now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
  const clientRowsHtml = activeClients.length === 0
    ? '<tr><td colspan="6" style="text-align:center;">لا توجد ملفات ممولين نشطة حالياً.</td></tr>'
    : activeClients.map((c, i) => {
        const datesListHtml = (c.dates && c.dates.length > 0)
          ? '<ul class="print-date-list">' + c.dates.map(d => '<li>• ' + escapeHtml(d.label) + ': <span class="num-tabular">' + escapeHtml(d.date || '-') + '</span></li>').join('') + '</ul>'
          : '';
        return '<tr>' +
          '<td class="num-tabular" style="width:28px; text-align:center; font-weight:700;">' + (i + 1) + '</td>' +
          '<td style="width:18%;"><strong>' + escapeHtml(c.name) + '</strong><br><span style="font-size:8.5pt;">' + escapeHtml(c.activity) + '</span></td>' +
          '<td style="width:15%;">' + escapeHtml(c.office || '-') + '<br><span style="font-size:8.5pt;">' + escapeHtml(c.category || '') + '</span></td>' +
          '<td style="width:16%;"><strong>' + escapeHtml(c.status) + '</strong>' + datesListHtml + '</td>' +
          '<td style="width:29%;">' + escapeHtml(c.problem) + '</td>' +
          '<td style="width:18%; font-weight:700;">' + escapeHtml(c.action) + '</td>' +
        '</tr>';
      }).join('');

  const sessionRowsHtml = openSessions.length === 0
    ? '<tr><td colspan="5" style="text-align:center;">لا توجد جلسات جارية غير منتهية حالياً.</td></tr>'
    : openSessions.map((s, i) => {
        const prevDatesStr = (Array.isArray(s.history) && s.history.length > 0)
          ? s.history.map(h => h.fromDate).filter(Boolean).join(' ثم ')
          : 'أول جلسة';
        return '<tr>' +
          '<td class="num-tabular" style="width:28px; text-align:center; font-weight:700;">' + (i + 1) + '</td>' +
          '<td style="width:24%;"><strong>' + escapeHtml(s.clientName || '-') + '</strong></td>' +
          '<td class="num-tabular" style="width:16%; font-weight:700;">' + escapeHtml(s.appealNum || '-') + '</td>' +
          '<td style="width:22%;"><strong class="num-tabular">' + escapeHtml(s.sessionDate || '-') + '</strong><br><span style="font-size:8pt;">السابق: ' + escapeHtml(prevDatesStr) + '</span></td>' +
          '<td style="width:34%;">' + escapeHtml(s.details || '-') + '</td>' +
        '</tr>';
      }).join('');

  container.innerHTML =
    '<div class="print-doc-header">' +
      '<div>' +
        '<h1 class="print-doc-title">دفتر المكتب الضريبي - بيان الملفات والجلسات الجارية</h1>' +
        '<p class="print-doc-subtitle">تقرير متابعة الملفات النشطة وجدول جلسات الطعون واللجان</p>' +
      '</div>' +
      '<div class="print-doc-meta">' +
        '<div>تاريخ الطباعة: ' + escapeHtml(dateFormatted) + ' - ' + escapeHtml(timeFormatted) + '</div>' +
        '<div>ملفات نشطة: (' + activeClients.length + ') | جلسات جارية: (' + openSessions.length + ')</div>' +
      '</div>' +
    '</div>' +
    '<h2 class="print-section-heading">أولاً: ملفات الممولين النشطة (' + activeClients.length + ' ملف)</h2>' +
    '<table class="print-table">' +
      '<thead>' +
        '<tr>' +
          '<th>م</th>' +
          '<th>اسم الممول والنشاط</th>' +
          '<th>المأمورية والقسم</th>' +
          '<th>الحالة والتواريخ</th>' +
          '<th>تفاصيل المشكلة</th>' +
          '<th>الإجراء المطلوب</th>' +
        '</tr>' +
      '</thead>' +
      '<tbody>' + clientRowsHtml + '</tbody>' +
    '</table>' +
    '<h2 class="print-section-heading">ثانياً: جدول الجلسات والطعون الجارية (' + openSessions.length + ' جلسة)</h2>' +
    '<table class="print-table">' +
      '<thead>' +
        '<tr>' +
          '<th>م</th>' +
          '<th>اسم الممول</th>' +
          '<th>رقم الطعن</th>' +
          '<th>تاريخ الجلسة والتأجيلات</th>' +
          '<th>التفاصيل والقرارات</th>' +
        '</tr>' +
      '</thead>' +
      '<tbody>' + sessionRowsHtml + '</tbody>' +
    '</table>';
}

let currentPrintMode = 'REPORT';
function renderAndPrintOfficeReport() {
  currentPrintMode = 'REPORT';
  populatePrintOfficeReport();
  window.print();
}

function populatePrintLegalMemo() {
  const container = document.getElementById('printReportContainer');
  if (!container) return;
  const clientId = document.getElementById('memoClientSelect') ? document.getElementById('memoClientSelect').value : '';
  const client = appState.clients.find(c => c.id === clientId) || appState.clients[0] || { name: 'الممول', office: 'مأمورية الضرائب المختصة', activity: '' };
  const typeSelect = document.getElementById('memoTemplateType');
  const typeVal = typeSelect ? typeSelect.value : 'APPEAL_19';
  const formNumVal = (document.getElementById('memoFormNum') ? document.getElementById('memoFormNum').value : '').trim() || 'مقيد بالملف';
  const memoArea = document.getElementById('memoOutputArea');
  if (memoArea && !memoArea.value.trim()) {
    generateLegalMemo();
  }
  const memoText = memoArea ? memoArea.value : '';
  const memoTitlesMap = {
    'APPEAL_19': 'صحيفة طعن قانوني على نموذج (19 ضرائب دخل) - المادة 54 من القانون 206 لسنة 2020',
    'APPEAL_15': 'صحيفة طعن قانوني على نموذج (15 ضريبة قيمة مضافة) - القانون 67 لسنة 2016 والقانون 206 لسنة 2020',
    'ARTICLE_3': 'طلب المحاسبة الضريبية المبسطة وتعديل الربط (المادة الثالثة ق 30/2023 وقانون التسهيلات 6/2025)',
    'TAX_POSITION': 'طلب استخراج شهادة موقف ضريبي تسلسلي وإثبات التوقف وحفظ الملف',
    'SEIZURE_APPEAL': 'مذكرة طعن ومنازعة في محضر حجز إداري وبطلان سند التنفيذ وفتح باب الطعن في أصل الربط',
    'STOP_NOTICE': 'إخطار رسمي بالتوقف عن النشاط (كلي / جزئي) وطلب رفع المحاسبة عن فترة التوقف (م 59 ق 91/2005 وم 26 ق 206/2020)',
    'PRESCRIPTION_MEMO': 'مذكرة دفاع قانونية بالدفع بسقوط الضريبة بالتقادم الخمسي (م 91 ق 91/2005 وم 377 مدني)'
  };
  const bannerTitle = memoTitlesMap[typeVal] || 'مذكرة قانونية وضريبية رسمية';
  const now = new Date();
  const dateFormatted = now.toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' });
  container.innerHTML =
    '<div class="print-memo-sheet">' +
      '<div class="print-memo-header">' +
        '<div>' +
          '<div class="print-memo-office-brand">مكتب المحاسبة والمراجعة والاستشارات الضريبية</div>' +
          '<div class="print-memo-office-sub">قسم الفحص واللجان والطعون الضريبية والمنازعات</div>' +
        '</div>' +
        '<div class="print-memo-meta-box">' +
          '<div><strong>تاريخ التحرير:</strong> ' + escapeHtml(dateFormatted) + '</div>' +
          '<div><strong>المأمورية:</strong> ' + escapeHtml(client.office || 'مأمورية الضرائب المختصة') + '</div>' +
          '<div><strong>الممول:</strong> ' + escapeHtml(client.name || '') + '</div>' +
          '<div><strong>رقم الصادر / النموذج:</strong> <span class="num-tabular">' + escapeHtml(formNumVal) + '</span></div>' +
        '</div>' +
      '</div>' +
      '<h1 class="print-memo-title-banner">' + escapeHtml(bannerTitle) + '</h1>' +
      '<div class="print-memo-body">' + escapeHtml(memoText) + '</div>' +
      '<div class="print-memo-signatures">' +
        '<div class="print-memo-sig-col">' +
          '<div>تحريراً في: ' + escapeHtml(dateFormatted) + '</div>' +
          '<div style="margin-top:6px; font-weight:500; font-size:9.5pt;">المرفقات: حافظة مستندات وصورة التوكيل / التفويض الرسمي</div>' +
        '</div>' +
        '<div class="print-memo-sig-col" style="text-align:center;">' +
          '<div>مقدمه لسيادتكم</div>' +
          '<div style="margin-top:4px;">الممول / الوكيل الرسمي بالتفويض</div>' +
          '<div style="margin-top:18px;">التوقيع: ...........................................</div>' +
        '</div>' +
      '</div>' +
    '</div>';
}

function renderAndPrintLegalMemo() {
  currentPrintMode = 'MEMO';
  populatePrintLegalMemo();
  window.print();
}

function getFocusableElements(container) {
  if (!container) return [];
  const selector = 'a[href], button:not([disabled]), input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  return Array.from(container.querySelectorAll(selector)).filter(el => {
    return el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
  });
}

function getActiveDialogElement() {
  const lockScreen = document.getElementById('authLockScreen');
  if (lockScreen && !lockScreen.classList.contains('unlocked')) {
    return lockScreen;
  }
  const modalIds = ['postponeModalBackdrop', 'taskModalBackdrop', 'backupModalBackdrop', 'clientModalBackdrop'];
  for (let i = 0; i < modalIds.length; i++) {
    const el = document.getElementById(modalIds[i]);
    if (el && el.classList.contains('open')) return el;
  }
  return null;
}

function initModalAndTabAccessibility() {
  if (typeof document === 'undefined') return;
  const modalIds = ['clientModalBackdrop', 'backupModalBackdrop', 'taskModalBackdrop', 'postponeModalBackdrop'];
  const returnFocusMap = new Map();

  function focusFirstInDialog(dialog) {
    const focusables = getFocusableElements(dialog);
    if (focusables.length > 0 && !dialog.contains(document.activeElement)) {
      setTimeout(() => focusables[0].focus(), 10);
    }
  }

  modalIds.forEach(id => {
    const modal = document.getElementById(id);
    if (!modal) return;
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.classList.remove('open');
      }
    });
    if (typeof MutationObserver !== 'undefined') {
      let wasOpen = modal.classList.contains('open');
      const obs = new MutationObserver(() => {
        const isOpen = modal.classList.contains('open');
        if (isOpen && !wasOpen) {
          if (document.activeElement && !modal.contains(document.activeElement)) {
            returnFocusMap.set(id, document.activeElement);
          }
          focusFirstInDialog(modal);
        } else if (!isOpen && wasOpen) {
          const prev = returnFocusMap.get(id);
          returnFocusMap.delete(id);
          if (prev && typeof prev.focus === 'function' && document.contains(prev)) {
            setTimeout(() => prev.focus(), 10);
          }
        }
        wasOpen = isOpen;
      });
      obs.observe(modal, { attributes: true, attributeFilter: ['class'] });
    }
  });

  const lockScreen = document.getElementById('authLockScreen');
  if (lockScreen && typeof MutationObserver !== 'undefined') {
    let wasUnlocked = lockScreen.classList.contains('unlocked');
    if (!wasUnlocked) {
      focusFirstInDialog(lockScreen);
    }
    const lockObs = new MutationObserver(() => {
      const isUnlocked = lockScreen.classList.contains('unlocked');
      if (!isUnlocked && wasUnlocked) {
        if (document.activeElement && !lockScreen.contains(document.activeElement)) {
          returnFocusMap.set('authLockScreen', document.activeElement);
        }
        focusFirstInDialog(lockScreen);
      } else if (isUnlocked && !wasUnlocked) {
        const prev = returnFocusMap.get('authLockScreen');
        returnFocusMap.delete('authLockScreen');
        if (prev && typeof prev.focus === 'function' && document.contains(prev)) {
          setTimeout(() => prev.focus(), 10);
        }
      }
      wasUnlocked = isUnlocked;
    });
    lockObs.observe(lockScreen, { attributes: true, attributeFilter: ['class'] });
  }

  document.addEventListener('keydown', (e) => {
    const activeDialog = getActiveDialogElement();
    if (!activeDialog) return;

    if (e.key === 'Escape' && activeDialog.id !== 'authLockScreen') {
      activeDialog.classList.remove('open');
      return;
    }

    if (e.key === 'Tab') {
      const focusables = getFocusableElements(activeDialog);
      if (focusables.length === 0) {
        e.preventDefault();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first || !activeDialog.contains(document.activeElement)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last || !activeDialog.contains(document.activeElement)) {
          e.preventDefault();
          first.focus();
        }
      }
    }
  });

  document.querySelectorAll('.calc-mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.calc-mode-btn').forEach(b => {
        b.setAttribute('aria-selected', b === btn ? 'true' : 'false');
      });
    });
  });
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initModalAndTabAccessibility);
  } else {
    initModalAndTabAccessibility();
  }
}
