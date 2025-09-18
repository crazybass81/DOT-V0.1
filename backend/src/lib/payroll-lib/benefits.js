/**
 * T180: 수당 계산 모듈
 * 주휴수당, 연차수당, 식대, 교통비 등
 */

/**
 * 주휴수당 계산
 * 주 15시간 이상 근무시 지급
 * @param {Object} options - 계산 옵션
 * @returns {number} 주휴수당
 */
function calculateWeeklyRestAllowance(options) {
  const { weeklyWorkHours, hourlyWage } = options;

  // 주 15시간 미만 근무시 주휴수당 없음
  if (weeklyWorkHours < 15) {
    return 0;
  }

  // 주휴수당 = 8시간 × 시급 (주 40시간 기준)
  // 실제 근무시간에 비례하여 계산
  const weeklyRestHours = Math.min(8, weeklyWorkHours / 5);
  const weeklyRestAllowance = Math.floor(weeklyRestHours * hourlyWage);

  return weeklyRestAllowance;
}

/**
 * 연차수당 계산
 * 미사용 연차에 대한 수당
 * @param {Object} options - 계산 옵션
 * @returns {number} 연차수당
 */
function calculateAnnualLeaveAllowance(options) {
  const {
    unusedLeaveDays,
    dailyWage,
    includeAllowances = true
  } = options;

  if (!unusedLeaveDays || unusedLeaveDays <= 0) {
    return 0;
  }

  // 연차수당 = 미사용 연차일수 × 1일 통상임금
  let annualLeaveAllowance = unusedLeaveDays * dailyWage;

  // 수당 포함 여부 (통상임금에 고정수당 포함시)
  if (includeAllowances) {
    annualLeaveAllowance = Math.floor(annualLeaveAllowance * 1.0);
  }

  return annualLeaveAllowance;
}

/**
 * 식대 계산
 * 비과세 한도: 월 10만원
 * @param {Object} options - 계산 옵션
 * @returns {Object} 식대 내역
 */
function calculateMealAllowance(options) {
  const {
    workDays,
    mealAllowancePerDay = 6000,
    includeTax = false
  } = options;

  const TAX_FREE_LIMIT = 100000; // 월 10만원 비과세

  const totalMealAllowance = workDays * mealAllowancePerDay;
  const taxFreeMealAllowance = Math.min(totalMealAllowance, TAX_FREE_LIMIT);
  const taxableMealAllowance = Math.max(0, totalMealAllowance - TAX_FREE_LIMIT);

  return {
    total: totalMealAllowance,
    taxFree: taxFreeMealAllowance,
    taxable: taxableMealAllowance,
    perDay: mealAllowancePerDay,
    workDays
  };
}

/**
 * 교통비 계산
 * 실비 정산 또는 정액 지급
 * @param {Object} options - 계산 옵션
 * @returns {Object} 교통비 내역
 */
function calculateTransportAllowance(options) {
  const {
    workDays,
    transportAllowancePerDay = 5000,
    actualExpenses = null,
    useActualExpenses = false
  } = options;

  let transportAllowance;

  if (useActualExpenses && actualExpenses) {
    // 실비 정산
    transportAllowance = actualExpenses;
  } else {
    // 정액 지급
    transportAllowance = workDays * transportAllowancePerDay;
  }

  return {
    total: transportAllowance,
    perDay: transportAllowancePerDay,
    workDays,
    isActualExpense: useActualExpenses,
    actualExpenses
  };
}

/**
 * 가족수당 계산
 * @param {Object} options - 계산 옵션
 * @returns {number} 가족수당
 */
function calculateFamilyAllowance(options) {
  const {
    spouseAllowance = 40000,
    childAllowancePerPerson = 20000,
    numberOfChildren = 0,
    hasSpouse = false
  } = options;

  let familyAllowance = 0;

  if (hasSpouse) {
    familyAllowance += spouseAllowance;
  }

  if (numberOfChildren > 0) {
    familyAllowance += numberOfChildren * childAllowancePerPerson;
  }

  return familyAllowance;
}

/**
 * 직책수당 계산
 * @param {Object} options - 계산 옵션
 * @returns {number} 직책수당
 */
function calculatePositionAllowance(options) {
  const { position, baseAllowance = 0 } = options;

  const positionAllowances = {
    사원: 0,
    주임: 50000,
    대리: 100000,
    과장: 150000,
    차장: 200000,
    부장: 300000,
    이사: 500000
  };

  return positionAllowances[position] || baseAllowance;
}

/**
 * 근속수당 계산
 * @param {Object} options - 계산 옵션
 * @returns {number} 근속수당
 */
function calculateLongevityAllowance(options) {
  const { yearsOfService, allowancePerYear = 10000 } = options;

  if (!yearsOfService || yearsOfService <= 0) {
    return 0;
  }

  // 근속연수당 수당 (최대 30년)
  const cappedYears = Math.min(yearsOfService, 30);
  const longevityAllowance = cappedYears * allowancePerYear;

  return longevityAllowance;
}

/**
 * 수당 종합 계산
 * @param {Object} options - 계산 옵션
 * @returns {Object} 수당 종합 내역
 */
function calculateAllAllowances(options) {
  const {
    weeklyWorkHours,
    hourlyWage,
    workDays,
    unusedLeaveDays,
    dailyWage,
    position,
    yearsOfService,
    hasSpouse,
    numberOfChildren
  } = options;

  // 각 수당 계산
  const weeklyRestAllowance = calculateWeeklyRestAllowance({
    weeklyWorkHours,
    hourlyWage
  });

  const annualLeaveAllowance = calculateAnnualLeaveAllowance({
    unusedLeaveDays,
    dailyWage
  });

  const mealAllowance = calculateMealAllowance({
    workDays
  });

  const transportAllowance = calculateTransportAllowance({
    workDays
  });

  const familyAllowance = calculateFamilyAllowance({
    hasSpouse,
    numberOfChildren
  });

  const positionAllowance = calculatePositionAllowance({
    position
  });

  const longevityAllowance = calculateLongevityAllowance({
    yearsOfService
  });

  // 총 수당
  const totalAllowances =
    weeklyRestAllowance +
    annualLeaveAllowance +
    mealAllowance.total +
    transportAllowance.total +
    familyAllowance +
    positionAllowance +
    longevityAllowance;

  return {
    weeklyRest: weeklyRestAllowance,
    annualLeave: annualLeaveAllowance,
    meal: mealAllowance,
    transport: transportAllowance,
    family: familyAllowance,
    position: positionAllowance,
    longevity: longevityAllowance,
    total: totalAllowances,
    taxFree: mealAllowance.taxFree, // 비과세 금액
    taxable: totalAllowances - mealAllowance.taxFree
  };
}

module.exports = {
  calculateWeeklyRestAllowance,
  calculateAnnualLeaveAllowance,
  calculateMealAllowance,
  calculateTransportAllowance,
  calculateFamilyAllowance,
  calculatePositionAllowance,
  calculateLongevityAllowance,
  calculateAllAllowances
};