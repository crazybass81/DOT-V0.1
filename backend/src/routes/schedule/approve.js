/**
 * T273: 스케줄 승인 API 엔드포인트
 * POST /api/v1/schedules/:id/approve
 */

const express = require('express');
const router = express.Router();
const pool = require('../../db');
const { authenticate } = require('../../middleware/auth');
const { authorize } = require('../../middleware/authorize');
const { asyncHandler } = require('../../middleware/errorHandler');
const logger = require('../../utils/logger');
const scheduleLib = require('../../lib/schedule-lib');

/**
 * POST /api/v1/schedules/:id/approve
 * 스케줄 승인 (draft → published)
 */
router.post('/:id/approve',
  authenticate,
  authorize(['owner', 'manager']),
  asyncHandler(async (req, res) => {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const scheduleId = parseInt(req.params.id);
      const {
        notify_workers = false,
        publish_immediately = true,
        approval_note
      } = req.body;

      // 스케줄 조회
      const scheduleQuery = `
        SELECT s.*, b.name as business_name
        FROM schedules s
        JOIN businesses b ON s.business_id = b.id
        WHERE s.id = $1
      `;
      const scheduleResult = await client.query(scheduleQuery, [scheduleId]);

      if (scheduleResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({
          success: false,
          error: '스케줄을 찾을 수 없습니다.'
        });
      }

      const schedule = scheduleResult.rows[0];

      // 상태 확인
      if (schedule.status !== 'draft') {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          error: `스케줄이 이미 ${schedule.status} 상태입니다.`,
          current_status: schedule.status
        });
      }

      // 유효성 검증
      const validation = scheduleLib.validateSchedule(schedule);
      if (!validation.valid) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          error: '스케줄 유효성 검증 실패',
          errors: validation.errors
        });
      }

      // 할당 상태 확인
      const assignmentQuery = `
        SELECT COUNT(*) as assigned_count
        FROM schedule_assignments
        WHERE schedule_id = $1 AND status = 'assigned'
      `;
      const assignmentResult = await client.query(assignmentQuery, [scheduleId]);
      const assignedCount = parseInt(assignmentResult.rows[0].assigned_count);

      // 필요 인원 확인
      if (assignedCount < schedule.required_workers) {
        const shortage = schedule.required_workers - assignedCount;
        logger.warn(`스케줄 승인 경고: 인원 부족 - schedule=${scheduleId}, required=${schedule.required_workers}, assigned=${assignedCount}`);

        // 경고만 하고 승인은 계속 진행
        if (!req.body.force_approve) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            success: false,
            error: 'INSUFFICIENT_WORKERS',
            message: `필요 인원이 부족합니다. (필요: ${schedule.required_workers}명, 현재: ${assignedCount}명)`,
            required: schedule.required_workers,
            assigned: assignedCount,
            shortage
          });
        }
      }

      // 상태 업데이트
      const newStatus = publish_immediately ? 'published' : 'approved';
      const updateQuery = `
        UPDATE schedules
        SET
          status = $1,
          approved_by = $2,
          approved_at = NOW(),
          updated_at = NOW()
        WHERE id = $3
        RETURNING *
      `;

      const updateResult = await client.query(updateQuery, [
        newStatus,
        req.user.id,
        scheduleId
      ]);

      const updatedSchedule = updateResult.rows[0];

      // 승인 이력 저장
      await client.query(`
        INSERT INTO schedule_approval_history (
          schedule_id,
          action,
          from_status,
          to_status,
          performed_by,
          performed_at,
          note
        ) VALUES ($1, $2, $3, $4, $5, NOW(), $6)
      `, [
        scheduleId,
        'approve',
        'draft',
        newStatus,
        req.user.id,
        approval_note
      ]);

      // 알림 처리
      if (notify_workers && assignedCount > 0) {
        // 할당된 직원들에게 알림 전송
        const workersQuery = `
          SELECT DISTINCT u.id, u.name, u.email, u.phone
          FROM schedule_assignments sa
          JOIN users u ON sa.user_id = u.id
          WHERE sa.schedule_id = $1 AND sa.status = 'assigned'
        `;
        const workersResult = await client.query(workersQuery, [scheduleId]);

        // 알림 큐에 추가
        for (const worker of workersResult.rows) {
          await client.query(`
            INSERT INTO notification_queue (
              user_id,
              type,
              title,
              message,
              data,
              status
            ) VALUES ($1, $2, $3, $4, $5, 'pending')
          `, [
            worker.id,
            'schedule_approved',
            '스케줄 승인됨',
            `${schedule.business_name}의 스케줄이 승인되었습니다.`,
            JSON.stringify({
              schedule_id: scheduleId,
              start_time: schedule.start_time,
              end_time: schedule.end_time
            })
          ]);
        }
      }

      await client.query('COMMIT');

      logger.info(`스케줄 승인: schedule=${scheduleId}, approver=${req.user.id}, status=${newStatus}`);

      res.json({
        success: true,
        message: `스케줄이 ${newStatus === 'published' ? '발행' : '승인'}되었습니다.`,
        data: {
          schedule_id: updatedSchedule.id,
          status: updatedSchedule.status,
          approved_by: updatedSchedule.approved_by,
          approved_at: updatedSchedule.approved_at,
          assigned_workers: assignedCount,
          required_workers: schedule.required_workers,
          notifications_sent: notify_workers ? workersResult?.rows.length || 0 : 0
        }
      });

    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('스케줄 승인 오류:', error);
      res.status(500).json({
        success: false,
        error: '스케줄 승인 중 오류가 발생했습니다.'
      });
    } finally {
      client.release();
    }
  })
);

