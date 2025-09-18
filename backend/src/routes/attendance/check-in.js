/**
 * T111-T115: 체크인 API 엔드포인트
 * POST /api/v1/attendance/check-in
 *
 * GPS 또는 QR 코드를 통한 출근 체크인
 */

const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { verifyToken } = require('../../lib/auth-lib/token');
const { verifyQRToken } = require('../../lib/attendance-lib/qr');
const { calculateDistance } = require('../../lib/attendance-lib/gps');

/**
 * 체크인 유효성 검사 미들웨어
 */
const validateCheckIn = [
  body('businessId').isInt().withMessage('유효한 사업장 ID를 입력해주세요'),
  body('method').isIn(['gps', 'qr']).withMessage('체크인 방식은 gps 또는 qr이어야 합니다'),

  // GPS 체크인 시 위치 정보 필수
  body('latitude').if(body('method').equals('gps'))
    .isFloat({ min: -90, max: 90 }).withMessage('유효한 위도를 입력해주세요'),
  body('longitude').if(body('method').equals('gps'))
    .isFloat({ min: -180, max: 180 }).withMessage('유효한 경도를 입력해주세요'),

  // QR 체크인 시 토큰 필수
  body('qrToken').if(body('method').equals('qr'))
    .notEmpty().withMessage('QR 토큰을 입력해주세요')
];

/**
 * POST /api/v1/attendance/check-in
 * 체크인 엔드포인트
 */
router.post('/check-in', validateCheckIn, async (req, res, next) => {
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

      const { businessId, method, latitude, longitude, qrToken, notes } = req.body;
      const pgPool = req.app.get('pgPool');

      // 4. 사용자가 해당 사업장의 구성원인지 확인
      const roleQuery = `
        SELECT ur.role_type, b.status as business_status,
               ST_X(b.location::geometry) as business_longitude,
               ST_Y(b.location::geometry) as business_latitude
        FROM user_roles ur
        JOIN businesses b ON ur.business_id = b.id
        WHERE ur.user_id = $1
          AND ur.business_id = $2
          AND ur.is_active = true
      `;

      const roleResult = await pgPool.query(roleQuery, [userId, businessId]);

      if (roleResult.rows.length === 0) {
        return res.status(403).json({
          success: false,
          error: '해당 사업장에 대한 권한이 없습니다'
        });
      }

      const userRole = roleResult.rows[0];

      // 사업장 활성 상태 확인
      if (userRole.business_status !== 'active') {
        return res.status(403).json({
          success: false,
          error: '비활성화된 사업장입니다'
        });
      }

      // 5. 이미 체크인한 상태인지 확인
      const checkExistingQuery = `
        SELECT id FROM attendance
        WHERE user_id = $1
          AND business_id = $2
          AND status = 'working'
          AND check_out_time IS NULL
      `;

      const existing = await pgPool.query(checkExistingQuery, [userId, businessId]);

      if (existing.rows.length > 0) {
        return res.status(409).json({
          success: false,
          error: '이미 체크인한 상태입니다'
        });
      }

      // 6. 체크인 방식별 검증
      let checkInLocation = null;

      if (method === 'gps') {
        // GPS 체크인: 위치 검증
        const businessLat = userRole.business_latitude;
        const businessLng = userRole.business_longitude;

        // 사업장 위치와의 거리 계산 (미터 단위)
        const distance = calculateDistance(
          latitude, longitude,
          businessLat, businessLng
        );

        // 100미터 이내에서만 체크인 허용
        const MAX_DISTANCE = 100;

        if (distance > MAX_DISTANCE) {
          return res.status(403).json({
            success: false,
            error: `사업장과의 거리가 너무 멉니다 (${Math.round(distance)}m)`,
            maxDistance: MAX_DISTANCE
          });
        }

        // GPS 위치 저장용 PostGIS 포맷
        checkInLocation = `POINT(${longitude} ${latitude})`;

      } else if (method === 'qr') {
        // QR 체크인: 토큰 검증
        const qrValidation = await verifyQRToken(qrToken);

        if (!qrValidation.valid) {
          return res.status(400).json({
            success: false,
            error: qrValidation.error || 'QR 코드가 유효하지 않습니다'
          });
        }

        // QR 토큰의 businessId와 요청의 businessId가 일치하는지 확인
        if (qrValidation.data.businessId !== businessId) {
          return res.status(400).json({
            success: false,
            error: '잘못된 QR 코드입니다'
          });
        }
      }

      // 7. 체크인 기록 생성
      const insertQuery = `
        INSERT INTO attendance (
          user_id, business_id, check_in_time,
          ${checkInLocation ? 'check_in_location,' : ''}
          method, status, notes, created_at
        ) VALUES (
          $1, $2, NOW(),
          ${checkInLocation ? `ST_GeogFromText('SRID=4326;${checkInLocation}'),` : ''}
          $3, 'working', $4, NOW()
        )
        RETURNING id, check_in_time
      `;

      const params = checkInLocation
        ? [userId, businessId, method, notes || null]
        : [userId, businessId, method, notes || null];

      const result = await pgPool.query(insertQuery, params);
      const attendance = result.rows[0];

      // 8. 체크인 로그 저장 (선택적)
      try {
        await pgPool.query(`
          INSERT INTO attendance_logs (
            user_id, business_id, action_type,
            action_data, created_at
          ) VALUES ($1, $2, 'check_in', $3, NOW())
        `, [
          userId,
          businessId,
          JSON.stringify({
            attendanceId: attendance.id,
            method: method,
            location: checkInLocation ? { latitude, longitude } : null
          })
        ]);
      } catch (logError) {
        // 로그 실패는 무시
        console.log('체크인 로그 저장 건너뜀');
      }

      // 9. 성공 응답
      res.status(200).json({
        success: true,
        attendanceId: attendance.id,
        checkInTime: attendance.check_in_time,
        method: method,
        message: '체크인이 완료되었습니다'
      });

    } catch (tokenError) {
      // 토큰 검증 실패
      return res.status(401).json({
        success: false,
        error: '유효하지 않은 토큰입니다'
      });
    }

  } catch (error) {
    console.error('체크인 에러:', error);

    // 데이터베이스 제약 조건 위반 처리
    if (error.code === '23505') {  // unique_violation
      return res.status(409).json({
        success: false,
        error: '이미 처리된 체크인입니다'
      });
    }

    // 일반 서버 에러
    res.status(500).json({
      success: false,
      error: '체크인 처리 중 오류가 발생했습니다'
    });
  }
});

module.exports = router;