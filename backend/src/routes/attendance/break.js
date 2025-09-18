/**
 * T257: 휴게 시간 관리 API 엔드포인트
 * 휴게 시작/종료, 휴게 시간 조회
 */

const express = require('express');
const router = express.Router();
const pool = require('../../db');
const { authenticate } = require('../../middleware/auth');
const { asyncHandler } = require('../../middleware/errorHandler');
const logger = require('../../utils/logger');
const moment = require('moment-timezone');

/**
 * POST /api/v1/attendance/break/start
 * 휴게 시간 시작
 */
router.post('/break/start',
  authenticate,
  asyncHandler(async (req, res) => {
    const client = await pool.connect();

    try {
      const { break_type = 'coffee', reason } = req.body;
      const userId = req.user.id;

      // 한국 시간 설정
      const now = moment().tz('Asia/Seoul');
      const today = now.format('YYYY-MM-DD');

      // 현재 체크인 상태 확인
      const attendanceQuery = `
        SELECT id, check_in_time, check_out_time
        FROM attendances
        WHERE user_id = $1
          AND DATE(check_in_time) = $2
          AND check_out_time IS NULL
        ORDER BY check_in_time DESC
        LIMIT 1
      `;

      const attendanceResult = await client.query(attendanceQuery, [userId, today]);

      if (attendanceResult.rows.length === 0) {
        return res.status(400).json({
          success: false,
          error: '출근 기록이 없습니다. 먼저 체크인을 해주세요.'
        });
      }

      const attendanceId = attendanceResult.rows[0].id;

      // 현재 진행 중인 휴게가 있는지 확인
      const activeBreakQuery = `
        SELECT id
        FROM attendance_breaks
        WHERE attendance_id = $1 AND end_time IS NULL
      `;

      const activeBreakResult = await client.query(activeBreakQuery, [attendanceId]);

      if (activeBreakResult.rows.length > 0) {
        return res.status(400).json({
          success: false,
          error: '이미 휴게 중입니다. 먼저 휴게를 종료해주세요.'
        });
      }

      // 오늘 총 휴게 시간 확인 (최대 3시간)
      const totalBreakQuery = `
        SELECT
          COUNT(*) as break_count,
          COALESCE(SUM(
            EXTRACT(EPOCH FROM (end_time - start_time)) / 60
          ), 0) as total_minutes
        FROM attendance_breaks
        WHERE attendance_id = $1
      `;

      const totalBreakResult = await client.query(totalBreakQuery, [attendanceId]);
      const { break_count, total_minutes } = totalBreakResult.rows[0];

      if (total_minutes >= 180) { // 3시간 = 180분
        return res.status(400).json({
          success: false,
          error: '일일 최대 휴게 시간(3시간)을 초과했습니다.'
        });
      }

      // 점심 휴게는 하루 1회만
      if (break_type === 'lunch') {
        const lunchBreakQuery = `
          SELECT COUNT(*) as lunch_count
          FROM attendance_breaks
          WHERE attendance_id = $1 AND break_type = 'lunch'
        `;

        const lunchBreakResult = await client.query(lunchBreakQuery, [attendanceId]);

        if (lunchBreakResult.rows[0].lunch_count > 0) {
          return res.status(400).json({
            success: false,
            error: '점심 휴게는 하루 1회만 가능합니다.'
          });
        }
      }

      // 휴게 시작 기록
      const insertQuery = `
        INSERT INTO attendance_breaks (
          attendance_id,
          start_time,
          break_type,
          reason
        ) VALUES ($1, $2, $3, $4)
        RETURNING *
      `;

      const insertResult = await client.query(insertQuery, [
        attendanceId,
        now.toDate(),
        break_type,
        reason
      ]);

      const breakRecord = insertResult.rows[0];

      logger.info(`휴게 시작: userId=${userId}, type=${break_type}`);

      res.status(201).json({
        success: true,
        message: '휴게가 시작되었습니다.',
        data: {
          breakId: breakRecord.id,
          startTime: breakRecord.start_time,
          breakType: breakRecord.break_type,
          todayBreakCount: parseInt(break_count) + 1,
          todayTotalMinutes: parseFloat(total_minutes)
        }
      });

    } catch (error) {
      logger.error('휴게 시작 오류:', error);
      res.status(500).json({
        success: false,
        error: '휴게 시작 처리 중 오류가 발생했습니다.'
      });
    } finally {
      client.release();
    }
  })
);

/**
 * POST /api/v1/attendance/break/end
 * 휴게 시간 종료
 */
