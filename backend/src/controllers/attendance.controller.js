/**
 * T127: 출퇴근 상태 조회 컨트롤러
 * attendance-lib 라이브러리와 데이터베이스 연동
 */

const { query } = require('../config/database');
const { getAttendanceStatus } = require('../lib/attendance-lib');
const { NotFoundError, ValidationError } = require('../middleware/errorHandler');

/**
 * 현재 사용자의 출퇴근 상태 조회
 */
async function getStatus(req, res) {
  // 검증된 파라미터 추출
  const userId = req.user.id;
  const businessId = req.validatedBusinessId || req.query.businessId;
  const date = req.validatedDate || new Date();

  // 날짜를 YYYY-MM-DD 형식으로 변환
  const dateStr = date.toISOString().split('T')[0];

  try {
    // 데이터베이스에서 출퇴근 기록 조회
    const result = await query(
      `SELECT
        a.id,
        a.user_id,
        a.business_id,
        a.check_in_time,
        a.check_out_time,
        a.check_in_location,
        a.check_out_location,
        a.check_in_method,
        a.check_out_method,
        a.status,
        a.date,
        u.name as user_name,
        b.name as business_name
       FROM attendance a
       JOIN users u ON a.user_id = u.id
       JOIN businesses b ON a.business_id = b.id
       WHERE a.user_id = $1
         AND a.business_id = $2
         AND a.date = $3
       ORDER BY a.check_in_time DESC
       LIMIT 1`,
      [userId, businessId, dateStr]
    );

    // 기록이 없는 경우
    if (result.rows.length === 0) {
      return res.status(200).json({
        success: true,
        data: {
          status: 'not_checked_in',
          date: dateStr,
          userId: userId,
          businessId: businessId,
          message: '출근 기록이 없습니다.'
        }
      });
    }

    const attendance = result.rows[0];

    // 근무 시간 계산 (체크아웃한 경우)
    let workDuration = null;
    if (attendance.check_out_time) {
      const checkIn = new Date(attendance.check_in_time);
      const checkOut = new Date(attendance.check_out_time);
      workDuration = Math.floor((checkOut - checkIn) / 1000 / 60); // 분 단위
    }

    // 응답 데이터 구성
    const responseData = {
      id: attendance.id,
      status: attendance.status,
      date: attendance.date,
      checkIn: {
        time: attendance.check_in_time,
        location: attendance.check_in_location,
        method: attendance.check_in_method
      },
      checkOut: attendance.check_out_time ? {
        time: attendance.check_out_time,
        location: attendance.check_out_location,
        method: attendance.check_out_method
      } : null,
      workDuration: workDuration,
      user: {
        id: attendance.user_id,
        name: attendance.user_name
      },
      business: {
        id: attendance.business_id,
        name: attendance.business_name
      }
    };

    res.status(200).json({
      success: true,
      data: responseData
    });
  } catch (error) {
    console.error('출퇴근 상태 조회 에러:', error);
    throw error;
  }
}

/**
 * 특정 사용자의 출퇴근 상태 조회 (관리자용)
 */
