'use strict';

function syncCustomDropdowns() {
  ensureCustomListsShape();
  const allCategories = BASE_CATEGORIES.concat(appState.customLists.categories.filter(x => BASE_CATEGORIES.indexOf(x) === -1));
  const allStatuses = BASE_STATUSES.concat(appState.customLists.statuses.filter(x => BASE_STATUSES.indexOf(x) === -1));
  const allTaskTypes = BASE_TASK_TYPES.concat(appState.customLists.taskTypes.filter(x => BASE_TASK_TYPES.indexOf(x) === -1));
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
  // 5. newTaskType & taskFormType
  ['newTaskType', 'taskFormType'].forEach(selectId => {
    const el = document.getElementById(selectId);
    if (!el) return;
    const prev = el.value;
    el.innerHTML = allTaskTypes.map(t => '<option value="' + escapeHtml(t) + '">' + escapeHtml(t) + '</option>').join('') +
      '<option value="__ADD_CUSTOM__">+ إضافة قيمة جديدة...</option>';
    if (prev && prev !== '__ADD_CUSTOM__' && allTaskTypes.indexOf(prev) !== -1) {
      el.value = prev;
    } else {
      el.value = allTaskTypes[0];
    }
  });
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
  if (!dateEntry.date) {
    return '<span class="tag-inline">' + labelStr + '</span>';
  }
  if (dateEntry.hasAppeal30) {
    const start = new Date(dateEntry.date + 'T00:00:00');
    if (!isNaN(start.getTime())) {
      const deadline = new Date(start.getTime() + 30 * 24 * 60 * 60 * 1000);
      const today = new Date();
      const diffDays = Math.ceil((deadline.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
      const deadlineFormatted = deadline.toISOString().slice(0, 10);
      if (diffDays < 0) {
        return '<span class="tag-inline urgent">' + labelStr + ' (<span class="num-tabular">' + dateStr + '</span>) · انتهت مهلة الـ 30 يوم (<span class="num-tabular">' + deadlineFormatted + '</span>)</span>';
      } else if (diffDays <= 10) {
        return '<span class="tag-inline urgent">' + labelStr + ' (<span class="num-tabular">' + dateStr + '</span>) · متبقي للطعن ' + diffDays + ' يوم (آخره <span class="num-tabular">' + deadlineFormatted + '</span>)</span>';
      }
      return '<span class="tag-inline brass">' + labelStr + ' (<span class="num-tabular">' + dateStr + '</span>) · مهلة 30 يوم: متبقي ' + diffDays + ' يوم (آخره <span class="num-tabular">' + deadlineFormatted + '</span>)</span>';
    }
  }
  return '<span class="tag-inline">' + labelStr + ': <span class="num-tabular">' + dateStr + '</span></span>';
}
function getClientDatesBadgesHtml(client) {
  const dates = normalizeClientDates(client);
  if (!dates || dates.length === 0) return '';
  return dates.map(d => getSingleDateBadgeHtml(d)).filter(Boolean).join('');
}
function createClientDateRowElement(dateObj) {
  const item = dateObj || { id: 'd_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), label: '', date: '', hasAppeal30: false };
  const row = document.createElement('div');
  row.className = 'client-date-row';
  row.setAttribute('data-date-id', item.id || ('d_' + Date.now()));
  row.innerHTML =
    '<input type="text" class="input-field date-row-label" list="clientDateLabelsList" placeholder="المسمى (مثال: استلام نموذج 19 / جلسة لجنة...)" value="' + escapeHtml(item.label || '') + '">' +
    '<input type="date" class="input-field date-row-value" value="' + escapeHtml(item.date || '') + '">' +
    '<label class="checkbox-inline-label" title="حساب مهلة الطعن 30 يوماً تلقائياً">' +
      '<input type="checkbox" class="date-row-appeal30"' + (item.hasAppeal30 ? ' checked' : '') + '>' +
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
    const hasAppeal30 = Boolean(row.querySelector('.date-row-appeal30').checked);
    if (date || label) {
      collected.push({
        id: id,
        label: label || 'استلام نموذج 19/15',
        date: date,
        hasAppeal30: hasAppeal30
      });
    }
  });
  return collected;
}
function renderClients() {
  normalizeAllClientsDates();
  const container = document.getElementById('clientsListContainer');
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
  container.innerHTML = filtered.map((c, idx) => {
    let statusClass = 'brass';
    let cardStateClass = '';
    if (c.status === 'عاجل / طعن') {
      statusClass = 'urgent';
      cardStateClass = 'status-urgent';
    } else if (c.status === 'منتهي') {
      statusClass = 'safe';
      cardStateClass = 'status-safe';
    }
    const delay = Math.min(idx * 20, 200);
    const datesBadgesHtml = getClientDatesBadgesHtml(c);
    const metaLine = [c.office, c.category].filter(Boolean).map(escapeHtml).join(' · ');
    return '<article class="client-card ' + cardStateClass + '" style="animation-delay:' + delay + 'ms;" data-client-id="' + escapeHtml(c.id) + '">' +
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
          '<button type="button" class="btn btn-icon" data-action="client-to-task" data-id="' + escapeHtml(c.id) + '" title="تحويل لمهمة في الأجندة" aria-label="تحويل لمهمة في الأجندة">' +
            '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>' +
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
  const taskSelect = document.getElementById('newTaskClient');
  const taskFormSelect = document.getElementById('taskFormClient');
  const memoSelect = document.getElementById('memoClientSelect');
  const opts = appState.clients.map(c => '<option value="' + escapeHtml(c.id) + '">' + escapeHtml(c.name) + ' (' + escapeHtml(c.activity) + ')</option>').join('');
  if (taskSelect) taskSelect.innerHTML = '<option value="">بدون ربط أو اختر الممول</option>' + opts;
  if (taskFormSelect) taskFormSelect.innerHTML = '<option value="">بدون ربط أو اختر الممول</option>' + opts;
  if (memoSelect) {
    const currentVal = memoSelect.value;
    memoSelect.innerHTML = opts;
    if (currentVal && appState.clients.some(c => c.id === currentVal)) {
      memoSelect.value = currentVal;
    }
    generateLegalMemo();
  }
}
function renderTasks() {
  const container = document.getElementById('tasksListContainer');
  const openCount = appState.tasks.filter(t => !t.done).length;
  const urgentCount = appState.tasks.filter(t => !t.done && t.priority === 'عاجل').length;
  const doneCount = appState.tasks.filter(t => t.done).length;
  document.getElementById('statOpenTasks').textContent = openCount;
  document.getElementById('navTasksCount').textContent = openCount;
  document.getElementById('statHighPriorityTasks').textContent = urgentCount;
  document.getElementById('statCompletedTasks').textContent = doneCount;
  const filtered = appState.tasks.filter(t => {
    if (appState.taskFilter === 'OPEN') return !t.done;
    if (appState.taskFilter === 'URGENT') return !t.done && t.priority === 'عاجل';
    if (appState.taskFilter === 'DONE') return t.done;
    return true;
  });
  if (filtered.length === 0) {
    container.innerHTML = '<div style="padding:30px 20px; text-align:center; color:var(--ink-secondary);">لا توجد مهام في هذا التصنيف حالياً.</div>';
    populatePrintOfficeReport();
    return;
  }
  container.innerHTML = filtered.map((t, idx) => {
    const delay = Math.min(idx * 20, 200);
    const metaParts = [];
    if (t.clientName) metaParts.push(escapeHtml(t.clientName));
    metaParts.push(escapeHtml(t.type || 'إجراء ضريبي'));
    if (t.due) metaParts.push('<span class="num-tabular">' + escapeHtml(t.due) + '</span>');
    return '<div class="task-row ' + (t.done ? 'done' : '') + '" style="animation-delay:' + delay + 'ms;">' +
      '<div class="task-main">' +
        '<button type="button" class="task-check-btn" data-action="toggle-task" data-id="' + escapeHtml(t.id) + '" aria-label="تغيير حالة المهمة">' +
          (t.done
            ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>'
            : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" opacity="0.4"><rect x="3" y="3" width="18" height="18" rx="4"/></svg>') +
        '</button>' +
        '<div>' +
          '<h3 class="task-title">' + escapeHtml(t.title) + '</h3>' +
          '<div class="task-meta-row">' +
            (t.priority === 'عاجل' ? '<span class="tag-inline urgent">عاجل</span>' : '') +
            '<span class="task-meta-line">' + metaParts.join(' · ') + '</span>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="row-actions-secondary">' +
        '<button type="button" class="btn btn-icon" data-action="edit-task" data-id="' + escapeHtml(t.id) + '" title="تعديل المهمة" aria-label="تعديل المهمة">' +
          '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>' +
        '</button>' +
        '<button type="button" class="btn btn-icon btn-danger" data-action="delete-task" data-id="' + escapeHtml(t.id) + '" title="حذف المهمة" aria-label="حذف المهمة">' +
          '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>' +
        '</button>' +
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
  const openTasks = appState.tasks.filter(t => !t.done);
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
  const taskRowsHtml = openTasks.length === 0
    ? '<tr><td colspan="6" style="text-align:center;">لا توجد مهام جارية غير مكتملة حالياً.</td></tr>'
    : openTasks.map((t, i) => {
        return '<tr>' +
          '<td class="num-tabular" style="width:28px; text-align:center; font-weight:700;">' + (i + 1) + '</td>' +
          '<td style="width:34%;"><strong>' + escapeHtml(t.title) + '</strong></td>' +
          '<td style="width:20%;">' + escapeHtml(t.clientName || '-') + '</td>' +
          '<td style="width:22%;">' + escapeHtml(t.type || 'إجراء ضريبي') + '</td>' +
          '<td class="num-tabular" style="width:12%;">' + escapeHtml(t.due || '-') + '</td>' +
          '<td style="width:8%; font-weight:700;">' + escapeHtml(t.priority || 'عادي') + '</td>' +
        '</tr>';
      }).join('');
  container.innerHTML =
    '<div class="print-doc-header">' +
      '<div>' +
        '<h1 class="print-doc-title">دفتر المكتب الضريبي - بيان الحالات والمهام الجارية</h1>' +
        '<p class="print-doc-subtitle">تقرير متابعة الملفات النشطة (غير المنتهية) ومهام الأجندة قيد التنفيذ</p>' +
      '</div>' +
      '<div class="print-doc-meta">' +
        '<div>تاريخ الطباعة: ' + escapeHtml(dateFormatted) + ' - ' + escapeHtml(timeFormatted) + '</div>' +
        '<div>ملفات نشطة: (' + activeClients.length + ') | مهام جارية: (' + openTasks.length + ')</div>' +
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
    '<h2 class="print-section-heading">ثانياً: المهام والإجراءات الجارية بالأجندة (' + openTasks.length + ' مهمة)</h2>' +
    '<table class="print-table">' +
      '<thead>' +
        '<tr>' +
          '<th>م</th>' +
          '<th>المهمة / الإجراء</th>' +
          '<th>الممول المرتبط</th>' +
          '<th>نوع الإجراء</th>' +
          '<th>تاريخ الاستحقاق</th>' +
          '<th>الأولوية</th>' +
        '</tr>' +
      '</thead>' +
      '<tbody>' + taskRowsHtml + '</tbody>' +
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
