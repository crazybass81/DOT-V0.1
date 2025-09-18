/**
 * T198-T199: 급여명세서 조회 API 엔드포인트
 * GET /api/v1/payroll/:id - 개별 조회
 * GET /api/v1/payroll/list - 목록 조회
 */

const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../../middleware/auth');
const pool = require('../../db');
const logger = require('../../utils/logger');

/**
 * GET /api/v1/payroll/:id
 * 급여명세서 개별 조회
 */
router.get('/:id', authenticate, async (req, res) => {
  const client = await pool.connect();

  try {
    const statementId = parseInt(req.params.id);

    if (!statementId || isNaN(statementId)) {
      return res.status(400).json({
        success: false,
        error: '유효하지 않은 ID입니다'
      });
    }

    // 급여명세서 조회 (RLS 정책 적용됨)
    const query = `
      SELECT
        ps.*,
        u.name as user_name,
        u.email as user_email,
        b.name as business_name
      FROM pay_statements ps
      JOIN users u ON ps.user_id = u.id
      JOIN businesses b ON ps.business_id = b.id
      WHERE ps.id = $1
    `;

    const result = await client.query(query, [statementId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: '급여명세서를 찾을 수 없습니다'
      });
    }

    const statement = result.rows[0];

    // 권한 확인: 본인 또는 관리자/매니저만 조회 가능
    const isOwner = statement.user_id === req.user.id;
    const isManager = await checkManagerPermission(client, req.user.id, statement.business_id);

    if (!isOwner && !isManager && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: '급여명세서를 조회할 권한이 없습니다'
      });
    }

    // 급여 데이터 구조화
    const payrollData = formatPayrollData(statement);

    res.json({
      success: true,
      data: payrollData
    });

  } catch (error) {
    logger.error('급여명세서 조회 오류:', error);
    res.status(500).json({
      success: false,
      error: '급여명세서 조회 중 오류가 발생했습니다'
    });
  } finally {
    client.release();
  }
});

/**
 * GET /api/v1/payroll/list
 * 급여명세서 목록 조회
 */
router.get('/list', authenticate, async (req, res) => {
  const client = await pool.connect();

  try {
    const {
      businessId,
      userId,
      year,
      month,
      status,
      page = 1,
      limit = 20
    } = req.query;

    // 페이지네이션
    const offset = (page - 1) * limit;

    // 기본 쿼리
    let query = `
      SELECT
        ps.id,
        ps.business_id,
        ps.user_id,
        ps.year,
        ps.month,
        ps.gross_pay,
        ps.net_pay,
        ps.status,
        ps.created_at,
        u.name as user_name,
        b.name as business_name
      FROM pay_statements ps
      JOIN users u ON ps.user_id = u.id
      JOIN businesses b ON ps.business_id = b.id
      WHERE 1=1
    `;

    const params = [];
    let paramCount = 0;

    // 필터 조건 추가
    if (businessId) {
      paramCount++;
      query += ` AND ps.business_id = $${paramCount}`;
      params.push(businessId);
    }

    if (userId) {
      paramCount++;
      query += ` AND ps.user_id = $${paramCount}`;
      params.push(userId);
    }

    if (year) {
      paramCount++;
      query += ` AND ps.year = $${paramCount}`;
      params.push(year);
    }

    if (month) {
      paramCount++;
      query += ` AND ps.month = $${paramCount}`;
      params.push(month);
    }

    if (status) {
      paramCount++;
      query += ` AND ps.status = $${paramCount}`;
      params.push(status);
    }

    // 권한에 따른 필터
    if (req.user.role !== 'admin') {
      // 관리자가 아닌 경우 권한 체크
      const businessQuery = await client.query(`
        SELECT business_id, role
        FROM user_businesses
        WHERE user_id = $1
      `, [req.user.id]);

      const managedBusinesses = businessQuery.rows
        .filter(row => ['admin', 'manager'].includes(row.role))
        .map(row => row.business_id);

      if (managedBusinesses.length > 0 || userId == req.user.id) {
        paramCount++;
        query += ` AND (ps.user_id = $${paramCount}`;
        params.push(req.user.id);

        if (managedBusinesses.length > 0) {
          paramCount++;
          query += ` OR ps.business_id = ANY($${paramCount}::int[])`;
          params.push(managedBusinesses);
        }
        query += ')';
      } else {
        // 권한이 없는 경우 본인 것만 조회
        paramCount++;
        query += ` AND ps.user_id = $${paramCount}`;
        params.push(req.user.id);
      }
    }

    // 정렬 및 페이지네이션
    query += ` ORDER BY ps.year DESC, ps.month DESC, ps.created_at DESC`;
    paramCount++;
    query += ` LIMIT $${paramCount}`;
    params.push(limit);
    paramCount++;
    query += ` OFFSET $${paramCount}`;
    params.push(offset);

    // 전체 카운트 쿼리
    let countQuery = query.replace(/SELECT[\s\S]*?FROM/, 'SELECT COUNT(*) FROM');
    countQuery = countQuery.replace(/ORDER BY[\s\S]*$/, '');
    const countParams = params.slice(0, -2); // LIMIT, OFFSET 제외

    const [result, countResult] = await Promise.all([
      client.query(query, params),
      client.query(countQuery, countParams)
    ]);

    const total = parseInt(countResult.rows[0].count);
    const totalPages = Math.ceil(total / limit);

    res.json({
      success: true,
      data: {
        statements: result.rows,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1
        }
      }
    });

  } catch (error) {
    logger.error('급여명세서 목록 조회 오류:', error);
    res.status(500).json({
      success: false,
      error: '급여명세서 목록 조회 중 오류가 발생했습니다'
    });
  } finally {
    client.release();
  }
});

