/**
 * T191: 급여명세서 생성 테스트 (RED)
 * 급여명세서 포맷팅 및 생성 테스트
 */

const payrollLib = require('../../../src/lib/payroll-lib');

describe('급여명세서 생성', () => {
  const samplePayrollData = {
    userId: 1,
    businessId: 1,
    period: '2024-01',
    year: 2024,
    month: 1,
    workHours: {
      total: 176,
      regular: 160,
      overtime: 16,
      night: 8,
      weekend: 0,
      holiday: 0
    },
    wages: {
      baseWage: 3000000,
      hourlyWage: 14329,
      regularPay: 2292640,
      overtimePay: 343896,
      nightShiftPay: 57316,
      weekendPay: 0,
      holidayPay: 0
    },
    allowances: {
      weeklyRest: 458528,
      meal: 100000,
      transport: 50000,
      other: 0,
      total: 608528
    },
    deductions: {
      nationalPension: 135000,
      healthInsurance: 106350,
      longTermCare: 13772,
      employmentInsurance: 27000,
      incomeTax: 150000,
      other: 0,
      total: 432122
    },
    summary: {
      grossPay: 3302380,
      totalDeductions: 432122,
      netPay: 2870258
    },
    calculatedAt: new Date('2024-02-01T00:00:00Z')
  };

  describe('급여명세서 포맷팅', () => {
    test('급여명세서 객체 생성', () => {
      const report = payrollLib.formatPayrollReport(samplePayrollData);

      expect(report).toHaveProperty('header');
      expect(report).toHaveProperty('employee');
      expect(report).toHaveProperty('workSummary');
      expect(report).toHaveProperty('earnings');
      expect(report).toHaveProperty('deductions');
      expect(report).toHaveProperty('netPay');
    });

    test('헤더 정보 포함', () => {
      const report = payrollLib.formatPayrollReport(samplePayrollData);

      expect(report.header).toHaveProperty('title', '급여명세서');
      expect(report.header).toHaveProperty('period', '2024-01');
      expect(report.header).toHaveProperty('generatedAt');
      expect(report.header).toHaveProperty('calculatedAt');
    });

    test('근무 시간 요약', () => {
      const report = payrollLib.formatPayrollReport(samplePayrollData);

      expect(report.workSummary.totalHours).toBe(176);
      expect(report.workSummary.regularHours).toBe(160);
      expect(report.workSummary.overtimeHours).toBe(16);
      expect(report.workSummary.nightHours).toBe(8);
    });

    test('지급 내역 포맷팅', () => {
      const report = payrollLib.formatPayrollReport(samplePayrollData);

      expect(report.earnings.basic.label).toBe('기본급');
      expect(report.earnings.basic.amount).toBe(2292640);
      expect(report.earnings.overtime.label).toBe('연장근로수당');
      expect(report.earnings.overtime.amount).toBe(343896);
      expect(report.earnings.meal.label).toBe('식대');
      expect(report.earnings.meal.amount).toBe(100000);
      expect(report.earnings.subtotal).toBe(3302380);
    });

    test('공제 내역 포맷팅', () => {
      const report = payrollLib.formatPayrollReport(samplePayrollData);

      expect(report.deductions.nationalPension.label).toBe('국민연금');
      expect(report.deductions.nationalPension.amount).toBe(135000);
      expect(report.deductions.healthInsurance.label).toBe('건강보험');
      expect(report.deductions.healthInsurance.amount).toBe(106350);
      expect(report.deductions.incomeTax.label).toBe('소득세');
      expect(report.deductions.incomeTax.amount).toBe(150000);
      expect(report.deductions.subtotal).toBe(432122);
    });

    test('실수령액 표시', () => {
      const report = payrollLib.formatPayrollReport(samplePayrollData);

      expect(report.netPay.label).toBe('실수령액');
      expect(report.netPay.amount).toBe(2870258);
    });
  });

  describe('텍스트 형식 급여명세서', () => {
    test('텍스트 급여명세서 생성', () => {
      const report = payrollLib.formatPayrollReport(samplePayrollData);
      const textReport = payrollLib.generateTextReport(report);

      expect(textReport).toContain('급여명세서');
      expect(textReport).toContain('2024-01');
      expect(textReport).toContain('[근무 내역]');
      expect(textReport).toContain('[지급 내역]');
      expect(textReport).toContain('[공제 내역]');
      expect(textReport).toContain('실수령액');
      expect(textReport).toContain('2,870,258원');
    });

    test('통화 포맷 적용', () => {
      const report = payrollLib.formatPayrollReport(samplePayrollData);
      const textReport = payrollLib.generateTextReport(report);

      // 천단위 구분자 확인
      expect(textReport).toMatch(/[\d,]+원/);
      // 실수령액 포맷 확인
      expect(textReport).toContain('2,870,258원');
    });
  });

  describe('HTML 형식 급여명세서', () => {
    test('HTML 급여명세서 생성', () => {
      const report = payrollLib.formatPayrollReport(samplePayrollData);
      const htmlReport = payrollLib.generateHTMLReport(report);

      expect(htmlReport).toContain('<!DOCTYPE html>');
      expect(htmlReport).toContain('<html lang="ko">');
      expect(htmlReport).toContain('<title>급여명세서 - 2024-01</title>');
      expect(htmlReport).toContain('<table>');
      expect(htmlReport).toContain('근무 내역');
      expect(htmlReport).toContain('지급 내역');
      expect(htmlReport).toContain('공제 내역');
    });

    test('CSS 스타일 포함', () => {
      const report = payrollLib.formatPayrollReport(samplePayrollData);
      const htmlReport = payrollLib.generateHTMLReport(report);

      expect(htmlReport).toContain('<style>');
      expect(htmlReport).toContain('font-family');
      expect(htmlReport).toContain('border-collapse');
      expect(htmlReport).toContain('.net-pay');
    });

    test('테이블 구조 확인', () => {
      const report = payrollLib.formatPayrollReport(samplePayrollData);
      const htmlReport = payrollLib.generateHTMLReport(report);

      // 근무 내역 테이블
      expect(htmlReport).toContain('<td>총 근무시간</td>');
      expect(htmlReport).toContain('<td class="amount">176시간</td>');

      // 지급 내역 테이블
      expect(htmlReport).toContain('<td>기본급</td>');
      expect(htmlReport).toContain('2,292,640원');

      // 실수령액 강조
      expect(htmlReport).toContain('class="net-pay"');
      expect(htmlReport).toContain('2,870,258원');
    });
  });

  describe('급여 요약 리포트', () => {
    test('여러 직원 급여 요약', () => {
      const payrollList = [
        { ...samplePayrollData, userId: 1 },
        { ...samplePayrollData, userId: 2, summary: { grossPay: 2500000, totalDeductions: 350000, netPay: 2150000 } },
        { ...samplePayrollData, userId: 3, summary: { grossPay: 2000000, totalDeductions: 280000, netPay: 1720000 } }
      ];

      const summaryReport = payrollLib.generateSummaryReport(payrollList);

      expect(summaryReport).toHaveProperty('period', '2024-01');
      expect(summaryReport).toHaveProperty('employeeCount', 3);
      expect(summaryReport).toHaveProperty('totalGrossPay');
      expect(summaryReport).toHaveProperty('totalNetPay');
      expect(summaryReport).toHaveProperty('averageGrossPay');
      expect(summaryReport).toHaveProperty('averageNetPay');
      expect(summaryReport).toHaveProperty('details');
      expect(summaryReport.details).toHaveLength(3);
    });

    test('빈 목록 처리', () => {
      const summaryReport = payrollLib.generateSummaryReport([]);
      expect(summaryReport).toBeNull();
    });
  });

  describe('급여명세서 저장', () => {
    test('데이터베이스 저장 형식', () => {
      const statementData = payrollLib.prepareForDatabase(samplePayrollData);

      // pay_statements 테이블 컬럼과 일치
      expect(statementData).toHaveProperty('business_id', 1);
      expect(statementData).toHaveProperty('user_id', 1);
      expect(statementData).toHaveProperty('year', 2024);
      expect(statementData).toHaveProperty('month', 1);
      expect(statementData).toHaveProperty('total_work_hours', 176);
      expect(statementData).toHaveProperty('regular_pay', 2292640);
      expect(statementData).toHaveProperty('overtime_pay', 343896);
      expect(statementData).toHaveProperty('gross_pay', 3302380);
      expect(statementData).toHaveProperty('net_pay', 2870258);
      expect(statementData).toHaveProperty('status', 'draft');
    });
  });
});