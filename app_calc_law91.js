'use strict';

function computeProgressiveBrackets(base, brackets, noExemption) {
  let remaining = base;
  let prevLimit = 0;
  let totalTax = 0;
  const rows = [];
  for (let i = 0; i < brackets.length; i++) {
    const br = brackets[i];
    const width = br.upTo === Infinity ? Infinity : Math.max(0, br.upTo - prevLimit);
    const slice = Math.min(remaining, width);
    let rate = br.rate;
    if (i === 0 && noExemption && rate === 0 && brackets.length > 1) {
      rate = brackets[1].rate;
    }
    const tax = slice * rate;
    if (slice > 0) {
      rows.push({
        label: br.label + (i === 0 && noExemption && br.rate === 0 ? ' (بدون إعفاء)' : ''),
        amount: Math.round(slice),
        ratePct: +(rate * 100).toFixed(2),
        tax: Math.round(tax * 100) / 100
      });
    }
    totalTax += tax;
    remaining -= slice;
    prevLimit = br.upTo;
    if (remaining <= 0) break;
  }
  return { totalTax, rows };
}

function calcLaw91Detailed(netProfit, options) {
  const opts = options || {};
  const year = Number(opts.year) || 2026;
  const months = Math.min(12, Math.max(1, Number(opts.months) || 12));
  const noExemption = Boolean(opts.noExemption);
  const rawPeriod = Math.max(0, Number(netProfit) || 0);
  const rawAnnual = months < 12 ? (rawPeriod * (12 / months)) : rawPeriod;
  const annualBase = Math.floor(rawAnnual / 10) * 10;

  if (annualBase <= 0) {
    return {
      year, months, noExemption, annualBase: 0, annualTax: 0, tax: 0,
      lawLabel: 'قانون 91 لسنة 2005', exemptAmount: 0, taxCreditRate: 0, taxCreditAmount: 0, rows: []
    };
  }

  let lawLabel = 'قانون 7 لسنة 2024';
  let exemptAmount = 40000;
  let taxCreditRate = 0;
  let taxCreditAmount = 0;
  let res = { totalTax: 0, rows: [] };

  if (year >= 2024) {
    lawLabel = 'قانون 7 لسنة 2024';
    exemptAmount = noExemption ? 0 : (annualBase <= 600000 ? 40000 : 0);
    let brackets;
    if (annualBase <= 600000) {
      brackets = [
        { upTo: 40000, rate: 0, label: 'حتى 40,000 (معفاة)' },
        { upTo: 55000, rate: 0.10, label: '40 إلى 55 ألف' },
        { upTo: 70000, rate: 0.15, label: '55 إلى 70 ألف' },
        { upTo: 200000, rate: 0.20, label: '70 إلى 200 ألف' },
        { upTo: 400000, rate: 0.225, label: '200 إلى 400 ألف' },
        { upTo: Infinity, rate: 0.25, label: 'أكثر من 400 ألف' }
      ];
    } else if (annualBase <= 700000) {
      brackets = [
        { upTo: 55000, rate: 0.10, label: 'حتى 55 ألف (سقوط الإعفاء)' },
        { upTo: 70000, rate: 0.15, label: '55 إلى 70 ألف' },
        { upTo: 200000, rate: 0.20, label: '70 إلى 200 ألف' },
        { upTo: 400000, rate: 0.225, label: '200 إلى 400 ألف' },
        { upTo: Infinity, rate: 0.25, label: 'أكثر من 400 ألف' }
      ];
    } else if (annualBase <= 800000) {
      brackets = [
        { upTo: 70000, rate: 0.15, label: 'حتى 70 ألف' },
        { upTo: 200000, rate: 0.20, label: '70 إلى 200 ألف' },
        { upTo: 400000, rate: 0.225, label: '200 إلى 400 ألف' },
        { upTo: Infinity, rate: 0.25, label: 'أكثر من 400 ألف' }
      ];
    } else if (annualBase <= 900000) {
      brackets = [
        { upTo: 200000, rate: 0.20, label: 'حتى 200 ألف' },
        { upTo: 400000, rate: 0.225, label: '200 إلى 400 ألف' },
        { upTo: Infinity, rate: 0.25, label: 'أكثر من 400 ألف' }
      ];
    } else if (annualBase <= 1200000) {
      brackets = [
        { upTo: 400000, rate: 0.225, label: 'حتى 400 ألف' },
        { upTo: Infinity, rate: 0.25, label: '400 ألف إلى 1.2 مليون' }
      ];
    } else {
      brackets = [
        { upTo: 1200000, rate: 0.25, label: 'حتى 1.2 مليون' },
        { upTo: Infinity, rate: 0.275, label: 'ما زاد عن 1.2 مليون' }
      ];
    }
    res = computeProgressiveBrackets(annualBase, brackets, noExemption);
  } else if (year === 2023) {
    lawLabel = 'قانون 30 / 175 لسنة 2023';
    exemptAmount = noExemption ? 0 : (annualBase <= 600000 ? 30000 : 0);
    let brackets;
    if (annualBase <= 600000) {
      brackets = [
        { upTo: 30000, rate: 0, label: 'حتى 30,000 (معفاة)' },
        { upTo: 45000, rate: 0.10, label: '30 إلى 45 ألف' },
        { upTo: 60000, rate: 0.15, label: '45 إلى 60 ألف' },
        { upTo: 200000, rate: 0.20, label: '60 إلى 200 ألف' },
        { upTo: 400000, rate: 0.225, label: '200 إلى 400 ألف' },
        { upTo: Infinity, rate: 0.25, label: 'أكثر من 400 ألف' }
      ];
    } else if (annualBase <= 700000) {
      brackets = [
        { upTo: 45000, rate: 0.10, label: 'حتى 45 ألف' },
        { upTo: 60000, rate: 0.15, label: '45 إلى 60 ألف' },
        { upTo: 200000, rate: 0.20, label: '60 إلى 200 ألف' },
        { upTo: 400000, rate: 0.225, label: '200 إلى 400 ألف' },
        { upTo: Infinity, rate: 0.25, label: 'أكثر من 400 ألف' }
      ];
    } else if (annualBase <= 800000) {
      brackets = [
        { upTo: 60000, rate: 0.15, label: 'حتى 60 ألف' },
        { upTo: 200000, rate: 0.20, label: '60 إلى 200 ألف' },
        { upTo: 400000, rate: 0.225, label: '200 إلى 400 ألف' },
        { upTo: Infinity, rate: 0.25, label: 'أكثر من 400 ألف' }
      ];
    } else if (annualBase <= 900000) {
      brackets = [
        { upTo: 200000, rate: 0.20, label: 'حتى 200 ألف' },
        { upTo: 400000, rate: 0.225, label: '200 إلى 400 ألف' },
        { upTo: Infinity, rate: 0.25, label: 'أكثر من 400 ألف' }
      ];
    } else if (annualBase <= 1200000) {
      brackets = [
        { upTo: 400000, rate: 0.225, label: 'حتى 400 ألف' },
        { upTo: Infinity, rate: 0.25, label: '400 ألف إلى 1.2 مليون' }
      ];
    } else {
      brackets = [
        { upTo: 1200000, rate: 0.25, label: 'حتى 1.2 مليون' },
        { upTo: Infinity, rate: 0.275, label: 'ما زاد عن 1.2 مليون' }
      ];
    }
    res = computeProgressiveBrackets(annualBase, brackets, noExemption);
  } else if (year >= 2020) {
    lawLabel = 'قانون 26 لسنة 2020';
    exemptAmount = noExemption ? 0 : (annualBase <= 600000 ? 15000 : 0);
    let brackets;
    if (annualBase <= 600000) {
      brackets = [
        { upTo: 15000, rate: 0, label: 'حتى 15,000 (معفاة)' },
        { upTo: 30000, rate: 0.025, label: '15 إلى 30 ألف' },
        { upTo: 45000, rate: 0.10, label: '30 إلى 45 ألف' },
        { upTo: 60000, rate: 0.15, label: '45 إلى 60 ألف' },
        { upTo: 200000, rate: 0.20, label: '60 إلى 200 ألف' },
        { upTo: 400000, rate: 0.225, label: '200 إلى 400 ألف' },
        { upTo: Infinity, rate: 0.25, label: 'أكثر من 400 ألف' }
      ];
    } else if (annualBase <= 700000) {
      brackets = [
        { upTo: 30000, rate: 0.025, label: 'حتى 30 ألف' },
        { upTo: 45000, rate: 0.10, label: '30 إلى 45 ألف' },
        { upTo: 60000, rate: 0.15, label: '45 إلى 60 ألف' },
        { upTo: 200000, rate: 0.20, label: '60 إلى 200 ألف' },
        { upTo: 400000, rate: 0.225, label: '200 إلى 400 ألف' },
        { upTo: Infinity, rate: 0.25, label: 'أكثر من 400 ألف' }
      ];
    } else if (annualBase <= 800000) {
      brackets = [
        { upTo: 45000, rate: 0.10, label: 'حتى 45 ألف' },
        { upTo: 60000, rate: 0.15, label: '45 إلى 60 ألف' },
        { upTo: 200000, rate: 0.20, label: '60 إلى 200 ألف' },
        { upTo: 400000, rate: 0.225, label: '200 إلى 400 ألف' },
        { upTo: Infinity, rate: 0.25, label: 'أكثر من 400 ألف' }
      ];
    } else if (annualBase <= 900000) {
      brackets = [
        { upTo: 60000, rate: 0.15, label: 'حتى 60 ألف' },
        { upTo: 200000, rate: 0.20, label: '60 إلى 200 ألف' },
        { upTo: 400000, rate: 0.225, label: '200 إلى 400 ألف' },
        { upTo: Infinity, rate: 0.25, label: 'أكثر من 400 ألف' }
      ];
    } else if (annualBase <= 1000000) {
      brackets = [
        { upTo: 200000, rate: 0.20, label: 'حتى 200 ألف' },
        { upTo: 400000, rate: 0.225, label: '200 إلى 400 ألف' },
        { upTo: Infinity, rate: 0.25, label: 'أكثر من 400 ألف' }
      ];
    } else {
      brackets = [
        { upTo: 400000, rate: 0.225, label: 'حتى 400 ألف' },
        { upTo: Infinity, rate: 0.25, label: 'أكثر من 400 ألف' }
      ];
    }
    res = computeProgressiveBrackets(annualBase, brackets, noExemption);
  } else if (year >= 2018) {
    lawLabel = 'قانون 97 لسنة 2018 (بالخصم الضريبي)';
    exemptAmount = noExemption ? 0 : 8000;
    const brackets = [
      { upTo: 8000, rate: 0, label: 'حتى 8,000 (معفاة)' },
      { upTo: 30000, rate: 0.10, label: '8 إلى 30 ألف' },
      { upTo: 45000, rate: 0.15, label: '30 إلى 45 ألف' },
      { upTo: 200000, rate: 0.20, label: '45 إلى 200 ألف' },
      { upTo: Infinity, rate: 0.225, label: 'أكثر من 200 ألف' }
    ];
    res = computeProgressiveBrackets(annualBase, brackets, noExemption);
    if (annualBase > 8000 && annualBase <= 30000) taxCreditRate = 0.85;
    else if (annualBase > 30000 && annualBase <= 45000) taxCreditRate = 0.45;
    else if (annualBase > 45000 && annualBase <= 200000) taxCreditRate = 0.075;
    taxCreditAmount = res.totalTax * taxCreditRate;
  } else if (year === 2017) {
    lawLabel = 'قانون 82 لسنة 2017 (بالخصم الضريبي)';
    exemptAmount = noExemption ? 0 : 7200;
    const brackets = [
      { upTo: 7200, rate: 0, label: 'حتى 7,200 (معفاة)' },
      { upTo: 30000, rate: 0.10, label: '7.2 إلى 30 ألف' },
      { upTo: 45000, rate: 0.15, label: '30 إلى 45 ألف' },
      { upTo: 200000, rate: 0.20, label: '45 إلى 200 ألف' },
      { upTo: Infinity, rate: 0.225, label: 'أكثر من 200 ألف' }
    ];
    res = computeProgressiveBrackets(annualBase, brackets, noExemption);
    if (annualBase > 7200 && annualBase <= 30000) taxCreditRate = 0.80;
    else if (annualBase > 30000 && annualBase <= 45000) taxCreditRate = 0.40;
    else if (annualBase > 45000 && annualBase <= 200000) taxCreditRate = 0.05;
    taxCreditAmount = res.totalTax * taxCreditRate;
  } else if (year >= 2015) {
    lawLabel = 'قانون 96 لسنة 2015';
    exemptAmount = noExemption ? 0 : 6500;
    const brackets = [
      { upTo: 6500, rate: 0, label: 'حتى 6,500 (معفاة)' },
      { upTo: 30000, rate: 0.10, label: '6.5 إلى 30 ألف' },
      { upTo: 45000, rate: 0.15, label: '30 إلى 45 ألف' },
      { upTo: 200000, rate: 0.20, label: '45 إلى 200 ألف' },
      { upTo: Infinity, rate: 0.225, label: 'أكثر من 200 ألف' }
    ];
    res = computeProgressiveBrackets(annualBase, brackets, noExemption);
  } else if (year >= 2013) {
    lawLabel = 'قانون 11 لسنة 2013';
    exemptAmount = noExemption ? 0 : 5000;
    const brackets = [
      { upTo: 5000, rate: 0, label: 'حتى 5,000 (معفاة)' },
      { upTo: 30000, rate: 0.10, label: '5 إلى 30 ألف' },
      { upTo: 45000, rate: 0.15, label: '30 إلى 45 ألف' },
      { upTo: 250000, rate: 0.20, label: '45 إلى 250 ألف' },
      { upTo: Infinity, rate: 0.25, label: 'أكثر من 250 ألف' }
    ];
    res = computeProgressiveBrackets(annualBase, brackets, noExemption);
  } else {
    lawLabel = 'قانون 91 لسنة 2005 (الأصلي)';
    exemptAmount = noExemption ? 0 : 5000;
    const brackets = [
      { upTo: 5000, rate: 0, label: 'حتى 5,000 (معفاة)' },
      { upTo: 20000, rate: 0.10, label: '5 إلى 20 ألف' },
      { upTo: 40000, rate: 0.15, label: '20 إلى 40 ألف' },
      { upTo: Infinity, rate: 0.20, label: 'أكثر من 40 ألف' }
    ];
    res = computeProgressiveBrackets(annualBase, brackets, noExemption);
  }

  const annualTaxRaw = Math.max(0, res.totalTax - taxCreditAmount);
  const annualTax = Math.round(annualTaxRaw);
  const periodTax = Math.round(annualTaxRaw * (months / 12));

  return {
    year,
    months,
    noExemption,
    annualBase,
    annualTax,
    tax: periodTax,
    lawLabel,
    exemptAmount,
    taxCreditRate,
    taxCreditAmount: Math.round(taxCreditAmount),
    rows: res.rows
  };
}

function calcLaw91IndividualTax(netProfit) {
  return calcLaw91Detailed(netProfit, { year: 2026, months: 12, noExemption: false }).tax;
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