/**
 * POST /api/v1/schedules/bulk-approve
 * 여러 스케줄 일괄 승인
 */
router.post('/bulk-approve',
  authenticate,
  authorize(['owner', 'manager']),
  asyncHandler(async (req, res) => {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const {
        schedule_ids,
        notify_workers = false,
        skip_validation = false
      } = req.body;

      if (!schedule_ids || !Array.isArray(schedule_ids) || schedule_ids.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          error: '승인할 스케줄 ID 목록이 필요합니다.'
        });
      }

      // 스케줄들 조회
      const schedulesQuery = `
        SELECT s.*, b.name as business_name
        FROM schedules s
        JOIN businesses b ON s.business_id = b.id
        WHERE s.id = ANY($1) AND s.status = 'draft'
      `;
      const schedulesResult = await client.query(schedulesQuery, [schedule_ids]);

      if (schedulesResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({
          success: false,
          error: '승인 가능한 스케줄을 찾을 수 없습니다.'
        });
      }

      const results = {
        approved: [],
        failed: [],
        warnings: []
      };

      // 각 스케줄 처리
      for (const schedule of schedulesResult.rows) {
        try {
          // 유효성 검증
          if (!skip_validation) {
            const validation = scheduleLib.validateSchedule(schedule);
            if (!validation.valid) {
              results.failed.push({
                schedule_id: schedule.id,
                reason: 'validation_failed',
                errors: validation.errors
              });
              continue;
            }
          }

          // 할당 확인
          const assignmentQuery = `
            SELECT COUNT(*) as assigned_count
            FROM schedule_assignments
            WHERE schedule_id = $1 AND status = 'assigned'
          `;
          const assignmentResult = await client.query(assignmentQuery, [schedule.id]);
          const assignedCount = parseInt(assignmentResult.rows[0].assigned_count);

          if (assignedCount < schedule.required_workers) {
            results.warnings.push({
              schedule_id: schedule.id,
              message: `인원 부족 (필요: ${schedule.required_workers}, 현재: ${assignedCount})`
            });
          }

          // 승인 처리
          await client.query(`
            UPDATE schedules
            SET
              status = 'published',
              approved_by = $1,
              approved_at = NOW(),
              updated_at = NOW()
            WHERE id = $2
          `, [req.user.id, schedule.id]);

          // 이력 저장
          await client.query(`
            INSERT INTO schedule_approval_history (
              schedule_id,
              action,
              from_status,
              to_status,
              performed_by,
              performed_at
            ) VALUES ($1, 'bulk_approve', 'draft', 'published', $2, NOW())
          `, [schedule.id, req.user.id]);

          results.approved.push({
            schedule_id: schedule.id,
            assigned_count: assignedCount,
            required_workers: schedule.required_workers
          });

        } catch (error) {
          results.failed.push({
            schedule_id: schedule.id,
            reason: 'processing_error',
            error: error.message
          });
        }
      }

      // 알림 처리
      if (notify_workers && results.approved.length > 0) {
        const approvedIds = results.approved.map(r => r.schedule_id);

        // 관련 직원 조회
        const workersQuery = `
          SELECT DISTINCT sa.schedule_id, u.id, u.name, u.email
          FROM schedule_assignments sa
          JOIN users u ON sa.user_id = u.id
          WHERE sa.schedule_id = ANY($1) AND sa.status = 'assigned'
        `;
        const workersResult = await client.query(workersQuery, [approvedIds]);

        // 알림 일괄 생성
        for (const worker of workersResult.rows) {
          await client.query(`
            INSERT INTO notification_queue (
              user_id,
              type,
              title,
              message,
              data,
              status
            ) VALUES ($1, 'schedule_approved', '스케줄 승인', '스케줄이 승인되었습니다.', $2, 'pending')
          `, [
            worker.id,
            JSON.stringify({ schedule_id: worker.schedule_id })
          ]);
        }
      }

      await client.query('COMMIT');

      const totalProcessed = results.approved.length + results.failed.length;
      const successRate = (results.approved.length / totalProcessed * 100).toFixed(1);

      logger.info(`일괄 스케줄 승인: approver=${req.user.id}, approved=${results.approved.length}, failed=${results.failed.length}`);

      res.json({
        success: true,
        message: `${results.approved.length}개 스케줄이 승인되었습니다.`,
        data: {
          total_processed: totalProcessed,
          approved_count: results.approved.length,
          failed_count: results.failed.length,
          success_rate: `${successRate}%`,
          results
        }
      });

    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('일괄 스케줄 승인 오류:', error);
      res.status(500).json({
        success: false,
        error: '일괄 스케줄 승인 중 오류가 발생했습니다.'
      });
    } finally {
      client.release();
    }
  })
);

