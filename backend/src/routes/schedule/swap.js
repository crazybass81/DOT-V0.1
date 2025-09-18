/**
 * T272: 스케줄 교대 API 엔드포인트
 * POST /api/v1/schedules/swap
 */

const express = require('express');
const router = express.Router();
const pool = require('../../db');
const { authenticate } = require('../../middleware/auth');
const { asyncHandler } = require('../../middleware/errorHandler');
const logger = require('../../utils/logger');
const scheduleLib = require('../../lib/schedule-lib');
const moment = require('moment-timezone');

/**
 * POST /api/v1/schedules/swap
 * 스케줄 교대 요청 생성 또는 관리자 직접 교대
 */
router.post('/swap',
  authenticate,
  asyncHandler(async (req, res) => {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const {
        // 직원 요청용
        my_schedule_id,
        target_schedule_id,
        reason,
        // 관리자 직접 교대용
        schedule_1_id,
        schedule_2_id,
        force = false,
        admin_note,
        // 검증 옵션
        check_hours = false,
        check_rest = false
      } = req.body;

      // 관리자 직접 교대
      if (force) {
        // 권한 확인
        const roleQuery = `
          SELECT role_type FROM user_roles
          WHERE user_id = $1 AND is_active = true
          LIMIT 1
        `;
        const roleResult = await client.query(roleQuery, [req.user.id]);

        if (!roleResult.rows[0] || !['owner', 'manager'].includes(roleResult.rows[0].role_type)) {
          await client.query('ROLLBACK');
          return res.status(403).json({
            success: false,
            error: '관리자 권한이 필요합니다.'
          });
        }

        // 두 스케줄 조회
        const schedulesQuery = `
          SELECT * FROM schedules
          WHERE id IN ($1, $2)
        `;
        const schedulesResult = await client.query(schedulesQuery, [schedule_1_id, schedule_2_id]);

        if (schedulesResult.rows.length !== 2) {
          await client.query('ROLLBACK');
          return res.status(404).json({
            success: false,
            error: '스케줄을 찾을 수 없습니다.'
          });
        }

        const [schedule1, schedule2] = schedulesResult.rows;

        // 같은 사업장 확인
        if (schedule1.business_id !== schedule2.business_id) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            success: false,
            error: '다른 사업장의 스케줄과는 교대할 수 없습니다.'
          });
        }

        // 직원 교체
        await client.query(`
          UPDATE schedules
          SET user_id = $1, updated_at = NOW()
          WHERE id = $2
        `, [schedule2.user_id, schedule1.id]);

        await client.query(`
          UPDATE schedules
          SET user_id = $1, updated_at = NOW()
          WHERE id = $2
        `, [schedule1.user_id, schedule2.id]);

        // 교대 이력 저장
        await client.query(`
          INSERT INTO schedule_swap_history (
            schedule_1_id,
            schedule_2_id,
            user_1_id,
            user_2_id,
            executed_by,
            executed_at,
            admin_executed,
            admin_note
          ) VALUES ($1, $2, $3, $4, $5, NOW(), true, $6)
        `, [
          schedule1.id,
          schedule2.id,
          schedule1.user_id,
          schedule2.user_id,
          req.user.id,
          admin_note
        ]);

        await client.query('COMMIT');

        logger.info(`관리자 교대 실행: admin=${req.user.id}, schedules=[${schedule1.id}, ${schedule2.id}]`);

        return res.json({
          success: true,
          message: '관리자 권한으로 교대가 완료되었습니다.',
          data: {
            swapped: true,
            admin_executed: true,
            schedule_1_id: schedule1.id,
            schedule_2_id: schedule2.id
          }
        });
      }

      // 일반 직원 교대 요청
      if (!my_schedule_id || !target_schedule_id) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          error: '교대할 스케줄 ID가 필요합니다.'
        });
      }

      // 스케줄 조회
      const myScheduleQuery = `
        SELECT * FROM schedules WHERE id = $1
      `;
      const myScheduleResult = await client.query(myScheduleQuery, [my_schedule_id]);

      if (myScheduleResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({
          success: false,
          error: '내 스케줄을 찾을 수 없습니다.'
        });
      }

      const mySchedule = myScheduleResult.rows[0];

      // 본인 스케줄 확인
      if (mySchedule.user_id !== req.user.id) {
        await client.query('ROLLBACK');
        return res.status(403).json({
          success: false,
          error: '본인의 스케줄만 교대 요청할 수 있습니다.'
        });
      }

      // 24시간 이내 스케줄 확인
      const hoursUntilStart = moment(mySchedule.start_time).diff(moment(), 'hours');
      if (hoursUntilStart < 24) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          error: '시작 24시간 이내의 스케줄은 교대할 수 없습니다.'
        });
      }

      // 취소된 스케줄 확인
      if (mySchedule.status === 'cancelled') {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          error: '취소된 스케줄은 교대할 수 없습니다.'
        });
      }

      // 대상 스케줄 조회
      const targetScheduleQuery = `
        SELECT s.*, u.name as worker_name
        FROM schedules s
        JOIN users u ON s.user_id = u.id
        WHERE s.id = $1
      `;
      const targetScheduleResult = await client.query(targetScheduleQuery, [target_schedule_id]);

      if (targetScheduleResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({
          success: false,
          error: '대상 스케줄을 찾을 수 없습니다.'
        });
      }

      const targetSchedule = targetScheduleResult.rows[0];

      // 같은 사업장 확인
      if (mySchedule.business_id !== targetSchedule.business_id) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          error: '다른 사업장의 스케줄과는 교대할 수 없습니다.'
        });
      }

      // 이미 진행 중인 요청 확인
      const existingRequestQuery = `
        SELECT * FROM schedule_swap_requests
        WHERE schedule_1_id = $1
          AND status = 'pending'
      `;
      const existingRequestResult = await client.query(existingRequestQuery, [my_schedule_id]);

      if (existingRequestResult.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          error: '이미 진행 중인 교대 요청이 있습니다.'
        });
      }

      // 교대 후 충돌 검사
      const myOtherSchedules = await client.query(`
        SELECT * FROM schedules
        WHERE user_id = $1
          AND id != $2
          AND status != 'cancelled'
      `, [req.user.id, my_schedule_id]);

      const targetOtherSchedules = await client.query(`
        SELECT * FROM schedules
        WHERE user_id = $1
          AND id != $2
          AND status != 'cancelled'
      `, [targetSchedule.user_id, target_schedule_id]);

      // 내가 target 스케줄을 받았을 때 충돌
      const myConflictCheck = scheduleLib.checkConflict(
        { ...targetSchedule, user_id: req.user.id },
        myOtherSchedules.rows
      );

      // 상대가 내 스케줄을 받았을 때 충돌
      const targetConflictCheck = scheduleLib.checkConflict(
        { ...mySchedule, user_id: targetSchedule.user_id },
        targetOtherSchedules.rows
      );

      if (myConflictCheck.hasConflict || targetConflictCheck.hasConflict) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          error: '교대 시 스케줄 충돌이 발생합니다.',
          conflicts: [
            ...myConflictCheck.conflicts,
            ...targetConflictCheck.conflicts
          ]
        });
      }

      // 교대 요청 생성
      const insertQuery = `
        INSERT INTO schedule_swap_requests (
          schedule_1_id,
          schedule_2_id,
          requester_id,
          target_user_id,
          reason,
          status,
          requested_at
        ) VALUES ($1, $2, $3, $4, $5, 'pending', NOW())
        RETURNING *
      `;

      const insertResult = await client.query(insertQuery, [
        my_schedule_id,
        target_schedule_id,
        req.user.id,
        targetSchedule.user_id,
        reason || ''
      ]);

      const swapRequest = insertResult.rows[0];

      // 경고 메시지 생성
      const warnings = [];

      if (check_hours) {
        // 주 52시간 검사
        const weekStart = moment(targetSchedule.start_time).startOf('week');
        const weekEnd = moment(targetSchedule.start_time).endOf('week');

        const weeklyHoursQuery = `
          SELECT SUM(EXTRACT(EPOCH FROM (end_time - start_time))/3600) as total_hours
          FROM schedules
          WHERE user_id = $1
            AND start_time >= $2
            AND end_time <= $3
            AND status IN ('confirmed', 'completed')
        `;

        const myWeeklyHours = await client.query(weeklyHoursQuery, [
          req.user.id,
          weekStart.toDate(),
          weekEnd.toDate()
        ]);

        const targetHours = moment(targetSchedule.end_time).diff(moment(targetSchedule.start_time), 'hours');
        const totalHours = parseFloat(myWeeklyHours.rows[0]?.total_hours || 0) + targetHours;

        if (totalHours > 52) {
          warnings.push(`교대 후 주간 근무시간이 ${totalHours}시간으로 52시간을 초과합니다.`);
        }
      }

      if (check_rest) {
        // 휴식 시간 검사
        const restWarnings = [];

        myOtherSchedules.rows.forEach(schedule => {
          const restTime = Math.abs(
            moment(targetSchedule.start_time).diff(moment(schedule.end_time), 'hours')
          );
          if (restTime < 11) {
            restWarnings.push(`휴식시간이 ${restTime}시간으로 11시간 미만입니다.`);
          }
        });

        if (restWarnings.length > 0) {
          warnings.push(...restWarnings);
        }
      }

      await client.query('COMMIT');

      logger.info(`교대 요청 생성: requester=${req.user.id}, target=${targetSchedule.user_id}, request=${swapRequest.id}`);

      res.status(201).json({
        success: true,
        message: '교대 요청이 생성되었습니다.',
        data: {
          swap_request_id: swapRequest.id,
          status: swapRequest.status,
          requester_id: swapRequest.requester_id,
          target_user_id: swapRequest.target_user_id,
          target_worker_name: targetSchedule.worker_name,
          my_schedule: {
            id: mySchedule.id,
            start_time: mySchedule.start_time,
            end_time: mySchedule.end_time
          },
          target_schedule: {
            id: targetSchedule.id,
            start_time: targetSchedule.start_time,
            end_time: targetSchedule.end_time
          }
        },
        warning: warnings.length > 0 ? warnings.join(' ') : undefined
      });

    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('교대 요청 처리 오류:', error);
      res.status(500).json({
        success: false,
        error: '교대 요청 처리 중 오류가 발생했습니다.'
      });
    } finally {
      client.release();
    }
  })
);

