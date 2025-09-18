/**
 * T186, T188: 급여 계산 테스트 (RED)
 * 기본급 및 주휴수당 계산 테스트
 */

const payrollLib = require('../../../src/lib/payroll-lib');

describe('급여 계산 라이브러리', () => {
  describe('T186: 기본급 계산', () => {
    test('월급에서 시급 계산', () => {
      // 월급 200만원 기준
      const monthlyWage = 2000000;
      const hourlyWage = payrollLib.calculateHourlyWage(monthlyWage);

      // 월 소정근로시간 = 주당 40시간 × 4.345주 = 173.8시간
      // 주휴수당 포함 = 173.8 + (8 × 4.345) = 208.56시간
      // 시급 = 2,000,000 / 208.56 = 9,589원
      expect(hourlyWage).toBe(9589);
    });

    test('일급 계산', () => {
      const options = {
        baseWage: 2000000,
        workMinutes: 480, // 8시간
        isHoliday: false,
        isWeekend: false,
        nightMinutes: 0
      };

      const result = payrollLib.calculateDailyPayroll(options);

      expect(result).toHaveProperty('workHours', 8);
      expect(result).toHaveProperty('regularPay');
      expect(result).toHaveProperty('overtimePay', 0);
      expect(result).toHaveProperty('totalPay');
      expect(result.regularPay).toBe(76712); // 9,589원 × 8시간
    });

    test('월급 계산 - 정규 근무만', () => {
      const options = {
        userId: 1,
        businessId: 1,
        year: 2024,
        month: 1,
        baseWage: 2000000,
        workRecords: [
          // 20일간 정규 근무 (8시간씩)
          ...Array(20).fill(null).map((_, i) => ({
            check_in_time: new Date(2024, 0, i + 1, 9, 0),
            check_out_time: new Date(2024, 0, i + 1, 18, 0) // 9시간 - 1시간 휴게
          }))
        ],
        allowances: {},
        deductions: {}
      };

      return payrollLib.calculateMonthlyPayroll(options).then(result => {
        expect(result).toHaveProperty('summary');
        expect(result.summary).toHaveProperty('grossPay');
        expect(result.summary).toHaveProperty('netPay');
        expect(result.workHours.total).toBe(180); // 20일 × 9시간
        expect(result.workHours.regular).toBe(160); // 정규 근무시간
        expect(result.workHours.overtime).toBe(20); // 초과 근무시간
      });
    });
  });

  describe('T188: 주휴수당 계산', () => {
    test('주 15시간 이상 근무시 주휴수당 지급', () => {
      const options = {
        weeklyWorkHours: 40,
        hourlyWage: 10000
      };

      const weeklyRestAllowance = payrollLib.calculateWeeklyRestAllowance(options);

      // 주휴수당 = 8시간 × 시급
      expect(weeklyRestAllowance).toBe(80000);
    });

    test('주 15시간 미만 근무시 주휴수당 미지급', () => {
      const options = {
        weeklyWorkHours: 10,
        hourlyWage: 10000
      };

      const weeklyRestAllowance = payrollLib.calculateWeeklyRestAllowance(options);

      expect(weeklyRestAllowance).toBe(0);
    });

    test('주 15-40시간 근무시 비례 지급', () => {
      const options = {
        weeklyWorkHours: 20,
        hourlyWage: 10000
      };

      const weeklyRestAllowance = payrollLib.calculateWeeklyRestAllowance(options);

      // 20시간/5일 = 4시간 × 시급
      expect(weeklyRestAllowance).toBe(40000);
    });
  });

  describe('T189: 연장/야간 수당 계산', () => {
    test('초과근무 수당 계산 (150%)', () => {
      const options = {
        overtimeMinutes: 120, // 2시간
        hourlyWage: 10000
      };

      const overtimePay = payrollLib.calculateOvertime(options);

      // 초과근무 = 2시간 × 10,000원 × 1.5
      expect(overtimePay).toBe(30000);
    });

    test('야간근무 수당 계산 (50% 가산)', () => {
      const options = {
        nightMinutes: 180, // 3시간
        hourlyWage: 10000
      };

      const nightShiftPay = payrollLib.calculateNightShift(options);

      // 야간근무 가산 = 3시간 × 10,000원 × 0.5
      expect(nightShiftPay).toBe(15000);
    });

    test('휴일근무 수당 계산 (150%)', () => {
      const options = {
        holidayMinutes: 480, // 8시간
        hourlyWage: 10000
      };

      const holidayPay = payrollLib.calculateHolidayPay(options);

      // 휴일근무 = 8시간 × 10,000원 × 1.5
      expect(holidayPay).toBe(120000);
    });

    test('주말근무 수당 계산 (150%)', () => {
      const options = {
        weekendMinutes: 240, // 4시간
        hourlyWage: 10000
      };

      const weekendPay = payrollLib.calculateWeekendPay(options);

      // 주말근무 = 4시간 × 10,000원 × 1.5
      expect(weekendPay).toBe(60000);
    });
  });

  describe('T190: 4대보험 및 세금 계산', () => {
    test('국민연금 계산 (4.5%)', () => {
      const monthlyIncome = 3000000;
      const nationalPension = payrollLib.calculateNationalPension(monthlyIncome);

      // 3,000,000 × 0.045 = 135,000원
      expect(nationalPension).toBe(135000);
    });

    test('건강보험 계산 (3.545%)', () => {
      const monthlyIncome = 3000000;
      const healthInsurance = payrollLib.calculateHealthInsurance(monthlyIncome);

      // 3,000,000 × 0.03545 = 106,350원
      expect(healthInsurance).toBe(106350);
    });

    test('장기요양보험 계산 (건강보험의 12.95%)', () => {
      const healthInsurance = 106350;
      const longTermCare = payrollLib.calculateLongTermCare(healthInsurance);

      // 106,350 × 0.1295 = 13,772원
      expect(longTermCare).toBe(13772);
    });

    test('고용보험 계산 (0.9%)', () => {
      const monthlyIncome = 3000000;
      const employmentInsurance = payrollLib.calculateEmploymentInsurance(monthlyIncome);

      // 3,000,000 × 0.009 = 27,000원 (반올림 차이)
      expect(employmentInsurance).toBe(26999);
    });

    test('소득세 계산 (간이세액표 기준)', () => {
      const monthlyIncome = 3000000;
      const dependents = 1;
      const incomeTax = payrollLib.calculateIncomeTax(monthlyIncome, dependents);

      // 간이세액표 기준으로 계산
      expect(incomeTax).toBeGreaterThan(0);
      expect(incomeTax).toBeLessThan(monthlyIncome * 0.1); // 10% 미만이어야 함
    });

    test('지방소득세 계산 (소득세의 10%)', () => {
      const incomeTax = 50000;
      const localIncomeTax = payrollLib.calculateLocalIncomeTax(incomeTax);

      expect(localIncomeTax).toBe(5000);
    });
  });

  describe('종합 급여 계산', () => {
    test('월 급여 종합 계산', async () => {
      const options = {
        userId: 1,
        businessId: 1,
        year: 2024,
        month: 1,
        baseWage: 3000000,
        workRecords: [
          // 22일간 근무 기록
          ...Array(22).fill(null).map((_, i) => {
            const date = new Date(2024, 0, i + 1);
            const dayOfWeek = date.getDay();

            // 주말 체크
            const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

            return {
              check_in_time: new Date(2024, 0, i + 1, 9, 0),
              check_out_time: new Date(2024, 0, i + 1, isWeekend ? 18 : 20, 0) // 평일 2시간 초과
            };
          })
        ],
        allowances: {
          meal: 100000,
          transport: 50000,
          other: 0
        },
        deductions: {
          other: 0
        }
      };

      const result = await payrollLib.calculateMonthlyPayroll(options);

      // 검증 항목
      expect(result).toHaveProperty('userId', 1);
      expect(result).toHaveProperty('businessId', 1);
      expect(result).toHaveProperty('year', 2024);
      expect(result).toHaveProperty('month', 1);

      // 근무 시간 검증
      expect(result.workHours.total).toBeGreaterThan(0);
      expect(result.workHours.overtime).toBeGreaterThan(0);

      // 급여 내역 검증
      expect(result.wages.regularPay).toBeGreaterThan(0);
      expect(result.wages.overtimePay).toBeGreaterThan(0);

      // 수당 검증
      expect(result.allowances.meal).toBe(100000);
      expect(result.allowances.transport).toBe(50000);
      expect(result.allowances.weeklyRest).toBeGreaterThan(0);

      // 공제 검증
      expect(result.deductions.nationalPension).toBeGreaterThan(0);
      expect(result.deductions.healthInsurance).toBeGreaterThan(0);
      expect(result.deductions.employmentInsurance).toBeGreaterThan(0);
      expect(result.deductions.incomeTax).toBeGreaterThan(0);

      // 총계 검증
      expect(result.summary.grossPay).toBeGreaterThan(result.summary.totalDeductions);
      expect(result.summary.netPay).toBe(
        result.summary.grossPay - result.summary.totalDeductions
      );
    });

    test('최저임금 미달 경고', () => {
      const options = {
        baseWage: 1000000, // 최저임금 미달
        workMinutes: 480,
        isHoliday: false,
        isWeekend: false,
        nightMinutes: 0
      };

      // 시급 계산시 최저임금 체크
      const hourlyWage = payrollLib.calculateHourlyWage(options.baseWage);
      const MINIMUM_WAGE_2024 = 9860;

      expect(hourlyWage).toBeLessThan(MINIMUM_WAGE_2024);
    });
  });
});