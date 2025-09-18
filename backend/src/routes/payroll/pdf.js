/**
 * T200: PDF 생성 엔드포인트
 * 급여명세서 PDF 다운로드 API
 */

const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/auth');
const payrollLib = require('../../lib/payroll-lib');
const pool = require('../../db');
const logger = require('../../utils/logger');
const path = require('path');

/**
 * GET /api/v1/payroll/:id/pdf
 * 급여명세서 PDF 다운로드
 */
router.get('/:id/pdf', authenticate, async (req, res) => {
  const client = await pool.connect();

  try {
    const statementId = parseInt(req.params.id);

    if (!statementId || isNaN(statementId)) {
      return res.status(400).json({
        success: false,
        error: '유효하지 않은 ID입니다'
      });
    }

    // 급여명세서 조회
    const query = `
      SELECT
        ps.*,
        u.name as user_name,
        u.employee_id,
        b.name as business_name,
        b.registration_number as business_reg_number
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

    // 권한 확인: 본인 또는 관리자/매니저만 다운로드 가능
    const isOwner = statement.user_id === req.user.id;
    const isManager = await checkManagerPermission(client, req.user.id, statement.business_id);

    if (!isOwner && !isManager && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'PDF를 다운로드할 권한이 없습니다'
      });
    }

    // PDF 생성을 위한 데이터 구조화
    const payrollData = {
      userId: statement.user_id,
      businessId: statement.business_id,
      userName: statement.user_name,
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
      }
    };

    // PDF 생성
    const pdfBuffer = await payrollLib.generatePDF(payrollData);

    // 파일명 생성
    const fileName = `payslip_${statement.user_name}_${statement.year}${String(statement.month).padStart(2, '0')}.pdf`;
    const safeFileName = fileName.replace(/[^a-zA-Z0-9가-힣._-]/g, '_');

    // PDF 응답 설정
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${safeFileName}"`,
      'Content-Length': pdfBuffer.length,
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });

    // PDF 전송
    res.send(pdfBuffer);

    // 로그 기록
    logger.info(`PDF 다운로드: statementId=${statementId}, userId=${req.user.id}`);

  } catch (error) {
    logger.error('PDF 생성 오류:', error);
    res.status(500).json({
      success: false,
      error: 'PDF 생성 중 오류가 발생했습니다'
    });
  } finally {
    client.release();
  }
});

/**
 * POST /api/v1/payroll/bulk-pdf
 * 여러 급여명세서 PDF 일괄 다운로드 (ZIP)
 */
router.post('/bulk-pdf', authenticate, async (req, res) => {
  const client = await pool.connect();

  try {
    const { statementIds, year, month, businessId } = req.body;

    // 입력 검증
    if (!statementIds && !year && !month && !businessId) {
      return res.status(400).json({
        success: false,
        error: '조회 조건이 필요합니다'
      });
    }

    // 쿼리 구성
    let query = `
      SELECT
        ps.*,
        u.name as user_name,
        u.employee_id,
        b.name as business_name
      FROM pay_statements ps
      JOIN users u ON ps.user_id = u.id
      JOIN businesses b ON ps.business_id = b.id
      WHERE 1=1
    `;

    const params = [];
    let paramCount = 0;

    if (statementIds && Array.isArray(statementIds)) {
      paramCount++;
      query += ` AND ps.id = ANY($${paramCount}::int[])`;
      params.push(statementIds);
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

    if (businessId) {
      paramCount++;
      query += ` AND ps.business_id = $${paramCount}`;
      params.push(businessId);

      // 사업장 권한 확인
      const authCheck = await client.query(`
        SELECT 1 FROM user_businesses
        WHERE user_id = $1 AND business_id = $2
        AND role IN ('admin', 'manager')
      `, [req.user.id, businessId]);

      if (authCheck.rows.length === 0 && req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          error: '해당 사업장에 대한 권한이 없습니다'
        });
      }
    }

    const result = await client.query(query, params);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: '급여명세서를 찾을 수 없습니다'
      });
    }

    // PDF 데이터 준비
    const employees = result.rows.map(statement => ({
      userId: statement.user_id,
      businessId: statement.business_id,
      userName: statement.user_name,
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
        meal: statement.meal_allowance,
        transport: statement.transport_allowance,
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
      }
    }));

    // ZIP 아카이브 생성
    const zipBuffer = await payrollLib.generatePDFArchive(employees);

    // 파일명 생성
    const zipFileName = `payslips_${year || 'all'}_${month || 'all'}.zip`;

    // ZIP 응답 설정
    res.set({
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${zipFileName}"`,
      'Content-Length': zipBuffer.length,
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    });

    // ZIP 전송
    res.send(zipBuffer);

    // 로그 기록
    logger.info(`일괄 PDF 다운로드: count=${employees.length}, userId=${req.user.id}`);

  } catch (error) {
    logger.error('일괄 PDF 생성 오류:', error);
    res.status(500).json({
      success: false,
      error: '일괄 PDF 생성 중 오류가 발생했습니다'
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

module.exports = router;