/**
 * PATCH /api/v1/schedules/swap/:id/accept
 * 교대 요청 수락
 */
router.patch('/swap/:id/accept',
  authenticate,
  asyncHandler(async (req, res) => {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const swapRequestId = parseInt(req.params.id);
      const { accept = true } = req.body;

      // 교대 요청 조회
      const requestQuery = `
        SELECT * FROM schedule_swap_requests
        WHERE id = $1 AND status = 'pending'
      `;
      const requestResult = await client.query(requestQuery, [swapRequestId]);

      if (requestResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({
          success: false,
          error: '교대 요청을 찾을 수 없거나 이미 처리되었습니다.'
        });
      }

      const swapRequest = requestResult.rows[0];

      // 권한 확인 (대상 직원만 수락 가능)
      if (swapRequest.target_user_id !== req.user.id) {
        await client.query('ROLLBACK');
        return res.status(403).json({
          success: false,
          error: '교대 요청을 수락할 권한이 없습니다.'
        });
      }

      if (!accept) {
        // 거절 처리
        await client.query(`
          UPDATE schedule_swap_requests
          SET status = 'rejected', responded_at = NOW()
          WHERE id = $1
        `, [swapRequestId]);

        await client.query('COMMIT');

        return res.json({
          success: true,
          message: '교대 요청을 거절했습니다.',
          data: { status: 'rejected' }
        });
      }

      // 스케줄 조회
      const schedulesQuery = `
        SELECT * FROM schedules
        WHERE id IN ($1, $2)
      `;
      const schedulesResult = await client.query(schedulesQuery, [
        swapRequest.schedule_1_id,
        swapRequest.schedule_2_id
      ]);

      if (schedulesResult.rows.length !== 2) {
        await client.query('ROLLBACK');
        return res.status(404).json({
          success: false,
          error: '스케줄을 찾을 수 없습니다.'
        });
      }

      const [schedule1, schedule2] = schedulesResult.rows;

      // 직원 교체
      await client.query(`
        UPDATE schedules
        SET user_id = $1, updated_at = NOW()
        WHERE id = $2
      `, [schedule2.user_id, schedule1.id]);

      await client.query(`
        UPDATE schedules
        SET user_id = $1, updated_at = NOW()
        WHERE id = $2
      `, [schedule1.user_id, schedule2.id]);

      // 요청 상태 업데이트
      await client.query(`
        UPDATE schedule_swap_requests
        SET status = 'accepted', responded_at = NOW()
        WHERE id = $1
      `, [swapRequestId]);

      // 교대 이력 저장
      await client.query(`
        INSERT INTO schedule_swap_history (
          schedule_1_id,
          schedule_2_id,
          user_1_id,
          user_2_id,
          swap_request_id,
          executed_at
        ) VALUES ($1, $2, $3, $4, $5, NOW())
      `, [
        schedule1.id,
        schedule2.id,
        schedule1.user_id,
        schedule2.user_id,
        swapRequestId
      ]);

      await client.query('COMMIT');

      logger.info(`교대 요청 수락: request=${swapRequestId}, acceptor=${req.user.id}`);

      res.json({
        success: true,
        message: '교대가 완료되었습니다.',
        data: {
          status: 'accepted',
          swapped: true
        }
      });

    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('교대 수락 처리 오류:', error);
      res.status(500).json({
        success: false,
        error: '교대 수락 처리 중 오류가 발생했습니다.'
      });
    } finally {
      client.release();
    }
  })
);

