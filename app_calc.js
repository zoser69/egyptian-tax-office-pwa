'use strict';

function clampNonNegNum(val) {
  const n = Number(val);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function calcLaw6Of2025Tax(turnover) {
  const safeTurnover = clampNonNegNum(turnover);
  if (safeTurnover <= 0) return { tax: 0, label: '0' };
  if (safeTurnover < 500000) return { tax: Math.round(safeTurnover * 0.004), label: 'أقل من 500 ألف (0.4% من رقم الأعمال)' };
  if (safeTurnover < 2000000) return { tax: Math.round(safeTurnover * 0.005), label: '500 ألف لأقل من 2 مليون (0.5%)' };
  if (safeTurnover < 3000000) return { tax: Math.round(safeTurnover * 0.0075), label: '2 مليون لأقل من 3 مليون (0.75%)' };
  if (safeTurnover <= 10000000) return { tax: Math.round(safeTurnover * 0.01), label: '3 مليون حتى 10 مليون (1%)' };
  if (safeTurnover <= 20000000) return { tax: Math.round(safeTurnover * 0.015), label: 'أكثر من 10 حتى 20 مليون (1.5%)' };
  return { tax: null, label: 'تجاوز 20 مليون (خارج سقف قانون 6 لسنة 2025)' };
}

function runInspectionCalculator() {
  const panel = document.getElementById('inspResultsPanel');
  if (!panel) return;

  const yearEl = document.getElementById('inspTaxYear');
  const mFromEl = document.getElementById('inspMonthFrom');
  const mToEl = document.getElementById('inspMonthTo');
  const noExEl = document.getElementById('inspNoExemption');
  const methodEl = document.getElementById('inspInputMethod');
  const entityEl = document.getElementById('inspEntityType');
  const dailyFields = document.getElementById('inspDailyFields');
  const turnoverInput = document.getElementById('inspTurnover');
  const dailyRevEl = document.getElementById('inspDailyRev');
  const workDaysEl = document.getElementById('inspWorkDays');
  const marginEl = document.getElementById('inspProfitMargin');
  const returnTaxEl = document.getElementById('inspReturnTax');
  const whtPaidEl = document.getElementById('inspWhtPaid');

  const year = Number(yearEl ? yearEl.value : 2026) || 2026;
  const mFrom = Math.min(12, Math.max(1, Number(mFromEl ? mFromEl.value : 1) || 1));
  let mTo = Math.min(12, Math.max(1, Number(mToEl ? mToEl.value : 12) || 12));
  if (mTo < mFrom) mTo = mFrom;
  const months = mTo - mFrom + 1;
  const noExemption = Boolean(noExEl && noExEl.checked);

  const method = methodEl ? methodEl.value : 'DIRECT';
  const entity = entityEl ? entityEl.value : 'INDIVIDUAL';
  let turnover = clampNonNegNum(turnoverInput ? turnoverInput.value : 0);
  if (method === 'DAILY') {
    if (dailyFields) dailyFields.style.display = 'grid';
    const daily = clampNonNegNum(dailyRevEl ? dailyRevEl.value : 0);
    const days = clampNonNegNum(workDaysEl ? workDaysEl.value : 0);
    turnover = daily * days;
    if (turnoverInput) {
      turnoverInput.value = turnover > 0 ? String(turnover) : '';
      turnoverInput.readOnly = true;
    }
  } else {
    if (dailyFields) dailyFields.style.display = 'none';
    if (turnoverInput) {
      turnoverInput.readOnly = false;
      if (turnoverInput.value === '0') turnoverInput.value = '';
    }
  }

  const margin = clampNonNegNum(marginEl ? marginEl.value : 0);
  const returnTax = clampNonNegNum(returnTaxEl ? returnTaxEl.value : 0);
  const whtPaid = clampNonNegNum(whtPaidEl ? whtPaidEl.value : 0);
  const netProfit = Math.round(turnover * (margin / 100));

  let law91Detail;
  if (entity === 'CORP') {
    law91Detail = calcLaw91CorporateDetailed(netProfit, { year, months });
  } else {
    law91Detail = calcLaw91Detailed(netProfit, { year, months, noExemption });
  }
  const law91Tax = law91Detail.tax;

  const turnoverLabelEl = document.getElementById('inspTurnoverLabel');
  if (turnoverLabelEl) {
    turnoverLabelEl.textContent = months < 12
      ? 'إجمالي رقم الأعمال عن الفترة (' + months + ' شهر) (جنيه)'
      : 'إجمالي رقم الأعمال السنوي (جنيه)';
  }

  const allowArt3 = year >= 2023;
  const allowLaw6 = year >= 2025;
  const annualTurnoverForCompare = months < 12 ? Math.round(turnover * (12 / months)) : turnover;

  let art3 = { tax: null, label: '' };
  if (allowArt3) {
    const art3Raw = calcArticle3Law30Tax(annualTurnoverForCompare);
    art3 = {
      tax: art3Raw.tax !== null ? (months < 12 ? Math.round(art3Raw.tax * (months / 12)) : art3Raw.tax) : null,
      label: art3Raw.label + (months < 12 && art3Raw.tax !== null ? ' · عن ' + months + ' شهر' : '')
    };
  }

  let law6 = { tax: null, label: '' };
  if (allowLaw6) {
    const law6Raw = calcLaw6Of2025Tax(annualTurnoverForCompare);
    law6 = {
      tax: law6Raw.tax !== null ? (months < 12 ? Math.round(law6Raw.tax * (months / 12)) : law6Raw.tax) : null,
      label: law6Raw.label + (months < 12 && law6Raw.tax !== null ? ' · عن ' + months + ' شهر' : '')
    };
  }

  const candidates = [{ name: 'قانون 91 (' + year + ' - ' + law91Detail.lawLabel + ')', val: law91Tax }];
  if (allowArt3 && art3.tax !== null) candidates.push({ name: 'المادة 3 (قانون 30 لسنة 2023)', val: art3.tax });
  if (allowLaw6 && law6.tax !== null) candidates.push({ name: 'قانون 6 لسنة 2025 (التسهيلات)', val: law6.tax });
  candidates.sort((a, b) => a.val - b.val);
  const best = candidates[0];
  const highestVal = candidates[candidates.length - 1].val;
  const isReturnTrap = returnTax > best.val;
  const effectiveTax = Math.max(best.val, returnTax);
  const netPayable = Math.max(0, effectiveTax - whtPaid);
  const maxVal = Math.max(
    law91Tax,
    (allowArt3 && art3.tax) ? art3.tax : 0,
    (allowLaw6 && law6.tax) ? law6.tax : 0,
    returnTax,
    1
  );

  let trapAlertHtml = '';
  if (isReturnTrap) {
    trapAlertHtml = '<div style="margin-top:12px; padding:12px; background:var(--status-urgent-bg); border:1px solid var(--status-urgent-border); color:var(--status-urgent); font-size:0.88rem; font-weight:700; border-radius:8px;">' +
      'تنبيه فخ الإقرار: ضريبة الإقرار المرفوعة (' + formatMoney(returnTax) + ' ج) أكبر من ضريبة ' + escapeHtml(best.name) + ' (' + formatMoney(best.val) + ' ج). المأمورية ستعتمد ضريبة الإقرار الأكبر لأن الإقرار لا رجعة فيه.' +
    '</div>';
  }

  const barClass91 = (best.name.indexOf('قانون 91') !== -1) ? 'best' : (law91Tax === highestVal && candidates.length > 1 ? 'high' : '');
  const barClassArt3 = (best.name.indexOf('المادة 3') !== -1) ? 'best' : (art3.tax === highestVal && candidates.length > 1 ? 'high' : '');
  const barClassLaw6 = (best.name.indexOf('قانون 6') !== -1) ? 'best' : (law6.tax === highestVal && candidates.length > 1 ? 'high' : '');

  const bracketRowsHtml = law91Detail.rows.map(r =>
    '<tr>' +
      '<td>' + escapeHtml(r.label) + '</td>' +
      '<td class="num-tabular">' + formatMoney(r.amount) + '</td>' +
      '<td class="num-tabular">' + r.ratePct + '%</td>' +
      '<td class="num-tabular" style="font-weight:700;">' + formatMoney(Math.round(r.tax)) + '</td>' +
    '</tr>'
  ).join('');

  const creditRowHtml = law91Detail.taxCreditAmount > 0
    ? '<tr><td colspan="3" style="color:var(--status-safe); font-weight:700;">خصم ضريبي (' + Math.round(law91Detail.taxCreditRate * 100) + '% عن سنة ' + year + ')</td><td class="num-tabular" style="color:var(--status-safe); font-weight:700;">- ' + formatMoney(law91Detail.taxCreditAmount) + '</td></tr>'
    : '';

  const art3LedgerRowHtml = allowArt3
    ? '<div class="dl-row"><dt class="dl-term">2. الضريبة على المادة 3 (' + escapeHtml(art3.label) + ')</dt><dd class="dl-val num-tabular">' + (art3.tax !== null ? formatMoney(art3.tax) + ' ج' : 'غير خاضع') + '</dd></div>'
    : '';

  const law6LedgerRowHtml = allowLaw6
    ? '<div class="dl-row"><dt class="dl-term">3. الضريبة على قانون 6/2025 (' + escapeHtml(law6.label) + ')</dt><dd class="dl-val num-tabular">' + (law6.tax !== null ? formatMoney(law6.tax) + ' ج' : 'غير خاضع') + '</dd></div>'
    : '';

  const trapLedgerRowHtml = isReturnTrap
    ? '<div class="dl-row"><dt class="dl-term" style="color:var(--status-urgent); font-weight:700;">ضريبة الإقرار المرفوعة (فخ الإقرار - ملزمة قانوناً)</dt><dd class="dl-val num-tabular" style="color:var(--status-urgent); font-weight:700;">' + formatMoney(returnTax) + ' ج</dd></div>'
    : '';

  panel.innerHTML =
    '<div class="result-hero">' +
      '<p class="result-headline">الاختيار الأوفر قانونياً للممول (سنة ' + year + ' · ' + months + ' شهر)</p>' +
      '<p class="result-big"><span class="num-tabular">' + formatMoney(best.val) + '</span> ج</p>' +
      '<span class="result-subtag">' + escapeHtml(best.name) + '</span>' +
      (isReturnTrap ? '<span class="tag-inline urgent" style="margin-top:6px;">فخ الإقرار: الضريبة الملزمة ' + formatMoney(returnTax) + ' ج</span>' : '') +
    '</div>' +
    '<dl class="dl-ledger">' +
      '<div class="dl-row"><dt class="dl-term">إجمالي رقم الأعمال</dt><dd class="dl-val num-tabular">' + formatMoney(turnover) + ' ج</dd></div>' +
      '<div class="dl-row"><dt class="dl-term">صافي الربح التقديري (' + margin + '%)</dt><dd class="dl-val num-tabular">' + formatMoney(netProfit) + ' ج</dd></div>' +
      (months < 12 ? '<div class="dl-row"><dt class="dl-term">رد الوعاء لسنة كاملة (' + months + ' شهر)</dt><dd class="dl-val num-tabular">' + formatMoney(law91Detail.annualBase) + ' ج</dd></div>' : '') +
      '<div class="dl-row"><dt class="dl-term">1. الضريبة على قانون 91 (' + year + ')</dt><dd class="dl-val num-tabular">' + formatMoney(law91Tax) + ' ج</dd></div>' +
      art3LedgerRowHtml +
      law6LedgerRowHtml +
      trapLedgerRowHtml +
      '<div class="dl-row"><dt class="dl-term">مبالغ مخصومة تحت حساب الضريبة (نموذج 41)</dt><dd class="dl-val num-tabular">- ' + formatMoney(whtPaid) + ' ج</dd></div>' +
      '<div class="dl-row"><dt class="dl-term" style="color:var(--ink-primary); font-weight:800;">الصافي النهائي واجب السداد</dt><dd class="dl-val num-tabular" style="color:var(--status-safe); font-size:1.1rem;">' + formatMoney(netPayable) + ' ج</dd></div>' +
    '</dl>' +
    trapAlertHtml +
    '<div class="bracket-table-wrap">' +
      '<table class="bracket-table">' +
        '<thead><tr><th>تفصيل شرائح قانون 91 (' + year + ')</th><th>القيمة</th><th>%</th><th>الضريبة</th></tr></thead>' +
        '<tbody>' + bracketRowsHtml + creditRowHtml + '</tbody>' +
      '</table>' +
    '</div>' +
    '<div class="tufte-chart">' +
      '<div class="tufte-bar-group">' +
        '<div class="tufte-bar-label"><span>قانون 91 لسنة 2005 (' + year + ')</span><span class="num-tabular">' + formatMoney(law91Tax) + ' ج</span></div>' +
        '<div class="tufte-bar-track"><div class="tufte-bar-fill ' + barClass91 + '" style="width:' + Math.min(100, Math.round((law91Tax / maxVal) * 100)) + '%"></div></div>' +
      '</div>' +
      (allowArt3 && art3.tax !== null ? (
        '<div class="tufte-bar-group">' +
          '<div class="tufte-bar-label"><span>المادة 3 (قانون 30/2023)</span><span class="num-tabular">' + formatMoney(art3.tax) + ' ج</span></div>' +
          '<div class="tufte-bar-track"><div class="tufte-bar-fill ' + barClassArt3 + '" style="width:' + Math.min(100, Math.round((art3.tax / maxVal) * 100)) + '%"></div></div>' +
        '</div>'
      ) : '') +
      (allowLaw6 && law6.tax !== null ? (
        '<div class="tufte-bar-group">' +
          '<div class="tufte-bar-label"><span>قانون 6 لسنة 2025 (التسهيلات)</span><span class="num-tabular">' + formatMoney(law6.tax) + ' ج</span></div>' +
          '<div class="tufte-bar-track"><div class="tufte-bar-fill ' + barClassLaw6 + '" style="width:' + Math.min(100, Math.round((law6.tax / maxVal) * 100)) + '%"></div></div>' +
        '</div>'
      ) : '') +
    '</div>';
}

function runPenaltyCalculator() {
  const taxEl = document.getElementById('penTaxAmount');
  const monthsEl = document.getElementById('penDelayMonths');
  const cbeEl = document.getElementById('penCbeRate');
  const retEl = document.getElementById('penReturnTax');
  const stageEl = document.getElementById('penStage');
  const panel = document.getElementById('penResultsPanel');
  if (!taxEl || !panel) return;

  const principal = Math.floor(clampNonNegNum(taxEl.value));
  const months = Math.floor(clampNonNegNum(monthsEl ? monthsEl.value : 0));
  const cbeRate = clampNonNegNum(cbeEl ? cbeEl.value : 0);
  const returnTax = Math.floor(clampNonNegNum(retEl ? retEl.value : 0));
  const stage = stageEl ? stageEl.value : 'INTERNAL_COMMITTEE';
  const settledBeforeAppeal = (stage === 'DIRECT_AGREEMENT' || stage === 'INTERNAL_COMMITTEE');

  const annualPenaltyRate = (cbeRate + 2) / 100;
  const delayBase = Math.max(0, principal - 200);
  const rawDelayPenalty = delayBase * annualPenaltyRate * (months / 12);
  const cappedDelayPenalty = Math.round(Math.min(rawDelayPenalty, principal));
  const isCapped = rawDelayPenalty > principal && principal > 200;
  const delayWaiver30 = settledBeforeAppeal ? Math.round(cappedDelayPenalty * 0.30) : 0;
  const netDelayPenalty = Math.max(0, cappedDelayPenalty - delayWaiver30);

  let art87Rate = 0;
  let art87Label = 'لا توجد فروق (الإقرار مطابق)';
  const diff = Math.max(0, principal - returnTax);
  if (principal > 0 && diff > 0) {
    if (returnTax === 0) {
      art87Rate = settledBeforeAppeal ? 0.20 : 0.40;
      art87Label = settledBeforeAppeal ? 'عدم تقديم إقرار + اتفاق قبل الطعن (20%)' : 'عدم تقديم إقرار (40% من النهائية)';
    } else if ((diff / principal) >= 0.5) {
      art87Rate = settledBeforeAppeal ? 0.20 : 0.40;
      art87Label = settledBeforeAppeal ? 'فروق >= 50% + اتفاق قبل الطعن (20%)' : 'فروق >= 50% (40% من الفرق)';
    } else {
      art87Rate = settledBeforeAppeal ? 0.10 : 0.20;
      art87Label = settledBeforeAppeal ? 'فروق < 50% + اتفاق قبل الطعن (10%)' : 'فروق < 50% (20% من الفرق)';
    }
  }
  const art87Base = returnTax === 0 ? principal : diff;
  const art87Amount = Math.round(art87Base * art87Rate);
  const grandTotal = principal + netDelayPenalty + art87Amount;

  panel.innerHTML =
    '<div class="result-hero">' +
      '<p class="result-headline">صافي مقابل التأخير والمبلغ الإضافي (م 87 مكرراً)</p>' +
      '<p class="result-big"><span class="num-tabular">' + formatMoney(netDelayPenalty + art87Amount) + '</span> ج</p>' +
      '<span class="result-subtag">' + (isCapped ? 'مقيد بالسقف القانوني 100% من أصل الضريبة (ق 7/2025)' : 'معدل سنوي ' + (cbeRate + 2).toFixed(2) + '%' + (principal > 0 && principal <= 200 ? ' (معفى <= 200 ج)' : ' (على ما يجاوز 200 ج)')) + '</span>' +
    '</div>' +
    '<dl class="dl-ledger">' +
      '<div class="dl-row"><dt class="dl-term">أصل الضريبة النهائية (مقرب للجنيه)</dt><dd class="dl-val num-tabular">' + formatMoney(principal) + ' ج</dd></div>' +
      '<div class="dl-row"><dt class="dl-term">وعاء مقابل التأخير (بعد استبعاد 200 ج)</dt><dd class="dl-val num-tabular">' + formatMoney(delayBase) + ' ج</dd></div>' +
      '<div class="dl-row"><dt class="dl-term">مقابل التأخير قبل الإعفاء (' + months + ' شهر)</dt><dd class="dl-val num-tabular" style="color:var(--status-urgent);">+ ' + formatMoney(cappedDelayPenalty) + ' ج</dd></div>' +
      (delayWaiver30 > 0 ? '<div class="dl-row"><dt class="dl-term" style="color:var(--status-safe);">إعفاء 30% من مقابل التأخير (م 110 عند السداد)</dt><dd class="dl-val num-tabular" style="color:var(--status-safe);">- ' + formatMoney(delayWaiver30) + ' ج</dd></div>' : '') +
      '<div class="dl-row"><dt class="dl-term">المبلغ الإضافي م 87 مكرراً (' + art87Label + ')</dt><dd class="dl-val num-tabular">+ ' + formatMoney(art87Amount) + ' ج</dd></div>' +
      '<div class="dl-row"><dt class="dl-term" style="font-weight:800; color:var(--ink-primary);">الإجمالي الكلي واجب السداد</dt><dd class="dl-val num-tabular" style="color:var(--status-safe); font-size:1.1rem;">' + formatMoney(grandTotal) + ' ج</dd></div>' +
    '</dl>';
}

function runInvoiceCalculator() {
  const panel = document.getElementById('invResultsPanel');
  if (!panel) return;

  const netEl = document.getElementById('invNetAmount');
  const vatEl = document.getElementById('invVatRate');
  const whtEl = document.getElementById('invWhtRate');
  const roleEl = document.getElementById('invRole');

  const net = clampNonNegNum(netEl ? netEl.value : 0);
  const vatRate = clampNonNegNum(vatEl ? vatEl.value : 0);
  const whtRate = clampNonNegNum(whtEl ? whtEl.value : 0);
  const role = roleEl ? roleEl.value : 'BUYER';
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
      '  ' + formatMoney(whtAmount) + ' من حـ/ ضرائب مخصومة تحت حساب الضريبة (' + whtRate + '% رصيد مدين يُخصم في إقرار الدخل)\n' +
      'إلى مذكورين:\n' +
      '  ' + formatMoney(net) + ' إلى حـ/ إيرادات المبيعات / الخدمات\n' +
      '  ' + formatMoney(vatAmount) + ' إلى حـ/ ضريبة القيمة المضافة | مخرجات (تُدرج في نموذج 10)';
  }
  panel.innerHTML =
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
  const panel = document.getElementById('payResultsPanel');
  if (!panel) return;

  const grossEl = document.getElementById('payGrossMonthly');
  const insEl = document.getElementById('payInsWage');

  const gross = clampNonNegNum(grossEl ? grossEl.value : 0);
  let insWage = clampNonNegNum(insEl ? insEl.value : 0);
  if (insWage > 16700) insWage = 16700;
  if (insWage > 0 && insWage < 2700) insWage = 2700;
  const empInsMonthly = Math.round(insWage * 0.11 * 100) / 100;
  const compInsMonthly = Math.round(insWage * 0.1875 * 100) / 100;
  const netMonthlyBeforeTax = Math.max(0, gross - empInsMonthly);
  const annualized = netMonthlyBeforeTax * 12;
  const taxableAnnualRaw = Math.max(0, annualized - 20000);
  const taxableAnnualRounded = Math.floor(taxableAnnualRaw / 10) * 10;
  const payrollDetail = calcLaw91Detailed(taxableAnnualRounded, { year: 2026, months: 12, noExemption: false });
  const annualTax = payrollDetail.tax;
  const monthlyTax = Math.round((annualTax / 12) * 100) / 100;
  const martyrsFund = Math.round(gross * 0.0005 * 100) / 100;
  const netTakeHome = Math.round((gross - empInsMonthly - monthlyTax - martyrsFund) * 100) / 100;
  const isNegativeOrBelowMin = netTakeHome < 0 || (gross > 0 && gross < 2700 && insWage >= 2700);
  const payrollWarnHtml = isNegativeOrBelowMin
    ? '<div class="calc-alert-box" style="margin-top:12px; padding:12px; background:var(--status-urgent-bg); border:1px solid var(--status-urgent-border); color:var(--status-urgent); border-radius:8px; font-weight:700;">' +
        'تنبيه الحد الأدنى التأميني (2026): إجمالي الأجر أقل من الحد الأدنى لأجر الاشتراك التأميني (2,700 ج)' +
        (netTakeHome < 0 ? ' مما نتج عنه صافي مرتب بالسالب (' + formatMoney(netTakeHome) + ' ج).' : '.') +
      '</div>'
    : '';
  const payRowsHtml = payrollDetail.rows.map(r =>
    '<tr>' +
      '<td>' + escapeHtml(r.label) + '</td>' +
      '<td class="num-tabular">' + formatMoney(r.amount) + '</td>' +
      '<td class="num-tabular">' + r.ratePct + '%</td>' +
      '<td class="num-tabular" style="font-weight:700;">' + formatMoney(Math.round(r.tax)) + '</td>' +
    '</tr>'
  ).join('');
  panel.innerHTML =
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
      '<div class="dl-row"><dt class="dl-term" style="font-weight:800; color:var(--ink-primary);">صافي المرتب الشهري للموظف</dt><dd class="dl-val num-tabular" style="color:' + (netTakeHome < 0 ? 'var(--status-urgent)' : 'var(--status-safe)') + ';">' + formatMoney(netTakeHome) + ' ج</dd></div>' +
    '</dl>' +
    payrollWarnHtml +
    (payRowsHtml ? (
      '<div class="bracket-table-wrap">' +
        '<table class="bracket-table">' +
          '<thead><tr><th>شرائح كسب العمل السنوية (2026)</th><th>القيمة</th><th>%</th><th>الضريبة</th></tr></thead>' +
          '<tbody>' + payRowsHtml + '</tbody>' +
        '</table>' +
      '</div>'
    ) : '');
}

