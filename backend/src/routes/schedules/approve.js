/**
 * T164-T165: 스케줄 승인/거절 API 엔드포인트
 * PUT /api/v1/schedules/approve/:id
 *
 * 관리자의 스케줄 변경 요청 승인/거절
 */

const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { verifyToken } = require('../../lib/auth-lib/token');
const moment = require('moment');

/**
 * 승인/거절 유효성 검사
 */
const validateApproval = [
  body('action').isIn(['approve', 'reject']).withMessage('승인 또는 거절을 선택해주세요'),
  body('reason').optional().notEmpty().withMessage('거절 사유를 입력해주세요')
];

/**
 * PUT /api/v1/schedules/approve/:id
 * 스케줄 요청 승인/거절
 */
router.put('/:id', validateApproval, async (req, res) => {
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
      const approverId = decoded.userId;

      if (!approverId) {
        return res.status(401).json({
          success: false,
          error: '유효하지 않은 토큰입니다'
        });
      }

      const assignmentId = req.params.id;
      const { action, reason } = req.body;
      const pgPool = req.app.get('pgPool');

      // 3. 요청 정보 조회
      const assignmentQuery = `
        SELECT
          sa.*,
          s.schedule_date,
          s.start_time,
          s.end_time,
          req.name as requester_name,
          asg.name as assignee_name
        FROM schedule_assignments sa
        LEFT JOIN schedules s ON sa.schedule_id = s.id
        JOIN users req ON sa.requester_id = req.id
        JOIN users asg ON sa.assignee_id = asg.id
        WHERE sa.id = $1
      `;
      const assignmentResult = await pgPool.query(assignmentQuery, [assignmentId]);

      if (assignmentResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: '요청을 찾을 수 없습니다'
        });
      }

      const assignment = assignmentResult.rows[0];

      // 이미 처리된 요청인지 확인
      if (assignment.status !== 'pending') {
        return res.status(400).json({
          success: false,
          error: '이미 처리된 요청입니다'
        });
      }

      // 4. 승인자 권한 확인
      const roleQuery = `
        SELECT role_type
        FROM user_roles
        WHERE user_id = $1
          AND business_id = $2
          AND is_active = true
      `;
      const roleResult = await pgPool.query(roleQuery, [approverId, assignment.business_id]);

      if (roleResult.rows.length === 0) {
        return res.status(403).json({
          success: false,
          error: '해당 사업장에 대한 권한이 없습니다'
        });
      }

      const approverRole = roleResult.rows[0].role_type;

      if (!['owner', 'manager'].includes(approverRole)) {
        return res.status(403).json({
          success: false,
          error: '승인 권한이 없습니다. 관리자만 승인할 수 있습니다.'
        });
      }

      // 5. 트랜잭션 시작
      const client = await pgPool.connect();

      try {
        await client.query('BEGIN');

        const newStatus = action === 'approve' ? 'approved' : 'rejected';
        const notes = assignment.notes ? JSON.parse(assignment.notes) : {};

        // 6. 요청 상태 업데이트
        const updateQuery = `
          UPDATE schedule_assignments
          SET
            status = $1,
            processed_by = $2,
            processed_at = NOW(),
            rejection_reason = $3,
            updated_at = NOW()
          WHERE id = $4
        `;
        await client.query(updateQuery, [
          newStatus,
          approverId,
          action === 'reject' ? reason : null,
          assignmentId
        ]);

        // 7. 승인인 경우 스케줄 처리
        if (action === 'approve') {
          // 요청 타입별 처리
          if (assignment.assignment_type === 'swap') {
            // 교대 요청 처리
            // 두 스케줄의 user_id를 교환
            const swapQuery1 = `
              UPDATE schedules
              SET user_id = $1, updated_at = NOW()
              WHERE id = $2
            `;
            const swapQuery2 = `
              UPDATE schedules
              SET user_id = $1, updated_at = NOW()
              WHERE id = $2
            `;

            await client.query(swapQuery1, [assignment.assignee_id, assignment.schedule_id]);
            await client.query(swapQuery2, [assignment.requester_id, assignment.swap_schedule_id]);

          } else if (notes.requestType === 'change') {
            // 시간 변경 요청 처리
            const changeQuery = `
              UPDATE schedules
              SET
                start_time = $1,
                end_time = $2,
                updated_at = NOW()
              WHERE id = $3
            `;
            await client.query(changeQuery, [
              notes.newStartTime,
              notes.newEndTime,
              assignment.schedule_id
            ]);

          } else if (notes.requestType === 'cancel') {
            // 취소 요청 처리
            const cancelQuery = `
              UPDATE schedules
              SET
                status = 'cancelled',
                updated_at = NOW()
              WHERE id = $1
            `;
            await client.query(cancelQuery, [assignment.schedule_id]);

          } else if (notes.requestType === 'leave') {
            // 휴가 요청 처리
            const leaveQuery = `
              UPDATE schedules
              SET
                status = 'confirmed',
                approved_by = $1,
                approved_at = NOW(),
                updated_at = NOW()
              WHERE id = $2
            `;
            await client.query(leaveQuery, [approverId, assignment.schedule_id]);

          } else if (notes.requestType === 'overtime') {
            // 초과근무 요청 처리
            if (!assignment.schedule_id) {
              // 새 초과근무 스케줄 생성
              const overtimeQuery = `
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
                  approved_by,
                  approved_at,
                  created_at
                ) VALUES (
                  $1, $2, $3, $4, $5, 'overtime', 'confirmed', $6, $7, $8, NOW(), NOW()
                )
              `;
              await client.query(overtimeQuery, [
                assignment.business_id,
                assignment.requester_id,
                notes.targetDate,
                notes.newStartTime || '18:00',
                notes.newEndTime || '22:00',
                `초과근무: ${notes.reason}`,
                assignment.requester_id,
                approverId
              ]);
            }
          }
        } else {
          // 거절인 경우
          if (notes.requestType === 'leave' && assignment.schedule_id) {
            // 휴가 요청 거절시 생성된 스케줄 취소
            const cancelLeaveQuery = `
              UPDATE schedules
              SET
                status = 'cancelled',
                updated_at = NOW()
              WHERE id = $1
            `;
            await client.query(cancelLeaveQuery, [assignment.schedule_id]);
          }
        }

        await client.query('COMMIT');

        // 8. 성공 응답
        res.json({
          success: true,
          assignmentId,
          action,
          status: newStatus,
          message: action === 'approve'
            ? '스케줄 변경 요청이 승인되었습니다.'
            : '스케줄 변경 요청이 거절되었습니다.',
          processedBy: {
            id: approverId,
            role: approverRole
          },
          processedAt: new Date(),
          requester: assignment.requester_name,
          assignee: assignment.assignee_name
        });

      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }

    } catch (tokenError) {
      return res.status(401).json({
        success: false,
        error: '유효하지 않은 토큰입니다'
      });
    }

  } catch (error) {
    console.error('스케줄 승인 처리 에러:', error);
    res.status(500).json({
      success: false,
      error: '스케줄 승인 처리 중 오류가 발생했습니다'
    });
  }
});

