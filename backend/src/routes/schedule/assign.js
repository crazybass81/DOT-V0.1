/**
 * T270: 스케줄 할당 API 엔드포인트
 * POST /api/v1/schedules/:id/assign
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
 * POST /api/v1/schedules/:id/assign
 * 직원을 스케줄에 할당
 */
router.post('/:id/assign',
  authenticate,
  authorize(['owner', 'manager']),
  asyncHandler(async (req, res) => {
    const client = await pool.connect();

    try {
      const scheduleId = parseInt(req.params.id);
      const {
        user_id,
        user_ids,
        auto_assign = false,
        required_count,
        force = false,
        ignore_warnings = false
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
        return res.status(404).json({
          success: false,
          error: '스케줄을 찾을 수 없습니다.'
        });
      }

      const schedule = scheduleResult.rows[0];

      // 취소된 스케줄 확인
      if (schedule.status === 'cancelled') {
        return res.status(400).json({
          success: false,
          error: '취소된 스케줄에는 할당할 수 없습니다.'
        });
      }

      // 자동 할당 처리
      if (auto_assign) {
        // 가용 직원 조회
        const workersQuery = `
          SELECT u.id, u.name, ur.role_type, ur.wage_type, ur.wage_amount
          FROM users u
          JOIN user_roles ur ON u.id = ur.user_id
          WHERE ur.business_id = $1
            AND ur.is_active = true
            AND ur.role_type = 'worker'
        `;
        const workersResult = await client.query(workersQuery, [schedule.business_id]);

        // 기존 스케줄 조회 (충돌 검사용)
        const existingQuery = `
          SELECT * FROM schedules
          WHERE business_id = $1
            AND status != 'cancelled'
            AND DATE(start_time) = DATE($2::timestamp)
        `;
        const existingResult = await client.query(existingQuery, [
          schedule.business_id,
          schedule.start_time
        ]);

        // 자동 할당 수행
        const assignmentResult = scheduleLib.autoAssign(
          [schedule],
          workersResult.rows,
          existingResult.rows
        );

        if (assignmentResult.assigned === 0) {
          return res.status(400).json({
            success: false,
            error: '자동 할당 가능한 직원이 없습니다.',
            data: assignmentResult
          });
        }

        // 할당 결과 저장
        const assignments = [];
        for (const assignment of assignmentResult.assignments) {
          if (assignment.assigned_workers && assignment.assigned_workers.length > 0) {
            for (const worker of assignment.assigned_workers) {
              const insertResult = await client.query(`
                INSERT INTO schedule_assignments (
                  schedule_id,
                  user_id,
                  assigned_by,
                  assigned_at,
                  status
                ) VALUES ($1, $2, $3, NOW(), 'assigned')
                RETURNING *
              `, [scheduleId, worker.id, req.user.id]);

              assignments.push(insertResult.rows[0]);
            }
          }
        }

        return res.status(201).json({
          success: true,
          message: '자동 할당이 완료되었습니다.',
          data: {
            auto_assigned: true,
            assignments,
            ...assignmentResult
          }
        });
      }

      // 여러 직원 할당
      if (user_ids && Array.isArray(user_ids)) {
        // 기존 스케줄 조회
        const existingSchedules = await client.query(`
          SELECT * FROM schedules
          WHERE business_id = $1
            AND status != 'cancelled'
            AND id != $2
        `, [schedule.business_id, scheduleId]);

        const results = scheduleLib.bulkAssign(
          schedule,
          user_ids,
          existingSchedules.rows
        );

        // 성공한 할당 저장
        const assignments = [];
        for (const success of results.results.success) {
          const insertResult = await client.query(`
            INSERT INTO schedule_assignments (
              schedule_id,
              user_id,
              assigned_by,
              assigned_at,
              status
            ) VALUES ($1, $2, $3, NOW(), 'assigned')
            RETURNING *
          `, [scheduleId, success.worker_id, req.user.id]);

          assignments.push(insertResult.rows[0]);
        }

        return res.status(201).json({
          success: true,
          message: `${results.succeeded}명 할당 성공, ${results.failed_count}명 실패`,
          data: {
            assignments,
            succeeded: results.succeeded,
            failed: results.failed_count,
            details: results.results
          }
        });
      }

      // 단일 직원 할당
      if (!user_id) {
        return res.status(400).json({
          success: false,
          error: '할당할 직원 ID가 필요합니다.'
        });
      }

      // 직원 존재 확인
      const workerQuery = `
        SELECT u.*, ur.role_type, ur.wage_type, ur.wage_amount
        FROM users u
        JOIN user_roles ur ON u.id = ur.user_id
        WHERE u.id = $1
          AND ur.business_id = $2
          AND ur.is_active = true
      `;
      const workerResult = await client.query(workerQuery, [user_id, schedule.business_id]);

      if (workerResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: '해당 직원을 찾을 수 없습니다.'
        });
      }

      const worker = workerResult.rows[0];

      // 기존 스케줄 조회 (충돌 검사)
      const existingSchedules = await client.query(`
        SELECT * FROM schedules
        WHERE user_id = $1
          AND status != 'cancelled'
          AND id != $2
      `, [user_id, scheduleId]);

      // 충돌 검사
      const conflictCheck = scheduleLib.checkConflict(
        {
          ...schedule,
          user_id: user_id
        },
        existingSchedules.rows
      );

      if (conflictCheck.hasConflict && !force) {
        // 휴식 시간 부족 경고
        const restWarning = conflictCheck.conflicts.find(c => c.type === 'INSUFFICIENT_REST');
        if (restWarning && !ignore_warnings) {
          return res.status(400).json({
            success: false,
            error: 'INSUFFICIENT_REST',
            warning: restWarning.message,
            conflicts: conflictCheck.conflicts
          });
        }

        // 시간 겹침 오류
        const overlapError = conflictCheck.conflicts.find(c => c.type === 'TIME_OVERLAP');
        if (overlapError) {
          return res.status(400).json({
            success: false,
            error: 'CONFLICT',
            message: overlapError.message,
            conflicts: conflictCheck.conflicts
          });
        }
      }

      // 할당 수행
      const assignmentResult = scheduleLib.assignWorker(
        schedule,
        worker,
        existingSchedules.rows
      );

      if (!assignmentResult.success) {
        // 주 52시간 초과 확인
        if (assignmentResult.error === 'EXCEED_MAX_HOURS') {
          return res.status(400).json({
            success: false,
            error: 'EXCEED_MAX_HOURS',
            message: assignmentResult.message,
            currentHours: assignmentResult.currentHours,
            additionalHours: assignmentResult.additionalHours,
            maxHours: assignmentResult.maxHours
          });
        }

        return res.status(400).json({
          success: false,
          error: assignmentResult.error,
          message: assignmentResult.message
        });
      }

      // DB에 할당 저장
      const insertQuery = `
        INSERT INTO schedule_assignments (
          schedule_id,
          user_id,
          assigned_by,
          assigned_at,
          status
        ) VALUES ($1, $2, $3, NOW(), $4)
        RETURNING *
      `;

      const insertResult = await client.query(insertQuery, [
        scheduleId,
        user_id,
        req.user.id,
        'assigned'
      ]);

      // 스케줄에 user_id 업데이트
      await client.query(`
        UPDATE schedules
        SET user_id = $1, updated_at = NOW()
        WHERE id = $2
      `, [user_id, scheduleId]);

      const assignment = insertResult.rows[0];

      logger.info(`스케줄 할당: schedule=${scheduleId}, user=${user_id}, by=${req.user.id}`);

      res.status(201).json({
        success: true,
        message: '직원이 스케줄에 할당되었습니다.',
        data: {
          assignment: {
            id: assignment.id,
            schedule_id: assignment.schedule_id,
            user_id: assignment.user_id,
            assigned_by: assignment.assigned_by,
            assigned_at: assignment.assigned_at,
            status: assignment.status
          }
        }
      });

    } catch (error) {
      logger.error('스케줄 할당 오류:', error);
      res.status(500).json({
        success: false,
        error: '스케줄 할당 중 오류가 발생했습니다.'
      });
    } finally {
      client.release();
    }
  })
);

module.exports = router;