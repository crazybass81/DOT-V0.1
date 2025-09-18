/**
 * T156-T159: 스케줄 생성 API 엔드포인트
 * POST /api/v1/schedules
 *
 * 근무 스케줄 생성 (관리자 전용)
 */

const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { verifyToken } = require('../../lib/auth-lib/token');
const scheduleLib = require('../../lib/schedule-lib');

/**
 * 스케줄 생성 유효성 검사 미들웨어
 */
const validateCreateSchedule = [
  body('businessId').isInt().withMessage('유효한 사업장 ID를 입력해주세요'),
  body('userId').isInt().withMessage('유효한 사용자 ID를 입력해주세요'),
  body('date').isISO8601().withMessage('유효한 날짜 형식을 입력해주세요 (YYYY-MM-DD)'),
  body('startTime').matches(/^([01]\d|2[0-3]):([0-5]\d)$/).withMessage('유효한 시작 시간을 입력해주세요 (HH:mm)'),
  body('endTime').matches(/^([01]\d|2[0-3]):([0-5]\d)$/).withMessage('유효한 종료 시간을 입력해주세요 (HH:mm)'),
  body('type').optional().isIn(['shift', 'overtime', 'break', 'leave', 'meeting', 'training'])
    .withMessage('유효한 스케줄 타입을 선택해주세요')
];

/**
 * POST /api/v1/schedules
 * 스케줄 생성 엔드포인트
 */
router.post('/', validateCreateSchedule, async (req, res, next) => {
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
      const requesterId = decoded.userId;

      if (!requesterId) {
        return res.status(401).json({
          success: false,
          error: '유효하지 않은 토큰입니다'
        });
      }

      const { businessId, userId, date, startTime, endTime, type = 'shift', notes, recurring, recurringEnd, weekdays } = req.body;
      const pgPool = req.app.get('pgPool');

      // 4. 권한 확인 - Owner/Manager만 스케줄 생성 가능
      const roleQuery = `
        SELECT ur.role_type
        FROM user_roles ur
        WHERE ur.user_id = $1
          AND ur.business_id = $2
          AND ur.is_active = true
      `;

      const roleResult = await pgPool.query(roleQuery, [requesterId, businessId]);

      if (roleResult.rows.length === 0) {
        return res.status(403).json({
          success: false,
          error: '해당 사업장에 대한 권한이 없습니다'
        });
      }

      const userRole = roleResult.rows[0].role_type;

      if (!['owner', 'manager'].includes(userRole)) {
        return res.status(403).json({
          success: false,
          error: '스케줄 생성 권한이 없습니다'
        });
      }

      // 5. 대상 사용자가 해당 사업장 소속인지 확인
      const targetUserQuery = `
        SELECT ur.role_type, u.name
        FROM user_roles ur
        JOIN users u ON ur.user_id = u.id
        WHERE ur.user_id = $1
          AND ur.business_id = $2
          AND ur.is_active = true
      `;

      const targetUserResult = await pgPool.query(targetUserQuery, [userId, businessId]);

      if (targetUserResult.rows.length === 0) {
        return res.status(400).json({
          success: false,
          error: '대상 사용자가 해당 사업장에 소속되어 있지 않습니다'
        });
      }

      const targetUserName = targetUserResult.rows[0].name;

      // 6. 스케줄 라이브러리로 유효성 검증
      const scheduleData = {
        userId,
        businessId,
        date,
        startTime,
        endTime,
        type
      };

      const validation = await scheduleLib.validateSchedule(scheduleData);
      if (!validation.valid) {
        return res.status(400).json({
          success: false,
          error: validation.errors[0]
        });
      }

      // 7. 기존 스케줄과 충돌 체크
      const conflictQuery = `
        SELECT id, start_time, end_time
        FROM schedules
        WHERE user_id = $1
          AND schedule_date = $2
          AND status != 'cancelled'
          AND (
            (start_time <= $3::time AND end_time > $3::time) OR
            (start_time < $4::time AND end_time >= $4::time) OR
            (start_time >= $3::time AND end_time <= $4::time)
          )
      `;

      const conflictResult = await pgPool.query(conflictQuery, [
        userId,
        date,
        startTime,
        endTime
      ]);

      if (conflictResult.rows.length > 0) {
        const conflict = conflictResult.rows[0];
        return res.status(409).json({
          success: false,
          error: `시간이 겹치는 스케줄이 있습니다 (${conflict.start_time}-${conflict.end_time})`
        });
      }

      // 8. 스케줄 생성
      let scheduleIds = [];

      if (recurring) {
        // 반복 스케줄 생성
        const recurringSchedules = await scheduleLib.createRecurringSchedule(
          scheduleData,
          { recurring, recurringEnd, weekdays }
        );

        for (const schedule of recurringSchedules) {
          const insertQuery = `
            INSERT INTO schedules (
              business_id, user_id, schedule_date,
              start_time, end_time, schedule_type,
              status, notes, created_by, recurring,
              recurring_end, recurring_id, created_at
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW()
            ) RETURNING id
          `;

          const result = await pgPool.query(insertQuery, [
            businessId,
            userId,
            schedule.date,
            startTime,
            endTime,
            type,
            'scheduled',
            notes,
            requesterId,
            recurring,
            recurringEnd,
            schedule.recurringId
          ]);

          scheduleIds.push(result.rows[0].id);
        }
      } else {
        // 단일 스케줄 생성
        const insertQuery = `
          INSERT INTO schedules (
            business_id, user_id, schedule_date,
            start_time, end_time, schedule_type,
            status, notes, created_by, created_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, NOW()
          ) RETURNING id, schedule_date, start_time, end_time
        `;

        const result = await pgPool.query(insertQuery, [
          businessId,
          userId,
          date,
          startTime,
          endTime,
          type,
          'scheduled',
          notes,
          requesterId
        ]);

        scheduleIds.push(result.rows[0].id);
      }

      // 9. 성공 응답
      res.status(201).json({
        success: true,
        scheduleCount: scheduleIds.length,
        scheduleIds: scheduleIds,
        user: {
          id: userId,
          name: targetUserName
        },
        date: date,
        time: `${startTime}-${endTime}`,
        type: type,
        message: recurring
          ? `반복 스케줄 ${scheduleIds.length}개가 생성되었습니다`
          : '스케줄이 생성되었습니다'
      });

    } catch (tokenError) {
      // 토큰 검증 실패
      return res.status(401).json({
        success: false,
        error: '유효하지 않은 토큰입니다'
      });
    }

  } catch (error) {
    console.error('스케줄 생성 에러:', error);

    // 일반 서버 에러
    res.status(500).json({
      success: false,
      error: '스케줄 생성 중 오류가 발생했습니다'
    });
  }
});