router.post('/break/end',
  authenticate,
  asyncHandler(async (req, res) => {
    const client = await pool.connect();

    try {
      const userId = req.user.id;
      const now = moment().tz('Asia/Seoul');
      const today = now.format('YYYY-MM-DD');

      // 현재 진행 중인 휴게 찾기
      const activeBreakQuery = `
        SELECT
          ab.id,
          ab.start_time,
          ab.break_type,
          a.id as attendance_id
        FROM attendance_breaks ab
        JOIN attendances a ON ab.attendance_id = a.id
        WHERE a.user_id = $1
          AND DATE(a.check_in_time) = $2
          AND ab.end_time IS NULL
        ORDER BY ab.start_time DESC
        LIMIT 1
      `;

      const activeBreakResult = await client.query(activeBreakQuery, [userId, today]);

      if (activeBreakResult.rows.length === 0) {
        return res.status(400).json({
          success: false,
          error: '진행 중인 휴게가 없습니다.'
        });
      }

      const breakRecord = activeBreakResult.rows[0];
      const breakDuration = moment(now).diff(moment(breakRecord.start_time), 'minutes');

      // 최소 휴게 시간 체크 (1분)
      if (breakDuration < 1) {
        return res.status(400).json({
          success: false,
          error: '휴게 시간은 최소 1분 이상이어야 합니다.'
        });
      }

      // 최대 연속 휴게 시간 체크 (2시간)
      if (breakDuration > 120) {
        return res.status(400).json({
          success: false,
          error: '연속 휴게 시간은 최대 2시간까지 가능합니다.'
        });
      }

      // 휴게 종료 업데이트
      const updateQuery = `
        UPDATE attendance_breaks
        SET
          end_time = $1,
          duration_minutes = $2
        WHERE id = $3
        RETURNING *
      `;

      const updateResult = await client.query(updateQuery, [
        now.toDate(),
        breakDuration,
        breakRecord.id
      ]);

      // 오늘 총 휴게 시간 계산
      const totalBreakQuery = `
        SELECT
          COUNT(*) as break_count,
          COALESCE(SUM(duration_minutes), 0) as total_minutes
        FROM attendance_breaks
        WHERE attendance_id = $1
      `;

      const totalBreakResult = await client.query(totalBreakQuery, [
        breakRecord.attendance_id
      ]);

      const { break_count, total_minutes } = totalBreakResult.rows[0];

      logger.info(`휴게 종료: userId=${userId}, duration=${breakDuration}분`);

      res.json({
        success: true,
        message: '휴게가 종료되었습니다.',
        data: {
          breakId: breakRecord.id,
          startTime: breakRecord.start_time,
          endTime: updateResult.rows[0].end_time,
          durationMinutes: breakDuration,
          breakType: breakRecord.break_type,
          todayBreakCount: parseInt(break_count),
          todayTotalMinutes: parseFloat(total_minutes)
        }
      });

    } catch (error) {
      logger.error('휴게 종료 오류:', error);
      res.status(500).json({
        success: false,
        error: '휴게 종료 처리 중 오류가 발생했습니다.'
      });
    } finally {
      client.release();
    }
  })
);

/**
 * GET /api/v1/attendance/break/today
 * 오늘의 휴게 시간 조회
 */
router.get('/break/today',
  authenticate,
  asyncHandler(async (req, res) => {
    const client = await pool.connect();

    try {
      const userId = req.user.id;
      const today = moment().tz('Asia/Seoul').format('YYYY-MM-DD');

      // 오늘의 모든 휴게 기록 조회
      const breaksQuery = `
        SELECT
          ab.*,
          a.check_in_time
        FROM attendance_breaks ab
        JOIN attendances a ON ab.attendance_id = a.id
        WHERE a.user_id = $1
          AND DATE(a.check_in_time) = $2
        ORDER BY ab.start_time ASC
      `;

      const breaksResult = await client.query(breaksQuery, [userId, today]);

      // 총 휴게 시간 계산
      const totalMinutes = breaksResult.rows.reduce((sum, record) => {
        return sum + (record.duration_minutes || 0);
      }, 0);

      // 현재 진행 중인 휴게 확인
      const activeBreak = breaksResult.rows.find(b => !b.end_time);

      res.json({
        success: true,
        data: {
          date: today,
          breaks: breaksResult.rows.map(b => ({
            id: b.id,
            startTime: b.start_time,
            endTime: b.end_time,
            durationMinutes: b.duration_minutes,
            breakType: b.break_type,
            reason: b.reason,
            isActive: !b.end_time
          })),
          summary: {
            totalBreaks: breaksResult.rows.length,
            totalMinutes,
            totalHours: (totalMinutes / 60).toFixed(1),
            hasActiveBreak: !!activeBreak,
            remainingMinutes: Math.max(0, 180 - totalMinutes) // 3시간 제한
          }
        }
      });

    } catch (error) {
      logger.error('휴게 시간 조회 오류:', error);
      res.status(500).json({
        success: false,
        error: '휴게 시간 조회 중 오류가 발생했습니다.'
      });
    } finally {
      client.release();
    }
  })
);

module.exports = router;