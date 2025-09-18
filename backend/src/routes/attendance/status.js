/**
 * T259: 실시간 근태 상태 조회 API 엔드포인트
 * 실시간 출석 현황, 휴게 정보, 통계 조회
 */

const express = require('express');
const router = express.Router();
const pool = require('../../db');
const { authenticate, authorize } = require('../../middleware/auth');
const { asyncHandler } = require('../../middleware/errorHandler');
const logger = require('../../utils/logger');
const moment = require('moment-timezone');

/**
 * GET /api/v1/attendance/status/realtime
 * 실시간 근태 현황 조회
 */
router.get('/status/realtime',
  authenticate,
  asyncHandler(async (req, res) => {
    const client = await pool.connect();

    try {
      const { business_id, date } = req.query;
      const userId = req.user.id;

      // 사용자 권한 확인
      const roleQuery = `
        SELECT ur.role_type, b.name as business_name
        FROM user_roles ur
        JOIN businesses b ON ur.business_id = b.id
        WHERE ur.user_id = $1
          AND ur.business_id = $2
          AND ur.is_active = true
      `;

      const roleResult = await client.query(roleQuery, [userId, business_id]);

      if (roleResult.rows.length === 0) {
        return res.status(403).json({
          success: false,
          error: '해당 사업장에 대한 권한이 없습니다.'
        });
      }

      const userRole = roleResult.rows[0];
      const isManager = ['owner', 'manager'].includes(userRole.role_type);

      // 조회할 날짜 결정
      const targetDate = date || moment().tz('Asia/Seoul').format('YYYY-MM-DD');

      // 실시간 근태 현황 조회
      let statusQuery;
      let queryParams;

      if (isManager) {
        // 관리자: 모든 직원의 상태 조회
        statusQuery = `
          WITH current_attendance AS (
            SELECT
              a.*,
              u.name as user_name,
              u.email as user_email,
              u.phone as user_phone,
              ur.role_type,
              ur.wage_type,
              ur.wage_amount,
              -- 현재 진행 중인 휴게
              (
                SELECT json_build_object(
                  'break_id', ab.id,
                  'start_time', ab.start_time,
                  'break_type', ab.break_type
                )
                FROM attendance_breaks ab
                WHERE ab.attendance_id = a.id
                  AND ab.end_time IS NULL
                LIMIT 1
              ) as active_break,
              -- 오늘의 총 휴게 시간
              (
                SELECT COALESCE(SUM(duration_minutes), 0)
                FROM attendance_breaks
                WHERE attendance_id = a.id
              ) as total_break_minutes
            FROM attendances a
            JOIN users u ON a.user_id = u.id
            JOIN user_roles ur ON u.id = ur.user_id AND ur.business_id = a.business_id
            WHERE a.business_id = $1
              AND DATE(a.check_in_time) = $2
              AND ur.is_active = true
          )
          SELECT
            *,
            -- 실시간 근무 시간 계산
            CASE
              WHEN check_out_time IS NOT NULL THEN
                EXTRACT(EPOCH FROM (check_out_time - check_in_time)) / 60
              ELSE
                EXTRACT(EPOCH FROM (NOW() - check_in_time)) / 60
            END as work_minutes,
            -- 실제 근무 시간 (휴게 제외)
            CASE
              WHEN check_out_time IS NOT NULL THEN
                EXTRACT(EPOCH FROM (check_out_time - check_in_time)) / 60 - total_break_minutes
              ELSE
                EXTRACT(EPOCH FROM (NOW() - check_in_time)) / 60 - total_break_minutes
            END as actual_work_minutes,
            -- GPS 좌표 추출
            ST_X(check_in_location::geometry) as check_in_lng,
            ST_Y(check_in_location::geometry) as check_in_lat,
            ST_X(check_out_location::geometry) as check_out_lng,
            ST_Y(check_out_location::geometry) as check_out_lat
          FROM current_attendance
          ORDER BY check_in_time DESC
        `;
        queryParams = [business_id, targetDate];

      } else {
        // 일반 직원: 본인 상태만 조회
        statusQuery = `
          WITH current_attendance AS (
            SELECT
              a.*,
              u.name as user_name,
              u.email as user_email,
              u.phone as user_phone,
              ur.role_type,
              ur.wage_type,
              ur.wage_amount,
              -- 현재 진행 중인 휴게
              (
                SELECT json_build_object(
                  'break_id', ab.id,
                  'start_time', ab.start_time,
                  'break_type', ab.break_type
                )
                FROM attendance_breaks ab
                WHERE ab.attendance_id = a.id
                  AND ab.end_time IS NULL
                LIMIT 1
              ) as active_break,
              -- 오늘의 총 휴게 시간
              (
                SELECT COALESCE(SUM(duration_minutes), 0)
                FROM attendance_breaks
                WHERE attendance_id = a.id
              ) as total_break_minutes
            FROM attendances a
            JOIN users u ON a.user_id = u.id
            JOIN user_roles ur ON u.id = ur.user_id AND ur.business_id = a.business_id
            WHERE a.business_id = $1
              AND a.user_id = $2
              AND DATE(a.check_in_time) = $3
              AND ur.is_active = true
          )
          SELECT
            *,
            -- 실시간 근무 시간 계산
            CASE
              WHEN check_out_time IS NOT NULL THEN
                EXTRACT(EPOCH FROM (check_out_time - check_in_time)) / 60
              ELSE
                EXTRACT(EPOCH FROM (NOW() - check_in_time)) / 60
            END as work_minutes,
            -- 실제 근무 시간 (휴게 제외)
            CASE
              WHEN check_out_time IS NOT NULL THEN
                EXTRACT(EPOCH FROM (check_out_time - check_in_time)) / 60 - total_break_minutes
              ELSE
                EXTRACT(EPOCH FROM (NOW() - check_in_time)) / 60 - total_break_minutes
            END as actual_work_minutes,
            -- GPS 좌표 추출
            ST_X(check_in_location::geometry) as check_in_lng,
            ST_Y(check_in_location::geometry) as check_in_lat,
            ST_X(check_out_location::geometry) as check_out_lng,
            ST_Y(check_out_location::geometry) as check_out_lat
          FROM current_attendance
          ORDER BY check_in_time DESC
        `;
        queryParams = [business_id, userId, targetDate];
      }

      const statusResult = await client.query(statusQuery, queryParams);

      // 통계 정보 계산
      const statistics = {
        total: statusResult.rows.length,
        working: 0,
        onBreak: 0,
        completed: 0,
        totalWorkMinutes: 0,
        averageWorkMinutes: 0
      };

      // 데이터 포맷팅
      const attendanceRecords = statusResult.rows.map(record => {
        // 상태 결정
        let currentStatus = 'completed';
        if (!record.check_out_time) {
          if (record.active_break) {
            currentStatus = 'on_break';
            statistics.onBreak++;
          } else {
            currentStatus = 'working';
            statistics.working++;
          }
        } else {
          statistics.completed++;
        }

        statistics.totalWorkMinutes += record.actual_work_minutes || 0;

        return {
          attendanceId: record.id,
          user: {
            id: record.user_id,
            name: record.user_name,
            email: record.user_email,
            phone: record.user_phone,
            role: record.role_type,
            wage: record.wage_type === 'hourly' ? {
              type: 'hourly',
              amount: record.wage_amount
            } : null
          },
          checkIn: {
            time: record.check_in_time,
            method: record.check_in_method,
            location: record.check_in_lat ? {
              lat: record.check_in_lat,
              lng: record.check_in_lng
            } : null
          },
          checkOut: record.check_out_time ? {
            time: record.check_out_time,
            method: record.check_out_method,
            location: record.check_out_lat ? {
              lat: record.check_out_lat,
              lng: record.check_out_lng
            } : null
          } : null,
          status: currentStatus,
          activeBreak: record.active_break,
          duration: {
            totalMinutes: Math.floor(record.work_minutes || 0),
            actualMinutes: Math.floor(record.actual_work_minutes || 0),
            breakMinutes: Math.floor(record.total_break_minutes || 0),
            formatted: {
              total: formatDuration(record.work_minutes || 0),
              actual: formatDuration(record.actual_work_minutes || 0),
              break: formatDuration(record.total_break_minutes || 0)
            }
          },
          overtime: record.actual_work_minutes > 480 ?
            Math.floor(record.actual_work_minutes - 480) : 0
        };
      });

      // 평균 근무 시간 계산
      if (statistics.total > 0) {
        statistics.averageWorkMinutes = Math.floor(
          statistics.totalWorkMinutes / statistics.total
        );
      }

      res.json({
        success: true,
        business: {
          id: parseInt(business_id),
          name: userRole.business_name
        },
        date: targetDate,
        statistics: {
          ...statistics,
          formatted: {
            totalWork: formatDuration(statistics.totalWorkMinutes),
            averageWork: formatDuration(statistics.averageWorkMinutes)
          }
        },
        records: attendanceRecords,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('실시간 상태 조회 오류:', error);
      res.status(500).json({
        success: false,
        error: '실시간 상태 조회 중 오류가 발생했습니다.'
      });
    } finally {
      client.release();
    }
  })
);

/**
 * GET /api/v1/attendance/status/summary
 * 근태 요약 정보 조회 (대시보드용)
 */
router.get('/status/summary',
  authenticate,
  asyncHandler(async (req, res) => {
    const client = await pool.connect();

    try {
      const userId = req.user.id;
      const today = moment().tz('Asia/Seoul').format('YYYY-MM-DD');

      // 사용자의 모든 사업장 요약 정보 조회
      const summaryQuery = `
        WITH user_businesses AS (
          SELECT DISTINCT
            ur.business_id,
            b.name as business_name,
            ur.role_type,
            ur.is_active
          FROM user_roles ur
          JOIN businesses b ON ur.business_id = b.id
          WHERE ur.user_id = $1 AND ur.is_active = true
        ),
        today_stats AS (
          SELECT
            a.business_id,
            COUNT(DISTINCT a.user_id) as total_count,
            COUNT(DISTINCT a.user_id) FILTER (WHERE a.check_out_time IS NULL) as working_count,
            COUNT(DISTINCT a.user_id) FILTER (WHERE a.check_out_time IS NOT NULL) as completed_count,
            AVG(EXTRACT(EPOCH FROM (
              COALESCE(a.check_out_time, NOW()) - a.check_in_time
            )) / 60) as avg_work_minutes
          FROM attendances a
          WHERE DATE(a.check_in_time) = $2
          GROUP BY a.business_id
        ),
        week_stats AS (
          SELECT
            a.business_id,
            COUNT(DISTINCT a.id) as week_total,
            AVG(a.work_duration_minutes) as week_avg_minutes
          FROM attendances a
          WHERE DATE(a.check_in_time) >= $2::date - INTERVAL '7 days'
            AND DATE(a.check_in_time) < $2::date
          GROUP BY a.business_id
        )
        SELECT
          ub.*,
          COALESCE(ts.total_count, 0) as today_total,
          COALESCE(ts.working_count, 0) as today_working,
          COALESCE(ts.completed_count, 0) as today_completed,
          COALESCE(ts.avg_work_minutes, 0) as today_avg_minutes,
          COALESCE(ws.week_total, 0) as week_total,
          COALESCE(ws.week_avg_minutes, 0) as week_avg_minutes
        FROM user_businesses ub
        LEFT JOIN today_stats ts ON ub.business_id = ts.business_id
        LEFT JOIN week_stats ws ON ub.business_id = ws.business_id
        ORDER BY ub.business_name
      `;

      const summaryResult = await client.query(summaryQuery, [userId, today]);

      const businesses = summaryResult.rows.map(row => ({
        id: row.business_id,
        name: row.business_name,
        role: row.role_type,
        isActive: row.is_active,
        todayStats: {
          total: parseInt(row.today_total),
          working: parseInt(row.today_working),
          completed: parseInt(row.today_completed),
          avgWorkTime: formatDuration(row.today_avg_minutes || 0)
        },
        weekStats: {
          total: parseInt(row.week_total),
          avgWorkTime: formatDuration(row.week_avg_minutes || 0)
        }
      }));

      res.json({
        success: true,
        date: today,
        businesses: businesses,
        summary: {
          totalBusinesses: businesses.length,
          activeBusinesses: businesses.filter(b => b.todayStats.total > 0).length
        }
      });

    } catch (error) {
      logger.error('요약 조회 오류:', error);
      res.status(500).json({
        success: false,
        error: '요약 정보 조회 중 오류가 발생했습니다.'
      });
    } finally {
      client.release();
    }
  })
);

/**
 * GET /api/v1/attendance/status/live
 * 실시간 상태 스트림 (Server-Sent Events)
 */
router.get('/status/live',
  authenticate,
  authorize(['owner', 'manager']),
  asyncHandler(async (req, res) => {
    const { business_id } = req.query;

    // SSE 헤더 설정
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });

    // 초기 연결 메시지
    res.write('data: {"type":"connected","message":"실시간 상태 스트림 연결됨"}\n\n');

    // 5초마다 상태 업데이트 전송
    const intervalId = setInterval(async () => {
      const client = await pool.connect();

      try {
        const statusQuery = `
          SELECT
            COUNT(*) FILTER (WHERE check_out_time IS NULL) as working,
            COUNT(*) FILTER (WHERE check_out_time IS NOT NULL) as completed,
            COUNT(*) as total
          FROM attendances
          WHERE business_id = $1
            AND DATE(check_in_time) = CURRENT_DATE
        `;

        const result = await client.query(statusQuery, [business_id]);
        const stats = result.rows[0];

        const data = JSON.stringify({
          type: 'update',
          timestamp: new Date().toISOString(),
          stats: {
            working: parseInt(stats.working),
            completed: parseInt(stats.completed),
            total: parseInt(stats.total)
          }
        });

        res.write(`data: ${data}\n\n`);

      } catch (error) {
        logger.error('SSE 업데이트 오류:', error);
      } finally {
        client.release();
      }
    }, 5000);

    // 클라이언트 연결 종료 처리
    req.on('close', () => {
      clearInterval(intervalId);
      logger.info(`SSE 연결 종료: business=${business_id}`);
    });
  })
);

/**
 * 시간 포맷팅 헬퍼 함수
 */
function formatDuration(minutes) {
  const hours = Math.floor(minutes / 60);
  const mins = Math.floor(minutes % 60);

  if (hours > 0) {
    return `${hours}시간 ${mins}분`;
  }
  return `${mins}분`;
}

module.exports = router;