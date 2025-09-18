/**
 * T177: 급여 계산 핵심 로직
 * 월급, 일급, 시급 계산
 */

const moment = require('moment');
const overtimeCalculator = require('./overtime');
const benefitsCalculator = require('./benefits');
const taxCalculator = require('./tax');

/**
 * 월 급여 계산
 * @param {Object} options - 계산 옵션
 * @returns {Object} 급여 계산 결과
 */
async function calculateMonthlyPayroll(options) {
  const {
    userId,
    businessId,
    year,
    month,
    baseWage,
    workRecords = [],
    schedules = [],
    allowances = {},
    deductions = {}
  } = options;

  // 1. 기본 근무 시간 계산
  let totalWorkMinutes = 0;
  let regularMinutes = 0;
  let overtimeMinutes = 0;
  let nightMinutes = 0;
  let holidayMinutes = 0;
  let weekendMinutes = 0;

  // 근무 기록에서 시간 계산
  workRecords.forEach(record => {
    if (record.check_out_time) {
      const checkIn = moment(record.check_in_time);
      const checkOut = moment(record.check_out_time);
      const duration = checkOut.diff(checkIn, 'minutes');

      totalWorkMinutes += duration;

      // 정규 근무 시간 (8시간까지)
      const dailyRegular = Math.min(duration, 480); // 8시간 = 480분
      regularMinutes += dailyRegular;

      // 초과 근무 시간
      if (duration > 480) {
        overtimeMinutes += duration - 480;
      }

      // 야간 근무 체크 (22:00 - 06:00)
      const nightStart = checkIn.clone().hour(22).minute(0);
      const nightEnd = checkIn.clone().add(1, 'day').hour(6).minute(0);

      if (checkOut.isAfter(nightStart) || checkIn.isBefore(nightEnd)) {
        // 야간 근무 시간 계산 로직
        nightMinutes += calculateNightMinutes(checkIn, checkOut);
      }

      // 주말/휴일 체크
      const dayOfWeek = checkIn.day();
      if (dayOfWeek === 0 || dayOfWeek === 6) {
        weekendMinutes += duration;
      }
    }
  });

  // 2. 시급 계산
  const hourlyWage = calculateHourlyWage(baseWage);

  // 3. 기본급 계산
  const regularHours = regularMinutes / 60;
  const regularPay = Math.floor(regularHours * hourlyWage);

  // 4. 초과 수당 계산
  const overtimePay = overtimeCalculator.calculateOvertime({
    overtimeMinutes,
    hourlyWage
  });

  const nightShiftPay = overtimeCalculator.calculateNightShift({
    nightMinutes,
    hourlyWage
  });

  const weekendPay = overtimeCalculator.calculateWeekendPay({
    weekendMinutes,
    hourlyWage
  });

  const holidayPay = overtimeCalculator.calculateHolidayPay({
    holidayMinutes,
    hourlyWage
  });

  // 5. 주휴수당 계산 (주 15시간 이상 근무시)
  const weeklyRestAllowance = benefitsCalculator.calculateWeeklyRestAllowance({
    weeklyWorkHours: totalWorkMinutes / 60 / 4, // 주당 평균
    hourlyWage
  });

  // 6. 기타 수당 계산
  const mealAllowance = allowances.meal || 0;
  const transportAllowance = allowances.transport || 0;
  const otherAllowances = allowances.other || 0;

  // 7. 총 지급액 계산
  const grossPay =
    regularPay +
    overtimePay +
    nightShiftPay +
    weekendPay +
    holidayPay +
    weeklyRestAllowance +
    mealAllowance +
    transportAllowance +
    otherAllowances;

  // 8. 공제 계산 (4대보험 + 소득세)
  const nationalPension = taxCalculator.calculateNationalPension(grossPay);
  const healthInsurance = taxCalculator.calculateHealthInsurance(grossPay);
  const longTermCare = taxCalculator.calculateLongTermCare(healthInsurance);
  const employmentInsurance = taxCalculator.calculateEmploymentInsurance(grossPay);
  const incomeTax = taxCalculator.calculateIncomeTax(grossPay);

  // 9. 기타 공제
  const otherDeductions = deductions.other || 0;

  // 10. 총 공제액
  const totalDeductions =
    nationalPension +
    healthInsurance +
    longTermCare +
    employmentInsurance +
    incomeTax +
    otherDeductions;

  // 11. 실수령액
  const netPay = grossPay - totalDeductions;

  return {
    // 기본 정보
    userId,
    businessId,
    year,
    month,
    period: `${year}-${String(month).padStart(2, '0')}`,

    // 근무 시간
    workHours: {
      total: Math.floor(totalWorkMinutes / 60),
      regular: Math.floor(regularMinutes / 60),
      overtime: Math.floor(overtimeMinutes / 60),
      night: Math.floor(nightMinutes / 60),
      weekend: Math.floor(weekendMinutes / 60),
      holiday: Math.floor(holidayMinutes / 60)
    },

    // 급여 내역
    wages: {
      baseWage,
      hourlyWage,
      regularPay,
      overtimePay,
      nightShiftPay,
      weekendPay,
      holidayPay
    },

    // 수당
    allowances: {
      weeklyRest: weeklyRestAllowance,
      meal: mealAllowance,
      transport: transportAllowance,
      other: otherAllowances,
      total: weeklyRestAllowance + mealAllowance + transportAllowance + otherAllowances
    },

    // 공제
    deductions: {
      nationalPension,
      healthInsurance,
      longTermCare,
      employmentInsurance,
      incomeTax,
      other: otherDeductions,
      total: totalDeductions
    },

    // 총계
    summary: {
      grossPay,
      totalDeductions,
      netPay
    },

    // 계산 일시
    calculatedAt: new Date()
  };
}

