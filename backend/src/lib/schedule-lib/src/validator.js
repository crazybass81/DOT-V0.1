/**
 * T145: 스케줄 유효성 검증 모듈
 * 스케줄 충돌, 유효성 검사
 */

class ScheduleValidator {
  constructor(pool) {
    this.pool = pool;
  }

  /**
   * 스케줄 유효성 검증
   */
  async validateSchedule(scheduleData) {
    const errors = [];

    // 1. 날짜 유효성 검증
    if (new Date(scheduleData.endDate) < new Date(scheduleData.startDate)) {
      errors.push('종료일이 시작일보다 이전입니다');
    }

    // 2. 각 시프트 검증
    for (const employee of scheduleData.employeeSchedules || []) {
      for (const shift of employee.shifts || []) {
        // 시간 유효성 검증
        if (shift.endTime <= shift.startTime) {
          errors.push(`직원 ${employee.employeeId}: 종료 시간이 시작 시간보다 이전입니다`);
        }

        // 휴게 시간 검증
        const workMinutes = this.calculateMinutes(shift.startTime, shift.endTime);
        if (shift.breakMinutes && shift.breakMinutes > workMinutes) {
          errors.push(`직원 ${employee.employeeId}: 휴게 시간이 근무 시간보다 깁니다`);
        }

        // 최대 근무 시간 검증 (예: 12시간)
        if (workMinutes > 720) {
          errors.push(`직원 ${employee.employeeId}: 일일 근무 시간이 12시간을 초과합니다`);
        }
      }
    }

    return {
      success: errors.length === 0,
      errors: errors,
      valid: errors.length === 0
    };
  }

  /**
   * 스케줄 충돌 체크
   */
  async checkConflicts(params) {
    const { employeeId, date, startTime, endTime, excludeId } = params;

    const result = await this.pool.query(`
      SELECT
        id,
        shift_date AS "date",
        start_time AS "startTime",
        end_time AS "endTime",
        status
      FROM schedule_shifts
      WHERE employee_id = $1
        AND shift_date = $2
        AND status NOT IN ('cancelled')
        AND id != COALESCE($5, 0)
        AND (
          -- 새 시작 시간이 기존 시간대 내에 있는 경우
          ($3 >= start_time AND $3 < end_time)
          -- 새 종료 시간이 기존 시간대 내에 있는 경우
          OR ($4 > start_time AND $4 <= end_time)
          -- 새 시간대가 기존 시간대를 포함하는 경우
          OR ($3 <= start_time AND $4 >= end_time)
        )
    `, [employeeId, date, startTime, endTime, excludeId || null]);

    if (result.rows.length > 0) {
      return {
        success: false,
        hasConflict: true,
        conflicts: result.rows,
        message: `충돌하는 스케줄이 ${result.rows.length}개 있습니다`
      };
    }

    return {
      success: true,
      hasConflict: false,
      message: '충돌하는 스케줄이 없습니다'
    };
  }

  /**
   * 직원 근무 가능 여부 체크
   */
  async checkEmployeeAvailability(employeeId, date) {
    // 직원 상태 확인
    const employeeResult = await this.pool.query(`
      SELECT employment_status
      FROM employees
      WHERE id = $1
    `, [employeeId]);

    if (employeeResult.rows.length === 0) {
      return {
        available: false,
        reason: '직원을 찾을 수 없습니다'
      };
    }

    const employee = employeeResult.rows[0];
    if (employee.employment_status !== 'active') {
      return {
        available: false,
        reason: `직원 상태: ${employee.employment_status}`
      };
    }

    // 휴가 또는 휴무 체크 (추후 구현)
    // ...

    return {
      available: true,
      employeeId: employeeId
    };
  }

  /**
   * 비즈니스 규칙 검증
   */
  async validateBusinessRules(businessId, scheduleData) {
    const rules = [];

    // 1. 최소 휴게시간 규칙 (5시간 이상 근무 시 30분 이상)
    for (const employee of scheduleData.employeeSchedules || []) {
      for (const shift of employee.shifts || []) {
        const workMinutes = this.calculateMinutes(shift.startTime, shift.endTime);
        if (workMinutes >= 300 && (!shift.breakMinutes || shift.breakMinutes < 30)) {
          rules.push({
            type: 'warning',
            message: `5시간 이상 근무 시 최소 30분의 휴게시간이 필요합니다`
          });
        }
      }
    }

    // 2. 주간 최대 근무시간 체크 (예: 52시간)
    // 추후 구현

    return {
      success: true,
      rules: rules,
      hasWarnings: rules.some(r => r.type === 'warning'),
      hasErrors: rules.some(r => r.type === 'error')
    };
  }

  /**
   * 시간 계산 헬퍼
   */
  calculateMinutes(startTime, endTime) {
    const start = new Date(`2000-01-01 ${startTime}`);
    const end = new Date(`2000-01-01 ${endTime}`);
    return (end - start) / 1000 / 60;
  }
}

module.exports = ScheduleValidator;