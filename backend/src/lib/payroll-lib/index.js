/**
 * T176: payroll-lib 메인 진입점
 * 급여 계산 라이브러리
 */

const calculatePayroll = require('./calculate');
const validatePayroll = require('./validate');
const taxCalculator = require('./tax');
const overtimeCalculator = require('./overtime');
const benefitsCalculator = require('./benefits');
const { formatPayrollReport, generateTextReport, generateHTMLReport, generateSummaryReport } = require('./report');
const pdfGenerator = require('./pdf');

module.exports = {
  // 급여 계산
  calculatePayroll,
  calculateMonthlyPayroll: calculatePayroll.calculateMonthlyPayroll,
  calculateDailyPayroll: calculatePayroll.calculateDailyPayroll,
  calculateHourlyWage: calculatePayroll.calculateHourlyWage,

  // 유효성 검증
  validatePayrollData: validatePayroll.validatePayrollData,
  validateWorkHours: validatePayroll.validateWorkHours,
  validateWageData: validatePayroll.validateWageData,

  // 세금 계산
  calculateIncomeTax: taxCalculator.calculateIncomeTax,
  calculateLocalIncomeTax: taxCalculator.calculateLocalIncomeTax,
  calculateNationalPension: taxCalculator.calculateNationalPension,
  calculateHealthInsurance: taxCalculator.calculateHealthInsurance,
  calculateEmploymentInsurance: taxCalculator.calculateEmploymentInsurance,
  calculateLongTermCare: taxCalculator.calculateLongTermCare,

  // 초과 근무 계산
  calculateOvertime: overtimeCalculator.calculateOvertime,
  calculateNightShift: overtimeCalculator.calculateNightShift,
  calculateHolidayPay: overtimeCalculator.calculateHolidayPay,
  calculateWeekendPay: overtimeCalculator.calculateWeekendPay,

  // 수당 계산
  calculateWeeklyRestAllowance: benefitsCalculator.calculateWeeklyRestAllowance,
  calculateAnnualLeaveAllowance: benefitsCalculator.calculateAnnualLeaveAllowance,
  calculateMealAllowance: benefitsCalculator.calculateMealAllowance,
  calculateTransportAllowance: benefitsCalculator.calculateTransportAllowance,

  // 리포트 생성
  formatPayrollReport,
  generateTextReport,
  generateHTMLReport,
  generateSummaryReport,

  // PDF 생성
  generatePDF: pdfGenerator.generatePDF,
  savePDF: pdfGenerator.savePDF,
  generateBulkPDF: pdfGenerator.generateBulkPDF,
  generatePDFArchive: pdfGenerator.generatePDFArchive,
  prepareForDatabase: pdfGenerator.prepareForDatabase,

  // 상수
  constants: {
    MINIMUM_WAGE_2024: 9860, // 2024년 최저시급
    STANDARD_WORK_HOURS_DAILY: 8,
    STANDARD_WORK_HOURS_WEEKLY: 40,
    OVERTIME_RATE: 1.5, // 초과근무 할증률 150%
    NIGHT_SHIFT_RATE: 1.5, // 야간근무 할증률 150%
    HOLIDAY_RATE: 1.5, // 휴일근무 할증률 150%
    WEEKEND_RATE: 1.5, // 주말근무 할증률 150%

    // 4대보험 요율 (2024년 기준)
    NATIONAL_PENSION_RATE: 0.045, // 국민연금 4.5%
    HEALTH_INSURANCE_RATE: 0.03545, // 건강보험 3.545%
    LONG_TERM_CARE_RATE: 0.004591, // 장기요양보험 (건강보험의 12.95%)
    EMPLOYMENT_INSURANCE_RATE: 0.009, // 고용보험 0.9%

    // 세금 관련
    TAX_FREE_LIMIT: 100000, // 비과세 한도 10만원 (식대 등)

    // 근무 시간 구분
    NIGHT_SHIFT_START: 22, // 22시 이후
    NIGHT_SHIFT_END: 6, // 06시 이전

    // 주휴수당 조건
    WEEKLY_REST_MIN_HOURS: 15, // 주 15시간 이상 근무시 주휴수당
    WEEKLY_REST_RATE: 1.0 // 주휴수당은 통상임금의 100%
  }
};