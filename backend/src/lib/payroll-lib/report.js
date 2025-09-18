/**
 * T180: 급여 리포트 생성
 * 급여명세서 포맷팅 및 리포트 생성
 */

/**
 * 급여명세서 포맷팅
 * @param {Object} payrollData - 급여 계산 결과
 * @returns {Object} 포맷된 급여명세서
 */
function formatPayrollReport(payrollData) {
  const {
    userId,
    businessId,
    period,
    workHours,
    wages,
    allowances,
    deductions,
    summary,
    calculatedAt
  } = payrollData;

  const report = {
    // 헤더 정보
    header: {
      title: '급여명세서',
      period,
      generatedAt: new Date().toISOString(),
      calculatedAt
    },

    // 사원 정보
    employee: {
      userId,
      businessId
    },

    // 근무 내역
    workSummary: {
      totalHours: workHours.total,
      regularHours: workHours.regular,
      overtimeHours: workHours.overtime,
      nightHours: workHours.night,
      weekendHours: workHours.weekend,
      holidayHours: workHours.holiday
    },

    // 지급 내역
    earnings: {
      basic: {
        label: '기본급',
        amount: wages.regularPay
      },
      overtime: {
        label: '연장근로수당',
        amount: wages.overtimePay
      },
      nightShift: {
        label: '야간근로수당',
        amount: wages.nightShiftPay
      },
      weekend: {
        label: '휴일근로수당',
        amount: wages.weekendPay + wages.holidayPay
      },
      weeklyRest: {
        label: '주휴수당',
        amount: allowances.weeklyRest
      },
      meal: {
        label: '식대',
        amount: allowances.meal
      },
      transport: {
        label: '교통비',
        amount: allowances.transport
      },
      other: {
        label: '기타수당',
        amount: allowances.other
      },
      subtotal: summary.grossPay
    },

    // 공제 내역
    deductions: {
      nationalPension: {
        label: '국민연금',
        amount: deductions.nationalPension
      },
      healthInsurance: {
        label: '건강보험',
        amount: deductions.healthInsurance
      },
      longTermCare: {
        label: '장기요양보험',
        amount: deductions.longTermCare
      },
      employmentInsurance: {
        label: '고용보험',
        amount: deductions.employmentInsurance
      },
      incomeTax: {
        label: '소득세',
        amount: deductions.incomeTax
      },
      localIncomeTax: {
        label: '지방소득세',
        amount: Math.floor(deductions.incomeTax * 0.1)
      },
      other: {
        label: '기타공제',
        amount: deductions.other
      },
      subtotal: summary.totalDeductions
    },

    // 실수령액
    netPay: {
      label: '실수령액',
      amount: summary.netPay
    }
  };

  return report;
}

/**
 * 텍스트 형식 급여명세서 생성
 * @param {Object} report - 포맷된 급여명세서
 * @returns {string} 텍스트 급여명세서
 */
function generateTextReport(report) {
  const lines = [];
  const separator = '='.repeat(50);
  const thinSeparator = '-'.repeat(50);

  // 헤더
  lines.push(separator);
  lines.push(centerText(report.header.title, 50));
  lines.push(centerText(`급여기간: ${report.header.period}`, 50));
  lines.push(separator);
  lines.push('');

  // 근무 내역
  lines.push('[근무 내역]');
  lines.push(formatLine('총 근무시간', `${report.workSummary.totalHours}시간`));
  lines.push(formatLine('정규 근무', `${report.workSummary.regularHours}시간`));
  if (report.workSummary.overtimeHours > 0) {
    lines.push(formatLine('연장 근무', `${report.workSummary.overtimeHours}시간`));
  }
  if (report.workSummary.nightHours > 0) {
    lines.push(formatLine('야간 근무', `${report.workSummary.nightHours}시간`));
  }
  if (report.workSummary.weekendHours > 0) {
    lines.push(formatLine('휴일 근무', `${report.workSummary.weekendHours}시간`));
  }
  lines.push('');

  // 지급 내역
  lines.push('[지급 내역]');
  Object.values(report.earnings).forEach(item => {
    if (item.label && item.amount > 0) {
      lines.push(formatLine(item.label, formatCurrency(item.amount)));
    }
  });
  lines.push(thinSeparator);
  lines.push(formatLine('지급 합계', formatCurrency(report.earnings.subtotal), true));
  lines.push('');

  // 공제 내역
  lines.push('[공제 내역]');
  Object.values(report.deductions).forEach(item => {
    if (item.label && item.amount > 0) {
      lines.push(formatLine(item.label, formatCurrency(item.amount)));
    }
  });
  lines.push(thinSeparator);
  lines.push(formatLine('공제 합계', formatCurrency(report.deductions.subtotal), true));
  lines.push('');

  // 실수령액
  lines.push(separator);
  lines.push(formatLine(report.netPay.label, formatCurrency(report.netPay.amount), true));
  lines.push(separator);

  return lines.join('\n');
}

/**
 * HTML 형식 급여명세서 생성
 * @param {Object} report - 포맷된 급여명세서
 * @returns {string} HTML 급여명세서
 */
