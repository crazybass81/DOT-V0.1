/**
 * T145: 근무 패턴 관리 모듈
 * 반복되는 근무 패턴 템플릿 관리
 */

class PatternManager {
  constructor(pool) {
    this.pool = pool;
  }

  /**
   * 근무 패턴 생성
   */
  async createPattern(patternData) {
    const { businessId, name, description, pattern, type } = patternData;

    const result = await this.pool.query(`
      INSERT INTO schedule_patterns (
        business_id, name, description, pattern, type
      ) VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [
      businessId,
      name,
      description || null,
      JSON.stringify(pattern),
      type || 'weekly'
    ]);

    return {
      success: true,
      patternId: result.rows[0].id,
      pattern: result.rows[0],
      message: '근무 패턴이 성공적으로 생성되었습니다'
    };
  }

  /**
   * 패턴을 사용한 스케줄 생성
   */
  async createScheduleFromPattern(params) {
    const { patternId, employeeId, startDate, endDate } = params;

    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // 1. 패턴 조회
      const patternResult = await client.query(`
        SELECT * FROM schedule_patterns
        WHERE id = $1 AND is_active = true
      `, [patternId]);

      if (patternResult.rows.length === 0) {
        throw new Error('패턴을 찾을 수 없습니다');
      }

      const pattern = patternResult.rows[0];
      const weeklyPattern = pattern.pattern;

      // 2. 스케줄 생성
      const scheduleResult = await client.query(`
        INSERT INTO schedules (
          business_id, name, type, start_date, end_date, status
        ) VALUES ($1, $2, 'custom', $3, $4, 'active')
        RETURNING id
      `, [
        pattern.business_id,
        `${pattern.name} - ${startDate}`,
        startDate,
        endDate
      ]);

      const scheduleId = scheduleResult.rows[0].id;

      // 3. 날짜 범위 내의 각 날짜에 대해 패턴 적용
      const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      const schedules = [];
      const start = new Date(startDate);
      const end = new Date(endDate);

      for (let date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
        const dayOfWeek = dayNames[date.getDay()];
        const dayPattern = weeklyPattern[dayOfWeek];

        if (dayPattern && dayPattern.start) {
          const shiftDate = date.toISOString().split('T')[0];

          const shiftResult = await client.query(`
            INSERT INTO schedule_shifts (
              schedule_id, employee_id, shift_date,
              start_time, end_time, break_minutes, status
            ) VALUES ($1, $2, $3, $4, $5, $6, 'scheduled')
            RETURNING *
          `, [
            scheduleId,
            employeeId,
            shiftDate,
            dayPattern.start,
            dayPattern.end,
            dayPattern.break || 60
          ]);

          schedules.push(shiftResult.rows[0]);
        }
      }

      await client.query('COMMIT');

      return {
        success: true,
        scheduleId: scheduleId,
        schedules: schedules,
        message: `패턴을 사용하여 ${schedules.length}개의 스케줄이 생성되었습니다`
      };

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * 패턴 목록 조회
   */
  async getPatterns(businessId) {
    const result = await this.pool.query(`
      SELECT
        id,
        name,
        description,
        pattern,
        type,
        is_active AS "isActive",
        created_at AS "createdAt"
      FROM schedule_patterns
      WHERE business_id = $1 AND is_active = true
      ORDER BY name
    `, [businessId]);

    return {
      success: true,
      patterns: result.rows,
      count: result.rows.length
    };
  }

  /**
   * 패턴 수정
   */
  async updatePattern(patternId, updates) {
    const { name, description, pattern, isActive } = updates;

    const updateFields = [];
    const values = [];
    let valueIndex = 1;

    if (name !== undefined) {
      updateFields.push(`name = $${valueIndex++}`);
      values.push(name);
    }
    if (description !== undefined) {
      updateFields.push(`description = $${valueIndex++}`);
      values.push(description);
    }
    if (pattern !== undefined) {
      updateFields.push(`pattern = $${valueIndex++}`);
      values.push(JSON.stringify(pattern));
    }
    if (isActive !== undefined) {
      updateFields.push(`is_active = $${valueIndex++}`);
      values.push(isActive);
    }

    values.push(patternId);

    const result = await this.pool.query(`
      UPDATE schedule_patterns
      SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${valueIndex}
      RETURNING *
    `, values);

    return {
      success: true,
      pattern: result.rows[0],
      message: '패턴이 성공적으로 수정되었습니다'
    };
  }

  /**
   * 패턴 삭제 (소프트 삭제)
   */
  async deletePattern(patternId) {
    const result = await this.pool.query(`
      UPDATE schedule_patterns
      SET is_active = false, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `, [patternId]);

    return {
      success: true,
      message: '패턴이 비활성화되었습니다'
    };
  }
}

module.exports = PatternManager;