function runRealEstateCalculator() {
  const panel = document.getElementById('reResultsPanel');
  if (!panel) return;

  const valEl = document.getElementById('reSaleValue');
  const marginEl = document.getElementById('reProfitMargin');

  const val = clampNonNegNum(valEl ? valEl.value : 0);
  const margin = clampNonNegNum(marginEl ? marginEl.value : 0);
  const dispTax = Math.round(val * 0.025);
  const estProfit = Math.round(val * (margin / 100));
  const commTax = calcLaw91IndividualTax(estProfit);
  panel.innerHTML =
    '<div class="result-hero">' +
      '<p class="result-headline">ضريبة التصرفات العقارية القطعية (2.5%)</p>' +
      '<p class="result-big"><span class="num-tabular">' + formatMoney(dispTax) + '</span> ج</p>' +
    '</div>' +
    '<dl class="dl-ledger">' +
      '<div class="dl-row"><dt class="dl-term">قيمة عقد البيع</dt><dd class="dl-val num-tabular">' + formatMoney(val) + ' ج</dd></div>' +
      '<div class="dl-row"><dt class="dl-term">ضريبة التصرفات العقارية (2.5% مقطوعة)</dt><dd class="dl-val num-tabular">' + formatMoney(dispTax) + ' ج</dd></div>' +
      '<div class="dl-row"><dt class="dl-term">في حال المحاسبة كاستثمار عقاري (ربح ' + margin + '%)</dt><dd class="dl-val num-tabular" style="color:var(--status-urgent);">' + formatMoney(commTax) + ' ج</dd></div>' +
    '</dl>' +
    '<div class="calc-alert-box calc-alert-info">' +
      '<strong>تنبيه مهلة الـ 60 يوماً (قانون 151 لسنة 2026):</strong> يجب سداد الـ 2.5% خلال <strong>60 يوماً</strong> من تاريخ التصرف (للتصرفات من 29 يوليو 2026 بدلاً من 30 يوماً)، وتُعتمد قيمة العقد ما لم تثبت المصلحة خلافها.<br>' +
      '<strong>الاستثناءات:</strong> تُعفى عقارات وأراضي القرى، وتصرفات الوارث في العقارات الآيلة إليه من مورثه بحالتها عند الميراث، والبيع أو الهبة للأصول أو الفروع أو الأزواج، وتقديم العقار كحصة عينية في شركة مساهمة (بشرط عدم التصرف في الأسهم 5 سنوات). وإذا كان لدى الممول ملف استثمار عقاري مسجل، يُمنع محاسبته بنسبة 2.5% منعاً للازدواج الضريبي.' +
    '</div>';
}