/**
 * POST /api/v1/schedules/bulk
 * 여러 스케줄 일괄 생성
 */
router.post('/bulk', async (req, res, next) => {
  try {
    // Authorization 확인
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
      const decoded = await verifyToken(token);
      const requesterId = decoded.userId;

      if (!requesterId) {
        return res.status(401).json({
          success: false,
          error: '유효하지 않은 토큰입니다'
        });
      }

      const { businessId, schedules } = req.body;

      if (!Array.isArray(schedules) || schedules.length === 0) {
        return res.status(400).json({
          success: false,
          error: '스케줄 목록이 필요합니다'
        });
      }

      const pgPool = req.app.get('pgPool');

      // 권한 확인
      const roleQuery = `
        SELECT ur.role_type
        FROM user_roles ur
        WHERE ur.user_id = $1
          AND ur.business_id = $2
          AND ur.is_active = true
      `;

      const roleResult = await pgPool.query(roleQuery, [requesterId, businessId]);

      if (roleResult.rows.length === 0 || !['owner', 'manager'].includes(roleResult.rows[0].role_type)) {
        return res.status(403).json({
          success: false,
          error: '스케줄 생성 권한이 없습니다'
        });
      }

      // 일괄 생성
      const results = await scheduleLib.createBulkSchedules(schedules);

      res.status(201).json({
        success: true,
        created: results.success.length,
        failed: results.failed.length,
        details: results
      });

    } catch (tokenError) {
      return res.status(401).json({
        success: false,
        error: '유효하지 않은 토큰입니다'
      });
    }

  } catch (error) {
    console.error('일괄 생성 에러:', error);
    res.status(500).json({
      success: false,
      error: '스케줄 일괄 생성 중 오류가 발생했습니다'
    });
  }
});

module.exports = router;