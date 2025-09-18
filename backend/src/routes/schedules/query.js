/**
 * T160: 스케줄 조회 API 엔드포인트
 * GET /api/v1/schedules
 *
 * 날짜 범위, 사용자별, 상태별 스케줄 조회
 */

const express = require('express');
const router = express.Router();
const { query, validationResult } = require('express-validator');
const { verifyToken } = require('../../lib/auth-lib/token');
const moment = require('moment');

/**
 * 조회 파라미터 유효성 검사
 */
const validateQuery = [
  query('businessId').optional().isInt().withMessage('유효한 사업장 ID를 입력해주세요'),
  query('userId').optional().isInt().withMessage('유효한 사용자 ID를 입력해주세요'),
  query('startDate').optional().isISO8601().withMessage('유효한 시작 날짜를 입력해주세요'),
  query('endDate').optional().isISO8601().withMessage('유효한 종료 날짜를 입력해주세요'),
  query('status').optional().isIn(['scheduled', 'confirmed', 'cancelled', 'completed'])
    .withMessage('유효한 상태를 선택해주세요'),
  query('type').optional().isIn(['shift', 'overtime', 'break', 'leave', 'meeting', 'training'])
    .withMessage('유효한 스케줄 타입을 선택해주세요'),
  query('includeStats').optional().isBoolean().withMessage('통계 포함 여부는 boolean이어야 합니다')
];

/**
 * GET /api/v1/schedules
 * 스케줄 목록 조회
 */
router.get('/', validateQuery, async (req, res) => {
  try {
    // 1. 입력 유효성 검사
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    // 2. 토큰 확인
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
        userId,
        startDate,
        endDate,
        status,
        type,
        includeStats = false
      } = req.query;

      const pgPool = req.app.get('pgPool');

      // 3. 기본 날짜 범위 설정 (없으면 이번 달)
      const queryStartDate = startDate || moment().startOf('month').format('YYYY-MM-DD');
      const queryEndDate = endDate || moment().endOf('month').format('YYYY-MM-DD');

      // 4. 사용자 권한 확인 및 사업장 결정
      let targetBusinessId = businessId;
      let userRole = null;
      let canViewAll = false;

      if (targetBusinessId) {
        // 특정 사업장 지정된 경우
        const roleQuery = `
          SELECT role_type
          FROM user_roles
          WHERE user_id = $1
            AND business_id = $2
            AND is_active = true
        `;
        const roleResult = await pgPool.query(roleQuery, [requesterId, targetBusinessId]);

        if (roleResult.rows.length === 0) {
          return res.status(403).json({
            success: false,
            error: '해당 사업장에 대한 권한이 없습니다'
          });
        }

        userRole = roleResult.rows[0].role_type;
        canViewAll = ['owner', 'manager'].includes(userRole);
      } else {
        // 사업장 미지정 - 사용자의 첫 번째 활성 사업장 사용
        const businessQuery = `
          SELECT business_id, role_type
          FROM user_roles
          WHERE user_id = $1 AND is_active = true
          ORDER BY created_at
          LIMIT 1
        `;
        const businessResult = await pgPool.query(businessQuery, [requesterId]);

        if (businessResult.rows.length === 0) {
          return res.status(403).json({
            success: false,
            error: '소속된 사업장이 없습니다'
          });
        }

        targetBusinessId = businessResult.rows[0].business_id;
        userRole = businessResult.rows[0].role_type;
        canViewAll = ['owner', 'manager'].includes(userRole);
      }

      // 5. 스케줄 조회 쿼리 구성
      let scheduleQuery = `
        SELECT
          s.id,
          s.user_id,
          u.name as user_name,
          u.email as user_email,
          s.schedule_date,
          s.start_time,
          s.end_time,
          s.schedule_type,
          s.status,
          s.notes,
          s.recurring,
          s.recurring_end,
          s.created_at,
          s.updated_at,
          s.created_by,
          creator.name as created_by_name
        FROM schedules s
        JOIN users u ON s.user_id = u.id
        LEFT JOIN users creator ON s.created_by = creator.id
        WHERE s.business_id = $1
          AND s.schedule_date >= $2
          AND s.schedule_date <= $3
      `;

      const queryParams = [targetBusinessId, queryStartDate, queryEndDate];
      let paramIndex = 4;

      // 권한에 따른 필터링
      if (!canViewAll) {
        // 일반 직원은 본인 스케줄만
        scheduleQuery += ` AND s.user_id = $${paramIndex}`;
        queryParams.push(requesterId);
        paramIndex++;
      } else if (userId) {
        // 관리자가 특정 사용자 지정
        scheduleQuery += ` AND s.user_id = $${paramIndex}`;
        queryParams.push(parseInt(userId));
        paramIndex++;
      }

      // 상태 필터
      if (status) {
        scheduleQuery += ` AND s.status = $${paramIndex}`;
        queryParams.push(status);
        paramIndex++;
      }

      // 타입 필터
      if (type) {
        scheduleQuery += ` AND s.schedule_type = $${paramIndex}`;
        queryParams.push(type);
        paramIndex++;
      }

      scheduleQuery += ` ORDER BY s.schedule_date, s.start_time`;

      // 6. 스케줄 조회 실행
      const scheduleResult = await pgPool.query(scheduleQuery, queryParams);

      // 7. 통계 계산 (요청시)
      let statistics = null;
      if (includeStats === 'true' || includeStats === true) {
        // 전체 근무 시간 계산
        let totalMinutes = 0;
        let overtimeMinutes = 0;
        const statusCount = {};
        const typeCount = {};
        const userStats = {};

        scheduleResult.rows.forEach(schedule => {
          // 상태별 집계
          statusCount[schedule.status] = (statusCount[schedule.status] || 0) + 1;

          // 타입별 집계
          typeCount[schedule.schedule_type] = (typeCount[schedule.schedule_type] || 0) + 1;

          // 시간 계산 (완료된 스케줄만)
          if (schedule.status === 'completed' || schedule.status === 'confirmed') {
            const start = moment(schedule.start_time, 'HH:mm');
            const end = moment(schedule.end_time, 'HH:mm');
            const duration = end.diff(start, 'minutes');

            totalMinutes += duration;

            // 8시간 초과분은 초과근무
            if (schedule.schedule_type === 'overtime') {
              overtimeMinutes += duration;
            }

            // 사용자별 통계
            if (!userStats[schedule.user_id]) {
              userStats[schedule.user_id] = {
                userId: schedule.user_id,
                userName: schedule.user_name,
                totalMinutes: 0,
                scheduleCount: 0
              };
            }
            userStats[schedule.user_id].totalMinutes += duration;
            userStats[schedule.user_id].scheduleCount++;
          }
        });

        statistics = {
          totalSchedules: scheduleResult.rows.length,
          totalHours: Math.floor(totalMinutes / 60),
          totalMinutes: totalMinutes % 60,
          overtimeHours: Math.floor(overtimeMinutes / 60),
          overtimeMinutes: overtimeMinutes % 60,
          byStatus: statusCount,
          byType: typeCount,
          byUser: Object.values(userStats)
        };
      }

      // 8. 응답
      res.json({
        success: true,
        businessId: targetBusinessId,
        dateRange: {
          start: queryStartDate,
          end: queryEndDate
        },
        count: scheduleResult.rows.length,
        schedules: scheduleResult.rows.map(row => ({
          id: row.id,
          user: {
            id: row.user_id,
            name: row.user_name,
            email: row.user_email
          },
          date: moment(row.schedule_date).format('YYYY-MM-DD'),
          time: `${row.start_time}-${row.end_time}`,
          type: row.schedule_type,
          status: row.status,
          notes: row.notes,
          recurring: row.recurring,
          recurringEnd: row.recurring_end,
          createdBy: {
            id: row.created_by,
            name: row.created_by_name
          },
          createdAt: row.created_at,
          updatedAt: row.updated_at
        })),
        statistics: statistics
      });

    } catch (tokenError) {
      return res.status(401).json({
        success: false,
        error: '유효하지 않은 토큰입니다'
      });
    }

  } catch (error) {
    console.error('스케줄 조회 에러:', error);
    res.status(500).json({
      success: false,
      error: '스케줄 조회 중 오류가 발생했습니다'
    });
  }
});

