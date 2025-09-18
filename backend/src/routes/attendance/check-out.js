/**
 * T116-T120: 체크아웃 API 엔드포인트
 * POST /api/v1/attendance/check-out
 *
 * 퇴근 체크아웃 및 근무시간 자동 계산
 */

const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { verifyToken } = require('../../lib/auth-lib/token');
const { calculateDistance } = require('../../lib/attendance-lib/gps');

/**
 * 체크아웃 유효성 검사 미들웨어
 */
const validateCheckOut = [
  body('businessId').isInt().withMessage('유효한 사업장 ID를 입력해주세요'),
  body('latitude').optional()
    .isFloat({ min: -90, max: 90 }).withMessage('유효한 위도를 입력해주세요'),
  body('longitude').optional()
    .isFloat({ min: -180, max: 180 }).withMessage('유효한 경도를 입력해주세요')
];

/**
 * POST /api/v1/attendance/check-out
 * 체크아웃 엔드포인트
 */
router.post('/check-out', validateCheckOut, async (req, res, next) => {
  try {
    // 1. 입력 유효성 검사
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    // 2. Authorization 헤더에서 토큰 추출
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({
        success: false,
        error: '인증 토큰이 필요합니다'
      });
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return res.status(401).json({
        success: false,
        error: '올바른 토큰 형식이 아닙니다'
      });
    }

    const token = parts[1];

    try {
      // 3. 토큰 검증
      const decoded = await verifyToken(token);
      const userId = decoded.userId;

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: '유효하지 않은 토큰입니다'
        });
      }

      const { businessId, latitude, longitude, notes } = req.body;
      const pgPool = req.app.get('pgPool');

      // 4. 현재 체크인 상태 확인
      const checkInQuery = `
        SELECT
          a.id,
          a.check_in_time,
          a.break_duration,
          ST_X(b.location::geometry) as business_longitude,
          ST_Y(b.location::geometry) as business_latitude
        FROM attendance a
        JOIN businesses b ON a.business_id = b.id
        WHERE a.user_id = $1
          AND a.business_id = $2
          AND a.status = 'working'
          AND a.check_out_time IS NULL
      `;

      const checkInResult = await pgPool.query(checkInQuery, [userId, businessId]);

      if (checkInResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: '체크인 기록이 없습니다'
        });
      }

      const attendance = checkInResult.rows[0];

      // 5. GPS 위치 검증 (선택적)
      let checkOutLocation = null;

      if (latitude && longitude) {
        const businessLat = attendance.business_latitude;
        const businessLng = attendance.business_longitude;

        // 사업장 위치와의 거리 계산 (미터 단위)
        const distance = calculateDistance(
          latitude, longitude,
          businessLat, businessLng
        );

        // 체크아웃은 거리 제한이 더 관대함 (200미터)
        const MAX_DISTANCE = 200;

        if (distance > MAX_DISTANCE) {
          console.log(`체크아웃 위치가 사업장에서 ${Math.round(distance)}m 떨어짐`);
          // 경고만 하고 진행 (나중에 관리자가 확인 가능)
        }

        // GPS 위치 저장용 PostGIS 포맷
        checkOutLocation = `POINT(${longitude} ${latitude})`;
      }

      // 6. 근무 시간 계산
      const checkInTime = new Date(attendance.check_in_time);
      const checkOutTime = new Date();
      const workDurationSeconds = Math.floor((checkOutTime - checkInTime) / 1000);
      const breakDuration = attendance.break_duration || 0;
      const actualWorkDuration = workDurationSeconds - breakDuration;

      // 7. 초과 근무 계산 (8시간 = 28800초 기준)
      const standardWorkSeconds = 8 * 60 * 60;
      const overtimeDuration = Math.max(0, actualWorkDuration - standardWorkSeconds);

      // 8. 체크아웃 업데이트
      const updateQuery = `
        UPDATE attendance
        SET
          check_out_time = NOW(),
          ${checkOutLocation ? 'check_out_location = ST_GeogFromText(\'SRID=4326;' + checkOutLocation + '\'),' : ''}
          work_duration = $3,
          overtime_duration = $4,
          status = 'completed',
          notes = CASE
            WHEN notes IS NULL THEN $5
            ELSE notes || ' / ' || $5
          END,
          updated_at = NOW()
        WHERE id = $1 AND user_id = $2
        RETURNING id, check_out_time, work_duration, overtime_duration
      `;

      const params = [
        attendance.id,
        userId,
        actualWorkDuration,
        overtimeDuration,
        notes || null
      ];

      const result = await pgPool.query(updateQuery, params);
      const updatedAttendance = result.rows[0];

      // 9. 체크아웃 로그 저장 (선택적)
      try {
        await pgPool.query(`
          INSERT INTO attendance_logs (
            user_id, business_id, action_type,
            action_data, created_at
          ) VALUES ($1, $2, 'check_out', $3, NOW())
        `, [
          userId,
          businessId,
          JSON.stringify({
            attendanceId: attendance.id,
            workDuration: actualWorkDuration,
            overtimeDuration: overtimeDuration,
            location: checkOutLocation ? { latitude, longitude } : null
          })
        ]);
      } catch (logError) {
        // 로그 실패는 무시
        console.log('체크아웃 로그 저장 건너뜀');
      }

      // 10. 근무 시간 포맷팅
      const formatDuration = (seconds) => {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        return `${hours}시간 ${minutes}분`;
      };

      // 11. 성공 응답
      res.status(200).json({
        success: true,
        attendanceId: attendance.id,
        checkInTime: attendance.check_in_time,
        checkOutTime: updatedAttendance.check_out_time,
        workDuration: formatDuration(updatedAttendance.work_duration),
        overtimeDuration: overtimeDuration > 0 ? formatDuration(updatedAttendance.overtime_duration) : null,
        message: '체크아웃이 완료되었습니다'
      });

    } catch (tokenError) {
      // 토큰 검증 실패
      return res.status(401).json({
        success: false,
        error: '유효하지 않은 토큰입니다'
      });
    }

  } catch (error) {
    console.error('체크아웃 에러:', error);

    // 일반 서버 에러
    res.status(500).json({
      success: false,
      error: '체크아웃 처리 중 오류가 발생했습니다'
    });
  }
});

module.exports = router;