/**
 * POST /api/v1/schedules/:id/reject
 * 스케줄 거부
 */
router.post('/:id/reject',
  authenticate,
  authorize(['owner', 'manager']),
  asyncHandler(async (req, res) => {
    const client = await pool.connect();

    try {
      const scheduleId = parseInt(req.params.id);
      const { reason, cancel = false } = req.body;

      // 스케줄 조회
      const scheduleQuery = `
        SELECT * FROM schedules WHERE id = $1
      `;
      const scheduleResult = await client.query(scheduleQuery, [scheduleId]);

      if (scheduleResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: '스케줄을 찾을 수 없습니다.'
        });
      }

      const schedule = scheduleResult.rows[0];

      // 상태 확인
      if (!['draft', 'published'].includes(schedule.status)) {
        return res.status(400).json({
          success: false,
          error: `${schedule.status} 상태의 스케줄은 거부할 수 없습니다.`
        });
      }

      // 상태 업데이트
      const newStatus = cancel ? 'cancelled' : 'rejected';
      await client.query(`
        UPDATE schedules
        SET
          status = $1,
          updated_at = NOW()
        WHERE id = $2
      `, [newStatus, scheduleId]);

      // 이력 저장
      await client.query(`
        INSERT INTO schedule_approval_history (
          schedule_id,
          action,
          from_status,
          to_status,
          performed_by,
          performed_at,
          note
        ) VALUES ($1, $2, $3, $4, $5, NOW(), $6)
      `, [
        scheduleId,
        cancel ? 'cancel' : 'reject',
        schedule.status,
        newStatus,
        req.user.id,
        reason
      ]);

      logger.info(`스케줄 거부/취소: schedule=${scheduleId}, action=${newStatus}, by=${req.user.id}`);

      res.json({
        success: true,
        message: `스케줄이 ${newStatus === 'cancelled' ? '취소' : '거부'}되었습니다.`,
        data: {
          schedule_id: scheduleId,
          status: newStatus,
          reason
        }
      });

    } catch (error) {
      logger.error('스케줄 거부 오류:', error);
      res.status(500).json({
        success: false,
        error: '스케줄 거부 중 오류가 발생했습니다.'
      });
    } finally {
      client.release();
    }
  })
);

module.exports = router;