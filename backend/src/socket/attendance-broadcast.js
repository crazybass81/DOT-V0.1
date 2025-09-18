/**
 * T296: 출퇴근 실시간 알림
 * WebSocket을 통한 출퇴근 관련 실시간 브로드캐스트
 *
 * 주요 기능:
 * - 체크인/체크아웃 실시간 알림
 * - 관리자 대시보드 실시간 업데이트
 * - 출근 현황 통계
 * - QR 코드 스캔 처리
 * - 휴게 시간 관리
 */

const pool = require('../db');
const logger = require('../utils/logger');
const attendanceLib = require('../lib/attendance-lib');
const moment = require('moment-timezone');

/**
 * 체크인 처리
 * @param {Socket} socket - Socket.io 소켓
 * @param {Object} data - 체크인 데이터
 * @returns {Promise<Object>} 처리 결과
 */
async function handleCheckIn(socket, data) {
  const client = await pool.connect();

  try {
    const userId = socket.user.id;
    const businessId = socket.user.currentBusinessId;
    const { latitude, longitude, method = 'gps' } = data;

    // 이미 체크인한 상태인지 확인
    const existingQuery = `
      SELECT id, check_in_time
      FROM attendances
      WHERE user_id = $1
        AND business_id = $2
        AND date = CURRENT_DATE
        AND check_out_time IS NULL
    `;
    const existingResult = await client.query(existingQuery, [userId, businessId]);

    if (existingResult.rows.length > 0) {
      return {
        success: false,
        error: 'ALREADY_CHECKED_IN',
        message: '이미 체크인한 상태입니다.',
        checkInTime: existingResult.rows[0].check_in_time
      };
    }

    // GPS 검증 (method가 GPS인 경우)
    if (method === 'gps') {
      if (!latitude || !longitude) {
        return {
          success: false,
          error: 'MISSING_LOCATION',
          message: 'GPS 위치 정보가 필요합니다.'
        };
      }

      // 사업장 위치 조회
      const businessQuery = `
        SELECT latitude, longitude, check_in_radius
        FROM businesses
        WHERE id = $1
      `;
      const businessResult = await client.query(businessQuery, [businessId]);

      if (businessResult.rows.length === 0) {
        return {
          success: false,
          error: 'BUSINESS_NOT_FOUND',
          message: '사업장 정보를 찾을 수 없습니다.'
        };
      }

      const business = businessResult.rows[0];
      const radius = business.check_in_radius || 50; // 기본 50m

      // GPS 거리 계산 (attendance-lib 활용)
      const distance = attendanceLib.calculateGPSDistance(
        latitude,
        longitude,
        business.latitude,
        business.longitude
      );

      if (distance > radius) {
        return {
          success: false,
          error: 'OUT_OF_RANGE',
          message: `사업장에서 ${Math.round(distance)}m 떨어져 있습니다. (허용: ${radius}m)`,
          distance: Math.round(distance)
        };
      }
    }

    // 스케줄 확인 (오늘 근무 예정인지)
    const scheduleQuery = `
      SELECT id, start_time, end_time
      FROM schedules
      WHERE user_id = $1
        AND business_id = $2
        AND DATE(start_time) = CURRENT_DATE
        AND status = 'confirmed'
      ORDER BY start_time ASC
      LIMIT 1
    `;
    const scheduleResult = await client.query(scheduleQuery, [userId, businessId]);

    let scheduleId = null;
    let scheduledStartTime = null;
    let isLate = false;

    if (scheduleResult.rows.length > 0) {
      const schedule = scheduleResult.rows[0];
      scheduleId = schedule.id;
      scheduledStartTime = schedule.start_time;

      // 지각 여부 확인 (10분 이상)
      const now = moment();
      const scheduled = moment(scheduledStartTime);
      if (now.diff(scheduled, 'minutes') > 10) {
        isLate = true;
      }
    }

    // 체크인 기록 생성
    await client.query('BEGIN');

    const insertQuery = `
      INSERT INTO attendances (
        user_id,
        business_id,
        date,
        check_in_time,
        check_in_location,
        check_in_method,
        schedule_id,
        is_late,
        status
      ) VALUES ($1, $2, CURRENT_DATE, NOW(),
               POINT($3, $4), $5, $6, $7, 'working')
      RETURNING id, check_in_time
    `;

    const insertResult = await client.query(insertQuery, [
      userId,
      businessId,
      latitude,
      longitude,
      method,
      scheduleId,
      isLate
    ]);

    const attendance = insertResult.rows[0];

    // 활동 로그 기록
    await client.query(`
      INSERT INTO attendance_logs (
        attendance_id,
        user_id,
        business_id,
        action,
        timestamp,
        location,
        method
      ) VALUES ($1, $2, $3, 'check_in', NOW(), POINT($4, $5), $6)
    `, [
      attendance.id,
      userId,
      businessId,
      latitude,
      longitude,
      method
    ]);

    await client.query('COMMIT');

    // 실시간 통계 업데이트
    await updateLiveStatistics(businessId);

    logger.info(`체크인 성공: userId=${userId}, businessId=${businessId}, method=${method}`);

    return {
      success: true,
      attendanceId: attendance.id,
      checkInTime: attendance.check_in_time,
      isLate,
      scheduledTime: scheduledStartTime,
      method
    };

  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('체크인 처리 오류:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * 체크아웃 처리
 * @param {Socket} socket - Socket.io 소켓
 * @param {Object} data - 체크아웃 데이터
 * @returns {Promise<Object>} 처리 결과
 */
async function handleCheckOut(socket, data) {
  const client = await pool.connect();

  try {
    const userId = socket.user.id;
    const businessId = socket.user.currentBusinessId;
    const { latitude, longitude, method = 'gps' } = data;

    // 현재 체크인 상태 확인
    const attendanceQuery = `
      SELECT id, check_in_time, break_time
      FROM attendances
      WHERE user_id = $1
        AND business_id = $2
        AND date = CURRENT_DATE
        AND check_out_time IS NULL
    `;
    const attendanceResult = await client.query(attendanceQuery, [userId, businessId]);

    if (attendanceResult.rows.length === 0) {
      return {
        success: false,
        error: 'NOT_CHECKED_IN',
        message: '체크인하지 않은 상태입니다.'
      };
    }

    const attendance = attendanceResult.rows[0];

    // 근무 시간 계산
    const checkInTime = moment(attendance.check_in_time);
    const checkOutTime = moment();
    const breakMinutes = attendance.break_time || 0;
    const totalMinutes = checkOutTime.diff(checkInTime, 'minutes') - breakMinutes;
    const totalHours = Math.round((totalMinutes / 60) * 100) / 100;

    // 체크아웃 업데이트
    await client.query('BEGIN');

    const updateQuery = `
      UPDATE attendances
      SET check_out_time = NOW(),
          check_out_location = POINT($1, $2),
          check_out_method = $3,
          total_hours = $4,
          status = 'completed'
      WHERE id = $5
      RETURNING check_out_time
    `;

    const updateResult = await client.query(updateQuery, [
      latitude,
      longitude,
      method,
      totalHours,
      attendance.id
    ]);

    const checkOutTime2 = updateResult.rows[0].check_out_time;

    // 활동 로그 기록
    await client.query(`
      INSERT INTO attendance_logs (
        attendance_id,
        user_id,
        business_id,
        action,
        timestamp,
        location,
        method
      ) VALUES ($1, $2, $3, 'check_out', NOW(), POINT($4, $5), $6)
    `, [
      attendance.id,
      userId,
      businessId,
      latitude,
      longitude,
      method
    ]);

    await client.query('COMMIT');

    // 실시간 통계 업데이트
    await updateLiveStatistics(businessId);

    logger.info(`체크아웃 성공: userId=${userId}, totalHours=${totalHours}`);

    return {
      success: true,
      attendanceId: attendance.id,
      checkOutTime: checkOutTime2,
      totalHours,
      totalMinutes,
      breakMinutes
    };

  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('체크아웃 처리 오류:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * QR 코드 스캔 처리
 * @param {Socket} socket - Socket.io 소켓
 * @param {Object} data - QR 코드 데이터
 * @returns {Promise<Object>} 처리 결과
 */
async function handleQRScan(socket, data) {
  try {
    const userId = socket.user.id;
    const businessId = socket.user.currentBusinessId;
    const { qrCode } = data;

    if (!qrCode) {
      return {
        success: false,
        error: 'MISSING_QR_CODE',
        message: 'QR 코드가 필요합니다.'
      };
    }

    // QR 코드 검증 (attendance-lib 활용)
    const validationResult = attendanceLib.verifyQRCode(qrCode, businessId);

    if (!validationResult.valid) {
      return {
        success: false,
        error: 'INVALID_QR_CODE',
        message: validationResult.message || 'QR 코드가 유효하지 않습니다.'
      };
    }

    // QR 체크인 처리
    const checkInResult = await handleCheckIn(socket, {
      method: 'qr',
      qrCode: qrCode,
      latitude: validationResult.latitude,
      longitude: validationResult.longitude
    });

    return checkInResult;

  } catch (error) {
    logger.error('QR 스캔 처리 오류:', error);
    throw error;
  }
}

/**
 * 휴게 시간 처리
 * @param {Socket} socket - Socket.io 소켓
 * @param {Object} data - 휴게 데이터
 * @returns {Promise<Object>} 처리 결과
 */
async function handleBreak(socket, data) {
  const client = await pool.connect();

  try {
    const userId = socket.user.id;
    const businessId = socket.user.currentBusinessId;
    const { type } = data; // start, end

    // 현재 출근 상태 확인
    const attendanceQuery = `
      SELECT id, check_in_time, break_start_time, break_time
      FROM attendances
      WHERE user_id = $1
        AND business_id = $2
        AND date = CURRENT_DATE
        AND check_out_time IS NULL
    `;
    const attendanceResult = await client.query(attendanceQuery, [userId, businessId]);

    if (attendanceResult.rows.length === 0) {
      return {
        success: false,
        error: 'NOT_CHECKED_IN',
        message: '체크인하지 않은 상태입니다.'
      };
    }

    const attendance = attendanceResult.rows[0];

    if (type === 'start') {
      // 휴게 시작
      if (attendance.break_start_time) {
        return {
          success: false,
          error: 'ALREADY_ON_BREAK',
          message: '이미 휴게 중입니다.'
        };
      }

      await client.query(`
        UPDATE attendances
        SET break_start_time = NOW()
        WHERE id = $1
      `, [attendance.id]);

      // 로그 기록
      await client.query(`
        INSERT INTO attendance_logs (
          attendance_id, user_id, business_id,
          action, timestamp
        ) VALUES ($1, $2, $3, 'break_start', NOW())
      `, [attendance.id, userId, businessId]);

      return {
        success: true,
        type: 'start',
        time: new Date()
      };

    } else if (type === 'end') {
      // 휴게 종료
      if (!attendance.break_start_time) {
        return {
          success: false,
          error: 'NOT_ON_BREAK',
          message: '휴게 중이 아닙니다.'
        };
      }

      // 휴게 시간 계산
      const breakStart = moment(attendance.break_start_time);
      const breakEnd = moment();
      const breakMinutes = breakEnd.diff(breakStart, 'minutes');
      const totalBreakMinutes = (attendance.break_time || 0) + breakMinutes;

      await client.query(`
        UPDATE attendances
        SET break_start_time = NULL,
            break_time = $1
        WHERE id = $2
      `, [totalBreakMinutes, attendance.id]);

      // 로그 기록
      await client.query(`
        INSERT INTO attendance_logs (
          attendance_id, user_id, business_id,
          action, timestamp, details
        ) VALUES ($1, $2, $3, 'break_end', NOW(), $4)
      `, [
        attendance.id,
        userId,
        businessId,
        JSON.stringify({ minutes: breakMinutes })
      ]);

      return {
        success: true,
        type: 'end',
        time: new Date(),
        breakMinutes,
        totalBreakMinutes
      };
    }

    return {
      success: false,
      error: 'INVALID_TYPE',
      message: '유효하지 않은 휴게 타입입니다.'
    };

  } catch (error) {
    logger.error('휴게 처리 오류:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * 실시간 출근 현황 조회
 * @param {string} businessId - 사업장 ID
 * @returns {Promise<Object>} 출근 현황 통계
 */
async function getLiveStatus(businessId) {
  const client = await pool.connect();

  try {
    // 전체 직원 수
    const totalQuery = `
      SELECT COUNT(*) as total
      FROM user_roles
      WHERE business_id = $1
        AND role_type = 'worker'
        AND is_active = true
    `;
    const totalResult = await client.query(totalQuery, [businessId]);
    const totalWorkers = parseInt(totalResult.rows[0].total);

    // 현재 출근 중인 직원
    const workingQuery = `
      SELECT
        COUNT(*) as working,
        COUNT(CASE WHEN is_late = true THEN 1 END) as late,
        COUNT(CASE WHEN break_start_time IS NOT NULL THEN 1 END) as on_break
      FROM attendances
      WHERE business_id = $1
        AND date = CURRENT_DATE
        AND check_out_time IS NULL
    `;
    const workingResult = await client.query(workingQuery, [businessId]);
    const stats = workingResult.rows[0];

    // 오늘 체크아웃한 직원
    const completedQuery = `
      SELECT COUNT(*) as completed
      FROM attendances
      WHERE business_id = $1
        AND date = CURRENT_DATE
        AND check_out_time IS NOT NULL
    `;
    const completedResult = await client.query(completedQuery, [businessId]);
    const completed = parseInt(completedResult.rows[0].completed);

    // 최근 활동 (최근 10개)
    const recentQuery = `
      SELECT
        al.action,
        al.timestamp,
        u.name as user_name
      FROM attendance_logs al
      JOIN users u ON al.user_id = u.id
      WHERE al.business_id = $1
        AND DATE(al.timestamp) = CURRENT_DATE
      ORDER BY al.timestamp DESC
      LIMIT 10
    `;
    const recentResult = await client.query(recentQuery, [businessId]);

    return {
      totalWorkers,
      working: parseInt(stats.working),
      completed,
      late: parseInt(stats.late),
      onBreak: parseInt(stats.on_break),
      absent: totalWorkers - parseInt(stats.working) - completed,
      attendanceRate: totalWorkers > 0
        ? Math.round(((parseInt(stats.working) + completed) / totalWorkers) * 100)
        : 0,
      recentActivities: recentResult.rows.map(row => ({
        action: row.action,
        timestamp: row.timestamp,
        userName: row.user_name
      })),
      lastUpdated: new Date()
    };

  } catch (error) {
    logger.error('실시간 현황 조회 오류:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * 실시간 통계 업데이트
 * Redis 캐시에 통계 저장
 * @param {string} businessId - 사업장 ID
 */
async function updateLiveStatistics(businessId) {
  try {
    const stats = await getLiveStatus(businessId);

    // Redis 캐시 업데이트 (있는 경우)
    const redis = require('../config/redis');
    if (redis) {
      const cacheKey = `attendance:stats:${businessId}`;
      await redis.setex(
        cacheKey,
        60, // 60초 TTL
        JSON.stringify(stats)
      );
    }

    logger.info(`실시간 통계 업데이트: businessId=${businessId}`);
    return stats;

  } catch (error) {
    logger.error('실시간 통계 업데이트 오류:', error);
    // 에러 발생해도 진행
  }
}

/**
 * 근태 알림 전송
 * @param {string} businessId - 사업장 ID
 * @param {string} type - 알림 타입
 * @param {Object} data - 알림 데이터
 */
async function sendAttendanceNotification(businessId, type, data) {
  try {
    const io = require('../socket').getSocketServer();
    if (!io) {
      logger.warn('Socket.io 서버가 초기화되지 않았습니다.');
      return;
    }

    // 관리자 룸으로 알림 전송
    const managerRoom = `business:${businessId}:managers`;
    io.to(managerRoom).emit(`attendance:${type}`, data);

    // 대시보드 업데이트 알림
    const dashboardRoom = `business:${businessId}:dashboard`;
    io.to(dashboardRoom).emit('dashboard:update', {
      type: 'attendance',
      data: await getLiveStatus(businessId)
    });

  } catch (error) {
    logger.error('근태 알림 전송 오류:', error);
  }
}

module.exports = {
  handleCheckIn,
  handleCheckOut,
  handleQRScan,
  handleBreak,
  getLiveStatus,
  updateLiveStatistics,
  sendAttendanceNotification
};