/**
 * GET /api/v1/schedules/:id
 * 특정 스케줄 상세 조회
 */
router.get('/:id', async (req, res) => {
  try {
    // 토큰 확인
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

      const scheduleId = req.params.id;
      const pgPool = req.app.get('pgPool');

      // 스케줄 조회
      const scheduleQuery = `
        SELECT
          s.*,
          u.name as user_name,
          u.email as user_email,
          b.name as business_name,
          creator.name as created_by_name,
          approver.name as approved_by_name
        FROM schedules s
        JOIN users u ON s.user_id = u.id
        JOIN businesses b ON s.business_id = b.id
        LEFT JOIN users creator ON s.created_by = creator.id
        LEFT JOIN users approver ON s.approved_by = approver.id
        WHERE s.id = $1
      `;

      const scheduleResult = await pgPool.query(scheduleQuery, [scheduleId]);

      if (scheduleResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: '스케줄을 찾을 수 없습니다'
        });
      }

      const schedule = scheduleResult.rows[0];

      // 권한 확인
      const roleQuery = `
        SELECT role_type
        FROM user_roles
        WHERE user_id = $1
          AND business_id = $2
          AND is_active = true
      `;
      const roleResult = await pgPool.query(roleQuery, [requesterId, schedule.business_id]);

      if (roleResult.rows.length === 0) {
        return res.status(403).json({
          success: false,
          error: '해당 스케줄에 대한 조회 권한이 없습니다'
        });
      }

      const userRole = roleResult.rows[0].role_type;
      const canView = ['owner', 'manager'].includes(userRole) || schedule.user_id === requesterId;

      if (!canView) {
        return res.status(403).json({
          success: false,
          error: '해당 스케줄에 대한 조회 권한이 없습니다'
        });
      }

      // 응답
      res.json({
        success: true,
        schedule: {
          id: schedule.id,
          business: {
            id: schedule.business_id,
            name: schedule.business_name
          },
          user: {
            id: schedule.user_id,
            name: schedule.user_name,
            email: schedule.user_email
          },
          date: moment(schedule.schedule_date).format('YYYY-MM-DD'),
          startTime: schedule.start_time,
          endTime: schedule.end_time,
          type: schedule.schedule_type,
          status: schedule.status,
          notes: schedule.notes,
          recurring: schedule.recurring,
          recurringEnd: schedule.recurring_end,
          recurringId: schedule.recurring_id,
          createdBy: {
            id: schedule.created_by,
            name: schedule.created_by_name
          },
          approvedBy: schedule.approved_by ? {
            id: schedule.approved_by,
            name: schedule.approved_by_name
          } : null,
          approvedAt: schedule.approved_at,
          createdAt: schedule.created_at,
          updatedAt: schedule.updated_at
        }
      });

    } catch (tokenError) {
      return res.status(401).json({
        success: false,
        error: '유효하지 않은 토큰입니다'
      });
    }

  } catch (error) {
    console.error('스케줄 상세 조회 에러:', error);
    res.status(500).json({
      success: false,
      error: '스케줄 조회 중 오류가 발생했습니다'
    });
  }
});

module.exports = router;