/**
 * T161-T163: 스케줄 요청 API 엔드포인트
 * POST /api/v1/schedules/request
 *
 * 직원의 스케줄 변경 요청 (교대, 휴가, 변경 등)
 */

const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { verifyToken } = require('../../lib/auth-lib/token');
const scheduleLib = require('../../lib/schedule-lib');
const moment = require('moment');

/**
 * 스케줄 요청 유효성 검사
 */
const validateRequest = [
  body('businessId').isInt().withMessage('유효한 사업장 ID를 입력해주세요'),
  body('scheduleId').optional().isInt().withMessage('유효한 스케줄 ID를 입력해주세요'),
  body('requestType').isIn(['swap', 'leave', 'change', 'cancel', 'overtime'])
    .withMessage('유효한 요청 타입을 선택해주세요'),
  body('targetDate').isISO8601().withMessage('유효한 날짜를 입력해주세요'),
  body('reason').notEmpty().withMessage('요청 사유를 입력해주세요'),
  // 교대 요청인 경우
  body('swapWithUserId').optional().isInt().withMessage('교대할 직원 ID를 입력해주세요'),
  body('swapScheduleId').optional().isInt().withMessage('교대할 스케줄 ID를 입력해주세요'),
  // 변경 요청인 경우
  body('newStartTime').optional().matches(/^([01]\d|2[0-3]):([0-5]\d)$/)
    .withMessage('유효한 시작 시간을 입력해주세요'),
  body('newEndTime').optional().matches(/^([01]\d|2[0-3]):([0-5]\d)$/)
    .withMessage('유효한 종료 시간을 입력해주세요')
];

/**
 * POST /api/v1/schedules/request
 * 스케줄 변경 요청 생성
 */
router.post('/', validateRequest, async (req, res) => {
  try {
    // 1. 입력 유효성 검사
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    // 2. 토큰 검증
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

      const {
        businessId,
        scheduleId,
        requestType,
        targetDate,
        reason,
        swapWithUserId,
        swapScheduleId,
        newStartTime,
        newEndTime
      } = req.body;

      const pgPool = req.app.get('pgPool');

      // 3. 요청자가 해당 사업장 소속인지 확인
      const roleQuery = `
        SELECT role_type
        FROM user_roles
        WHERE user_id = $1
          AND business_id = $2
          AND is_active = true
      `;
      const roleResult = await pgPool.query(roleQuery, [requesterId, businessId]);

      if (roleResult.rows.length === 0) {
        return res.status(403).json({
          success: false,
          error: '해당 사업장에 대한 권한이 없습니다'
        });
      }

      // 4. 요청 타입별 검증
      if (requestType === 'swap') {
        // 교대 요청 검증
        if (!swapWithUserId || !swapScheduleId) {
          return res.status(400).json({
            success: false,
            error: '교대 요청에는 대상 직원과 스케줄 정보가 필요합니다'
          });
        }

        // 교대 대상자가 같은 사업장 소속인지 확인
        const swapUserQuery = `
          SELECT role_type
          FROM user_roles
          WHERE user_id = $1
            AND business_id = $2
            AND is_active = true
        `;
        const swapUserResult = await pgPool.query(swapUserQuery, [swapWithUserId, businessId]);

        if (swapUserResult.rows.length === 0) {
          return res.status(400).json({
            success: false,
            error: '교대 대상자가 같은 사업장 소속이 아닙니다'
          });
        }

        // 교대 스케줄 유효성 확인
        const swapScheduleQuery = `
          SELECT id, user_id, schedule_date
          FROM schedules
          WHERE id = $1
            AND business_id = $2
            AND user_id = $3
            AND status = 'scheduled'
        `;
        const swapScheduleResult = await pgPool.query(swapScheduleQuery, [
          swapScheduleId,
          businessId,
          swapWithUserId
        ]);

        if (swapScheduleResult.rows.length === 0) {
          return res.status(400).json({
            success: false,
            error: '유효하지 않은 교대 스케줄입니다'
          });
        }
      }

      if (requestType === 'change') {
        // 변경 요청 검증
        if (!newStartTime || !newEndTime) {
          return res.status(400).json({
            success: false,
            error: '변경 요청에는 새로운 시간 정보가 필요합니다'
          });
        }

        // 시간 유효성 검증
        const validation = await scheduleLib.validateSchedule({
          date: targetDate,
          startTime: newStartTime,
          endTime: newEndTime
        });

        if (!validation.valid) {
          return res.status(400).json({
            success: false,
            error: validation.errors[0]
          });
        }
      }

      // 5. 요청 생성
      const insertQuery = `
        INSERT INTO schedule_assignments (
          business_id,
          schedule_id,
          requester_id,
          assignee_id,
          assignment_type,
          status,
          swap_with_user_id,
          swap_schedule_id,
          notes,
          created_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, NOW()
        ) RETURNING id, created_at
      `;

      // assignee_id 결정 (요청 타입에 따라)
      let assigneeId = requesterId; // 기본값: 요청자 본인
      let assignmentType = 'requested';

      if (requestType === 'swap') {
        assignmentType = 'swap';
        assigneeId = swapWithUserId;
      }

      const result = await pgPool.query(insertQuery, [
        businessId,
        scheduleId || null,
        requesterId,
        assigneeId,
        assignmentType,
        'pending',
        swapWithUserId || null,
        swapScheduleId || null,
        JSON.stringify({
          requestType,
          targetDate,
          reason,
          newStartTime,
          newEndTime
        })
      ]);

      const assignmentId = result.rows[0].id;

      // 6. 요청 타입별 추가 처리
      if (requestType === 'leave') {
        // 휴가 요청인 경우 스케줄 자동 생성 (pending 상태)
        const leaveScheduleQuery = `
          INSERT INTO schedules (
            business_id,
            user_id,
            schedule_date,
            start_time,
            end_time,
            schedule_type,
            status,
            notes,
            created_by,
            created_at
          ) VALUES (
            $1, $2, $3, '09:00', '18:00', 'leave', 'scheduled', $4, $5, NOW()
          ) RETURNING id
        `;

        const leaveResult = await pgPool.query(leaveScheduleQuery, [
          businessId,
          requesterId,
          targetDate,
          `휴가 요청: ${reason}`,
          requesterId
        ]);

        // assignment 업데이트
        await pgPool.query(
          'UPDATE schedule_assignments SET schedule_id = $1 WHERE id = $2',
          [leaveResult.rows[0].id, assignmentId]
        );
      }

      // 7. 응답
      res.status(201).json({
        success: true,
        assignmentId,
        requestType,
        status: 'pending',
        message: '스케줄 변경 요청이 생성되었습니다. 관리자 승인을 기다려주세요.',
        targetDate,
        createdAt: result.rows[0].created_at
      });

    } catch (tokenError) {
      return res.status(401).json({
        success: false,
        error: '유효하지 않은 토큰입니다'
      });
    }

  } catch (error) {
    console.error('스케줄 요청 생성 에러:', error);
    res.status(500).json({
      success: false,
      error: '스케줄 요청 생성 중 오류가 발생했습니다'
    });
  }
});

