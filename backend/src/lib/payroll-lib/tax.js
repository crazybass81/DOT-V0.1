/**
 * T179: 세금 및 4대보험 계산
 * 소득세, 국민연금, 건강보험, 고용보험 등
 */

/**
 * 소득세 계산 (간이세액표 기준)
 * @param {number} monthlyIncome - 월 소득
 * @param {number} dependents - 부양가족 수
 * @returns {number} 소득세
 */
function calculateIncomeTax(monthlyIncome, dependents = 1) {
  // 간이세액표 기준 (2024년)
  // 실제로는 국세청 간이세액표를 참조해야 하지만, 여기서는 단순화된 계산 사용

  // 비과세 소득 제외
  const TAX_FREE_LIMIT = 100000; // 식대 등 비과세 10만원
  const taxableIncome = Math.max(0, monthlyIncome - TAX_FREE_LIMIT);

  // 소득세 구간별 계산 (단순화된 버전)
  let tax = 0;

  if (taxableIncome <= 1500000) {
    tax = taxableIncome * 0.06; // 6%
  } else if (taxableIncome <= 4500000) {
    tax = 90000 + (taxableIncome - 1500000) * 0.15; // 15%
  } else if (taxableIncome <= 8800000) {
    tax = 540000 + (taxableIncome - 4500000) * 0.24; // 24%
  } else if (taxableIncome <= 15000000) {
    tax = 1572000 + (taxableIncome - 8800000) * 0.35; // 35%
  } else {
    tax = 3742000 + (taxableIncome - 15000000) * 0.38; // 38%
  }

  // 부양가족 공제 (1인당 약 15만원 감면 효과)
  const familyDeduction = (dependents - 1) * 12500; // 단순화된 계산
  tax = Math.max(0, tax - familyDeduction);

  // 근로소득세액공제 (단순화)
  if (tax <= 500000) {
    tax = tax * 0.55; // 55% 공제
  } else {
    tax = 275000 + (tax - 500000) * 0.7; // 30% 공제
  }

  return Math.floor(tax);
}

/**
 * 지방소득세 계산 (소득세의 10%)
 * @param {number} incomeTax - 소득세
 * @returns {number} 지방소득세
 */
function calculateLocalIncomeTax(incomeTax) {
  return Math.floor(incomeTax * 0.1);
}

/**
 * 국민연금 계산 (4.5%)
 * @param {number} monthlyIncome - 월 소득
 * @returns {number} 국민연금
 */
function calculateNationalPension(monthlyIncome) {
  // 2024년 기준 상한액: 5,900,000원, 하한액: 370,000원
  const MIN_INCOME = 370000;
  const MAX_INCOME = 5900000;

  const pensionBase = Math.min(Math.max(monthlyIncome, MIN_INCOME), MAX_INCOME);
  const pension = Math.floor(pensionBase * 0.045);

  return pension;
}

/**
 * 건강보험 계산 (3.545%)
 * @param {number} monthlyIncome - 월 소득
 * @returns {number} 건강보험료
 */
function calculateHealthInsurance(monthlyIncome) {
  // 2024년 건강보험료율: 3.545%
  const HEALTH_INSURANCE_RATE = 0.03545;

  // 상한액: 7,810,800원, 하한액: 없음
  const MAX_INCOME = 7810800;
  const insuranceBase = Math.min(monthlyIncome, MAX_INCOME);

  const healthInsurance = Math.floor(insuranceBase * HEALTH_INSURANCE_RATE);

  return healthInsurance;
}

/**
 * 장기요양보험 계산 (건강보험료의 12.95%)
 * @param {number} healthInsurance - 건강보험료
 * @returns {number} 장기요양보험료
 */
function calculateLongTermCare(healthInsurance) {
  // 2024년 장기요양보험료율: 건강보험료의 12.95%
  const LONG_TERM_CARE_RATE = 0.1295;

  const longTermCare = Math.floor(healthInsurance * LONG_TERM_CARE_RATE);

  return longTermCare;
}

/**
 * 고용보험 계산 (0.9%)
 * @param {number} monthlyIncome - 월 소득
 * @returns {number} 고용보험료
 */
function calculateEmploymentInsurance(monthlyIncome) {
  // 2024년 고용보험료율: 0.9% (근로자 부담분)
  const EMPLOYMENT_INSURANCE_RATE = 0.009;

  const employmentInsurance = Math.floor(monthlyIncome * EMPLOYMENT_INSURANCE_RATE);

  return employmentInsurance;
}

/**
 * 4대보험 종합 계산
 * @param {number} monthlyIncome - 월 소득
 * @returns {Object} 4대보험 내역
 */
function calculateSocialInsurance(monthlyIncome) {
  const nationalPension = calculateNationalPension(monthlyIncome);
  const healthInsurance = calculateHealthInsurance(monthlyIncome);
  const longTermCare = calculateLongTermCare(healthInsurance);
  const employmentInsurance = calculateEmploymentInsurance(monthlyIncome);

  const totalInsurance =
    nationalPension + healthInsurance + longTermCare + employmentInsurance;

  return {
    nationalPension,
    healthInsurance,
    longTermCare,
    employmentInsurance,
    total: totalInsurance,
    breakdown: {
      nationalPension: {
        rate: 0.045,
        amount: nationalPension
      },
      healthInsurance: {
        rate: 0.03545,
        amount: healthInsurance
      },
      longTermCare: {
        rate: 0.1295,
        baseAmount: healthInsurance,
        amount: longTermCare
      },
      employmentInsurance: {
        rate: 0.009,
        amount: employmentInsurance
      }
    }
  };
}

/**
 * 실수령액 계산
 * @param {number} grossPay - 총 지급액
 * @param {number} dependents - 부양가족 수
 * @returns {Object} 공제 내역 및 실수령액
 */
function calculateNetPay(grossPay, dependents = 1) {
  // 4대보험 계산
  const socialInsurance = calculateSocialInsurance(grossPay);

  // 소득세 계산
  const incomeTax = calculateIncomeTax(grossPay, dependents);
  const localIncomeTax = calculateLocalIncomeTax(incomeTax);

  // 총 공제액
  const totalDeductions =
    socialInsurance.total + incomeTax + localIncomeTax;

  // 실수령액
  const netPay = grossPay - totalDeductions;

  return {
    grossPay,
    deductions: {
      socialInsurance: socialInsurance.total,
      incomeTax,
      localIncomeTax,
      total: totalDeductions
    },
    netPay,
    detailedDeductions: {
      ...socialInsurance,
      incomeTax,
      localIncomeTax
    }
  };
}

module.exports = {
  calculateIncomeTax,
  calculateLocalIncomeTax,
  calculateNationalPension,
  calculateHealthInsurance,
  calculateLongTermCare,
  calculateEmploymentInsurance,
  calculateSocialInsurance,
  calculateNetPay
};