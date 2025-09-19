/**
 * T258: QR 코드 기반 출퇴근 관리 엔드포인트
 * 사업장 QR 코드 생성, 검증 및 출퇴근 처리
 */

const express = require('express');
const router = express.Router();
const pool = require('../../db');
const { authenticate, requireRole } = require('../../middleware/auth');
const { asyncHandler } = require('../../middleware/errorHandler');
const logger = require('../../utils/logger');
const { generateQRCode, verifyQRCode } = require('../../lib/attendance-lib/qr');
const moment = require('moment-timezone');

/**
 * POST /api/v1/attendance/qr/generate
 * 사업장 QR 코드 생성 (관리자 전용)
 */
router.post('/qr/generate',
  authenticate,
  requireRole(['owner', 'manager']),
  asyncHandler(async (req, res) => {
    const client = await pool.connect();

    try {
      const { business_id } = req.body;
      const managerId = req.user.id;

      // 사업장 권한 확인
      const roleQuery = `
        SELECT ur.role_type, b.name as business_name
        FROM user_roles ur
        JOIN businesses b ON ur.business_id = b.id
        WHERE ur.user_id = $1
          AND ur.business_id = $2
          AND ur.is_active = true
          AND ur.role_type IN ('owner', 'manager')
      `;

      const roleResult = await client.query(roleQuery, [managerId, business_id]);

      if (roleResult.rows.length === 0) {
        return res.status(403).json({
          success: false,
          error: '해당 사업장에 대한 권한이 없습니다.'
        });
      }

      const businessName = roleResult.rows[0].business_name;

      // QR 코드 생성 (30초 유효)
      const qrData = generateQRCode(business_id);

      // QR 생성 로그 기록
      const logQuery = `
        INSERT INTO qr_generation_logs (
          business_id,
          generated_by,
          generated_at,
          qr_hash
        ) VALUES ($1, $2, $3, $4)
      `;

      await client.query(logQuery, [
        business_id,
        managerId,
        new Date(),
        qrData.hash
      ]);

      logger.info(`QR 생성: business=${business_id}, manager=${managerId}`);

      res.json({
        success: true,
        message: 'QR 코드가 생성되었습니다.',
        data: {
          qrCode: qrData.code,
          expiresAt: qrData.expiresAt,
          businessId: business_id,
          businessName: businessName,
          validForSeconds: 30
        }
      });

    } catch (error) {
      logger.error('QR 생성 오류:', error);
      res.status(500).json({
        success: false,
        error: 'QR 코드 생성 중 오류가 발생했습니다.'
      });
    } finally {
      client.release();
    }
  })
);

/**
 * POST /api/v1/attendance/qr/verify
 * QR 코드 검증 및 출퇴근 처리
 */