async function getUserStatus(req, res) {
  const targetUserId = req.params.userId;
  const businessId = req.validatedBusinessId || req.query.businessId;
  const date = req.validatedDate || new Date();
  const dateStr = date.toISOString().split('T')[0];

  try {
    // 대상 사용자가 해당 사업장 소속인지 확인
    const userCheck = await query(
      `SELECT user_id FROM user_roles
       WHERE user_id = $1 AND business_id = $2 AND is_active = true`,
      [targetUserId, businessId]
    );

    if (userCheck.rows.length === 0) {
      throw new NotFoundError('해당 사용자를 찾을 수 없습니다.');
    }

    // 출퇴근 기록 조회
    const result = await query(
      `SELECT
        a.*,
        u.name as user_name,
        u.email as user_email,
        ur.role_type
       FROM attendance a
       JOIN users u ON a.user_id = u.id
       LEFT JOIN user_roles ur ON u.id = ur.user_id AND ur.business_id = $2
       WHERE a.user_id = $1
         AND a.business_id = $2
         AND a.date = $3
       ORDER BY a.check_in_time DESC
       LIMIT 1`,
      [targetUserId, businessId, dateStr]
    );

    if (result.rows.length === 0) {
      return res.status(200).json({
        success: true,
        data: {
          status: 'not_checked_in',
          date: dateStr,
          userId: targetUserId,
          businessId: businessId,
          message: '출근 기록이 없습니다.'
        }
      });
    }

    const attendance = result.rows[0];

    // 휴게 시간 조회
    const breakResult = await query(
      `SELECT
        SUM(EXTRACT(EPOCH FROM (end_time - start_time)) / 60) as total_break_minutes
       FROM attendance_breaks
       WHERE attendance_id = $1`,
      [attendance.id]
    );

    const totalBreakMinutes = breakResult.rows[0]?.total_break_minutes || 0;

    // 실제 근무 시간 계산
    let actualWorkMinutes = null;
    if (attendance.check_out_time) {
      const checkIn = new Date(attendance.check_in_time);
      const checkOut = new Date(attendance.check_out_time);
      const totalMinutes = Math.floor((checkOut - checkIn) / 1000 / 60);
      actualWorkMinutes = totalMinutes - totalBreakMinutes;
    }

    res.status(200).json({
      success: true,
      data: {
        id: attendance.id,
        status: attendance.status,
        date: attendance.date,
        checkIn: {
          time: attendance.check_in_time,
          location: attendance.check_in_location,
          method: attendance.check_in_method
        },
        checkOut: attendance.check_out_time ? {
          time: attendance.check_out_time,
          location: attendance.check_out_location,
          method: attendance.check_out_method
        } : null,
        breaks: {
          totalMinutes: Math.round(totalBreakMinutes)
        },
        workDuration: {
          totalMinutes: actualWorkMinutes,
          netMinutes: actualWorkMinutes
        },
        user: {
          id: attendance.user_id,
          name: attendance.user_name,
          email: attendance.user_email,
          role: attendance.role_type
        }
      }
    });
  } catch (error) {
    console.error('사용자 출퇴근 상태 조회 에러:', error);
    throw error;
  }
}

/**
 * 사업장 전체 직원의 출퇴근 상태 조회 (관리자용)
 */
async function getBusinessStatus(req, res) {
  const businessId = req.params.businessId;
  const date = req.validatedDate || new Date();
  const dateStr = date.toISOString().split('T')[0];

  try {
    // 해당 사업장의 활성 직원 목록 조회
    const employeesResult = await query(
      `SELECT
        u.id,
        u.name,
        u.email,
        ur.role_type
       FROM users u
       JOIN user_roles ur ON u.id = ur.user_id
       WHERE ur.business_id = $1
         AND ur.is_active = true
       ORDER BY u.name`,
      [businessId]
    );

    const employees = employeesResult.rows;

    // 각 직원의 출퇴근 상태 조회
    const attendancePromises = employees.map(async (employee) => {
      const attendanceResult = await query(
        `SELECT
          id,
          check_in_time,
          check_out_time,
          status,
          check_in_method
         FROM attendance
         WHERE user_id = $1
           AND business_id = $2
           AND date = $3
         ORDER BY check_in_time DESC
         LIMIT 1`,
        [employee.id, businessId, dateStr]
      );

      const attendance = attendanceResult.rows[0];

      return {
        user: {
          id: employee.id,
          name: employee.name,
          email: employee.email,
          role: employee.role_type
        },
        attendance: attendance ? {
          id: attendance.id,
          status: attendance.status,
          checkInTime: attendance.check_in_time,
          checkOutTime: attendance.check_out_time,
          checkInMethod: attendance.check_in_method
        } : {
          status: 'not_checked_in'
        }
      };
    });

    const attendanceStatuses = await Promise.all(attendancePromises);

    // 통계 계산
    const stats = {
      total: employees.length,
      checkedIn: attendanceStatuses.filter(s =>
        s.attendance.status === 'checked_in' ||
        s.attendance.status === 'checked_out'
      ).length,
      checkedOut: attendanceStatuses.filter(s =>
        s.attendance.status === 'checked_out'
      ).length,
      notCheckedIn: attendanceStatuses.filter(s =>
        s.attendance.status === 'not_checked_in'
      ).length,
      onBreak: attendanceStatuses.filter(s =>
        s.attendance.status === 'on_break'
      ).length
    };

    res.status(200).json({
      success: true,
      data: {
        date: dateStr,
        businessId: businessId,
        stats: stats,
        employees: attendanceStatuses
      }
    });
  } catch (error) {
    console.error('사업장 출퇴근 상태 조회 에러:', error);
    throw error;
  }
}

