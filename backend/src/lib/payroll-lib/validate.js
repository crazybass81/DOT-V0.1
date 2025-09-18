/**
 * T180: 급여 데이터 유효성 검증
 * 급여 계산 전 데이터 검증
 */

/**
 * 급여 데이터 유효성 검증
 * @param {Object} payrollData - 급여 데이터
 * @returns {Object} 검증 결과
 */
function validatePayrollData(payrollData) {
  const errors = [];
  const warnings = [];

  const {
    userId,
    businessId,
    year,
    month,
    baseWage,
    workRecords,
    schedules
  } = payrollData;

  // 필수 필드 검증
  if (!userId) {
    errors.push('사용자 ID가 필요합니다');
  }

  if (!businessId) {
    errors.push('사업장 ID가 필요합니다');
  }

  if (!year || year < 2020 || year > 2030) {
    errors.push('유효한 년도를 입력해주세요 (2020-2030)');
  }

  if (!month || month < 1 || month > 12) {
    errors.push('유효한 월을 입력해주세요 (1-12)');
  }

  // 기본급 검증
  if (!baseWage || baseWage <= 0) {
    errors.push('기본급은 0보다 커야 합니다');
  }

  // 최저임금 체크 (2024년 기준)
  const MINIMUM_WAGE_2024 = 9860;
  const monthlyMinimumWage = MINIMUM_WAGE_2024 * 209; // 월 209시간 기준

  if (baseWage < monthlyMinimumWage) {
    warnings.push(`기본급이 최저임금(${monthlyMinimumWage.toLocaleString()}원) 미만입니다`);
  }

  // 근무 기록 검증
  if (!workRecords || !Array.isArray(workRecords)) {
    errors.push('근무 기록이 필요합니다');
  } else {
    workRecords.forEach((record, index) => {
      const recordErrors = validateWorkRecord(record);
      if (recordErrors.length > 0) {
        errors.push(`근무 기록 ${index + 1}: ${recordErrors.join(', ')}`);
      }
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * 근무 기록 유효성 검증
 * @param {Object} workRecord - 근무 기록
 * @returns {Array} 에러 목록
 */
function validateWorkRecord(workRecord) {
  const errors = [];

  if (!workRecord.check_in_time) {
    errors.push('출근 시간이 없습니다');
  }

  // 퇴근 시간이 있는 경우 시간 순서 체크
  if (workRecord.check_out_time) {
    const checkIn = new Date(workRecord.check_in_time);
    const checkOut = new Date(workRecord.check_out_time);

    if (checkOut <= checkIn) {
      errors.push('퇴근 시간이 출근 시간보다 빠르거나 같습니다');
    }

    // 24시간 초과 근무 체크
    const duration = (checkOut - checkIn) / (1000 * 60 * 60); // 시간 단위
    if (duration > 24) {
      errors.push('24시간을 초과하는 연속 근무는 불가능합니다');
    }
  }

  return errors;
}

/**
 * 근무 시간 유효성 검증
 * @param {Object} workHours - 근무 시간
 * @returns {Object} 검증 결과
 */
function validateWorkHours(workHours) {
  const errors = [];
  const warnings = [];

  const {
    total,
    regular,
    overtime,
    night,
    weekend,
    holiday
  } = workHours;

  // 음수 체크
  if (total < 0) errors.push('총 근무시간은 음수일 수 없습니다');
  if (regular < 0) errors.push('정규 근무시간은 음수일 수 없습니다');
  if (overtime < 0) errors.push('초과 근무시간은 음수일 수 없습니다');

  // 논리적 일관성 체크
  if (regular > total) {
    errors.push('정규 근무시간이 총 근무시간보다 많습니다');
  }

  // 법적 제한 체크
  const WEEKLY_OVERTIME_LIMIT = 12;
  const weeklyOvertime = overtime / 4; // 월간 초과근무를 주간으로 환산

  if (weeklyOvertime > WEEKLY_OVERTIME_LIMIT) {
    warnings.push(`주간 초과근무 한도(${WEEKLY_OVERTIME_LIMIT}시간)를 초과했습니다`);
  }

  // 최대 근무시간 체크 (주 52시간)
  const WEEKLY_MAX_HOURS = 52;
  const weeklyTotal = total / 4;

  if (weeklyTotal > WEEKLY_MAX_HOURS) {
    errors.push(`주간 최대 근무시간(${WEEKLY_MAX_HOURS}시간)을 초과했습니다`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * 임금 데이터 유효성 검증
 * @param {Object} wageData - 임금 데이터
 * @returns {Object} 검증 결과
 */
function validateWageData(wageData) {
  const errors = [];
  const warnings = [];

  const {
    baseWage,
    hourlyWage,
    regularPay,
    overtimePay,
    allowances,
    deductions
  } = wageData;

  // 기본급 검증
  if (baseWage <= 0) {
    errors.push('기본급은 0보다 커야 합니다');
  }

  // 시급 검증
  const MINIMUM_WAGE = 9860;
  if (hourlyWage < MINIMUM_WAGE) {
    errors.push(`시급이 최저임금(${MINIMUM_WAGE}원) 미만입니다`);
  }

  // 공제액 검증
  if (deductions) {
    const totalDeductions = Object.values(deductions).reduce((sum, val) => sum + val, 0);
    const grossPay = regularPay + overtimePay +
      (allowances ? Object.values(allowances).reduce((sum, val) => sum + val, 0) : 0);

    if (totalDeductions > grossPay) {
      errors.push('공제액이 총 지급액보다 많습니다');
    }

    if (totalDeductions > grossPay * 0.5) {
      warnings.push('공제액이 총 지급액의 50%를 초과합니다');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * 급여 계산 결과 검증
 * @param {Object} payrollResult - 급여 계산 결과
 * @returns {Object} 검증 결과
 */
function validatePayrollResult(payrollResult) {
  const errors = [];
  const warnings = [];

  const { summary, wages, deductions } = payrollResult;

  // 실수령액 검증
  if (summary.netPay < 0) {
    errors.push('실수령액이 음수입니다');
  }

  // 계산 일관성 검증
  const calculatedGross =
    wages.regularPay +
    wages.overtimePay +
    wages.nightShiftPay +
    wages.weekendPay +
    wages.holidayPay;

  if (Math.abs(calculatedGross - summary.grossPay) > 1) {
    errors.push('급여 합계 계산에 오류가 있습니다');
  }

  const calculatedNet = summary.grossPay - summary.totalDeductions;
  if (Math.abs(calculatedNet - summary.netPay) > 1) {
    errors.push('실수령액 계산에 오류가 있습니다');
  }

  // 4대보험 검증
  if (deductions.nationalPension > summary.grossPay * 0.045) {
    warnings.push('국민연금이 정상 요율(4.5%)을 초과합니다');
  }

  if (deductions.healthInsurance > summary.grossPay * 0.04) {
    warnings.push('건강보험이 정상 요율(3.545%)을 초과합니다');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

module.exports = {
  validatePayrollData,
  validateWorkRecord,
  validateWorkHours,
  validateWageData,
  validatePayrollResult
};