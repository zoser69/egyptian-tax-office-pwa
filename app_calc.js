'use strict';

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
  const clientSelectEl = document.getElementById('memoClientSelect');
  const typeSelectEl = document.getElementById('memoTemplateType');
  const formNumEl = document.getElementById('memoFormNum');
  const outputEl = document.getElementById('memoOutputArea');
  if (!clientSelectEl || !typeSelectEl || !outputEl) return;
  const clientId = clientSelectEl.value;
  const type = typeSelectEl.value;
  const rawFormNum = (formNumEl ? formNumEl.value : '').trim();
  const formNum = rawFormNum || 'المقيد بالملف';
  const client = appState.clients.find(c => c.id === clientId) || appState.clients[0];
  if (!client) return;
  const clientDates = normalizeClientDates(client);
  const todayStr = new Date().toISOString().slice(0, 10);
  function pickBestDateEntryForMemo(keywords) {
    const kwList = Array.isArray(keywords) ? keywords : (keywords ? [keywords] : []);
    for (let i = 0; i < kwList.length; i++) {
      const kw = kwList[i];
      const matched = clientDates.find(d => d.date && (d.label || '').indexOf(kw) !== -1);
      if (matched) {
        return {
          date: matched.date,
          label: matched.label || 'تاريخ الإخطار المقيد'
        };
      }
    }
    const appealEntry = clientDates.find(d => d.date && d.hasAppeal30);
    if (appealEntry) {
      return {
        date: appealEntry.date,
        label: appealEntry.label || 'تاريخ الإعلان بالنموذج'
      };
    }
    const firstEntry = clientDates.find(d => d.date);
    if (firstEntry) {
      return {
        date: firstEntry.date,
        label: firstEntry.label || 'تاريخ الملف المقيد'
      };
    }
    if (client.noticeDate) {
      return {
        date: client.noticeDate,
        label: 'تاريخ الإخطار المقيد'
      };
    }
    return {
      date: todayStr,
      label: 'تاريخ تقديم الطلب'
    };
  }
  const datesSummaryLine = clientDates.length > 0
    ? 'بيان التواريخ والمواعيد المقيدة بملف الممول: ' + clientDates.map(d => (d.label || 'تاريخ ملف') + ' (' + (d.date || 'غير محدد') + ')').join(' | ') + '.\n\n'
    : '';
  const officeName = client.office || 'مأمورية الضرائب المختصة';
  const activityName = client.activity || 'نشاط تجاري / مهني';
  const problemText = client.problem || 'وفقاً للوقائع والمستندات الثابتة بالملف الضريبي';
  const actionText = client.action || 'إعادة الفحص والمحاسبة على الأسس الفعلية القانونية';
  let text = '';
  if (type === 'APPEAL_19') {
    const dEntry = pickBestDateEntryForMemo(['19', 'نموذج 19', 'استلام', 'ربط']);
    text =
      'السيد الأستاذ / رئيس ' + officeName + '\n' +
      'تحية طيبة وبعد،،،\n\n' +
      'مقدمه لسيادتكم الممول / ' + client.name + ' (أو وكيله الرسمي بموجب توكيل / تفويض معتمد)، بشأن نشاط: (' + activityName + ').\n' +
      'الموضوع: صحيفة طعن قانوني على نموذج (19 ضرائب دخل - إخطار عناصر ربط الضريبة وقيمتها) رقم (' + formNum + ') والمرتبط ببيان (' + dEntry.label + ': ' + dEntry.date + ').\n\n' +
      datesSummaryLine +
      'حيث أُعلن الممول بالنموذج المشار إليه، فإنه يطعن عليه في الميعاد القانوني المقرر (خلال ثلاثين يوماً من تاريخ الإعلان طبقاً لنص المادة 54 من قانون الإجراءات الضريبية الموحد رقم 206 لسنة 2020) للأسباب والأسانيد القانونية الآتية:\n\n' +
      'أولاً - من الناحية الشكلية وبطلان النموذج: قبول الطعن شكلاً لتقديمه في الميعاد القانوني، مع الدفع ببطلان نموذج (19 ضرائب دخل) لخلوه من بيان عناصر وأسس الفحص والتقدير التفصيلية التي تمكن الممول من الوقوف على كيفية احتساب الوعاء الضريبي بالمخالفة لأحكام القانون المستقرة ومبادئ محكمة النقض.\n\n' +
      'ثانياً - الدفع الأصلي بسقوط الضريبة بالتقادم الخمسي: يتمسك الممول بسقوط حق المصلحة في الفحص والتقدير والمطالبة عن السنوات الضريبية التي انقضت عليها خمس سنوات طبقاً لنص المادة (91) من قانون الضريبة على الدخل رقم 91 لسنة 2005 والمادة (377) من القانون المدني، لخلو الأوراق من أي إجراء قاطع للتقادم معلن للممول إعلاناً قانونياً صحيحاً.\n\n' +
      'ثالثاً - من الناحية الموضوعية والمحاسبية: يعترض الممول كلياً على التقديرات الجزافية الواردة بالنموذج للمغالاة الشديدة في تقدير الإيراد اليومي وعدد أيام العمل السنوية ونسبة صافي الربح الحكمية دون معاينة فعلية أو مراعاة لظروف النشاط، فضلاً عن إغفال خصم التكاليف والمصروفات اللازمة لمزاولة النشاط طبقاً للمادتين (22 و23) من القانون رقم 91 لسنة 2005 والمادة (28) من لائحته التنفيذية (بما فيها المصروفات النثرية في حدود 7%)، وعدم خصم المبالغ المستقطعة والمسددة تحت حساب الضريبة (نموذج 41).\n\n' +
      'رابعاً - الوقائع الخاصة بملف الممول: (' + problemText + ')، مع التمسك بـ: (' + actionText + ').\n\n' +
      'بناءً عليه (الطلبات الختامية):\n' +
      'يلتمس الممول:\n' +
      '1. بصفة أصلية: قبول الطعن شكلاً، وفي الموضوع بإلغاء التقديرات الواردة بنموذج (19 ضرائب دخل) وإحالة الملف إلى اللجنة الداخلية المختصة لإعادة المحاسبة على الأسس الفعلية المؤيدة بالمستندات، وإعمال أحكام التقادم الخمسي عن السنوات الساقطة قانوناً.\n' +
      '2. بصفة احتياطية: تطبيق المعاملة الضريبية المبسطة المقررة بالمادة الثالثة من القانون رقم 30 لسنة 2023 (أو أحكام قانون الحوافز والتسهيلات الضريبية رقم 6 لسنة 2025 بحسب الفترة الضريبية) متى كان ذلك أوفر للممول، مع خصم كافة المبالغ المسددة والمستقطعة تحت حساب الضريبة.';
  } else if (type === 'APPEAL_15') {
    const dEntry = pickBestDateEntryForMemo(['15', 'نموذج 15', 'قيمة مضافة', 'استلام']);
    text =
      'السيد الأستاذ / رئيس ' + officeName + ' (مأمورية ضريبة القيمة المضافة)\n' +
      'تحية طيبة وبعد،،،\n\n' +
      'مقدمه لسيادتكم المسجل / ' + client.name + ' (أو وكيله الرسمي بموجب توكيل / تفويض معتمد)، بشأن نشاط: (' + activityName + ').\n' +
      'الموضوع: صحيفة طعن قانوني على نموذج (15 ضريبة قيمة مضافة - إخطار تعديل الإقرار / تقدير الضريبة) رقم (' + formNum + ') والمرتبط ببيان (' + dEntry.label + ': ' + dEntry.date + ').\n\n' +
      datesSummaryLine +
      'حيث أُخطر المسجل بالنموذج المشار إليه، فإنه يطعن عليه خلال الميعاد القانوني المقرر (ثلاثين يوماً من تاريخ الإعلان طبقاً لنص المادة 54 من قانون الإجراءات الضريبية الموحد رقم 206 لسنة 2020 والمادة 14 من قانون الضريبة على القيمة المضافة رقم 67 لسنة 2016) للأسباب الآتية:\n\n' +
      'أولاً - من الناحية الشكلية: قبول الطعن شكلاً لتقديمه في الميعاد القانوني، والدفع ببطلان التقدير الوارد بالنموذج لابتنائه على أسس تقديرية واحتمالية غير مؤيدة بمستندات فعلية.\n\n' +
      'ثانياً - من الناحية الموضوعية والمحاسبية: يعترض المسجل كلياً على فروق الفحص والتعديلات التي أجرتها المأمورية على إقرارات ضريبة القيمة المضافة الشهرية (نموذج 10)، ويتمسك بحجية الإقرارات المقدمة والفواتير الإلكترونية المسجلة على المنظومة، وبأحقيته القانونية الكاملة في خصم ضريبة المدخلات السابق سدادها على المشتريات ومستلزمات النشاط طبقاً للمادة (22) من القانون رقم 67 لسنة 2016 وتعديلاته (بما فيها القانون رقم 157 لسنة 2025)، مع استبعاد أية فترات توقف عن النشاط أو معاملات غير خاضعة.\n\n' +
      'ثالثاً - الوقائع الخاصة بملف المسجل: (' + problemText + ')، والإجراء المطلوب إثباته: (' + actionText + ').\n\n' +
      'بناءً عليه (الطلبات الختامية):\n' +
      'يلتمس المسجل قبول الطعن شكلاً، وفي الموضوع بإلغاء التعديلات والفروق الواردة بنموذج (15 ضريبة قيمة مضافة) واعتبار إقرارات المسجل الشهرية (نموذج 10) هي الأساس الصحيح للمحاسبة، وإحالة الملف إلى اللجنة الداخلية المختصة لمطابقة الفواتير الإلكترونية واعتماد خصم ضريبة المدخلات.';
  } else if (type === 'ARTICLE_3') {
    const dEntry = pickBestDateEntryForMemo(['لجنة', 'فحص', '19', 'طلب']);
    text =
      'السيد الأستاذ / رئيس ' + officeName + ' / رئيس اللجنة الداخلية المختصة\n' +
      'تحية طيبة وبعد،،،\n\n' +
      'مقدمه لسيادتكم الممول / ' + client.name + ' (أو وكيله الرسمي بالتفويض)، بشأن نشاط: (' + activityName + ').\n' +
      'الموضوع: طلب المحاسبة الضريبية المبسطة وتعديل الربط وأوراد التحصيل وفقاً لأحكام المادة الثالثة من القانون رقم 30 لسنة 2023 والقانون رقم 6 لسنة 2025، والمرتبط ببيان (' + dEntry.label + ': ' + dEntry.date + ') ورقم المرجع (' + formNum + ').\n\n' +
      datesSummaryLine +
      'أولاً - السند التشريعي للمحاسبة المبسطة: نصت المادة الثالثة من القانون رقم 30 لسنة 2023 (وكذلك القانون رقم 6 لسنة 2025 بشأن بعض الحوافز والتسهيلات الضريبية للمشروعات التي لا يتجاوز حجم أعمالها السنوي عشرين مليون جنيه) على أحقية الممول في المحاسبة الضريبية المبسطة (ضريبة قطعية أو نسبية مقطوعة من رقم الأعمال السنوي تتدرج من 1,000 جنيه أو 0.4% وحتى 1.5% بحسب الشريحة) دون الدخول في فحص تقديري للمصروفات أو نسب صافي الربح الحكمية متى كان ذلك أوفر للممول.\n\n' +
      'ثانياً - انطباق الشروط القانونية على ملف الممول: حيث إن رقم الأعمال السنوي للمنشأة عن سنوات الفحص يقع ضمن الشرائح القانونية المقررة لتطبيق هذا النظام المبسط ولا يتجاوز الحد الأقصى المقرر قانوناً، وذلك وفقاً لوقائع الملف: (' + problemText + ')، وما يترتب عليه من: (' + actionText + ').\n\n' +
      'بناءً عليه (الطلبات الختامية):\n' +
      'يلتمس الممول التكرم بالموافقة على:\n' +
      '1. تطبيق أحكام المادة الثالثة من القانون رقم 30 لسنة 2023 (أو أحكام القانون رقم 6 لسنة 2025 بحسب السنوات محل المحاسبة) على ملف الممول عن سنوات الفحص.\n' +
      '2. إعادة احتساب الضريبة المستحقة وتعديل الربط الضريبي وأوراد التحصيل الصادرة على هذا الأساس، مع خصم كافة المبالغ السابق سدادها أو استقطاعها تحت حساب الضريبة (نموذج 41) وتسوية مقابل التأخير تبعاً لذلك.';
  } else if (type === 'TAX_POSITION') {
    const dEntry = pickBestDateEntryForMemo(['موقف', 'توقف', 'تسوية', 'حفظ']);
    text =
      'السيد الأستاذ / رئيس ' + officeName + '\n' +
      'تحية طيبة وبعد،،،\n\n' +
      'مقدمه لسيادتكم الممول / ' + client.name + ' (أو وكيله الرسمي بالتفويض)، بشأن نشاط: (' + activityName + ').\n' +
      'الموضوع: طلب استخراج شهادة موقف ضريبي تسلسلي وإثبات حالة التوقف / التسوية لحفظ الملف ورفع الالتزامات، والمرتبط ببيان (' + dEntry.label + ': ' + dEntry.date + ') ورقم المرجع (' + formNum + ').\n\n' +
      datesSummaryLine +
      'أولاً - السند القانوني للطلب: استناداً إلى أحكام المادتين (29 و70) من قانون الإجراءات الضريبية الموحد رقم 206 لسنة 2020، يتشرف الممول بطلب استخراج شهادة رسمية بالموقف الضريبي التسلسلي توضح التاريخ الفعلي لبداية النشاط، وسنوات المحاسبة الضريبية المنتهية، وتاريخ التوقف الفعلي أو التسوية الضريبية على منظومة (SAP) والملف الورقي.\n\n' +
      'ثانياً - بيان الحالة التفصيلية للملف: (' + problemText + ')، والغرض الإجرائي من استخراج الشهادة: (' + actionText + ').\n\n' +
      'بناءً عليه (الطلبات الختامية):\n' +
      'يلتمس الممول التكرم بالموافقة على إصدار شهادة موقف ضريبي تسلسلي معتمدة توضح التسلسل التاريخي الكامل للمحاسبة والتوقف الفعلي للملف، وذلك لتقديمها إلى الجهة المختصة (مأمورية القيمة المضافة / شعبة الحصر والإقرارات / منظومة الساب) لحفظ الملف نهائياً ورفع أية التزامات أو مطالبات آلية غير مستحقة.';
  } else if (type === 'SEIZURE_APPEAL') {
    const dEntry = pickBestDateEntryForMemo(['حجز', 'أوراد', 'تنبيه', '19']);
    text =
      'السيد الأستاذ / رئيس ' + officeName + ' - شعبة الحجز والتحصيل والشؤون القانونية\n' +
      'تحية طيبة وبعد،،،\n\n' +
      'مقدمه لسيادتكم الممول / ' + client.name + ' (أو وكيله الرسمي بالتفويض)، بشأن نشاط: (' + activityName + ').\n' +
      'الموضوع: مذكرة طعن ومنازعة في محضر الحجز الإداري وأوراد التحصيل رقم (' + formNum + ') والمرتبط ببيان (' + dEntry.label + ': ' + dEntry.date + ') لبطلان الإعلان بسند التنفيذ وطلب فتح باب الطعن الموضوعي في أصل الربط الضريبي.\n\n' +
      datesSummaryLine +
      'أولاً - بطلان سند التنفيذ وأوراد التحصيل لانعدام الإعلان القانوني الصحيح بنموذج الربط: استقر قضاء محكمة النقض والمحكمة الإدارية العليا على أن أوراد التحصيل وإجراءات الحجز الإداري المتخذة بالتطبيق للقانون رقم 308 لسنة 1955 والمادة (69) من القانون رقم 206 لسنة 2020 تدور وجوداً وعدماً مع صحة إعلان الممول بنموذج ربط الضريبة (نموذج 19 دخل / نموذج 15 قيمة مضافة) إعلاناً قانونياً منتجاً لآثاره يتحقق به العلم اليقيني. وحيث لم يتحقق علم الممول اليقيني بنموذج الربط قبل فوات ميعاد الثلاثين يوماً المقرر بالمادة (54) من القانون رقم 206 لسنة 2020، فإن الربط لعدم الطعن يكون باطلاً ولا يصلح سنداً تنفيذياً لتوقيع الحجز الإداري.\n\n' +
      'ثانياً - المنازعة الجدية في أصل الدين الضريبي ومقداره: ينازع الممول منازعة جدية في أصل المديونية الضريبية المحجوز بمقتضاها، وفقاً للوقائع الثابتة بالملف: (' + problemText + ')، وما يقتضيه ذلك من: (' + actionText + ').\n\n' +
      'ثالثاً - التمسك بالتقادم الخمسي والأسس الفعلية للمحاسبة: يتمسك الممول بسقوط السنوات المنقضية بالتقادم الخمسي طبقاً للمادة (91) من القانون رقم 91 لسنة 2005، وبعدم صحة التقديرات الجزافية للسنوات الأخرى.\n\n' +
      'بناءً عليه (الطلبات الختامية):\n' +
      'يلتمس الممول:\n' +
      '1. وقف كافة إجراءات الحجز الإداري والتنفيذ الجبري وإلغاء أوراد التحصيل الصادرة لبطلان الإعلان بسند التنفيذ، وإصدار خطاب رفع الحجز إن كان موقعاً لدى البنوك.\n' +
      '2. قبول الطعن شكلاً وفتح باب الطعن الموضوعي في أصل الربط الضريبي (نموذج 19 / 15) وإحالة الملف إلى اللجنة الداخلية المختصة للمحاسبة على الأسس الفعلية أو وفقاً لأحكام المادة الثالثة من القانون رقم 30 لسنة 2023.';
  } else if (type === 'STOP_NOTICE') {
    const dEntry = pickBestDateEntryForMemo(['توقف', '16 مكرر', 'قفل', 'غلق']);
    text =
      'السيد الأستاذ / رئيس ' + officeName + ' - شعبة الحصر والفحص الضريبي\n' +
      'تحية طيبة وبعد،،،\n\n' +
      'مقدمه لسيادتكم الممول / ' + client.name + ' (أو وكيله الرسمي بالتفويض)، بشأن نشاط: (' + activityName + ').\n' +
      'الموضوع: إخطار رسمي بالتوقف عن مزاولة النشاط (كلي / جزئي) وطلب رفع المحاسبة الضريبية وحفظ الالتزامات عن فترة التوقف (نموذج 16 مكرر حصر رقم: ' + formNum + ')، والمرتبط ببيان (' + dEntry.label + ': ' + dEntry.date + ').\n\n' +
      datesSummaryLine +
      'أولاً - السند التشريعي لإخطار التوقف ورفع المحاسبة: عملاً بنص المادتين (58 و59) من قانون الضريبة على الدخل رقم 91 لسنة 2005، والمادة (26) من قانون الإجراءات الضريبية الموحد رقم 206 لسنة 2020، يخطر الممول المأمورية بتوقفه الفعلي عن مزاولة النشاط، ويتمسك بمحاسبته ضريبياً عن الفترة التي زاول فيها النشاط فعلياً فقط حتى تاريخ التوقف دون تحميله بأية أرباح تقديرية عن فترات التوقف التي لم تتحقق فيها أية واقعة منشئة للضريبة.\n\n' +
      'ثانياً - وقائع التوقف الفعلي والمستندات المؤيدة بالملف: (' + problemText + ')، والإجراء المطلوب تنفيذه: (' + actionText + ')، وذلك استناداً إلى المستندات الرسمية القاطعة المثبتة لتاريخ التوقف الفعلي وعدم تحقيق أية إيرادات بعده.\n\n' +
      'بناءً عليه (الطلبات الختامية):\n' +
      'يلتمس الممول:\n' +
      '1. إثبات واقعة التوقف عن النشاط (كلياً / جزئياً) بسجلات المأمورية وشعبة الحصر وعلى منظومة (SAP) اعتباراً من تاريخ التوقف الفعلي.\n' +
      '2. استبعاد فترة التوقف بالكامل من وعاء المحاسبة الضريبية ورفع أية مطالبات أو التزامات إقرارية عنها، وإحالة الملف للمحاسبة النهائية حتى تاريخ التوقف الفعلي وحفظ الملف.';
  } else if (type === 'PRESCRIPTION_MEMO') {
    const dEntry = pickBestDateEntryForMemo(['19', 'لجنة', 'تقادم', 'استلام']);
    text =
      'السيد الأستاذ / رئيس ' + officeName + ' / رئيس اللجنة الداخلية / رئيس لجنة الطعن الضريبي\n' +
      'تحية طيبة وبعد،،،\n\n' +
      'مقدمه لسيادتكم الممول / ' + client.name + ' (أو وكيله الرسمي بالتفويض)، بشأن نشاط: (' + activityName + ').\n' +
      'الموضوع: مذكرة دفاع قانونية بالدفع الأصلي بسقوط حق المصلحة في المطالبة بالضريبة بالتقادم الخمسي طبقاً للمادة (91) من القانون رقم 91 لسنة 2005 والمادة (377) من القانون المدني، بشأن الإخطار / الطعن رقم (' + formNum + ') والمرتبط ببيان (' + dEntry.label + ': ' + dEntry.date + ').\n\n' +
      datesSummaryLine +
      'أولاً - السند التشريعي للدفع بالتقادم الخمسي: تنص المادة (91 فقرة 2) من قانون الضريبة على الدخل رقم 91 لسنة 2005 على أنه: «يسقط حق المصلحة في المطالبة بالضريبة أو باقيها بمضي خمس سنوات تبدأ من اليوم التالي لانتهاء الأجل المحدد لتقديم الإقرار المنصوص عليه في المادة 82 من هذا القانون»، وهو ما يتفق مع الأصل العام المقرر بالمادة (377) من القانون المدني بشأن تقادم الضرائب والرسوم بخمس سنوات.\n\n' +
      'ثانياً - خلو الأوراق من أي إجراء قاطع للتقادم معلن قانوناً: استقرت أحكام محكمة النقض والمحكمة الدستورية العليا على أن الإجراء القاطع لتقادم الضريبة (كإخطار الممول بعناصر ربط الضريبة أو بقيمتها بنموذج 19 أو التنبيه عليه بأدائها أو الإحالة إلى لجان الطعن) لا ينتج أثره في قطع التقادم بمجرد تحريره داخلياً بالمأمورية، بل يشترط إعلانه للممول إعلاناً قانونياً صحيحاً يتحقق به علمه اليقيني قبل اكتمال مدة الخمس سنوات.\n\n' +
      'ثالثاً - تطبيق الدفع على وقائع ملف الممول وعدم القفز بأساس التقدير للسنوات اللاحقة: وفقاً لوقائع الملف: (' + problemText + ')، يتمسك الممول تمسكاً جازماً بسقوط السنوات المنقضية بالتقادم الخمسي دون تنازل صريح أو ضمني عنها، مع التمسك بعدم اتخاذ السنوات الساقطة بالتقادم ذريعة لرفع أساس التقدير في السنوات اللاحقة غير الساقطة، وفقاً لما هو مطلوب بالملف: (' + actionText + ').\n\n' +
      'بناءً عليه (الطلبات الختامية):\n' +
      'يلتمس الممول:\n' +
      '1. بصفة أصلية: إثبات سقوط حق المصلحة في الفحص والمطالبة بالضريبة عن السنوات التي اكتملت بشأنها مدة التقادم الخمسي المقررة بالمادة (91) من القانون رقم 91 لسنة 2005 ورفعها كلياً من المطالبة.\n' +
      '2. بالنسبة للسنوات اللاحقة غير الساقطة بالتقادم (إن وجدت): محاسبة الممول عنها على أسس فعلية مستقلة ومنخفضة تتفق مع حقيقة النشاط (أو بتطبيق أحكام المادة الثالثة من القانون رقم 30 لسنة 2023 / القانون رقم 6 لسنة 2025) دون ترحيل أي تدرج حكمي مرتفع من السنوات الساقطة بالتقادم.';
  }
  outputEl.value = text;
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