/**
 * 출퇴근 체크인
 * T132: GPS 및 QR 방식 체크인 구현
 */
async function checkIn(req, res) {
  const userId = req.user.id;
  const { businessId, method, location, qrToken } = req.body;
  const today = new Date().toISOString().split('T')[0];

  // 트랜잭션 시작
  const client = await query.getClient();

  try {
    await client.query('BEGIN');

    // 1. 중복 체크인 확인
    const existingResult = await client.query(
      `SELECT id, status FROM attendance
       WHERE user_id = $1 AND business_id = $2 AND date = $3`,
      [userId, businessId, today]
    );

    if (existingResult.rows.length > 0) {
      const existing = existingResult.rows[0];
      if (existing.status === 'checked_in') {
        await client.query('ROLLBACK');
        return res.status(409).json({
          success: false,
          error: '이미 출근한 상태입니다.',
          code: 'ALREADY_CHECKED_IN'
        });
      }
      if (existing.status === 'checked_out') {
        await client.query('ROLLBACK');
        return res.status(409).json({
          success: false,
          error: '이미 퇴근 처리되었습니다.',
          code: 'ALREADY_CHECKED_OUT'
        });
      }
    }

    // 2. 방식별 검증
    let validationResult = { valid: false, message: '' };

    if (method === 'gps') {
      // GPS 방식 검증
      validationResult = await validateGPSCheckIn(client, businessId, location);
    } else if (method === 'qr') {
      // QR 방식 검증
      validationResult = await validateQRCheckIn(businessId, qrToken);
    }

    if (!validationResult.valid) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        error: validationResult.message,
        code: 'VALIDATION_FAILED'
      });
    }

    // 3. 체크인 기록 생성
    const checkInResult = await client.query(
      `INSERT INTO attendance (
        user_id, business_id, date, check_in_time,
        check_in_location, check_in_method, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *`,
      [
        userId,
        businessId,
        today,
        new Date(),
        location ? { type: 'Point', coordinates: [location.longitude, location.latitude] } : null,
        method,
        'checked_in'
      ]
    );

    const attendance = checkInResult.rows[0];

    // 4. 체크인 이벤트 로깅
    await client.query(
      `INSERT INTO attendance_logs (
        attendance_id, user_id, action, details, created_at
      ) VALUES ($1, $2, $3, $4, $5)`,
      [
        attendance.id,
        userId,
        'check_in',
        JSON.stringify({ method, location, businessId }),
        new Date()
      ]
    );

    await client.query('COMMIT');

    // 5. 응답 전송
    res.status(201).json({
      success: true,
      data: {
        attendanceId: attendance.id,
        checkInTime: attendance.check_in_time,
        method: attendance.check_in_method,
        status: attendance.status,
        message: '출근 체크인이 완료되었습니다.'
      }
    });

    // 6. 실시간 알림 발송 (비동기)
    // TODO: WebSocket으로 관리자에게 알림

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('체크인 처리 에러:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * GPS 체크인 검증
 */
async function validateGPSCheckIn(client, businessId, location) {
  // 사업장 정보 조회
  const businessResult = await client.query(
    `SELECT
      name,
      ST_X(gps_location::geometry) as longitude,
      ST_Y(gps_location::geometry) as latitude,
      gps_radius
     FROM businesses
     WHERE id = $1`,
    [businessId]
  );

  if (businessResult.rows.length === 0) {
    return { valid: false, message: '사업장을 찾을 수 없습니다.' };
  }

  const business = businessResult.rows[0];

  // PostGIS로 거리 계산
  const distanceResult = await client.query(
    `SELECT ST_Distance(
      ST_GeogFromText($1),
      ST_GeogFromText($2)
    ) as distance`,
    [
      `POINT(${location.longitude} ${location.latitude})`,
      `POINT(${business.longitude} ${business.latitude})`
    ]
  );

  const distance = distanceResult.rows[0].distance;

  if (distance > business.gps_radius) {
    return {
      valid: false,
      message: `체크인 위치가 허용 범위(${business.gps_radius}m)를 벗어났습니다. 현재 거리: ${Math.round(distance)}m`
    };
  }

  return { valid: true };
}

/**
 * QR 체크인 검증
 */
async function validateQRCheckIn(businessId, qrToken) {
  const { verifyQRCode } = require('../lib/attendance-lib/qr');

  try {
    const isValid = await verifyQRCode(qrToken, businessId);

    if (!isValid) {
      return {
        valid: false,
        message: 'QR 코드가 유효하지 않거나 만료되었습니다.'
      };
    }

    return { valid: true };
  } catch (error) {
    console.error('QR 검증 에러:', error);
    return {
      valid: false,
      message: 'QR 코드 검증 중 오류가 발생했습니다.'
    };
  }
}

/**
 * 체크인 가능 여부 사전 검증
 */
async function validateCheckIn(req, res) {
  const userId = req.user.id;
  const { businessId, location } = req.body;
  const today = new Date().toISOString().split('T')[0];

  try {
    // 이미 체크인했는지 확인
    const existingResult = await query(
      `SELECT id, status FROM attendance
       WHERE user_id = $1 AND business_id = $2 AND date = $3`,
      [userId, businessId, today]
    );

    if (existingResult.rows.length > 0) {
      const status = existingResult.rows[0].status;
      return res.status(200).json({
        success: true,
        data: {
          canCheckIn: false,
          reason: status === 'checked_in' ? '이미 출근한 상태입니다.' : '이미 퇴근 처리되었습니다.',
          currentStatus: status
        }
      });
    }

    // GPS 위치 검증 (제공된 경우)
    if (location) {
      const client = await query.getClient();
      try {
        const validation = await validateGPSCheckIn(client, businessId, location);

        res.status(200).json({
          success: true,
          data: {
            canCheckIn: validation.valid,
            reason: validation.valid ? null : validation.message,
            currentStatus: 'not_checked_in'
          }
        });
      } finally {
        client.release();
      }
    } else {
      res.status(200).json({
        success: true,
        data: {
          canCheckIn: true,
          currentStatus: 'not_checked_in'
        }
      });
    }
  } catch (error) {
    console.error('체크인 검증 에러:', error);
    throw error;
  }
}

/**
 * 체크인 취소 (5분 이내만 가능)
 */
async function cancelCheckIn(req, res) {
  const userId = req.user.id;
  const { businessId, attendanceId, reason } = req.body;

  try {
    // 체크인 기록 조회
    const attendanceResult = await query(
      `SELECT * FROM attendance
       WHERE id = $1 AND user_id = $2 AND business_id = $3`,
      [attendanceId, userId, businessId]
    );

    if (attendanceResult.rows.length === 0) {
      throw new NotFoundError('체크인 기록을 찾을 수 없습니다.');
    }

    const attendance = attendanceResult.rows[0];

    // 5분 이내인지 확인
    const checkInTime = new Date(attendance.check_in_time);
    const now = new Date();
    const diffMinutes = (now - checkInTime) / 1000 / 60;

    if (diffMinutes > 5) {
      return res.status(400).json({
        success: false,
        error: '체크인 후 5분이 지나 취소할 수 없습니다.',
        code: 'CANCELLATION_TIME_EXPIRED'
      });
    }

    // 이미 퇴근한 경우
    if (attendance.status === 'checked_out') {
      return res.status(400).json({
        success: false,
        error: '이미 퇴근 처리되어 취소할 수 없습니다.',
        code: 'ALREADY_CHECKED_OUT'
      });
    }

    // 체크인 취소 (삭제)
    await query(
      `DELETE FROM attendance WHERE id = $1`,
      [attendanceId]
    );

    // 취소 로그 기록
    await query(
      `INSERT INTO attendance_logs (
        user_id, action, details, created_at
      ) VALUES ($1, $2, $3, $4)`,
      [
        userId,
        'check_in_cancelled',
        JSON.stringify({ attendanceId, reason, businessId }),
        new Date()
      ]
    );

    res.status(200).json({
      success: true,
      data: {
        message: '체크인이 취소되었습니다.',
        cancelledAt: new Date()
      }
    });
  } catch (error) {
    console.error('체크인 취소 에러:', error);
    throw error;
  }
}

/**
 * 출퇴근 체크아웃
 * T137: 체크아웃 로직 구현
 */
async function checkOut(req, res) {
  const userId = req.user.id;
  const { businessId, location } = req.body;
  const today = new Date().toISOString().split('T')[0];

  const client = await query.getClient();

  try {
    await client.query('BEGIN');

    // 1. 활성 출근 기록 조회
    const attendanceResult = await client.query(
      `SELECT * FROM attendance
       WHERE user_id = $1 AND business_id = $2 AND date = $3
       AND status = 'checked_in'
       ORDER BY check_in_time DESC
       LIMIT 1`,
      [userId, businessId, today]
    );

    if (attendanceResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        error: '출근 기록이 없거나 이미 퇴근했습니다.',
        code: 'NO_ACTIVE_CHECK_IN'
      });
    }

    const attendance = attendanceResult.rows[0];

    // 2. 위치 검증 (선택사항)
    if (location) {
      const validationResult = await validateCheckOutLocation(client, businessId, location);
      if (!validationResult.valid) {
        // 경고만 하고 진행 (엄격하지 않음)
        console.warn('체크아웃 위치 범위 벗어남:', validationResult.message);
      }
    }

    // 3. 휴게 시간 종료 (진행중인 휴게가 있다면)
    await client.query(
      `UPDATE attendance_breaks
       SET end_time = $1
       WHERE attendance_id = $2 AND end_time IS NULL`,
      [new Date(), attendance.id]
    );

    // 4. 체크아웃 처리
    const checkOutTime = new Date();
    await client.query(
      `UPDATE attendance
       SET check_out_time = $1,
           check_out_location = $2,
           check_out_method = $3,
           status = 'checked_out',
           updated_at = $1
       WHERE id = $4`,
      [
        checkOutTime,
        location ? { type: 'Point', coordinates: [location.longitude, location.latitude] } : null,
        location ? 'gps' : 'manual',
        attendance.id
      ]
    );

    // 5. 근무 시간 계산
    const workDuration = await calculateWorkDurationInternal(client, attendance.id);

    // 6. 체크아웃 로그 기록
    await client.query(
      `INSERT INTO attendance_logs (
        attendance_id, user_id, action, details, created_at
      ) VALUES ($1, $2, $3, $4, $5)`,
      [
        attendance.id,
        userId,
        'check_out',
        JSON.stringify({ businessId, location, workDuration }),
        checkOutTime
      ]
    );

    await client.query('COMMIT');

    // 7. 응답 전송
    res.status(200).json({
      success: true,
      data: {
        attendanceId: attendance.id,
        checkInTime: attendance.check_in_time,
        checkOutTime: checkOutTime,
        workDuration: workDuration,
        status: 'checked_out',
        message: '퇴근 체크아웃이 완료되었습니다.'
      }
    });

    // 8. 실시간 알림 발송 (비동기)
    // TODO: T135 WebSocket으로 관리자에게 알림

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('체크아웃 처리 에러:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * 체크아웃 위치 검증 (선택적)
 */
async function validateCheckOutLocation(client, businessId, location) {
  const businessResult = await client.query(
    `SELECT
      name,
      ST_X(gps_location::geometry) as longitude,
      ST_Y(gps_location::geometry) as latitude,
      gps_radius
     FROM businesses
     WHERE id = $1`,
    [businessId]
  );

  if (businessResult.rows.length === 0) {
    return { valid: false, message: '사업장을 찾을 수 없습니다.' };
  }

  const business = businessResult.rows[0];

  const distanceResult = await client.query(
    `SELECT ST_Distance(
      ST_GeogFromText($1),
      ST_GeogFromText($2)
    ) as distance`,
    [
      `POINT(${location.longitude} ${location.latitude})`,
      `POINT(${business.longitude} ${business.latitude})`
    ]
  );

  const distance = distanceResult.rows[0].distance;

  // 체크아웃은 좀 더 관대한 범위 허용 (2배)
  const allowedRadius = business.gps_radius * 2;

  if (distance > allowedRadius) {
    return {
      valid: false,
      message: `체크아웃 위치가 허용 범위(${allowedRadius}m)를 벗어났습니다. 현재 거리: ${Math.round(distance)}m`
    };
  }

  return { valid: true };
}

/**
 * 근무 시간 계산 (내부 함수)
 */
async function calculateWorkDurationInternal(client, attendanceId) {
  // 출퇴근 시간 조회
  const attendanceResult = await client.query(
    `SELECT check_in_time, check_out_time
     FROM attendance WHERE id = $1`,
    [attendanceId]
  );

  if (attendanceResult.rows.length === 0) {
    return null;
  }

  const { check_in_time, check_out_time } = attendanceResult.rows[0];

  if (!check_out_time) {
    return null;
  }

  // 총 근무 시간 (분)
  const totalMinutes = Math.floor((new Date(check_out_time) - new Date(check_in_time)) / 1000 / 60);

  // 휴게 시간 조회
  const breakResult = await client.query(
    `SELECT SUM(
      EXTRACT(EPOCH FROM (
        COALESCE(end_time, NOW()) - start_time
      )) / 60
    ) as total_break_minutes
     FROM attendance_breaks
     WHERE attendance_id = $1`,
    [attendanceId]
  );

  const totalBreakMinutes = Math.round(breakResult.rows[0]?.total_break_minutes || 0);

  // 실제 근무 시간
  const actualWorkMinutes = totalMinutes - totalBreakMinutes;

  return {
    totalMinutes,
    breakMinutes: totalBreakMinutes,
    actualWorkMinutes,
    hours: Math.floor(actualWorkMinutes / 60),
    minutes: actualWorkMinutes % 60
  };
}

/**
 * 오늘의 근무 요약 조회
 */
async function getTodaySummary(req, res) {
  const userId = req.user.id;
  const businessId = req.query.businessId;
  const today = new Date().toISOString().split('T')[0];

  try {
    // 오늘의 출근 기록 조회
    const attendanceResult = await query(
      `SELECT * FROM attendance
       WHERE user_id = $1 AND business_id = $2 AND date = $3
       ORDER BY check_in_time DESC
       LIMIT 1`,
      [userId, businessId, today]
    );

    if (attendanceResult.rows.length === 0) {
      return res.status(200).json({
        success: true,
        data: {
          hasCheckIn: false,
          message: '오늘 출근 기록이 없습니다.'
        }
      });
    }

    const attendance = attendanceResult.rows[0];

    // 휴게 시간 조회
    const breakResult = await query(
      `SELECT
        id,
        start_time,
        end_time,
        break_type,
        EXTRACT(EPOCH FROM (
          COALESCE(end_time, NOW()) - start_time
        )) / 60 as duration_minutes
       FROM attendance_breaks
       WHERE attendance_id = $1
       ORDER BY start_time`,
      [attendance.id]
    );

    // 근무 시간 계산 (체크아웃한 경우)
    let workDuration = null;
    if (attendance.check_out_time) {
      const client = await query.getClient();
      try {
        workDuration = await calculateWorkDurationInternal(client, attendance.id);
      } finally {
        client.release();
      }
    }

    res.status(200).json({
      success: true,
      data: {
        hasCheckIn: true,
        attendanceId: attendance.id,
        checkInTime: attendance.check_in_time,
        checkOutTime: attendance.check_out_time,
        status: attendance.status,
        breaks: breakResult.rows,
        workDuration: workDuration
      }
    });
  } catch (error) {
    console.error('근무 요약 조회 에러:', error);
    throw error;
  }
}

/**
 * 휴게 시작
 */
async function startBreak(req, res) {
  const userId = req.user.id;
  const { businessId, attendanceId, breakType = 'normal' } = req.body;

  try {
    // 출근 기록 확인
    const attendanceResult = await query(
      `SELECT * FROM attendance
       WHERE id = $1 AND user_id = $2 AND business_id = $3
       AND status = 'checked_in'`,
      [attendanceId, userId, businessId]
    );

    if (attendanceResult.rows.length === 0) {
      return res.status(400).json({
        success: false,
        error: '활성 출근 기록이 없습니다.',
        code: 'NO_ACTIVE_ATTENDANCE'
      });
    }

    // 이미 진행중인 휴게가 있는지 확인
    const activeBreakResult = await query(
      `SELECT * FROM attendance_breaks
       WHERE attendance_id = $1 AND end_time IS NULL`,
      [attendanceId]
    );

    if (activeBreakResult.rows.length > 0) {
      return res.status(400).json({
        success: false,
        error: '이미 휴게 중입니다.',
        code: 'ALREADY_ON_BREAK'
      });
    }

    // 휴게 시작
    const breakResult = await query(
      `INSERT INTO attendance_breaks (
        attendance_id, user_id, start_time, break_type
      ) VALUES ($1, $2, $3, $4)
      RETURNING *`,
      [attendanceId, userId, new Date(), breakType]
    );

    const breakRecord = breakResult.rows[0];

    // 출근 상태를 휴게중으로 변경
    await query(
      `UPDATE attendance SET status = 'on_break' WHERE id = $1`,
      [attendanceId]
    );

    res.status(201).json({
      success: true,
      data: {
        breakId: breakRecord.id,
        startTime: breakRecord.start_time,
        breakType: breakRecord.break_type,
        message: '휴게를 시작했습니다.'
      }
    });
  } catch (error) {
    console.error('휴게 시작 에러:', error);
    throw error;
  }
}

/**
 * 휴게 종료
 */
async function endBreak(req, res) {
  const userId = req.user.id;
  const { businessId, attendanceId, breakId } = req.body;

  try {
    // 휴게 기록 확인
    const breakResult = await query(
      `SELECT * FROM attendance_breaks
       WHERE id = $1 AND attendance_id = $2 AND user_id = $3
       AND end_time IS NULL`,
      [breakId, attendanceId, userId]
    );

    if (breakResult.rows.length === 0) {
      return res.status(400).json({
        success: false,
        error: '활성 휴게 기록이 없습니다.',
        code: 'NO_ACTIVE_BREAK'
      });
    }

    const breakRecord = breakResult.rows[0];
    const endTime = new Date();
    const durationMinutes = Math.floor((endTime - new Date(breakRecord.start_time)) / 1000 / 60);

    // 휴게 종료
    await query(
      `UPDATE attendance_breaks
       SET end_time = $1
       WHERE id = $2`,
      [endTime, breakId]
    );

    // 출근 상태를 다시 checked_in으로 변경
    await query(
      `UPDATE attendance SET status = 'checked_in' WHERE id = $1`,
      [attendanceId]
    );

    res.status(200).json({
      success: true,
      data: {
        breakId: breakId,
        startTime: breakRecord.start_time,
        endTime: endTime,
        durationMinutes: durationMinutes,
        message: '휴게를 종료했습니다.'
      }
    });
  } catch (error) {
    console.error('휴게 종료 에러:', error);
    throw error;
  }
}

/**
 * 근무 시간 계산 API
 */
async function calculateWorkDuration(req, res) {
  const userId = req.user.id;
  const attendanceId = req.params.attendanceId;

  try {
    // 권한 확인
    const attendanceResult = await query(
      `SELECT * FROM attendance WHERE id = $1 AND user_id = $2`,
      [attendanceId, userId]
    );

    if (attendanceResult.rows.length === 0) {
      throw new NotFoundError('출근 기록을 찾을 수 없습니다.');
    }

    const client = await query.getClient();
    try {
      const workDuration = await calculateWorkDurationInternal(client, attendanceId);

      res.status(200).json({
        success: true,
        data: workDuration || {
          message: '아직 체크아웃하지 않았습니다.'
        }
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('근무 시간 계산 에러:', error);
    throw error;
  }
}

module.exports = {
  getStatus,
  getUserStatus,
  getBusinessStatus,
  checkIn,
  checkOut,
  validateCheckIn,
  cancelCheckIn,
  getTodaySummary,
  startBreak,
  endBreak,
  calculateWorkDuration
};