function generateHTMLReport(report) {
  const html = `
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <title>${report.header.title} - ${report.header.period}</title>
  <style>
    body {
      font-family: 'Malgun Gothic', sans-serif;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
    }
    h1 {
      text-align: center;
      color: #333;
    }
    .period {
      text-align: center;
      color: #666;
      margin-bottom: 30px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 20px;
    }
    th, td {
      padding: 8px;
      text-align: left;
      border-bottom: 1px solid #ddd;
    }
    th {
      background-color: #f5f5f5;
      font-weight: bold;
    }
    td.amount {
      text-align: right;
    }
    .subtotal {
      font-weight: bold;
      background-color: #f9f9f9;
    }
    .net-pay {
      font-size: 1.2em;
      font-weight: bold;
      color: #2c5aa0;
      background-color: #e8f0fe;
    }
  </style>
</head>
<body>
  <h1>${report.header.title}</h1>
  <div class="period">급여기간: ${report.header.period}</div>

  <h3>근무 내역</h3>
  <table>
    <tr><td>총 근무시간</td><td class="amount">${report.workSummary.totalHours}시간</td></tr>
    <tr><td>정규 근무</td><td class="amount">${report.workSummary.regularHours}시간</td></tr>
    ${report.workSummary.overtimeHours > 0 ?
      `<tr><td>연장 근무</td><td class="amount">${report.workSummary.overtimeHours}시간</td></tr>` : ''}
    ${report.workSummary.nightHours > 0 ?
      `<tr><td>야간 근무</td><td class="amount">${report.workSummary.nightHours}시간</td></tr>` : ''}
    ${report.workSummary.weekendHours > 0 ?
      `<tr><td>휴일 근무</td><td class="amount">${report.workSummary.weekendHours}시간</td></tr>` : ''}
  </table>

  <h3>지급 내역</h3>
  <table>
    ${Object.values(report.earnings).filter(item => item.label && item.amount > 0)
      .map(item => `<tr><td>${item.label}</td><td class="amount">${formatCurrency(item.amount)}</td></tr>`)
      .join('')}
    <tr class="subtotal">
      <td>지급 합계</td>
      <td class="amount">${formatCurrency(report.earnings.subtotal)}</td>
    </tr>
  </table>

  <h3>공제 내역</h3>
  <table>
    ${Object.values(report.deductions).filter(item => item.label && item.amount > 0)
      .map(item => `<tr><td>${item.label}</td><td class="amount">${formatCurrency(item.amount)}</td></tr>`)
      .join('')}
    <tr class="subtotal">
      <td>공제 합계</td>
      <td class="amount">${formatCurrency(report.deductions.subtotal)}</td>
    </tr>
  </table>

  <table>
    <tr class="net-pay">
      <td>${report.netPay.label}</td>
      <td class="amount">${formatCurrency(report.netPay.amount)}</td>
    </tr>
  </table>

  <div style="margin-top: 30px; text-align: center; color: #999; font-size: 0.9em;">
    생성일시: ${new Date(report.header.generatedAt).toLocaleString('ko-KR')}
  </div>
</body>
</html>
  `;

  return html.trim();
}

/**
 * 유틸리티 함수들
 */

function formatCurrency(amount) {
  return `${amount.toLocaleString('ko-KR')}원`;
}

function formatLine(label, value, isBold = false) {
  const labelWidth = 30;
  const valueWidth = 20;
  const paddedLabel = label.padEnd(labelWidth, ' ');
  const paddedValue = value.padStart(valueWidth, ' ');
  const line = `${paddedLabel}${paddedValue}`;
  return isBold ? `**${line}**` : line;
}

function centerText(text, width) {
  const padding = Math.max(0, Math.floor((width - text.length) / 2));
  return ' '.repeat(padding) + text;
}

/**
 * 급여 요약 리포트 생성
 * @param {Array} payrollList - 여러 직원의 급여 데이터
 * @returns {Object} 요약 리포트
 */
function generateSummaryReport(payrollList) {
  if (!Array.isArray(payrollList) || payrollList.length === 0) {
    return null;
  }

  const summary = {
    period: payrollList[0].period,
    employeeCount: payrollList.length,
    totalGrossPay: 0,
    totalDeductions: 0,
    totalNetPay: 0,
    averageGrossPay: 0,
    averageNetPay: 0,
    details: []
  };

  payrollList.forEach(payroll => {
    summary.totalGrossPay += payroll.summary.grossPay;
    summary.totalDeductions += payroll.summary.totalDeductions;
    summary.totalNetPay += payroll.summary.netPay;

    summary.details.push({
      userId: payroll.userId,
      grossPay: payroll.summary.grossPay,
      deductions: payroll.summary.totalDeductions,
      netPay: payroll.summary.netPay
    });
  });

  summary.averageGrossPay = Math.floor(summary.totalGrossPay / summary.employeeCount);
  summary.averageNetPay = Math.floor(summary.totalNetPay / summary.employeeCount);

  return summary;
}

module.exports = {
  formatPayrollReport,
  generateTextReport,
  generateHTMLReport,
  generateSummaryReport
};