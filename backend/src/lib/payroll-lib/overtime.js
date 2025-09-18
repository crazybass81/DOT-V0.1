/**
 * T178: 초과근무 및 특수 근무 수당 계산
 * 초과, 야간, 휴일, 주말 근무 수당
 */

/**
 * 초과 근무 수당 계산
 * @param {Object} options - 계산 옵션
 * @returns {number} 초과 근무 수당
 */
function calculateOvertime(options) {
  const { overtimeMinutes, hourlyWage } = options;

  if (!overtimeMinutes || overtimeMinutes <= 0) {
    return 0;
  }

  const overtimeHours = overtimeMinutes / 60;
  // 초과근무 수당 = 시급 × 초과시간 × 1.5 (150%)
  const overtimePay = Math.floor(overtimeHours * hourlyWage * 1.5);

  return overtimePay;
}

/**
 * 야간 근무 수당 계산 (22:00 - 06:00)
 * @param {Object} options - 계산 옵션
 * @returns {number} 야간 근무 수당
 */
function calculateNightShift(options) {
  const { nightMinutes, hourlyWage } = options;

  if (!nightMinutes || nightMinutes <= 0) {
    return 0;
  }

  const nightHours = nightMinutes / 60;
  // 야간근무 가산 = 시급 × 야간시간 × 0.5 (50% 가산)
  const nightShiftPay = Math.floor(nightHours * hourlyWage * 0.5);

  return nightShiftPay;
}

/**
 * 휴일 근무 수당 계산
 * @param {Object} options - 계산 옵션
 * @returns {number} 휴일 근무 수당
 */
function calculateHolidayPay(options) {
  const { holidayMinutes, hourlyWage } = options;

  if (!holidayMinutes || holidayMinutes <= 0) {
    return 0;
  }

  const holidayHours = holidayMinutes / 60;
  // 휴일근무 수당 = 시급 × 휴일근무시간 × 1.5 (150%)
  const holidayPay = Math.floor(holidayHours * hourlyWage * 1.5);

  return holidayPay;
}

/**
 * 주말 근무 수당 계산
 * @param {Object} options - 계산 옵션
 * @returns {number} 주말 근무 수당
 */
function calculateWeekendPay(options) {
  const { weekendMinutes, hourlyWage } = options;

  if (!weekendMinutes || weekendMinutes <= 0) {
    return 0;
  }

  const weekendHours = weekendMinutes / 60;
  // 주말근무 수당 = 시급 × 주말근무시간 × 1.5 (150%)
  const weekendPay = Math.floor(weekendHours * hourlyWage * 1.5);

  return weekendPay;
}

/**
 * 연장근무 한도 체크 (주 12시간)
 * @param {number} weeklyOvertimeHours - 주간 연장근무 시간
 * @returns {Object} 한도 체크 결과
 */
function checkOvertimeLimit(weeklyOvertimeHours) {
  const WEEKLY_OVERTIME_LIMIT = 12; // 주 12시간 한도

  const isExceeded = weeklyOvertimeHours > WEEKLY_OVERTIME_LIMIT;
  const excessHours = Math.max(0, weeklyOvertimeHours - WEEKLY_OVERTIME_LIMIT);

  return {
    isExceeded,
    limit: WEEKLY_OVERTIME_LIMIT,
    actual: weeklyOvertimeHours,
    excess: excessHours,
    message: isExceeded
      ? `주간 연장근무 한도(${WEEKLY_OVERTIME_LIMIT}시간)를 ${excessHours}시간 초과했습니다.`
      : `주간 연장근무 한도 내에서 근무했습니다.`
  };
}

/**
 * 특수 근무 수당 종합 계산
 * @param {Object} workRecord - 근무 기록
 * @returns {Object} 특수 근무 수당 내역
 */
function calculateSpecialPay(workRecord) {
  const {
    regularMinutes,
    overtimeMinutes,
    nightMinutes,
    holidayMinutes,
    weekendMinutes,
    hourlyWage
  } = workRecord;

  // 각 수당 계산
  const overtimePay = calculateOvertime({ overtimeMinutes, hourlyWage });
  const nightShiftPay = calculateNightShift({ nightMinutes, hourlyWage });
  const holidayPay = calculateHolidayPay({ holidayMinutes, hourlyWage });
  const weekendPay = calculateWeekendPay({ weekendMinutes, hourlyWage });

  // 중복 제거 (예: 주말 야간 근무는 더 높은 수당만 적용)
  let totalSpecialPay = overtimePay + nightShiftPay;

  // 휴일과 주말 중 더 높은 수당만 적용
  const maxHolidayWeekendPay = Math.max(holidayPay, weekendPay);
  totalSpecialPay += maxHolidayWeekendPay;

  return {
    overtimePay,
    nightShiftPay,
    holidayPay,
    weekendPay,
    totalSpecialPay,
    breakdown: {
      overtime: {
        hours: overtimeMinutes / 60,
        rate: 1.5,
        amount: overtimePay
      },
      nightShift: {
        hours: nightMinutes / 60,
        rate: 0.5,
        amount: nightShiftPay
      },
      holiday: {
        hours: holidayMinutes / 60,
        rate: 1.5,
        amount: holidayPay
      },
      weekend: {
        hours: weekendMinutes / 60,
        rate: 1.5,
        amount: weekendPay
      }
    }
  };
}

module.exports = {
  calculateOvertime,
  calculateNightShift,
  calculateHolidayPay,
  calculateWeekendPay,
  checkOvertimeLimit,
  calculateSpecialPay
};