/**
 * T271: 스케줄 목록 조회 API 엔드포인트
 * GET /api/v1/schedules
 */

const express = require('express');
const router = express.Router();
const pool = require('../../db');
const { authenticate } = require('../../middleware/auth');
const { asyncHandler } = require('../../middleware/errorHandler');
const logger = require('../../utils/logger');
const moment = require('moment-timezone');

/**
 * GET /api/v1/schedules
 * 스케줄 목록 조회
 */
router.get('/',
  authenticate,
  asyncHandler(async (req, res) => {
    const client = await pool.connect();

    try {
      const {
        business_id,
        date,
        start_date,
        end_date,
        status,
        worker_id,
        view_mode = 'day', // day, week, month
        include_assignments = false,
        page = 1,
        limit = 50
      } = req.query;

      // 권한 확인 - 사용자가 해당 사업장에 속해있는지
      const userRole = await client.query(`
        SELECT role_type FROM user_roles
        WHERE user_id = $1 AND business_id = $2 AND is_active = true
      `, [req.user.id, business_id]);

      if (userRole.rows.length === 0) {
        // 일반 직원은 자신의 스케줄만 볼 수 있음
        if (!worker_id || worker_id !== req.user.id.toString()) {
          return res.status(403).json({
            success: false,
            error: '스케줄 조회 권한이 없습니다.'
          });
        }
      }

      const role = userRole.rows[0]?.role_type;

      // 날짜 범위 계산
      let queryStartDate, queryEndDate;

      if (date) {
        // 특정 날짜 조회
        const targetDate = moment.tz(date, 'Asia/Seoul');

        switch (view_mode) {
          case 'week':
            queryStartDate = targetDate.clone().startOf('week');
            queryEndDate = targetDate.clone().endOf('week');
            break;
          case 'month':
            queryStartDate = targetDate.clone().startOf('month');
            queryEndDate = targetDate.clone().endOf('month');
            break;
          default: // day
            queryStartDate = targetDate.clone().startOf('day');
            queryEndDate = targetDate.clone().endOf('day');
            break;
        }
      } else if (start_date && end_date) {
        // 범위 조회
        queryStartDate = moment.tz(start_date, 'Asia/Seoul');
        queryEndDate = moment.tz(end_date, 'Asia/Seoul');
      } else {
        // 기본값: 오늘
        queryStartDate = moment.tz('Asia/Seoul').startOf('day');
        queryEndDate = moment.tz('Asia/Seoul').endOf('day');
      }

      // 쿼리 구성
      let query = `
        SELECT
          s.*,
          u.name as worker_name,
          b.name as business_name,
          COUNT(sa.id) as assigned_count
        FROM schedules s
        LEFT JOIN users u ON s.user_id = u.id
        LEFT JOIN businesses b ON s.business_id = b.id
        LEFT JOIN schedule_assignments sa ON s.id = sa.schedule_id AND sa.status = 'assigned'
        WHERE 1=1
      `;
      const queryParams = [];
      let paramCounter = 1;

      // 사업장 필터
      if (business_id) {
        query += ` AND s.business_id = $${paramCounter}`;
        queryParams.push(business_id);
        paramCounter++;
      }

      // 날짜 범위 필터
      query += ` AND s.start_time >= $${paramCounter} AND s.end_time <= $${paramCounter + 1}`;
      queryParams.push(queryStartDate.toDate(), queryEndDate.toDate());
      paramCounter += 2;

      // 상태 필터
      if (status) {
        if (Array.isArray(status)) {
          query += ` AND s.status = ANY($${paramCounter})`;
          queryParams.push(status);
        } else {
          query += ` AND s.status = $${paramCounter}`;
          queryParams.push(status);
        }
        paramCounter++;
      }

      // 직원 필터 (일반 직원은 자신의 스케줄만)
      if (role === 'worker' || worker_id) {
        const targetWorkerId = worker_id || req.user.id;
        query += ` AND (s.user_id = $${paramCounter} OR sa.user_id = $${paramCounter})`;
        queryParams.push(targetWorkerId);
        paramCounter++;
      }

      // 그룹화 및 정렬
      query += `
        GROUP BY s.id, u.name, b.name
        ORDER BY s.start_time ASC
      `;

      // 페이지네이션
      const offset = (page - 1) * limit;
      query += ` LIMIT $${paramCounter} OFFSET $${paramCounter + 1}`;
      queryParams.push(limit, offset);

      // 실행
      const result = await client.query(query, queryParams);

      // 할당 정보 포함 옵션
      let schedules = result.rows;
      if (include_assignments) {
        const scheduleIds = schedules.map(s => s.id);
        if (scheduleIds.length > 0) {
          const assignmentsQuery = `
            SELECT
              sa.*,
              u.name as worker_name,
              u.phone as worker_phone
            FROM schedule_assignments sa
            JOIN users u ON sa.user_id = u.id
            WHERE sa.schedule_id = ANY($1)
              AND sa.status = 'assigned'
          `;
          const assignmentsResult = await client.query(assignmentsQuery, [scheduleIds]);

          // 스케줄별로 할당 정보 매핑
          const assignmentMap = {};
          assignmentsResult.rows.forEach(assignment => {
            if (!assignmentMap[assignment.schedule_id]) {
              assignmentMap[assignment.schedule_id] = [];
            }
            assignmentMap[assignment.schedule_id].push({
              user_id: assignment.user_id,
              worker_name: assignment.worker_name,
              worker_phone: assignment.worker_phone,
              assigned_at: assignment.assigned_at
            });
          });

          schedules = schedules.map(schedule => ({
            ...schedule,
            assignments: assignmentMap[schedule.id] || []
          }));
        }
      }

      // 통계 정보 계산
      const stats = {
        total: schedules.length,
        by_status: {},
        total_hours: 0,
        workers_needed: 0
      };

      schedules.forEach(schedule => {
        // 상태별 집계
        stats.by_status[schedule.status] = (stats.by_status[schedule.status] || 0) + 1;

        // 총 시간 계산
        const hours = moment(schedule.end_time).diff(moment(schedule.start_time), 'hours', true);
        stats.total_hours += hours;

        // 필요 인원 계산
        if (schedule.status !== 'cancelled') {
          const needed = schedule.required_workers - (schedule.assigned_count || 0);
          stats.workers_needed += Math.max(0, needed);
        }
      });

      logger.info(`스케줄 조회: user=${req.user.id}, business=${business_id}, range=${queryStartDate.format('YYYY-MM-DD')}~${queryEndDate.format('YYYY-MM-DD')}`);

      res.json({
        success: true,
        data: {
          schedules,
          stats,
          pagination: {
            current_page: parseInt(page),
            per_page: parseInt(limit),
            total: schedules.length,
            has_more: schedules.length === parseInt(limit)
          },
          query_info: {
            start_date: queryStartDate.format('YYYY-MM-DD'),
            end_date: queryEndDate.format('YYYY-MM-DD'),
            view_mode,
            role
          }
        }
      });

    } catch (error) {
      logger.error('스케줄 목록 조회 오류:', error);
      res.status(500).json({
        success: false,
        error: '스케줄 목록 조회 중 오류가 발생했습니다.'
      });
    } finally {
      client.release();
    }
  })
);