/**
 * 일급 계산
 * @param {Object} options - 계산 옵션
 * @returns {Object} 일급 계산 결과
 */
function calculateDailyPayroll(options) {
  const {
    baseWage,
    workMinutes,
    isHoliday = false,
    isWeekend = false,
    nightMinutes = 0
  } = options;

  const hourlyWage = calculateHourlyWage(baseWage);
  const workHours = workMinutes / 60;

  // 정규 근무 (8시간까지)
  const regularHours = Math.min(workHours, 8);
  const regularPay = Math.floor(regularHours * hourlyWage);

  // 초과 근무
  let overtimePay = 0;
  if (workHours > 8) {
    const overtimeHours = workHours - 8;
    overtimePay = Math.floor(overtimeHours * hourlyWage * 1.5);
  }

  // 야간 수당
  const nightPay = nightMinutes > 0
    ? Math.floor((nightMinutes / 60) * hourlyWage * 0.5) // 50% 가산
    : 0;

  // 휴일/주말 수당
  const holidayPay = isHoliday || isWeekend
    ? Math.floor(workHours * hourlyWage * 0.5) // 50% 가산
    : 0;

  const totalPay = regularPay + overtimePay + nightPay + holidayPay;

  return {
    workHours,
    regularPay,
    overtimePay,
    nightPay,
    holidayPay,
    totalPay
  };
}

/**
 * 시급 계산
 * @param {number} monthlyWage - 월급
 * @returns {number} 시급
 */
function calculateHourlyWage(monthlyWage) {
  // 월 소정근로시간 = 주당 40시간 × 4.345주
  const monthlyWorkHours = 40 * 4.345;
  // 주휴수당 포함 (주 40시간 근무시 주휴 8시간)
  const monthlyPaidHours = monthlyWorkHours + (8 * 4.345);

  return Math.floor(monthlyWage / monthlyPaidHours);
}

/**
 * 야간 근무 시간 계산
 * @param {moment} checkIn - 출근 시각
 * @param {moment} checkOut - 퇴근 시각
 * @returns {number} 야간 근무 시간(분)
 */
function calculateNightMinutes(checkIn, checkOut) {
  let nightMinutes = 0;

  // 22:00 - 06:00 사이의 근무 시간 계산
  const nightStart = moment(checkIn).hour(22).minute(0).second(0);
  const nightEnd = moment(checkIn).add(1, 'day').hour(6).minute(0).second(0);
  const prevNightEnd = moment(checkIn).hour(6).minute(0).second(0);

  // 전날 밤부터 이어진 경우
  if (checkIn.isBefore(prevNightEnd)) {
    const end = moment.min(checkOut, prevNightEnd);
    nightMinutes += end.diff(checkIn, 'minutes');
  }

  // 당일 밤 근무
  if (checkOut.isAfter(nightStart)) {
    const start = moment.max(checkIn, nightStart);
    const end = checkOut.isAfter(nightEnd) ? nightEnd : checkOut;
    if (end.isAfter(start)) {
      nightMinutes += end.diff(start, 'minutes');
    }
  }

  // 다음날 새벽까지 근무
  if (checkOut.isAfter(nightEnd)) {
    const start = moment.max(checkIn, nightEnd.clone().subtract(1, 'day').hour(22));
    nightMinutes += nightEnd.diff(start, 'minutes');
  }

  return nightMinutes;
}

module.exports = {
  calculateMonthlyPayroll,
  calculateDailyPayroll,
  calculateHourlyWage,
  calculateNightMinutes
};