router.post('/qr/verify',
  authenticate,
  asyncHandler(async (req, res) => {
    const client = await pool.connect();

    try {
      const { qr_code, action = 'check_in' } = req.body;
      const userId = req.user.id;

      // QR 코드 검증
      const verification = verifyQRCode(qr_code);

      if (!verification.valid) {
        return res.status(400).json({
          success: false,
          error: verification.reason || 'QR 코드가 유효하지 않습니다.'
        });
      }

      const businessId = verification.businessId;

      // 사용자가 해당 사업장 직원인지 확인
      const roleQuery = `
        SELECT ur.*, b.name as business_name
        FROM user_roles ur
        JOIN businesses b ON ur.business_id = b.id
        WHERE ur.user_id = $1
          AND ur.business_id = $2
          AND ur.is_active = true
          AND ur.role_type = 'worker'
      `;

      const roleResult = await client.query(roleQuery, [userId, businessId]);

      if (roleResult.rows.length === 0) {
        return res.status(403).json({
          success: false,
          error: '해당 사업장의 직원이 아닙니다.'
        });
      }

      const userRole = roleResult.rows[0];
      const now = moment().tz('Asia/Seoul');
      const today = now.format('YYYY-MM-DD');

      if (action === 'check_in') {
        // 체크인 처리
        // 이미 체크인 했는지 확인
        const checkInQuery = `
          SELECT id, check_in_time
          FROM attendances
          WHERE user_id = $1
            AND business_id = $2
            AND DATE(check_in_time) = $3
            AND check_out_time IS NULL
        `;

        const checkInResult = await client.query(checkInQuery, [userId, businessId, today]);

        if (checkInResult.rows.length > 0) {
          return res.status(400).json({
            success: false,
            error: '이미 출근 처리되었습니다.',
            data: {
              checkInTime: checkInResult.rows[0].check_in_time
            }
          });
        }

        // 체크인 기록
        const insertQuery = `
          INSERT INTO attendances (
            user_id,
            business_id,
            check_in_time,
            check_in_method,
            check_in_location,
            status
          ) VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING *
        `;

        const insertResult = await client.query(insertQuery, [
          userId,
          businessId,
          now.toDate(),
          'qr',
          null, // QR은 위치 정보 없음
          'working'
        ]);

        const attendance = insertResult.rows[0];

        logger.info(`QR 체크인: user=${userId}, business=${businessId}`);

        res.status(201).json({
          success: true,
          message: '출근 처리되었습니다.',
          data: {
            attendanceId: attendance.id,
            checkInTime: attendance.check_in_time,
            businessName: userRole.business_name,
            method: 'qr'
          }
        });

      } else if (action === 'check_out') {
        // 체크아웃 처리
        // 오늘 체크인 기록 찾기
        const checkInQuery = `
          SELECT id, check_in_time
          FROM attendances
          WHERE user_id = $1
            AND business_id = $2
            AND DATE(check_in_time) = $3
            AND check_out_time IS NULL
          ORDER BY check_in_time DESC
          LIMIT 1
        `;

        const checkInResult = await client.query(checkInQuery, [userId, businessId, today]);

        if (checkInResult.rows.length === 0) {
          return res.status(400).json({
            success: false,
            error: '출근 기록이 없습니다. 먼저 출근 처리를 해주세요.'
          });
        }

        const attendanceId = checkInResult.rows[0].id;
        const checkInTime = moment(checkInResult.rows[0].check_in_time);
        const workDuration = now.diff(checkInTime, 'minutes');

        // 최소 근무 시간 체크 (10분)
        if (workDuration < 10) {
          return res.status(400).json({
            success: false,
            error: '최소 근무 시간(10분)이 되지 않았습니다.',
            data: {
              workedMinutes: workDuration,
              requiredMinutes: 10
            }
          });
        }

        // 체크아웃 업데이트
        const updateQuery = `
          UPDATE attendances
          SET
            check_out_time = $1,
            check_out_method = $2,
            work_duration_minutes = $3,
            status = $4
          WHERE id = $5
          RETURNING *
        `;

        const updateResult = await client.query(updateQuery, [
          now.toDate(),
          'qr',
          workDuration,
          'completed',
          attendanceId
        ]);

        const attendance = updateResult.rows[0];

        // 일일 근무 시간 계산
        const dailyQuery = `
          SELECT
            COUNT(*) as attendance_count,
            COALESCE(SUM(work_duration_minutes), 0) as total_minutes
          FROM attendances
          WHERE user_id = $1
            AND business_id = $2
            AND DATE(check_in_time) = $3
        `;

        const dailyResult = await client.query(dailyQuery, [userId, businessId, today]);
        const dailyStats = dailyResult.rows[0];

        logger.info(`QR 체크아웃: user=${userId}, duration=${workDuration}분`);

        res.json({
          success: true,
          message: '퇴근 처리되었습니다.',
          data: {
            attendanceId: attendance.id,
            checkInTime: attendance.check_in_time,
            checkOutTime: attendance.check_out_time,
            workDurationMinutes: workDuration,
            businessName: userRole.business_name,
            method: 'qr',
            dailyStats: {
              totalMinutes: parseInt(dailyStats.total_minutes),
              totalHours: (parseInt(dailyStats.total_minutes) / 60).toFixed(1),
              attendanceCount: parseInt(dailyStats.attendance_count)
            }
          }
        });

      } else {
        res.status(400).json({
          success: false,
          error: '잘못된 요청입니다. action은 check_in 또는 check_out이어야 합니다.'
        });
      }

    } catch (error) {
      logger.error('QR 검증 오류:', error);
      res.status(500).json({
        success: false,
        error: 'QR 코드 처리 중 오류가 발생했습니다.'
      });
    } finally {
      client.release();
    }
  })
);

/**
 * GET /api/v1/attendance/qr/logs
 * QR 생성 로그 조회 (관리자 전용)
 */
router.get('/qr/logs',
  authenticate,
  requireRole(['owner', 'manager']),
  asyncHandler(async (req, res) => {
    const client = await pool.connect();

    try {
      const { business_id, date } = req.query;
      const managerId = req.user.id;

      // 권한 확인
      const roleQuery = `
        SELECT role_type
        FROM user_roles
        WHERE user_id = $1
          AND business_id = $2
          AND is_active = true
          AND role_type IN ('owner', 'manager')
      `;

      const roleResult = await client.query(roleQuery, [managerId, business_id]);

      if (roleResult.rows.length === 0) {
        return res.status(403).json({
          success: false,
          error: '해당 사업장에 대한 권한이 없습니다.'
        });
      }

      // QR 생성 로그 조회
      const targetDate = date || moment().tz('Asia/Seoul').format('YYYY-MM-DD');

      const logsQuery = `
        SELECT
          ql.*,
          u.name as generated_by_name
        FROM qr_generation_logs ql
        JOIN users u ON ql.generated_by = u.id
        WHERE ql.business_id = $1
          AND DATE(ql.generated_at) = $2
        ORDER BY ql.generated_at DESC
      `;

      const logsResult = await client.query(logsQuery, [business_id, targetDate]);

      res.json({
        success: true,
        data: {
          date: targetDate,
          businessId: business_id,
          logs: logsResult.rows.map(log => ({
            id: log.id,
            generatedAt: log.generated_at,
            generatedBy: log.generated_by_name,
            qrHash: log.qr_hash.substring(0, 10) + '...' // 일부만 표시
          })),
          totalCount: logsResult.rows.length
        }
      });

    } catch (error) {
      logger.error('QR 로그 조회 오류:', error);
      res.status(500).json({
        success: false,
        error: 'QR 로그 조회 중 오류가 발생했습니다.'
      });
    } finally {
      client.release();
    }
  })
);

module.exports = router;