(function() {
  'use strict';

  const STORAGE_KEY = 'egyptian_tax_office_companion_v2';
  const THEME_KEY = 'egyptian_tax_office_theme_v1';
  const DB_NAME = 'EgyptianTaxOfficeDB';
  const DB_STORE = 'app_state';

  let appState = {
    version: 2,
    lastSaved: new Date().toISOString(),
    clients: JSON.parse(JSON.stringify(DEFAULT_CLIENTS)),
    tasks: JSON.parse(JSON.stringify(DEFAULT_TASKS)),
    taskFilter: 'OPEN'
  };

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

  function openIdb() {
    return new Promise((resolve) => {
      if (!window.indexedDB) return resolve(null);
      const req = window.indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = function(e) {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(DB_STORE)) {
          db.createObjectStore(DB_STORE);
        }
      };
      req.onsuccess = function(e) { resolve(e.target.result); };
      req.onerror = function() { resolve(null); };
    });
  }

  async function saveState(silent) {
    appState.lastSaved = new Date().toISOString();
    const raw = JSON.stringify(appState);
    try { window.localStorage.setItem(STORAGE_KEY, raw); } catch (err) {}
    try {
      const db = await openIdb();
      if (db) {
        const tx = db.transaction(DB_STORE, 'readwrite');
        tx.objectStore(DB_STORE).put(raw, 'main');
      }
    } catch (err) {}
    updateHeaderSaveTime();
    if (!silent) showToast('تم حفظ التعديلات تلقائياً على جهازك');
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
    } else {
      await saveState(true);
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
  function showToast(msg) {
    const box = document.getElementById('toastBox');
    const txt = document.getElementById('toastMessage');
    if (!box || !txt) return;
    txt.textContent = msg;
    box.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => box.classList.remove('show'), 3200);
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

  function getAppealBadgeHtml(noticeDateStr) {
    if (!noticeDateStr) return '';
    const start = new Date(noticeDateStr + 'T00:00:00');
    if (isNaN(start.getTime())) return '';
    const deadline = new Date(start.getTime() + 30 * 24 * 60 * 60 * 1000);
    const today = new Date();
    const diffDays = Math.ceil((deadline.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
    const deadlineFormatted = deadline.toISOString().slice(0, 10);
    if (diffDays < 0) {
      return '<span class="tag-inline urgent">نموذج 19/15: انتهت مهلة الـ 30 يوم (' + deadlineFormatted + ')</span>';
    } else if (diffDays <= 10) {
      return '<span class="tag-inline urgent">متبقي للطعن ' + diffDays + ' يوم (آخره ' + deadlineFormatted + ')</span>';
    }
    return '<span class="tag-inline brass">مهلة الطعن: متبقي ' + diffDays + ' يوم (آخره ' + deadlineFormatted + ')</span>';
  }

  function renderClients() {
    const container = document.getElementById('clientsListContainer');
    const q = (document.getElementById('clientSearchInput').value || '').trim().toLowerCase();
    const catFilter = document.getElementById('clientCategoryFilter').value;
    const statusFilter = document.getElementById('clientStatusFilter').value;

    const total = appState.clients.length;
    const urgentCount = appState.clients.filter(c => c.status === 'عاجل / طعن').length;
    const reCount = appState.clients.filter(c => c.category.indexOf('عقارات') !== -1).length;

    document.getElementById('statTotalClients').textContent = total;
    document.getElementById('navClientsCount').textContent = total;
    document.getElementById('statUrgentClients').textContent = urgentCount;
    document.getElementById('statRealEstateClients').textContent = reCount;

    const filtered = appState.clients.filter(c => {
      if (catFilter !== 'ALL' && c.category !== catFilter) return false;
      if (statusFilter !== 'ALL' && c.status !== statusFilter) return false;
      if (q) {
        const hay = (c.name + ' ' + c.office + ' ' + c.activity + ' ' + c.problem + ' ' + c.action).toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });

    if (filtered.length === 0) {
      container.innerHTML = '<div class="ledger-panel" style="padding:32px 20px; text-align:center; color:var(--ink-secondary);">لا توجد ملفات مطابقة للبحث الحالي. اضغط «مسح الفلتر» أو أضف ممولاً جديداً.</div>';
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
      const isLongProblem = (c.problem || '').length > 140;
      const appealBadge = getAppealBadgeHtml(c.noticeDate);
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
          (appealBadge ? '<div class="client-tags">' + appealBadge + '</div>' : '') +
        '</div>' +
        '<div class="case-problem-wrap">' +
          '<p class="case-problem ' + (isLongProblem ? 'clamped' : '') + '">' + escapeHtml(c.problem) + '</p>' +
          (isLongProblem ? '<button type="button" class="read-more-btn" data-action="toggle-problem" data-id="' + escapeHtml(c.id) + '">عرض المزيد</button>' : '') +
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
  }

  function calcLaw91IndividualTax(netProfit) {
    if (netProfit <= 0) return 0;
    let tax = 0;
    if (netProfit <= 600000) {
      if (netProfit > 40000) tax += Math.min(netProfit - 40000, 15000) * 0.10;
      if (netProfit > 55000) tax += Math.min(netProfit - 55000, 15000) * 0.15;
      if (netProfit > 70000) tax += Math.min(netProfit - 70000, 130000) * 0.20;
      if (netProfit > 200000) tax += Math.min(netProfit - 200000, 200000) * 0.225;
      if (netProfit > 400000) tax += (netProfit - 400000) * 0.25;
    } else {
      if (netProfit <= 700000) {
        tax += Math.min(netProfit, 55000) * 0.10;
        if (netProfit > 55000) tax += Math.min(netProfit - 55000, 15000) * 0.15;
        if (netProfit > 70000) tax += Math.min(netProfit - 70000, 130000) * 0.20;
        if (netProfit > 200000) tax += Math.min(netProfit - 200000, 200000) * 0.225;
        if (netProfit > 400000) tax += (netProfit - 400000) * 0.25;
      } else if (netProfit <= 1200000) {
        tax = netProfit * 0.225;
      } else {
        tax = 1200000 * 0.25 + (netProfit - 1200000) * 0.275;
      }
    }
    return Math.round(tax);
  }

  function calcArticle3Law30Tax(turnover) {
    if (turnover <= 0) return { tax: 0, label: '0' };
    if (turnover < 250000) return { tax: 1000, label: 'أقل من 250 ألف (1,000 ج قطعية)' };
    if (turnover < 500000) return { tax: 2500, label: '250 إلى 500 ألف (2,500 ج قطعية)' };
    if (turnover < 1000000) return { tax: 5000, label: '500 ألف إلى مليون (5,000 ج قطعية)' };
    if (turnover < 2000000) return { tax: Math.round(turnover * 0.005), label: 'مليون إلى 2 مليون (0.5% من رقم الأعمال)' };
    if (turnover < 3000000) return { tax: Math.round(turnover * 0.0075), label: '2 إلى 3 مليون (0.75% من رقم الأعمال)' };
    if (turnover <= 10000000) return { tax: Math.round(turnover * 0.01), label: '3 إلى 10 مليون (1% من رقم الأعمال)' };
    return { tax: null, label: 'تجاوز 10 مليون (خارج سقف المادة 3 ق 30/2023)' };
  }

  function calcLaw6Of2025Tax(turnover) {
    if (turnover <= 0) return { tax: 0, label: '0' };
    if (turnover < 500000) return { tax: Math.round(turnover * 0.004), label: 'أقل من 500 ألف (0.4% من رقم الأعمال)' };
    if (turnover < 2000000) return { tax: Math.round(turnover * 0.005), label: '500 ألف لأقل من 2 مليون (0.5%)' };
    if (turnover < 3000000) return { tax: Math.round(turnover * 0.0075), label: '2 مليون لأقل من 3 مليون (0.75%)' };
    if (turnover <= 10000000) return { tax: Math.round(turnover * 0.01), label: '3 مليون حتى 10 مليون (1%)' };
    if (turnover <= 20000000) return { tax: Math.round(turnover * 0.015), label: 'أكثر من 10 حتى 20 مليون (1.5%)' };
    return { tax: null, label: 'تجاوز 20 مليون (خارج سقف قانون 6 لسنة 2025)' };
  }

  function runInspectionCalculator() {
    const method = document.getElementById('inspInputMethod').value;
    const entity = document.getElementById('inspEntityType').value;
    const dailyFields = document.getElementById('inspDailyFields');
    const turnoverInput = document.getElementById('inspTurnover');

    let turnover = Number(turnoverInput.value) || 0;
    if (method === 'DAILY') {
      dailyFields.style.display = 'grid';
      const daily = Number(document.getElementById('inspDailyRev').value) || 0;
      const days = Number(document.getElementById('inspWorkDays').value) || 310;
      turnover = daily * days;
      turnoverInput.value = turnover;
      turnoverInput.readOnly = true;
    } else {
      dailyFields.style.display = 'none';
      turnoverInput.readOnly = false;
    }

    const margin = Number(document.getElementById('inspProfitMargin').value) || 0;
    const returnTax = Number(document.getElementById('inspReturnTax').value) || 0;
    const whtPaid = Number(document.getElementById('inspWhtPaid').value) || 0;

    const netProfit = Math.round(turnover * (margin / 100));
    const law91Tax = entity === 'CORP' ? Math.round(netProfit * 0.225) : calcLaw91IndividualTax(netProfit);
    const art3 = calcArticle3Law30Tax(turnover);
    const law6 = calcLaw6Of2025Tax(turnover);

    const candidates = [{ name: 'قانون 91 لسنة 2005', val: law91Tax }];
    if (art3.tax !== null) candidates.push({ name: 'المادة 3 (قانون 30 لسنة 2023)', val: art3.tax });
    if (law6.tax !== null) candidates.push({ name: 'قانون 6 لسنة 2025 (التسهيلات)', val: law6.tax });

    candidates.sort((a, b) => a.val - b.val);
    const best = candidates[0];
    const highestVal = candidates[candidates.length - 1].val;
    const effectiveTax = Math.max(best.val, returnTax);
    const netPayable = Math.max(0, effectiveTax - whtPaid);
    const maxVal = Math.max(law91Tax, art3.tax || 0, law6.tax || 0, returnTax, 1);

    let trapAlertHtml = '';
    if (returnTax > best.val) {
      trapAlertHtml = '<div style="margin-top:12px; padding:12px; background:var(--status-urgent-bg); border:1px solid var(--status-urgent-border); color:var(--status-urgent); font-size:0.88rem; font-weight:700; border-radius:8px;">' +
        'تنبيه فخ الإقرار: ضريبة الإقرار المرفوعة (' + formatMoney(returnTax) + ' ج) أكبر من ضريبة ' + best.name + ' (' + formatMoney(best.val) + ' ج). المأمورية ستعتمد ضريبة الإقرار الأكبر لأن الإقرار لا رجعة فيه.' +
      '</div>';
    }

    const barClass91 = (best.name.indexOf('91') !== -1) ? 'best' : (law91Tax === highestVal && candidates.length > 1 ? 'high' : '');
    const barClassArt3 = (best.name.indexOf('المادة 3') !== -1) ? 'best' : (art3.tax === highestVal && candidates.length > 1 ? 'high' : '');

    const panel = document.getElementById('inspResultsPanel');
    panel.innerHTML =
      '<div class="result-hero">' +
        '<p class="result-headline">الاختيار الأوفر قانونياً للممول</p>' +
        '<p class="result-big"><span class="num-tabular">' + formatMoney(best.val) + '</span> ج</p>' +
        '<span class="result-subtag">' + escapeHtml(best.name) + '</span>' +
      '</div>' +
      '<dl class="dl-ledger">' +
        '<div class="dl-row"><dt class="dl-term">إجمالي رقم الأعمال السنوي</dt><dd class="dl-val num-tabular">' + formatMoney(turnover) + ' ج</dd></div>' +
        '<div class="dl-row"><dt class="dl-term">صافي الربح التقديري (' + margin + '%)</dt><dd class="dl-val num-tabular">' + formatMoney(netProfit) + ' ج</dd></div>' +
        '<div class="dl-row"><dt class="dl-term">1. الضريبة على قانون 91 لسنة 2005</dt><dd class="dl-val num-tabular">' + formatMoney(law91Tax) + ' ج</dd></div>' +
        '<div class="dl-row"><dt class="dl-term">2. الضريبة على المادة 3 (' + art3.label + ')</dt><dd class="dl-val num-tabular">' + (art3.tax !== null ? formatMoney(art3.tax) + ' ج' : 'غير خاضع') + '</dd></div>' +
        '<div class="dl-row"><dt class="dl-term">3. الضريبة على قانون 6/2025 (' + law6.label + ')</dt><dd class="dl-val num-tabular">' + (law6.tax !== null ? formatMoney(law6.tax) + ' ج' : 'غير خاضع') + '</dd></div>' +
        '<div class="dl-row"><dt class="dl-term">مبالغ مخصومة تحت حساب الضريبة (نموذج 41)</dt><dd class="dl-val num-tabular">- ' + formatMoney(whtPaid) + ' ج</dd></div>' +
        '<div class="dl-row"><dt class="dl-term" style="color:var(--ink-primary); font-weight:800;">الصافي النهائي واجب السداد</dt><dd class="dl-val num-tabular" style="color:var(--status-safe); font-size:1.1rem;">' + formatMoney(netPayable) + ' ج</dd></div>' +
      '</dl>' +
      trapAlertHtml +
      '<div class="tufte-chart">' +
        '<div class="tufte-bar-group">' +
          '<div class="tufte-bar-label"><span>قانون 91 لسنة 2005</span><span class="num-tabular">' + formatMoney(law91Tax) + ' ج</span></div>' +
          '<div class="tufte-bar-track"><div class="tufte-bar-fill ' + barClass91 + '" style="width:' + Math.min(100, Math.round((law91Tax / maxVal) * 100)) + '%"></div></div>' +
        '</div>' +
        (art3.tax !== null ? (
          '<div class="tufte-bar-group">' +
            '<div class="tufte-bar-label"><span>المادة 3 (قانون 30/2023)</span><span class="num-tabular">' + formatMoney(art3.tax) + ' ج</span></div>' +
            '<div class="tufte-bar-track"><div class="tufte-bar-fill ' + barClassArt3 + '" style="width:' + Math.min(100, Math.round((art3.tax / maxVal) * 100)) + '%"></div></div>' +
          '</div>'
        ) : '') +
      '</div>';
  }

  function runInvoiceCalculator() {
    const net = Number(document.getElementById('invNetAmount').value) || 0;
    const vatRate = Number(document.getElementById('invVatRate').value) || 0;
    const whtRate = Number(document.getElementById('invWhtRate').value) || 0;
    const role = document.getElementById('invRole').value;

    const vatAmount = Math.round(net * (vatRate / 100) * 100) / 100;
    const grossInvoice = Math.round((net + vatAmount) * 100) / 100;
    const whtAmount = Math.round(net * (whtRate / 100) * 100) / 100;
    const netCashTransfer = Math.round((grossInvoice - whtAmount) * 100) / 100;

    let journalText = '';
    if (role === 'BUYER') {
      journalText =
        'من مذكورين:\n' +
        '  ' + formatMoney(net) + ' من حـ/ المشتريات أو المصروفات (بالصافي)\n' +
        '  ' + formatMoney(vatAmount) + ' من حـ/ ضريبة القيمة المضافة | مدخلات (تُخصم في نموذج 10)\n' +
        'إلى مذكورين:\n' +
        '  ' + formatMoney(whtAmount) + ' إلى حـ/ مصلحة الضرائب | خصم وتحصيل (' + whtRate + '% تورد في نموذج 41)\n' +
        '  ' + formatMoney(netCashTransfer) + ' إلى حـ/ البنك أو الموردين (الصافي المسدد للمورد)';
    } else {
      journalText =
        'من مذكورين:\n' +
        '  ' + formatMoney(netCashTransfer) + ' من حـ/ البنك أو الخزينة (المبلغ المحصل فعلياً)\n' +
        '  ' + formatMoney(whtAmount) + ' من حـ/ ضرائب مستقطعة مننا عند المنبع (' + whtRate + '% رصيد لنا يُخصم في إقرار الدخل)\n' +
        'إلى مذكورين:\n' +
        '  ' + formatMoney(net) + ' إلى حـ/ إيرادات المبيعات / الخدمات\n' +
        '  ' + formatMoney(vatAmount) + ' إلى حـ/ ضريبة القيمة المضافة | مخرجات (تُدرج في نموذج 10)';
    }

    document.getElementById('invResultsPanel').innerHTML =
      '<div class="result-hero">' +
        '<p class="result-headline">الصافي الواجب تحويله بعد الخصم</p>' +
        '<p class="result-big"><span class="num-tabular">' + formatMoney(netCashTransfer) + '</span> ج</p>' +
      '</div>' +
      '<dl class="dl-ledger">' +
        '<div class="dl-row"><dt class="dl-term">صافي الفاتورة قبل الضريبة</dt><dd class="dl-val num-tabular">' + formatMoney(net) + ' ج</dd></div>' +
        '<div class="dl-row"><dt class="dl-term">ضريبة القيمة المضافة (' + vatRate + '%)</dt><dd class="dl-val num-tabular">+ ' + formatMoney(vatAmount) + ' ج</dd></div>' +
        '<div class="dl-row"><dt class="dl-term">إجمالي الفاتورة الإلكترونية</dt><dd class="dl-val num-tabular">' + formatMoney(grossInvoice) + ' ج</dd></div>' +
        '<div class="dl-row"><dt class="dl-term">الخصم تحت حساب الضريبة (' + whtRate + '% على الصافي)</dt><dd class="dl-val num-tabular" style="color:var(--status-urgent);">- ' + formatMoney(whtAmount) + ' ج</dd></div>' +
      '</dl>' +
      '<div style="margin-top:16px;">' +
        '<label class="field-label">قيد اليومية المحاسبي الجاهز:</label>' +
        '<pre style="background:var(--surface-muted); padding:12px; border-radius:8px; font-family:Tajawal,sans-serif; font-size:0.86rem; white-space:pre-wrap; margin:0; border:1px solid var(--border-subtle);">' + escapeHtml(journalText) + '</pre>' +
      '</div>';
  }

  function runPayrollCalculator() {
    const gross = Number(document.getElementById('payGrossMonthly').value) || 0;
    let insWage = Number(document.getElementById('payInsWage').value) || 0;
    if (insWage > 16700) insWage = 16700;
    if (insWage > 0 && insWage < 2700) insWage = 2700;

    const empInsMonthly = Math.round(insWage * 0.11 * 100) / 100;
    const compInsMonthly = Math.round(insWage * 0.1875 * 100) / 100;
    const netMonthlyBeforeTax = Math.max(0, gross - empInsMonthly);
    const annualized = netMonthlyBeforeTax * 12;
    const taxableAnnualRaw = Math.max(0, annualized - 20000);
    const taxableAnnualRounded = Math.floor(taxableAnnualRaw / 10) * 10;

    const annualTax = calcLaw91IndividualTax(taxableAnnualRounded);
    const monthlyTax = Math.round((annualTax / 12) * 100) / 100;
    const martyrsFund = Math.round(gross * 0.0005 * 100) / 100;
    const netTakeHome = Math.round((gross - empInsMonthly - monthlyTax - martyrsFund) * 100) / 100;

    document.getElementById('payResultsPanel').innerHTML =
      '<div class="result-hero">' +
        '<p class="result-headline">ضريبة كسب العمل الشهرية</p>' +
        '<p class="result-big"><span class="num-tabular">' + formatMoney(monthlyTax) + '</span> ج</p>' +
        '<span class="result-subtag">صافي المرتب: ' + formatMoney(netTakeHome) + ' ج شهرياً</span>' +
      '</div>' +
      '<dl class="dl-ledger">' +
        '<div class="dl-row"><dt class="dl-term">حصة العامل في التأمينات (11%)</dt><dd class="dl-val num-tabular">' + formatMoney(empInsMonthly) + ' ج</dd></div>' +
        '<div class="dl-row"><dt class="dl-term">حصة الشركة في التأمينات (18.75%)</dt><dd class="dl-val num-tabular">' + formatMoney(compInsMonthly) + ' ج</dd></div>' +
        '<div class="dl-row"><dt class="dl-term">الوعاء السنوي الصافي بعد الإعفاء (20 ألف)</dt><dd class="dl-val num-tabular">' + formatMoney(taxableAnnualRounded) + ' ج</dd></div>' +
        '<div class="dl-row"><dt class="dl-term">الضريبة السنوية (شريحة صفرية 40 ألف)</dt><dd class="dl-val num-tabular">' + formatMoney(annualTax) + ' ج</dd></div>' +
        '<div class="dl-row"><dt class="dl-term">صندوق تكريم الشهداء (0.05%)</dt><dd class="dl-val num-tabular">' + formatMoney(martyrsFund) + ' ج</dd></div>' +
        '<div class="dl-row"><dt class="dl-term" style="font-weight:800; color:var(--ink-primary);">صافي المرتب الشهري للموظف</dt><dd class="dl-val num-tabular" style="color:var(--status-safe);">' + formatMoney(netTakeHome) + ' ج</dd></div>' +
      '</dl>';
  }

  function runRealEstateCalculator() {
    const val = Number(document.getElementById('reSaleValue').value) || 0;
    const margin = Number(document.getElementById('reProfitMargin').value) || 15;
    const dispTax = Math.round(val * 0.025);
    const estProfit = Math.round(val * (margin / 100));
    const commTax = calcLaw91IndividualTax(estProfit);

    document.getElementById('reResultsPanel').innerHTML =
      '<div class="result-hero">' +
        '<p class="result-headline">ضريبة التصرفات العقارية القطعية (2.5%)</p>' +
        '<p class="result-big"><span class="num-tabular">' + formatMoney(dispTax) + '</span> ج</p>' +
      '</div>' +
      '<dl class="dl-ledger">' +
        '<div class="dl-row"><dt class="dl-term">قيمة عقد البيع</dt><dd class="dl-val num-tabular">' + formatMoney(val) + ' ج</dd></div>' +
        '<div class="dl-row"><dt class="dl-term">ضريبة التصرفات العقارية (2.5% مقطوعة)</dt><dd class="dl-val num-tabular">' + formatMoney(dispTax) + ' ج</dd></div>' +
        '<div class="dl-row"><dt class="dl-term">لو تحول لاستثمار عقاري (ربح ' + margin + '%)</dt><dd class="dl-val num-tabular" style="color:var(--status-urgent);">' + formatMoney(commTax) + ' ج</dd></div>' +
      '</dl>' +
      '<p style="margin:12px 0 0 0; font-size:0.86rem; color:var(--ink-secondary);">تنبيه: لو الممول فاتح ملف استثمار عقاري، يُمنع محاسبته بـ 2.5% تصرفات عقارية على نفس العقارات منعاً للازدواج الضريبي.</p>';
  }

  function generateLegalMemo() {
    const clientId = document.getElementById('memoClientSelect').value;
    const type = document.getElementById('memoTemplateType').value;
    const formNum = document.getElementById('memoFormNum').value || '.......';
    const client = appState.clients.find(c => c.id === clientId) || appState.clients[0];
    if (!client) return;

    const todayStr = new Date().toISOString().slice(0, 10);
    const noticeDate = client.noticeDate || todayStr;
    let text = '';

    if (type === 'APPEAL_19' || type === 'APPEAL_15') {
      const formLabel = type === 'APPEAL_19' ? 'نموذج (19 ضرائب دخل)' : 'نموذج (15 ضريبة قيمة مضافة)';
      text =
        'السيد الأستاذ / رئيس ' + (client.office || 'مأمورية الضرائب المختصة') + '\n' +
        'تحية طيبة وبعد،،،\n\n' +
        'مقدمه لسيادتكم / ' + client.name + ' (أو وكيله الرسمي بالتفويض)، نشاط: (' + client.activity + ').\n' +
        'الموضوع: طعن قانوني على ' + formLabel + ' رقم صادر (' + formNum + ') بتاريخ (' + noticeDate + ').\n\n' +
        'حيث أُعلن الممول بالنموذج المشار إليه، فإنه يطعن عليه في الميعاد القانوني المقرر (خلال 30 يوماً طبقاً للمادة 54 من قانون الإجراءات الضريبية الموحد رقم 206 لسنة 2020) للأسباب الآتية:\n' +
        '1. من الناحية الشكلية: قبول الطعن شكلاً لتقديمه في الميعاد، مع الدفع ببطلان النموذج لخلوه من بيان عناصر وأسس الفحص والتقدير التفصيلية.\n' +
        '2. الدفع بالتقادم الخمسي: يتمسك الممول بسقوط حق المصلحة في الفحص والمطالبة عن السنوات التي مضى عليها خمس سنوات طبقاً للمادة (91) من القانون 91 لسنة 2005 لعدم وجود إجراء قاطع للتقادم.\n' +
        '3. من الناحية الموضوعية: المغالاة الشديدة في تقدير الإيراد اليومي وعدد أيام العمل ونسبة صافي الربح الحكمية دون مراعاة الطبيعة الفعلية للنشاط، وإغفال خصم التكاليف اللازمة للنشاط (م 22) والمبالغ المخصومة والمسددة تحت حساب الضريبة (' + client.problem + ').\n\n' +
        'لذلك: يلتمس الممول قبول الطعن شكلاً، وفي الموضوع بإلغاء التقديرات الواردة بالنموذج وإحالة الملف للجنة الداخلية للمحاسبة على الأسس الفعلية (أو تطبيق المادة الثالثة من القانون رقم 30 لسنة 2023).';
    } else if (type === 'ARTICLE_3') {
      text =
        'السيد الأستاذ / رئيس ' + (client.office || 'مأمورية الضرائب المختصة / رئيس اللجنة الداخلية') + '\n' +
        'تحية طيبة وبعد،،،\n\n' +
        'مقدمه لسيادتكم الممول / ' + client.name + ' | نشاط: (' + client.activity + ').\n' +
        'الموضوع: طلب المحاسبة وتعديل الربط وفقاً لأحكام المادة الثالثة من القانون رقم 30 لسنة 2023 (وقانون التسهيلات رقم 6 لسنة 2025).\n\n' +
        'يتشرف الممول بطلب تطبيق أحكام المادة الثالثة من القانون رقم 30 لسنة 2023 على ملفه الضريبي عن سنوات الفحص، حيث إن رقم الأعمال السنوي للمنشأة يقع ضمن الشرائح المقررة بالمادة الثالثة ولا يتجاوز الحد القانوني، مع تعديل الربط الضريبي وأوراد التحصيل على هذا الأساس وخصم كافة المبالغ المسددة تحت حساب الضريبة.';
    } else if (type === 'TAX_POSITION') {
      text =
        'السيد الأستاذ / رئيس ' + (client.office || 'مأمورية الضرائب المختصة') + '\n' +
        'تحية طيبة وبعد،،،\n\n' +
        'مقدمه لسيادتكم الممول / ' + client.name + '.\n' +
        'الموضوع: طلب استخراج شهادة موقف ضريبي تسلسلي لإثبات توقف النشاط وحفظ ملف القيمة المضافة.\n\n' +
        'برجاء التكرم بالموافقة على إصدار بيان موقف ضريبي يوضح التسلسل التاريخي الكامل للملف الضريبي (' + client.problem + ')، وإثبات تاريخ التوقف الفعلي والمحاسبة النهائية، وذلك لتقديمه إلى مأمورية القيمة المضافة لحفظ الملف نهائياً ورفع أي التزامات غير مستحقة.';
    } else if (type === 'SEIZURE_APPEAL') {
      text =
        'السيد الأستاذ / رئيس ' + (client.office || 'مأمورية الضرائب المختصة - شعبة الحجز والتحصيل') + '\n' +
        'تحية طيبة وبعد،،،\n\n' +
        'مقدمه لسيادتكم الممول / ' + client.name + '.\n' +
        'الموضوع: طعن ومنازعة في محضر الحجز الإداري المؤرخ (' + todayStr + ') وطلب فتح باب الطعن في أصل الربط الضريبي.\n\n' +
        'حيث تم توقيع محضر الحجز الإداري، فإن الممول يطعن على محضر الحجز وينازع في أصل الدين الضريبي لعدم صحة إعلانه بنموذج الربط (نموذج 19) على النحو المقرر قانوناً، ويلتمس فتح باب الطعن الموضوعي في عناصر التقدير وإحالة الملف إلى اللجنة الداخلية للمحاسبة على الأسس الفعلية.';
    }

    document.getElementById('memoOutputArea').value = text;
  }

  function renderReferenceList() {
    const q = (document.getElementById('refSearchInput').value || '').trim().toLowerCase();
    const cat = document.getElementById('refCategorySelect').value;
    const container = document.getElementById('referenceListContainer');

    const filtered = REFERENCE_ITEMS.filter(item => {
      if (cat !== 'ALL' && item.category !== cat) return false;
      if (q) {
        const hay = (item.title + ' ' + item.legal + ' ' + item.balady + ' ' + item.category).toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });

    if (filtered.length === 0) {
      container.innerHTML = '<div class="ledger-panel" style="padding:28px 20px; text-align:center; color:var(--ink-secondary);">لا توجد نتائج مطابقة في الدليل.</div>';
      return;
    }

    container.innerHTML = filtered.map((item, idx) => {
      const delay = Math.min(idx * 20, 160);
      const isOpenAttr = (idx === 0 || q.length > 0) ? ' open' : '';
      return '<details class="ref-card" style="animation-delay:' + delay + 'ms;"' + isOpenAttr + '>' +
        '<summary class="ref-summary">' +
          '<span>' + escapeHtml(item.title) + '</span>' +
          '<span class="ref-summary-meta">' +
            '<span class="tag-inline brass">' + escapeHtml(item.category) + '</span>' +
            '<svg class="ref-chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="6 9 12 15 18 9"/></svg>' +
          '</span>' +
        '</summary>' +
        '<div class="ref-body">' +
          '<blockquote class="ref-legal"><strong>النص / القاعدة الرسمية:</strong> ' + escapeHtml(item.legal) + '</blockquote>' +
          '<p class="ref-balady"><strong>الشرح بالبلدي في المكتب:</strong> ' + escapeHtml(item.balady) + '</p>' +
        '</div>' +
      '</details>';
    }).join('');
  }

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

    const mode = document.getElementById('restoreModeSelect').value;
    if (mode === 'REPLACE') {
      appState.clients = parsed.clients;
      appState.tasks = parsed.tasks;
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
    }

    await saveState(true);
    renderClients();
    renderTasks();
    document.getElementById('backupModalBackdrop').classList.remove('open');
    showToast('تم استرجاع النسخة الاحتياطية بنجاح (' + appState.clients.length + ' ممول)');
  }

  function exportClientsCsv() {
    const headers = ['الاسم', 'المأمورية', 'النشاط', 'القسم', 'الحالة', 'تاريخ النموذج', 'تفاصيل المشكلة', 'الإجراء المطلوب'];
    const rows = appState.clients.map(c => [
      c.name, c.office, c.activity, c.category, c.status, c.noticeDate || '', c.problem, c.action
    ].map(v => '"' + String(v || '').replace(/"/g, '""') + '"').join(','));
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
    const modal = document.getElementById('clientModalBackdrop');
    const delBtn = document.getElementById('btnDeleteClientInModal');
    if (clientId) {
      const c = appState.clients.find(item => item.id === clientId);
      if (!c) return;
      document.getElementById('clientModalTitle').textContent = 'تعديل ملف: ' + c.name;
      document.getElementById('clientFormId').value = c.id;
      document.getElementById('clientFormName').value = c.name;
      document.getElementById('clientFormOffice').value = c.office || '';
      document.getElementById('clientFormActivity').value = c.activity || '';
      document.getElementById('clientFormCategory').value = c.category || 'فحص ولجان وطعون';
      document.getElementById('clientFormStatus').value = c.status || 'قيد المتابعة';
      document.getElementById('clientFormNoticeDate').value = c.noticeDate || '';
      document.getElementById('clientFormProblem').value = c.problem || '';
      document.getElementById('clientFormAction').value = c.action || '';
      delBtn.style.display = 'inline-flex';
    } else {
      document.getElementById('clientModalTitle').textContent = 'إضافة ملف ممول جديد';
      document.getElementById('clientForm').reset();
      document.getElementById('clientFormId').value = '';
      delBtn.style.display = 'none';
    }
    modal.classList.add('open');
  }

  function openTaskModal(taskId) {
    const t = appState.tasks.find(item => item.id === taskId);
    if (!t) return;
    document.getElementById('taskFormId').value = t.id;
    document.getElementById('taskFormTitle').value = t.title || '';
    document.getElementById('taskFormClient').value = t.clientId || '';

    const typeSelect = document.getElementById('taskFormType');
    const taskType = t.type || 'طعن 30 يوم / نموذج 19 و15';
    const hasOption = Array.from(typeSelect.options).some(opt => opt.value === taskType);
    if (!hasOption) {
      const opt = document.createElement('option');
      opt.value = taskType;
      opt.textContent = taskType;
      typeSelect.appendChild(opt);
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
    document.getElementById('btnToggleTheme').addEventListener('click', () => {
      const curr = document.documentElement.getAttribute('data-theme');
      const next = (curr === 'dark') ? 'light' : 'dark';
      applyTheme(next);
      showToast(next === 'dark' ? 'تم تفعيل الوضع الليلي' : 'تم تفعيل الوضع النهاري');
    });

    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        switchMainTab('view-clients');
        document.getElementById('clientSearchInput').focus();
      } else if (e.key === 'Escape') {
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
      const record = {
        id: id || ('c_' + Date.now()),
        name: document.getElementById('clientFormName').value.trim(),
        office: document.getElementById('clientFormOffice').value.trim(),
        activity: document.getElementById('clientFormActivity').value.trim(),
        category: document.getElementById('clientFormCategory').value,
        status: document.getElementById('clientFormStatus').value,
        noticeDate: document.getElementById('clientFormNoticeDate').value,
        problem: document.getElementById('clientFormProblem').value.trim(),
        action: document.getElementById('clientFormAction').value.trim()
      };
      if (id) {
        const idx = appState.clients.findIndex(c => c.id === id);
        if (idx !== -1) appState.clients[idx] = record;
      } else {
        appState.clients.unshift(record);
      }
      await saveState(false);
      renderClients();
      document.getElementById('clientModalBackdrop').classList.remove('open');
    });

    document.getElementById('btnDeleteClientInModal').addEventListener('click', async () => {
      const id = document.getElementById('clientFormId').value;
      if (!id) return;
      appState.clients = appState.clients.filter(c => c.id !== id);
      await saveState(false);
      renderClients();
      document.getElementById('clientModalBackdrop').classList.remove('open');
      showToast('تم حذف ملف الممول');
    });

    document.getElementById('clientsListContainer').addEventListener('click', async (e) => {
      const btn = e.target.closest('button[data-action]');
      if (!btn) return;
      const action = btn.getAttribute('data-action');
      const id = btn.getAttribute('data-id');

      if (action === 'toggle-problem') {
        const card = btn.closest('.client-card');
        const p = card && card.querySelector('.case-problem');
        if (p) {
          const isClamped = p.classList.toggle('clamped');
          btn.textContent = isClamped ? 'عرض المزيد' : 'عرض أقل';
        }
        return;
      }

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
        appState.tasks.unshift(newTask);
        await saveState(true);
        renderTasks();
        switchMainTab('view-tasks');
        showToast('تمت إضافة إجراء (' + client.name + ') إلى الأجندة');
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
      const clientObj = appState.clients.find(c => c.id === clientId);
      const task = {
        id: 't_' + Date.now(),
        title: title,
        clientId: clientId,
        clientName: clientObj ? clientObj.name : '',
        type: document.getElementById('newTaskType').value,
        due: document.getElementById('newTaskDue').value || new Date().toISOString().slice(0, 10),
        priority: document.getElementById('newTaskPriority').value,
        done: false
      };
      appState.tasks.unshift(task);
      titleInput.value = '';
      await saveState(false);
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
          t.done = !t.done;
          await saveState(true);
          renderTasks();
        }
      } else if (action === 'edit-task') {
        openTaskModal(id);
      } else if (action === 'delete-task') {
        appState.tasks = appState.tasks.filter(item => item.id !== id);
        await saveState(true);
        renderTasks();
        showToast('تم حذف المهمة');
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
      const clientId = document.getElementById('taskFormClient').value;
      const clientObj = appState.clients.find(c => c.id === clientId);
      t.title = document.getElementById('taskFormTitle').value.trim();
      t.clientId = clientId;
      t.clientName = clientObj ? clientObj.name : '';
      t.type = document.getElementById('taskFormType').value;
      t.due = document.getElementById('taskFormDue').value;
      t.priority = document.getElementById('taskFormPriority').value;
      await saveState(false);
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
    document.getElementById('refSearchInput').addEventListener('input', renderReferenceList);
    document.getElementById('refCategorySelect').addEventListener('change', renderReferenceList);

    document.getElementById('btnOpenBackupModal').addEventListener('click', () => {
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
      appState.clients = JSON.parse(JSON.stringify(DEFAULT_CLIENTS));
      appState.tasks = JSON.parse(JSON.stringify(DEFAULT_TASKS));
      await saveState(true);
      renderClients();
      renderTasks();
      document.getElementById('backupModalBackdrop').classList.remove('open');
      showToast('تمت استعادة قائمة الـ 20 عميلاً والمهام الأصلية من الريكورد');
    });

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
    await loadState();
    initEventListeners();
    renderClients();
    renderTasks();
    runInspectionCalculator();
    runInvoiceCalculator();
    runPayrollCalculator();
    runRealEstateCalculator();
    renderReferenceList();
    updateHeaderSaveTime();
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    }
  });
})();