/**
 * GET /api/v1/schedules/summary
 * 스케줄 요약 정보 조회
 */
router.get('/summary',
  authenticate,
  asyncHandler(async (req, res) => {
    const client = await pool.connect();

    try {
      const { business_id, month } = req.query;
      const targetMonth = month ? moment.tz(month, 'Asia/Seoul') : moment.tz('Asia/Seoul');
      const startOfMonth = targetMonth.clone().startOf('month');
      const endOfMonth = targetMonth.clone().endOf('month');

      // 월간 스케줄 요약
      const summaryQuery = `
        SELECT
          DATE(start_time) as date,
          COUNT(*) as total_schedules,
          SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END) as draft_count,
          SUM(CASE WHEN status = 'published' THEN 1 ELSE 0 END) as published_count,
          SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END) as confirmed_count,
          SUM(required_workers) as total_required,
          COUNT(DISTINCT user_id) as unique_workers
        FROM schedules
        WHERE business_id = $1
          AND start_time >= $2
          AND end_time <= $3
          AND status != 'cancelled'
        GROUP BY DATE(start_time)
        ORDER BY date ASC
      `;

      const summaryResult = await client.query(summaryQuery, [
        business_id,
        startOfMonth.toDate(),
        endOfMonth.toDate()
      ]);

      // 직원별 통계
      const workerStatsQuery = `
        SELECT
          u.id,
          u.name,
          COUNT(s.id) as schedule_count,
          SUM(EXTRACT(EPOCH FROM (s.end_time - s.start_time))/3600) as total_hours
        FROM schedules s
        JOIN users u ON s.user_id = u.id
        WHERE s.business_id = $1
          AND s.start_time >= $2
          AND s.end_time <= $3
          AND s.status IN ('confirmed', 'completed')
        GROUP BY u.id, u.name
        ORDER BY total_hours DESC
      `;

      const workerStatsResult = await client.query(workerStatsQuery, [
        business_id,
        startOfMonth.toDate(),
        endOfMonth.toDate()
      ]);

      res.json({
        success: true,
        data: {
          month: targetMonth.format('YYYY-MM'),
          daily_summary: summaryResult.rows,
          worker_stats: workerStatsResult.rows,
          totals: {
            total_schedules: summaryResult.rows.reduce((sum, day) => sum + day.total_schedules, 0),
            total_workers: workerStatsResult.rows.length,
            total_hours: workerStatsResult.rows.reduce((sum, worker) => sum + parseFloat(worker.total_hours), 0)
          }
        }
      });

    } catch (error) {
      logger.error('스케줄 요약 조회 오류:', error);
      res.status(500).json({
        success: false,
        error: '스케줄 요약 조회 중 오류가 발생했습니다.'
      });
    } finally {
      client.release();
    }
  })
);

module.exports = router;