/**
 * PATCH /api/v1/schedules/swap/:id/reject
 * 교대 요청 거절
 */
router.patch('/swap/:id/reject',
  authenticate,
  asyncHandler(async (req, res) => {
    const client = await pool.connect();

    try {
      const swapRequestId = parseInt(req.params.id);
      const { reject_reason } = req.body;

      // 교대 요청 조회
      const requestQuery = `
        SELECT * FROM schedule_swap_requests
        WHERE id = $1 AND status = 'pending'
      `;
      const requestResult = await client.query(requestQuery, [swapRequestId]);

      if (requestResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: '교대 요청을 찾을 수 없거나 이미 처리되었습니다.'
        });
      }

      const swapRequest = requestResult.rows[0];

      // 권한 확인
      if (swapRequest.target_user_id !== req.user.id) {
        return res.status(403).json({
          success: false,
          error: '교대 요청을 거절할 권한이 없습니다.'
        });
      }

      // 거절 처리
      await client.query(`
        UPDATE schedule_swap_requests
        SET
          status = 'rejected',
          reject_reason = $2,
          responded_at = NOW()
        WHERE id = $1
      `, [swapRequestId, reject_reason]);

      logger.info(`교대 요청 거절: request=${swapRequestId}, rejector=${req.user.id}`);

      res.json({
        success: true,
        message: '교대 요청을 거절했습니다.',
        data: {
          status: 'rejected',
          reject_reason
        }
      });

    } catch (error) {
      logger.error('교대 거절 처리 오류:', error);
      res.status(500).json({
        success: false,
        error: '교대 거절 처리 중 오류가 발생했습니다.'
      });
    } finally {
      client.release();
    }
  })
);

module.exports = router;