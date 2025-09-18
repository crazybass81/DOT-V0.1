/**
 * T297: 스케줄 변경 실시간 업데이트
 * WebSocket을 통한 스케줄 관련 실시간 알림
 *
 * 주요 기능:
 * - 스케줄 생성/수정/삭제 알림
 * - 교대 요청 및 승인 알림
 * - 스케줄 충돌 감지
 * - 실시간 스케줄 동기화
 * - 근무 시간 변경 알림
 */

const pool = require('../db');
const logger = require('../utils/logger');
const scheduleLib = require('../lib/schedule-lib');
const moment = require('moment-timezone');

/**
 * 스케줄 생성 처리
 * @param {Socket} socket - Socket.io 소켓
 * @param {Object} data - 스케줄 데이터
 * @returns {Promise<Object>} 처리 결과
 */
async function handleScheduleCreate(socket, data) {
  const client = await pool.connect();

  try {
    const creatorId = socket.user.id;
    const businessId = socket.user.currentBusinessId;
    const role = socket.user.currentRole;

    // 권한 확인 (manager, owner만 가능)
    if (role !== 'manager' && role !== 'owner') {
      return {
        success: false,
        error: 'PERMISSION_DENIED',
        message: '스케줄 생성 권한이 없습니다.'
      };
    }

    const {
      userId,
      startTime,
      endTime,
      shiftType,
      department,
      position,
      notes
    } = data;

    // 필수 필드 검증
    if (!userId || !startTime || !endTime) {
      return {
        success: false,
        error: 'MISSING_FIELDS',
        message: '필수 정보가 누락되었습니다.'
      };
    }

    // 시간 유효성 검증
    const start = moment(startTime);
    const end = moment(endTime);

    if (!start.isValid() || !end.isValid()) {
      return {
        success: false,
        error: 'INVALID_TIME',
        message: '유효하지 않은 시간 형식입니다.'
      };
    }

    if (end.isSameOrBefore(start)) {
      return {
        success: false,
        error: 'INVALID_TIME_RANGE',
        message: '종료 시간은 시작 시간보다 늦어야 합니다.'
      };
    }

    // 근무 시간 계산
    const hoursScheduled = end.diff(start, 'hours', true);

    // 한국 노동법 준수 확인
    if (hoursScheduled > 12) {
      return {
        success: false,
        error: 'EXCESSIVE_HOURS',
        message: '일일 근무시간은 12시간을 초과할 수 없습니다.'
      };
    }

    // 중복 스케줄 확인
    const conflictQuery = `
      SELECT id, start_time, end_time
      FROM schedules
      WHERE user_id = $1
        AND business_id = $2
        AND status != 'cancelled'
        AND (
          (start_time <= $3 AND end_time > $3) OR
          (start_time < $4 AND end_time >= $4) OR
          (start_time >= $3 AND end_time <= $4)
        )
    `;
    const conflictResult = await client.query(conflictQuery, [
      userId,
      businessId,
      startTime,
      endTime
    ]);

    if (conflictResult.rows.length > 0) {
      const conflict = conflictResult.rows[0];
      return {
        success: false,
        error: 'SCHEDULE_CONFLICT',
        message: '해당 시간에 이미 스케줄이 존재합니다.',
        conflict: {
          id: conflict.id,
          startTime: conflict.start_time,
          endTime: conflict.end_time
        }
      };
    }

    // 주간 근무시간 확인 (52시간 제한)
    const weekStart = start.clone().startOf('week');
    const weekEnd = start.clone().endOf('week');

    const weekHoursQuery = `
      SELECT SUM(hours_scheduled) as total_hours
      FROM schedules
      WHERE user_id = $1
        AND business_id = $2
        AND start_time >= $3
        AND start_time <= $4
        AND status != 'cancelled'
    `;
    const weekHoursResult = await client.query(weekHoursQuery, [
      userId,
      businessId,
      weekStart.toISOString(),
      weekEnd.toISOString()
    ]);

    const currentWeekHours = parseFloat(weekHoursResult.rows[0].total_hours || 0);
    if (currentWeekHours + hoursScheduled > 52) {
      return {
        success: false,
        error: 'WEEKLY_HOURS_EXCEEDED',
        message: `주간 근무시간이 52시간을 초과합니다. (현재: ${currentWeekHours}시간)`,
        currentHours: currentWeekHours,
        additionalHours: hoursScheduled
      };
    }

    // 스케줄 생성
    await client.query('BEGIN');

    const insertQuery = `
      INSERT INTO schedules (
        user_id,
        business_id,
        start_time,
        end_time,
        shift_type,
        department,
        position,
        notes,
        hours_scheduled,
        created_by,
        status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'confirmed')
      RETURNING id, start_time, end_time
    `;

    const insertResult = await client.query(insertQuery, [
      userId,
      businessId,
      startTime,
      endTime,
      shiftType || 'regular',
      department,
      position,
      notes,
      hoursScheduled,
      creatorId
    ]);

    const schedule = insertResult.rows[0];

    // 활동 로그 기록
    await client.query(`
      INSERT INTO schedule_logs (
        schedule_id,
        user_id,
        action,
        details,
        created_at
      ) VALUES ($1, $2, 'created', $3, NOW())
    `, [
      schedule.id,
      creatorId,
      JSON.stringify({ userId, startTime, endTime })
    ]);

    await client.query('COMMIT');

    // 영향받는 사용자 정보 조회
    const userQuery = `
      SELECT name, email, phone FROM users WHERE id = $1
    `;
    const userResult = await client.query(userQuery, [userId]);
    const affectedUser = userResult.rows[0];

    logger.info(`스케줄 생성: id=${schedule.id}, userId=${userId}, by=${creatorId}`);

    return {
      success: true,
      scheduleId: schedule.id,
      startTime: schedule.start_time,
      endTime: schedule.end_time,
      hoursScheduled,
      affectedUser: {
        id: userId,
        name: affectedUser.name
      }
    };

  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('스케줄 생성 오류:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * 스케줄 수정 처리
 * @param {Socket} socket - Socket.io 소켓
 * @param {Object} data - 수정 데이터
 * @returns {Promise<Object>} 처리 결과
 */
async function handleScheduleUpdate(socket, data) {
  const client = await pool.connect();

  try {
    const updaterId = socket.user.id;
    const role = socket.user.currentRole;
    const { scheduleId, startTime, endTime, notes } = data;

    // 권한 확인
    if (role !== 'manager' && role !== 'owner') {
      return {
        success: false,
        error: 'PERMISSION_DENIED',
        message: '스케줄 수정 권한이 없습니다.'
      };
    }

    // 기존 스케줄 조회
    const scheduleQuery = `
      SELECT * FROM schedules WHERE id = $1
    `;
    const scheduleResult = await client.query(scheduleQuery, [scheduleId]);

    if (scheduleResult.rows.length === 0) {
      return {
        success: false,
        error: 'SCHEDULE_NOT_FOUND',
        message: '스케줄을 찾을 수 없습니다.'
      };
    }

    const originalSchedule = scheduleResult.rows[0];

    // 변경 사항 추적
    const changes = {};
    const updateFields = [];
    const updateValues = [];
    let paramCount = 1;

    if (startTime && startTime !== originalSchedule.start_time) {
      updateFields.push(`start_time = $${paramCount++}`);
      updateValues.push(startTime);
      changes.startTime = { from: originalSchedule.start_time, to: startTime };
    }

    if (endTime && endTime !== originalSchedule.end_time) {
      updateFields.push(`end_time = $${paramCount++}`);
      updateValues.push(endTime);
      changes.endTime = { from: originalSchedule.end_time, to: endTime };
    }

    if (notes !== undefined && notes !== originalSchedule.notes) {
      updateFields.push(`notes = $${paramCount++}`);
      updateValues.push(notes);
      changes.notes = { from: originalSchedule.notes, to: notes };
    }

    if (updateFields.length === 0) {
      return {
        success: false,
        error: 'NO_CHANGES',
        message: '변경 사항이 없습니다.'
      };
    }

    // 근무 시간 재계산
    const newStart = startTime ? moment(startTime) : moment(originalSchedule.start_time);
    const newEnd = endTime ? moment(endTime) : moment(originalSchedule.end_time);
    const hoursScheduled = newEnd.diff(newStart, 'hours', true);

    updateFields.push(`hours_scheduled = $${paramCount++}`);
    updateValues.push(hoursScheduled);
    updateFields.push(`updated_by = $${paramCount++}`);
    updateValues.push(updaterId);
    updateFields.push(`updated_at = NOW()`);

    // 스케줄 업데이트
    await client.query('BEGIN');

    updateValues.push(scheduleId);
    const updateQuery = `
      UPDATE schedules
      SET ${updateFields.join(', ')}
      WHERE id = $${paramCount}
      RETURNING user_id
    `;

    const updateResult = await client.query(updateQuery, updateValues);
    const affectedUserId = updateResult.rows[0].user_id;

    // 활동 로그 기록
    await client.query(`
      INSERT INTO schedule_logs (
        schedule_id,
        user_id,
        action,
        details,
        created_at
      ) VALUES ($1, $2, 'updated', $3, NOW())
    `, [
      scheduleId,
      updaterId,
      JSON.stringify(changes)
    ]);

    await client.query('COMMIT');

    logger.info(`스케줄 수정: id=${scheduleId}, by=${updaterId}`);

    return {
      success: true,
      scheduleId,
      changes,
      affectedUsers: [affectedUserId]
    };

  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('스케줄 수정 오류:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * 교대 요청 처리
 * @param {Socket} socket - Socket.io 소켓
 * @param {Object} data - 교대 요청 데이터
 * @returns {Promise<Object>} 처리 결과
 */
async function handleShiftRequest(socket, data) {
  const client = await pool.connect();

  try {
    const requesterId = socket.user.id;
    const businessId = socket.user.currentBusinessId;
    const {
      scheduleId,
      targetUserId,
      reason,
      date
    } = data;

    // 자신의 스케줄인지 확인
    const scheduleQuery = `
      SELECT * FROM schedules
      WHERE id = $1 AND user_id = $2 AND business_id = $3
    `;
    const scheduleResult = await client.query(scheduleQuery, [
      scheduleId,
      requesterId,
      businessId
    ]);

    if (scheduleResult.rows.length === 0) {
      return {
        success: false,
        error: 'SCHEDULE_NOT_FOUND',
        message: '해당 스케줄을 찾을 수 없습니다.'
      };
    }

    const schedule = scheduleResult.rows[0];

    // 대상 사용자 확인
    const targetQuery = `
      SELECT u.name
      FROM users u
      JOIN user_roles ur ON u.id = ur.user_id
      WHERE u.id = $1 AND ur.business_id = $2 AND ur.is_active = true
    `;
    const targetResult = await client.query(targetQuery, [targetUserId, businessId]);

    if (targetResult.rows.length === 0) {
      return {
        success: false,
        error: 'TARGET_USER_NOT_FOUND',
        message: '대상 사용자를 찾을 수 없습니다.'
      };
    }

    const targetUserName = targetResult.rows[0].name;

    // 교대 요청 생성
    await client.query('BEGIN');

    const insertQuery = `
      INSERT INTO shift_requests (
        schedule_id,
        requester_id,
        target_user_id,
        business_id,
        reason,
        status,
        requested_date,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, 'pending', $6, NOW())
      RETURNING id
    `;

    const insertResult = await client.query(insertQuery, [
      scheduleId,
      requesterId,
      targetUserId,
      businessId,
      reason,
      date || schedule.start_time
    ]);

    const requestId = insertResult.rows[0].id;

    // 알림 생성
    await client.query(`
      INSERT INTO notifications (
        user_id,
        type,
        title,
        message,
        data,
        created_at
      ) VALUES ($1, 'shift_request', $2, $3, $4, NOW())
    `, [
      targetUserId,
      '교대 요청',
      `${socket.user.name}님이 교대를 요청했습니다.`,
      JSON.stringify({
        requestId,
        scheduleId,
        requesterId,
        requesterName: socket.user.name,
        date: schedule.start_time
      })
    ]);

    await client.query('COMMIT');

    logger.info(`교대 요청 생성: id=${requestId}, from=${requesterId}, to=${targetUserId}`);

    return {
      success: true,
      requestId,
      scheduleId,
      targetUserId,
      targetUserName,
      date: schedule.start_time,
      shift: {
        startTime: schedule.start_time,
        endTime: schedule.end_time
      }
    };

  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('교대 요청 오류:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * 교대 요청 승인/거부 처리
 * @param {Socket} socket - Socket.io 소켓
 * @param {Object} data - 승인/거부 데이터
 * @returns {Promise<Object>} 처리 결과
 */
async function handleApproval(socket, data) {
  const client = await pool.connect();

  try {
    const approverId = socket.user.id;
    const { requestId, approved, reason } = data;

    // 교대 요청 조회
    const requestQuery = `
      SELECT sr.*, s.start_time, s.end_time, s.hours_scheduled
      FROM shift_requests sr
      JOIN schedules s ON sr.schedule_id = s.id
      WHERE sr.id = $1
    `;
    const requestResult = await client.query(requestQuery, [requestId]);

    if (requestResult.rows.length === 0) {
      return {
        success: false,
        error: 'REQUEST_NOT_FOUND',
        message: '교대 요청을 찾을 수 없습니다.'
      };
    }

    const request = requestResult.rows[0];

    // 권한 확인 (대상자 본인 또는 관리자)
    const role = socket.user.currentRole;
    if (approverId !== request.target_user_id &&
        role !== 'manager' && role !== 'owner') {
      return {
        success: false,
        error: 'PERMISSION_DENIED',
        message: '승인 권한이 없습니다.'
      };
    }

    // 이미 처리된 요청인지 확인
    if (request.status !== 'pending') {
      return {
        success: false,
        error: 'ALREADY_PROCESSED',
        message: '이미 처리된 요청입니다.',
        status: request.status
      };
    }

    await client.query('BEGIN');

    if (approved) {
      // 승인: 스케줄 교대
      await client.query(`
        UPDATE schedules
        SET user_id = $1,
            updated_by = $2,
            updated_at = NOW()
        WHERE id = $3
      `, [request.target_user_id, approverId, request.schedule_id]);

      // 교대 로그 기록
      await client.query(`
        INSERT INTO schedule_logs (
          schedule_id,
          user_id,
          action,
          details,
          created_at
        ) VALUES ($1, $2, 'shifted', $3, NOW())
      `, [
        request.schedule_id,
        approverId,
        JSON.stringify({
          from: request.requester_id,
          to: request.target_user_id,
          requestId: requestId
        })
      ]);
    }

    // 요청 상태 업데이트
    await client.query(`
      UPDATE shift_requests
      SET status = $1,
          approved_by = $2,
          approval_reason = $3,
          processed_at = NOW()
      WHERE id = $4
    `, [
      approved ? 'approved' : 'rejected',
      approverId,
      reason,
      requestId
    ]);

    // 알림 생성 (요청자에게)
    await client.query(`
      INSERT INTO notifications (
        user_id,
        type,
        title,
        message,
        data,
        created_at
      ) VALUES ($1, 'shift_response', $2, $3, $4, NOW())
    `, [
      request.requester_id,
      approved ? '교대 승인됨' : '교대 거부됨',
      approved
        ? `교대 요청이 승인되었습니다.`
        : `교대 요청이 거부되었습니다. 사유: ${reason}`,
      JSON.stringify({
        requestId,
        approved,
        approvedBy: socket.user.name,
        reason
      })
    ]);

    await client.query('COMMIT');

    logger.info(`교대 요청 처리: id=${requestId}, approved=${approved}, by=${approverId}`);

    return {
      success: true,
      requestId,
      approved,
      requesterId: request.requester_id,
      scheduleId: request.schedule_id
    };

  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('교대 승인/거부 오류:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * 스케줄 동기화
 * @param {string} userId - 사용자 ID
 * @param {string} businessId - 사업장 ID
 * @param {string} from - 시작 날짜
 * @param {string} to - 종료 날짜
 * @returns {Promise<Array>} 스케줄 목록
 */
async function syncSchedules(userId, businessId, from, to) {
  const client = await pool.connect();

  try {
    const query = `
      SELECT
        s.id,
        s.user_id,
        s.start_time,
        s.end_time,
        s.shift_type,
        s.department,
        s.position,
        s.notes,
        s.hours_scheduled,
        s.status,
        u.name as user_name,
        sr.id as shift_request_id,
        sr.status as shift_request_status
      FROM schedules s
      JOIN users u ON s.user_id = u.id
      LEFT JOIN shift_requests sr ON s.id = sr.schedule_id
        AND sr.status = 'pending'
      WHERE s.business_id = $1
        AND (s.user_id = $2 OR $3 IN ('manager', 'owner'))
        AND s.start_time >= $4
        AND s.start_time <= $5
        AND s.status != 'cancelled'
      ORDER BY s.start_time ASC
    `;

    const role = await getUserRole(userId, businessId);
    const result = await client.query(query, [
      businessId,
      userId,
      role,
      from,
      to
    ]);

    return result.rows.map(row => ({
      id: row.id,
      userId: row.user_id,
      userName: row.user_name,
      startTime: row.start_time,
      endTime: row.end_time,
      shiftType: row.shift_type,
      department: row.department,
      position: row.position,
      notes: row.notes,
      hoursScheduled: row.hours_scheduled,
      status: row.status,
      hasShiftRequest: !!row.shift_request_id,
      shiftRequestStatus: row.shift_request_status
    }));

  } catch (error) {
    logger.error('스케줄 동기화 오류:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * 사용자 역할 조회
 * @param {string} userId - 사용자 ID
 * @param {string} businessId - 사업장 ID
 * @returns {Promise<string>} 역할
 */
async function getUserRole(userId, businessId) {
  const client = await pool.connect();

  try {
    const query = `
      SELECT role_type
      FROM user_roles
      WHERE user_id = $1 AND business_id = $2 AND is_active = true
    `;
    const result = await client.query(query, [userId, businessId]);

    return result.rows[0]?.role_type || 'worker';

  } catch (error) {
    logger.error('역할 조회 오류:', error);
    return 'worker';
  } finally {
    client.release();
  }
}

/**
 * 스케줄 알림 전송
 * @param {string} businessId - 사업장 ID
 * @param {string} type - 알림 타입
 * @param {Object} data - 알림 데이터
 */
async function sendScheduleNotification(businessId, type, data) {
  try {
    const io = require('../socket').getSocketServer();
    if (!io) {
      logger.warn('Socket.io 서버가 초기화되지 않았습니다.');
      return;
    }

    // 사업장 전체 알림
    const businessRoom = `business:${businessId}`;
    io.to(businessRoom).emit(`schedule:${type}`, data);

    // 개인 알림 (영향받는 사용자)
    if (data.affectedUsers) {
      data.affectedUsers.forEach(userId => {
        io.to(`user:${userId}`).emit(`schedule:${type}`, data);
      });
    }

  } catch (error) {
    logger.error('스케줄 알림 전송 오류:', error);
  }
}

module.exports = {
  handleScheduleCreate,
  handleScheduleUpdate,
  handleShiftRequest,
  handleApproval,
  syncSchedules,
  sendScheduleNotification
};