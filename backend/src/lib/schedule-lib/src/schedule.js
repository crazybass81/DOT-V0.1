/**
 * T144-T145: 스케줄 핵심 기능 구현
 * 스케줄 CRUD 및 조회 기능
 */

class ScheduleCore {
  constructor(pool) {
    this.pool = pool;
  }

  /**
   * 주간 스케줄 생성
   */
  async createWeeklySchedule(scheduleData) {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // 1. 메인 스케줄 생성
      const scheduleResult = await client.query(`
        INSERT INTO schedules (
          business_id, name, type, start_date, end_date, status, created_by
        ) VALUES ($1, $2, $3, $4, $5, 'active', $6)
        RETURNING id
      `, [
        scheduleData.businessId,
        scheduleData.name || `주간 스케줄 ${scheduleData.startDate}`,
        'weekly',
        scheduleData.startDate,
        scheduleData.endDate,
        scheduleData.createdBy || 1
      ]);

      const scheduleId = scheduleResult.rows[0].id;
      const createdShifts = [];
      let totalHours = 0;

      // 2. 각 직원의 시프트 생성
      for (const employee of scheduleData.employeeSchedules) {
        for (const shift of employee.shifts) {
          // 중복 체크는 트리거에서 자동으로 처리됨

          const shiftResult = await client.query(`
            INSERT INTO schedule_shifts (
              schedule_id, employee_id, shift_date,
              start_time, end_time, break_minutes, status, notes
            ) VALUES ($1, $2, $3, $4, $5, $6, 'scheduled', $7)
            RETURNING *, work_minutes
          `, [
            scheduleId,
            employee.employeeId,
            shift.date,
            shift.startTime,
            shift.endTime,
            shift.breakMinutes || 0,
            shift.notes || null
          ]);

          const createdShift = shiftResult.rows[0];
          createdShifts.push(createdShift);

          // 근무 시간 합계 계산
          totalHours += createdShift.work_minutes / 60;
        }
      }

      await client.query('COMMIT');

      return {
        success: true,
        scheduleId: scheduleId,
        shifts: createdShifts,
        totalHours: totalHours,
        message: '주간 스케줄이 성공적으로 생성되었습니다'
      };

    } catch (error) {
      await client.query('ROLLBACK');

      // 중복 오류 처리
      if (error.message && error.message.includes('이미 스케줄이 존재합니다')) {
        throw new Error(`스케줄 충돌: ${error.message}`);
      }

      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * 월간 스케줄 생성 (패턴 기반)
   */
  async createMonthlySchedule(scheduleData) {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // 월의 시작일과 종료일 계산
      const startDate = new Date(scheduleData.year, scheduleData.month - 1, 1);
      const endDate = new Date(scheduleData.year, scheduleData.month, 0);

      // 1. 메인 스케줄 생성
      const scheduleResult = await client.query(`
        INSERT INTO schedules (
          business_id, name, type, start_date, end_date, status, created_by
        ) VALUES ($1, $2, $3, $4, $5, 'active', $6)
        RETURNING id
      `, [
        scheduleData.businessId,
        scheduleData.name || `${scheduleData.year}년 ${scheduleData.month}월 스케줄`,
        'monthly',
        startDate.toISOString().split('T')[0],
        endDate.toISOString().split('T')[0],
        scheduleData.createdBy || 1
      ]);

      const scheduleId = scheduleResult.rows[0].id;
      let totalDays = 0;
      let totalHours = 0;

      // 2. 각 직원의 월간 패턴에 따라 시프트 생성
      for (const employee of scheduleData.employeeSchedules) {
        const weeklyPattern = employee.weeklyPattern;
        const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

        // 월의 각 날짜에 대해 패턴 적용
        for (let date = new Date(startDate); date <= endDate; date.setDate(date.getDate() + 1)) {
          const dayOfWeek = dayNames[date.getDay()];
          const dayPattern = weeklyPattern[dayOfWeek];

          // 해당 요일에 근무가 있는 경우
          if (dayPattern && dayPattern.startTime) {
            const shiftDate = date.toISOString().split('T')[0];

            const shiftResult = await client.query(`
              INSERT INTO schedule_shifts (
                schedule_id, employee_id, shift_date,
                start_time, end_time, break_minutes, status
              ) VALUES ($1, $2, $3, $4, $5, $6, 'scheduled')
              RETURNING work_minutes
            `, [
              scheduleId,
              employee.employeeId,
              shiftDate,
              dayPattern.startTime,
              dayPattern.endTime,
              dayPattern.breakMinutes || 60
            ]);

            totalDays++;
            totalHours += shiftResult.rows[0].work_minutes / 60;
          }
        }
      }

      await client.query('COMMIT');

      return {
        success: true,
        scheduleId: scheduleId,
        totalDays: totalDays,
        totalHours: totalHours,
        message: '월간 스케줄이 성공적으로 생성되었습니다'
      };

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * 특정 날짜의 스케줄 조회
   */
  async getScheduleByDate(params) {
    const { businessId, date } = params;

    const result = await this.pool.query(`
      SELECT
        ss.id,
        ss.employee_id AS "employeeId",
        e.name AS "employeeName",
        ss.shift_date AS "date",
        ss.start_time AS "startTime",
        ss.end_time AS "endTime",
        ss.break_minutes AS "breakMinutes",
        ss.work_minutes AS "workMinutes",
        ss.status,
        ss.notes
      FROM schedule_shifts ss
      JOIN employees e ON e.id = ss.employee_id
      JOIN schedules s ON s.id = ss.schedule_id
      WHERE s.business_id = $1
        AND ss.shift_date = $2
        AND ss.status != 'cancelled'
      ORDER BY ss.start_time, e.name
    `, [businessId, date]);

    return {
      success: true,
      schedules: result.rows,
      date: date,
      count: result.rows.length
    };
  }

  /**
   * 주간 스케줄 조회
   */
  async getWeeklySchedule(params) {
    const { businessId, startDate, endDate } = params;

    const result = await this.pool.query(`
      SELECT
        ss.id,
        ss.employee_id AS "employeeId",
        e.name AS "employeeName",
        ss.shift_date AS "date",
        ss.start_time AS "startTime",
        ss.end_time AS "endTime",
        ss.break_minutes AS "breakMinutes",
        ss.work_minutes AS "workMinutes",
        ss.status,
        ss.notes
      FROM schedule_shifts ss
      JOIN employees e ON e.id = ss.employee_id
      JOIN schedules s ON s.id = ss.schedule_id
      WHERE s.business_id = $1
        AND ss.shift_date >= $2
        AND ss.shift_date <= $3
        AND ss.status != 'cancelled'
      ORDER BY ss.shift_date, ss.start_time, e.name
    `, [businessId, startDate, endDate]);

    // 총 근무 시간 계산
    const totalHours = result.rows.reduce((sum, shift) => {
      return sum + (shift.workMinutes / 60);
    }, 0);

    return {
      success: true,
      schedules: result.rows,
      totalHours: totalHours,
      startDate: startDate,
      endDate: endDate,
      count: result.rows.length
    };
  }

  /**
   * 직원별 스케줄 조회
   */
  async getEmployeeSchedule(params) {
    const { employeeId, startDate, endDate } = params;

    const result = await this.pool.query(`
      SELECT
        ss.id,
        ss.shift_date AS "date",
        ss.start_time AS "startTime",
        ss.end_time AS "endTime",
        ss.break_minutes AS "breakMinutes",
        ss.work_minutes AS "workMinutes",
        ss.status,
        ss.notes,
        s.name AS "scheduleName"
      FROM schedule_shifts ss
      JOIN schedules s ON s.id = ss.schedule_id
      WHERE ss.employee_id = $1
        AND ss.shift_date >= $2
        AND ss.shift_date <= $3
        AND ss.status != 'cancelled'
      ORDER BY ss.shift_date, ss.start_time
    `, [employeeId, startDate, endDate]);

    return {
      success: true,
      employeeId: employeeId,
      schedules: result.rows,
      startDate: startDate,
      endDate: endDate,
      count: result.rows.length
    };
  }

  /**
   * 스케줄 수정
   */
  async updateSchedule(params) {
    const { scheduleId, startTime, endTime, breakMinutes, status, notes } = params;

    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // 현재 user_id를 세션 변수로 설정 (이력 추적용)
      await client.query('SET LOCAL app.current_user_id = $1', [params.userId || '1']);

      // 스케줄 업데이트
      const updateFields = [];
      const values = [];
      let valueIndex = 1;

      if (startTime !== undefined) {
        updateFields.push(`start_time = $${valueIndex++}`);
        values.push(startTime);
      }
      if (endTime !== undefined) {
        updateFields.push(`end_time = $${valueIndex++}`);
        values.push(endTime);
      }
      if (breakMinutes !== undefined) {
        updateFields.push(`break_minutes = $${valueIndex++}`);
        values.push(breakMinutes);
      }
      if (status !== undefined) {
        updateFields.push(`status = $${valueIndex++}`);
        values.push(status);
      }
      if (notes !== undefined) {
        updateFields.push(`notes = $${valueIndex++}`);
        values.push(notes);
      }

      values.push(scheduleId);

      const result = await client.query(`
        UPDATE schedule_shifts
        SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP
        WHERE id = $${valueIndex}
        RETURNING *
      `, values);

      await client.query('COMMIT');

      return {
        success: true,
        updatedSchedule: result.rows[0],
        message: '스케줄이 성공적으로 수정되었습니다'
      };

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * 스케줄 삭제
   */
  async deleteSchedule(params) {
    const { scheduleId, reason } = params;

    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // 현재 user_id를 세션 변수로 설정
      await client.query('SET LOCAL app.current_user_id = $1', [params.userId || '1']);

      // 소프트 삭제 (상태를 cancelled로 변경)
      const result = await client.query(`
        UPDATE schedule_shifts
        SET status = 'cancelled',
            notes = COALESCE(notes || E'\\n', '') || '취소 사유: ' || $2,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING updated_at AS "deletedAt"
      `, [scheduleId, reason || '사유 없음']);

      // 이력에 취소 기록 추가
      await client.query(`
        INSERT INTO schedule_history (
          schedule_shift_id, changed_by, change_type, reason
        ) VALUES ($1, $2, 'cancelled', $3)
      `, [scheduleId, params.userId || 1, reason]);

      await client.query('COMMIT');

      return {
        success: true,
        deletedAt: result.rows[0].deletedAt,
        message: '스케줄이 취소되었습니다'
      };

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * 스케줄 변경 이력 조회
   */
  async getScheduleHistory(params) {
    const { scheduleId } = params;

    const result = await this.pool.query(`
      SELECT
        sh.id,
        sh.change_type AS "changeType",
        sh.old_values AS "oldValues",
        sh.new_values AS "newValues",
        sh.reason,
        sh.changed_at AS "changedAt",
        u.name AS "changedBy"
      FROM schedule_history sh
      LEFT JOIN users u ON u.id = sh.changed_by
      WHERE sh.schedule_shift_id = $1
      ORDER BY sh.changed_at DESC
    `, [scheduleId]);

    return {
      success: true,
      history: result.rows,
      count: result.rows.length
    };
  }
}

module.exports = ScheduleCore;