/**
 * GET /api/v1/schedules/request
 * 스케줄 요청 목록 조회
 */
router.get('/', async (req, res) => {
  try {
    // 토큰 검증
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
      const userId = decoded.userId;

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: '유효하지 않은 토큰입니다'
        });
      }

      const { businessId, status = 'pending' } = req.query;
      const pgPool = req.app.get('pgPool');

      // 권한 확인
      const roleQuery = `
        SELECT role_type
        FROM user_roles
        WHERE user_id = $1
          AND business_id = $2
          AND is_active = true
      `;
      const roleResult = await pgPool.query(roleQuery, [userId, businessId || 1]);

      if (roleResult.rows.length === 0) {
        return res.status(403).json({
          success: false,
          error: '해당 사업장에 대한 권한이 없습니다'
        });
      }

      const userRole = roleResult.rows[0].role_type;
      const isManager = ['owner', 'manager'].includes(userRole);

      // 요청 목록 조회
      let query = `
        SELECT
          sa.id,
          sa.schedule_id,
          sa.requester_id,
          req.name as requester_name,
          sa.assignee_id,
          asg.name as assignee_name,
          sa.assignment_type,
          sa.status,
          sa.swap_with_user_id,
          swap.name as swap_with_name,
          sa.swap_schedule_id,
          sa.notes,
          sa.rejection_reason,
          sa.processed_by,
          proc.name as processed_by_name,
          sa.processed_at,
          sa.created_at,
          s.schedule_date,
          s.start_time,
          s.end_time,
          s.schedule_type
        FROM schedule_assignments sa
        JOIN users req ON sa.requester_id = req.id
        JOIN users asg ON sa.assignee_id = asg.id
        LEFT JOIN users swap ON sa.swap_with_user_id = swap.id
        LEFT JOIN users proc ON sa.processed_by = proc.id
        LEFT JOIN schedules s ON sa.schedule_id = s.id
        WHERE sa.business_id = $1
      `;

      const queryParams = [businessId || 1];
      let paramIndex = 2;

      // 관리자가 아니면 본인 요청만
      if (!isManager) {
        query += ` AND (sa.requester_id = $${paramIndex} OR sa.assignee_id = $${paramIndex})`;
        queryParams.push(userId);
        paramIndex++;
      }

      // 상태 필터
      if (status) {
        query += ` AND sa.status = $${paramIndex}`;
        queryParams.push(status);
        paramIndex++;
      }

      query += ` ORDER BY sa.created_at DESC`;

      const result = await pgPool.query(query, queryParams);

      // 응답 포맷팅
      const requests = result.rows.map(row => {
        const notes = row.notes ? JSON.parse(row.notes) : {};
        return {
          id: row.id,
          scheduleId: row.schedule_id,
          requester: {
            id: row.requester_id,
            name: row.requester_name
          },
          assignee: {
            id: row.assignee_id,
            name: row.assignee_name
          },
          type: row.assignment_type,
          requestType: notes.requestType,
          status: row.status,
          targetDate: notes.targetDate || (row.schedule_date ? moment(row.schedule_date).format('YYYY-MM-DD') : null),
          scheduleTime: row.start_time ? `${row.start_time}-${row.end_time}` : null,
          reason: notes.reason,
          swapWith: row.swap_with_user_id ? {
            id: row.swap_with_user_id,
            name: row.swap_with_name
          } : null,
          newTime: notes.newStartTime ? `${notes.newStartTime}-${notes.newEndTime}` : null,
          processedBy: row.processed_by ? {
            id: row.processed_by,
            name: row.processed_by_name
          } : null,
          processedAt: row.processed_at,
          rejectionReason: row.rejection_reason,
          createdAt: row.created_at
        };
      });

      res.json({
        success: true,
        count: requests.length,
        requests
      });

    } catch (tokenError) {
      return res.status(401).json({
        success: false,
        error: '유효하지 않은 토큰입니다'
      });
    }

  } catch (error) {
    console.error('스케줄 요청 조회 에러:', error);
    res.status(500).json({
      success: false,
      error: '스케줄 요청 조회 중 오류가 발생했습니다'
    });
  }
});

module.exports = router;