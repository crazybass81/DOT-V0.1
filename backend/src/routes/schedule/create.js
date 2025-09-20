/**
 * T269: 스케줄 생성 API 엔드포인트
 * POST /api/v1/schedules
 */

const express = require('express');
const router = express.Router();
const pool = require('../../db');
const { authenticate } = require('../../middleware/auth');
const { authorize } = require('../../middleware/authorize');
const { asyncHandler } = require('../../middleware/errorHandler');
const logger = require('../../utils/logger');
const scheduleLib = require('../../lib/schedule-lib');
const moment = require('moment-timezone');

/**
 * POST /api/v1/schedules
 * 스케줄 생성
 */
router.post('/',
  authenticate,
  authorize(['owner', 'manager']),
  asyncHandler(async (req, res) => {
    const client = await pool.connect();

    try {
      const {
        business_id,
        schedule_type = 'regular',
        start_time,
        end_time,
        required_workers = 1,
        notes = '',
        template_id,
        start_date,
        end_date,
        auto_assign = false,
        user_id // 특정 직원 지정 (옵션)
      } = req.body;

      // 템플릿 기반 생성
      if (template_id) {
        // 템플릿 조회
        const templateQuery = `
          SELECT * FROM schedule_templates
          WHERE id = $1 AND business_id = $2
        `;
        const templateResult = await client.query(templateQuery, [template_id, business_id]);

        if (templateResult.rows.length === 0) {
          return res.status(404).json({
            success: false,
            error: '템플릿을 찾을 수 없습니다.'
          });
        }

        const template = templateResult.rows[0];

        // 템플릿 적용
        const schedules = scheduleLib.applyTemplate(
          template,
          new Date(start_date),
          new Date(end_date)
        );

        // 스케줄 일괄 생성
        const createdSchedules = [];
        for (const schedule of schedules) {
          const insertQuery = `
            INSERT INTO schedules (
              business_id,
              template_id,
              schedule_type,
              start_time,
              end_time,
              required_workers,
              status,
              created_by,
              created_from_template
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING *
          `;

          const insertResult = await client.query(insertQuery, [
            business_id,
            template_id,
            schedule.schedule_type,
            schedule.start_time,
            schedule.end_time,
            schedule.required_workers,
            'draft',
            req.user.id,
            true
          ]);

          createdSchedules.push(insertResult.rows[0]);
        }

        // 자동 할당 처리
        if (auto_assign) {
          // 가용 직원 조회
          const workersQuery = `
            SELECT u.id, u.name, ur.role_type
            FROM users u
            JOIN user_roles ur ON u.id = ur.user_id
            WHERE ur.business_id = $1
              AND ur.is_active = true
              AND ur.role_type = 'worker'
          `;
          const workersResult = await client.query(workersQuery, [business_id]);

          // 기존 스케줄 조회
          const existingQuery = `
            SELECT * FROM schedules
            WHERE business_id = $1
              AND status != 'cancelled'
              AND start_time >= $2
              AND end_time <= $3
          `;
          const existingResult = await client.query(existingQuery, [
            business_id,
            start_date,
            end_date
          ]);

          // 자동 할당 수행
          const assignmentResult = scheduleLib.autoAssign(
            createdSchedules,
            workersResult.rows,
            existingResult.rows
          );

          // 할당 결과 저장
          for (const assignment of assignmentResult.assignments) {
            if (assignment.status === 'complete' || assignment.status === 'partial') {
              for (const worker of assignment.assigned_workers) {
                await client.query(`
                  INSERT INTO schedule_assignments (
                    schedule_id,
                    user_id,
                    assigned_by,
                    assigned_at,
                    status
                  ) VALUES ($1, $2, $3, NOW(), 'assigned')
                `, [assignment.schedule_id, worker.id, req.user.id]);
              }
            }
          }
        }

        logger.info(`템플릿 기반 스케줄 생성: template=${template_id}, count=${createdSchedules.length}`);

        return res.status(201).json({
          success: true,
          message: `${createdSchedules.length}개의 스케줄이 생성되었습니다.`,
          data: {
            created_from_template: true,
            template_id,
            schedules: createdSchedules,
            auto_assigned: auto_assign
          }
        });
      }

      // 단일 스케줄 생성
      // 유효성 검증
      const validation = scheduleLib.validateSchedule({
        business_id,
        start_time,
        end_time,
        required_workers,
        status: 'draft'
      });

      if (!validation.valid) {
        return res.status(400).json({
          success: false,
          errors: validation.errors
        });
      }

      // 시간 범위 검증
      const timeValidation = scheduleLib.validateTimeRange(start_time, end_time);
      if (!timeValidation.valid) {
        return res.status(400).json({
          success: false,
          errors: timeValidation.errors
        });
      }

      // 특정 직원이 지정된 경우 충돌 검사
      if (user_id) {
        const existingSchedules = await client.query(`
          SELECT * FROM schedules
          WHERE user_id = $1
            AND status != 'cancelled'
            AND (
              (start_time <= $2 AND end_time > $2) OR
              (start_time < $3 AND end_time >= $3) OR
              (start_time >= $2 AND end_time <= $3)
            )
        `, [user_id, start_time, end_time]);

        const conflictCheck = scheduleLib.checkConflict(
          { user_id, start_time, end_time },
          existingSchedules.rows
        );

        if (conflictCheck.hasConflict) {
          return res.status(400).json({
            success: false,
            error: 'CONFLICT',
            conflicts: conflictCheck.conflicts
          });
        }
      }

      // 스케줄 생성
      const insertQuery = `
        INSERT INTO schedules (
          business_id,
          schedule_type,
          start_time,
          end_time,
          required_workers,
          notes,
          status,
          created_by,
          user_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *
      `;

      const result = await client.query(insertQuery, [
        business_id,
        schedule_type,
        start_time,
        end_time,
        required_workers,
        notes,
        'draft',
        req.user.id,
        user_id || null
      ]);

      const schedule = result.rows[0];

      logger.info(`스케줄 생성: id=${schedule.id}, business=${business_id}, type=${schedule_type}`);

      res.status(201).json({
        success: true,
        message: '스케줄이 생성되었습니다.',
        data: {
          schedule_id: schedule.id,
          business_id: schedule.business_id,
          schedule_type: schedule.schedule_type,
          start_time: schedule.start_time,
          end_time: schedule.end_time,
          required_workers: schedule.required_workers,
          status: schedule.status,
          notes: schedule.notes,
          created_by: schedule.created_by,
          created_at: schedule.created_at
        }
      });

    } catch (error) {
      logger.error('스케줄 생성 오류:', error);
      res.status(500).json({
        success: false,
        error: '스케줄 생성 중 오류가 발생했습니다.'
      });
    } finally {
      client.release();
    }
  })
);

module.exports = router;