/**
 * 관리자/매니저 권한 확인
 */
async function checkManagerPermission(client, userId, businessId) {
  const result = await client.query(`
    SELECT 1 FROM user_businesses
    WHERE user_id = $1 AND business_id = $2
    AND role IN ('admin', 'manager')
  `, [userId, businessId]);

  return result.rows.length > 0;
}

/**
 * 급여 데이터 포맷팅
 */
function formatPayrollData(statement) {
  return {
    id: statement.id,
    userId: statement.user_id,
    userName: statement.user_name,
    userEmail: statement.user_email,
    businessId: statement.business_id,
    businessName: statement.business_name,
    period: `${statement.year}-${String(statement.month).padStart(2, '0')}`,
    year: statement.year,
    month: statement.month,
    workHours: {
      total: statement.total_work_hours,
      regular: statement.regular_work_hours,
      overtime: statement.overtime_hours,
      night: statement.night_hours,
      weekend: statement.weekend_hours,
      holiday: statement.holiday_hours
    },
    wages: {
      baseWage: statement.base_wage,
      hourlyWage: statement.hourly_wage,
      regularPay: statement.regular_pay,
      overtimePay: statement.overtime_pay,
      nightShiftPay: statement.night_shift_pay,
      weekendPay: statement.weekend_pay,
      holidayPay: statement.holiday_pay
    },
    allowances: {
      weeklyRest: statement.weekly_rest_allowance,
      annualLeave: statement.annual_leave_allowance,
      meal: statement.meal_allowance,
      transport: statement.transport_allowance,
      family: statement.family_allowance,
      position: statement.position_allowance,
      longevity: statement.longevity_allowance,
      other: statement.other_allowances,
      total: statement.total_allowances
    },
    deductions: {
      nationalPension: statement.national_pension,
      healthInsurance: statement.health_insurance,
      longTermCare: statement.long_term_care,
      employmentInsurance: statement.employment_insurance,
      incomeTax: statement.income_tax,
      localIncomeTax: statement.local_income_tax,
      other: statement.other_deductions,
      total: statement.total_deductions
    },
    summary: {
      grossPay: statement.gross_pay,
      totalDeductions: statement.total_deductions,
      netPay: statement.net_pay
    },
    status: statement.status,
    createdAt: statement.created_at,
    updatedAt: statement.updated_at,
    confirmedAt: statement.confirmed_at
  };
}

module.exports = router;