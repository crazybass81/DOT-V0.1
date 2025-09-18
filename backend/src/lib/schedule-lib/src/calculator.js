/**
 * T145: 근무 시간 계산 모듈
 * 근무 시간, 초과 근무, 급여 계산
 */

class ScheduleCalculator {
  constructor(pool) {
    this.pool = pool;
  }

  /**
   * 근무 시간 계산
   */
  async calculateWorkHours(params) {
    const { employeeId, startDate, endDate } = params;

    const result = await this.pool.query(`
      SELECT
        COUNT(*) AS "totalDays",
        SUM(work_minutes) AS "totalMinutes",
        AVG(work_minutes) AS "averageMinutes"
      FROM schedule_shifts
      WHERE employee_id = $1
        AND shift_date >= $2
        AND shift_date <= $3
        AND status IN ('scheduled', 'confirmed', 'completed')
    `, [employeeId, startDate, endDate]);

    const stats = result.rows[0];
    const totalHours = Math.round((stats.totalMinutes || 0) / 60 * 100) / 100;
    const averageHoursPerDay = Math.round((stats.averageMinutes || 0) / 60 * 100) / 100;

    return {
      success: true,
      employeeId: employeeId,
      startDate: startDate,
      endDate: endDate,
      totalDays: parseInt(stats.totalDays) || 0,
      totalHours: totalHours,
      averageHoursPerDay: averageHoursPerDay,
      totalMinutes: parseInt(stats.totalMinutes) || 0
    };
  }

  /**
   * 초과 근무 시간 계산
   */
  async calculateOvertimeHours(params) {
    const { employeeId, date, standardHours = 8 } = params;

    // 해당 날짜의 근무 시간 조회
    const result = await this.pool.query(`
      SELECT
        SUM(work_minutes) AS "totalMinutes"
      FROM schedule_shifts
      WHERE employee_id = $1
        AND shift_date = $2
        AND status IN ('scheduled', 'confirmed', 'completed')
    `, [employeeId, date]);

    const totalMinutes = parseInt(result.rows[0].totalMinutes) || 0;
    const totalHours = totalMinutes / 60;
    const standardMinutes = standardHours * 60;

    const regularHours = Math.min(totalHours, standardHours);
    const overtimeHours = Math.max(0, totalHours - standardHours);

    return {
      success: true,
      date: date,
      totalHours: Math.round(totalHours * 100) / 100,
      regularHours: Math.round(regularHours * 100) / 100,
      overtimeHours: Math.round(overtimeHours * 100) / 100,
      regularMinutes: Math.min(totalMinutes, standardMinutes),
      overtimeMinutes: Math.max(0, totalMinutes - standardMinutes)
    };
  }

  /**
   * 주간 근무 시간 집계
   */
  async calculateWeeklyHours(employeeId, weekStartDate) {
    const weekEndDate = new Date(weekStartDate);
    weekEndDate.setDate(weekEndDate.getDate() + 6);

    const result = await this.pool.query(`
      SELECT
        shift_date AS "date",
        SUM(work_minutes) AS "dayMinutes"
      FROM schedule_shifts
      WHERE employee_id = $1
        AND shift_date >= $2
        AND shift_date <= $3
        AND status IN ('scheduled', 'confirmed', 'completed')
      GROUP BY shift_date
      ORDER BY shift_date
    `, [employeeId, weekStartDate, weekEndDate.toISOString().split('T')[0]]);

    const dailyHours = result.rows.map(row => ({
      date: row.date,
      hours: Math.round(row.dayMinutes / 60 * 100) / 100
    }));

    const totalWeeklyMinutes = result.rows.reduce((sum, row) => sum + parseInt(row.dayMinutes), 0);
    const totalWeeklyHours = Math.round(totalWeeklyMinutes / 60 * 100) / 100;

    return {
      success: true,
      weekStartDate: weekStartDate,
      dailyHours: dailyHours,
      totalWeeklyHours: totalWeeklyHours,
      averageDailyHours: Math.round(totalWeeklyHours / dailyHours.length * 100) / 100
    };
  }

  /**
   * 월간 근무 시간 집계
   */
  async calculateMonthlyHours(employeeId, year, month) {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);

    const result = await this.pool.query(`
      SELECT
        DATE_PART('week', shift_date) AS "weekNumber",
        SUM(work_minutes) AS "weekMinutes"
      FROM schedule_shifts
      WHERE employee_id = $1
        AND shift_date >= $2
        AND shift_date <= $3
        AND status IN ('scheduled', 'confirmed', 'completed')
      GROUP BY DATE_PART('week', shift_date)
      ORDER BY "weekNumber"
    `, [employeeId, startDate.toISOString().split('T')[0], endDate.toISOString().split('T')[0]]);

    const weeklyStats = result.rows.map(row => ({
      week: parseInt(row.weekNumber),
      hours: Math.round(row.weekMinutes / 60 * 100) / 100
    }));

    const totalMonthlyMinutes = result.rows.reduce((sum, row) => sum + parseInt(row.weekMinutes), 0);
    const totalMonthlyHours = Math.round(totalMonthlyMinutes / 60 * 100) / 100;

    // 초과 근무 계산 (주 40시간 기준)
    const standardWeeklyHours = 40;
    let totalOvertimeHours = 0;

    weeklyStats.forEach(week => {
      if (week.hours > standardWeeklyHours) {
        totalOvertimeHours += (week.hours - standardWeeklyHours);
      }
    });

    return {
      success: true,
      year: year,
      month: month,
      weeklyStats: weeklyStats,
      totalMonthlyHours: totalMonthlyHours,
      totalOvertimeHours: Math.round(totalOvertimeHours * 100) / 100,
      regularHours: Math.round((totalMonthlyHours - totalOvertimeHours) * 100) / 100
    };
  }

  /**
   * 예상 급여 계산
   */
  async calculateExpectedPay(employeeId, startDate, endDate) {
    // 직원 정보 조회
    const employeeResult = await this.pool.query(`
      SELECT hourly_rate, salary, pay_type
      FROM employees
      WHERE id = $1
    `, [employeeId]);

    if (employeeResult.rows.length === 0) {
      throw new Error('직원을 찾을 수 없습니다');
    }

    const employee = employeeResult.rows[0];

    // 근무 시간 조회
    const hoursResult = await this.calculateWorkHours({
      employeeId,
      startDate,
      endDate
    });

    let basePay = 0;
    let overtimePay = 0;

    if (employee.pay_type === 'hourly') {
      // 시급제 계산
      const hourlyRate = parseFloat(employee.hourly_rate) || 0;

      // 정규 시간과 초과 시간 분리
      const standardHoursPerDay = 8;
      const totalStandardHours = Math.min(hoursResult.totalHours, hoursResult.totalDays * standardHoursPerDay);
      const overtimeHours = Math.max(0, hoursResult.totalHours - totalStandardHours);

      basePay = totalStandardHours * hourlyRate;
      overtimePay = overtimeHours * hourlyRate * 1.5; // 초과 근무 1.5배

    } else if (employee.pay_type === 'salary') {
      // 월급제는 고정
      basePay = parseFloat(employee.salary) || 0;
    }

    const totalPay = basePay + overtimePay;

    return {
      success: true,
      employeeId: employeeId,
      payType: employee.pay_type,
      totalHours: hoursResult.totalHours,
      basePay: Math.round(basePay),
      overtimePay: Math.round(overtimePay),
      totalPay: Math.round(totalPay),
      period: {
        startDate: startDate,
        endDate: endDate
      }
    };
  }
}

module.exports = ScheduleCalculator;