function initCalcYearMonthOptions() {
  const yEl = document.getElementById('inspTaxYear');
  if (yEl && yEl.options.length <= 1) {
    let opts = '';
    for (let y = 2026; y >= 2005; y--) opts += '<option value="' + y + '">' + y + '</option>';
    yEl.innerHTML = opts;
    yEl.value = '2026';
  }
  const mFrom = document.getElementById('inspMonthFrom');
  const mTo = document.getElementById('inspMonthTo');
  if (mFrom && mFrom.options.length <= 1) {
    let mOpts = '';
    for (let m = 1; m <= 12; m++) mOpts += '<option value="' + m + '">' + m + '</option>';
    mFrom.innerHTML = mOpts;
    mFrom.value = '1';
  }
  if (mTo && mTo.options.length <= 1) {
    let mOpts = '';
    for (let m = 1; m <= 12; m++) mOpts += '<option value="' + m + '">' + m + '</option>';
    mTo.innerHTML = mOpts;
    mTo.value = '12';
  }
}

function resetInspectionCalculator() {
  ['inspDailyRev', 'inspWorkDays', 'inspTurnover', 'inspProfitMargin', 'inspReturnTax', 'inspWhtPaid'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const yEl = document.getElementById('inspTaxYear');
  if (yEl) yEl.value = '2026';
  const mFrom = document.getElementById('inspMonthFrom');
  if (mFrom) mFrom.value = '1';
  const mTo = document.getElementById('inspMonthTo');
  if (mTo) mTo.value = '12';
  const noEx = document.getElementById('inspNoExemption');
  if (noEx) noEx.checked = false;
  const methodEl = document.getElementById('inspInputMethod');
  if (methodEl) methodEl.value = 'DIRECT';
  const entityEl = document.getElementById('inspEntityType');
  if (entityEl) entityEl.value = 'INDIVIDUAL';
  runInspectionCalculator();
}

function resetInvoiceCalculator() {
  const netEl = document.getElementById('invNetAmount');
  if (netEl) netEl.value = '';
  const vatEl = document.getElementById('invVatRate');
  if (vatEl) vatEl.value = '14';
  const whtEl = document.getElementById('invWhtRate');
  if (whtEl) whtEl.value = '1';
  const roleEl = document.getElementById('invRole');
  if (roleEl) roleEl.value = 'BUYER';
  runInvoiceCalculator();
}

function resetPayrollCalculator() {
  ['payGrossMonthly', 'payInsWage'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  runPayrollCalculator();
}

function resetRealEstateCalculator() {
  ['reSaleValue', 'reProfitMargin'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  runRealEstateCalculator();
}

function resetPenaltyCalculator() {
  ['penTaxAmount', 'penDelayMonths', 'penCbeRate', 'penReturnTax'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const stageEl = document.getElementById('penStage');
  if (stageEl) stageEl.value = 'INTERNAL_COMMITTEE';
  runPenaltyCalculator();
}