/**
 * POST /api/v1/schedules/approve/bulk
 * 여러 요청 일괄 처리
 */
router.post('/bulk', async (req, res) => {
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
      const approverId = decoded.userId;

      if (!approverId) {
        return res.status(401).json({
          success: false,
          error: '유효하지 않은 토큰입니다'
        });
      }

      const { businessId, assignmentIds, action, reason } = req.body;

      if (!Array.isArray(assignmentIds) || assignmentIds.length === 0) {
        return res.status(400).json({
          success: false,
          error: '처리할 요청 ID 목록이 필요합니다'
        });
      }

      const pgPool = req.app.get('pgPool');

      // 권한 확인
      const roleQuery = `
        SELECT role_type
        FROM user_roles
        WHERE user_id = $1
          AND business_id = $2
          AND is_active = true
      `;
      const roleResult = await pgPool.query(roleQuery, [approverId, businessId]);

      if (roleResult.rows.length === 0 || !['owner', 'manager'].includes(roleResult.rows[0].role_type)) {
        return res.status(403).json({
          success: false,
          error: '승인 권한이 없습니다'
        });
      }

      // 일괄 처리
      const results = {
        success: [],
        failed: []
      };

      for (const assignmentId of assignmentIds) {
        try {
          const updateQuery = `
            UPDATE schedule_assignments
            SET
              status = $1,
              processed_by = $2,
              processed_at = NOW(),
              rejection_reason = $3,
              updated_at = NOW()
            WHERE id = $4 AND status = 'pending'
            RETURNING id
          `;

          const result = await pgPool.query(updateQuery, [
            action === 'approve' ? 'approved' : 'rejected',
            approverId,
            action === 'reject' ? reason : null,
            assignmentId
          ]);

          if (result.rows.length > 0) {
            results.success.push(assignmentId);
          } else {
            results.failed.push({
              id: assignmentId,
              reason: '이미 처리되었거나 존재하지 않는 요청입니다'
            });
          }
        } catch (error) {
          results.failed.push({
            id: assignmentId,
            reason: error.message
          });
        }
      }

      res.json({
        success: true,
        action,
        processed: results.success.length,
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
    console.error('일괄 승인 처리 에러:', error);
    res.status(500).json({
      success: false,
      error: '일괄 승인 처리 중 오류가 발생했습니다'
    });
  }
});

module.exports = router;