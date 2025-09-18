/**
 * 급여 컨트롤러
 * 급여 계산 및 명세서 관리를 위한 비즈니스 로직
 */

const pool = require('../db');
const payrollLib = require('../lib/payroll-lib');
const logger = require('../utils/logger');

class PayrollController {
  /**
   * 급여 계산 (저장)
   * POST /api/v1/payroll/calculate
   */
  static async calculate(req, res) {
    const client = await pool.connect();

    try {
      const { userId, businessId, year, month, workRecords, allowances } = req.body;

      // 권한 확인
      if (!req.user.isAdmin && !req.user.isManager && req.user.id !== userId) {
        return res.status(403).json({
          success: false,
          error: '급여 계산 권한이 없습니다'
        });
      }

      // 사용자 정보 조회
      const userQuery = `
        SELECT u.*, ub.hourly_wage, ub.monthly_salary
        FROM users u
        JOIN user_businesses ub ON u.id = ub.user_id
        WHERE u.id = $1 AND ub.business_id = $2
      `;
      const userResult = await client.query(userQuery, [userId, businessId]);

      if (userResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: '사용자를 찾을 수 없습니다'
        });
      }

      const userData = userResult.rows[0];

      // 급여 계산
      const payrollData = payrollLib.calculateMonthlyPayroll({
        baseWage: userData.monthly_salary || 0,
        hourlyWage: userData.hourly_wage || 0,
        workRecords,
        allowances: allowances || {}
      });

      // 트랜잭션 시작
      await client.query('BEGIN');

      // 기존 급여명세서 확인
      const existingQuery = `
        SELECT id FROM pay_statements
        WHERE user_id = $1 AND business_id = $2 AND year = $3 AND month = $4
      `;
      const existingResult = await client.query(existingQuery, [userId, businessId, year, month]);

      let statementId;

      if (existingResult.rows.length > 0) {
        // 기존 명세서 업데이트
        statementId = existingResult.rows[0].id;
        const updateQuery = `
          UPDATE pay_statements
          SET
            total_work_hours = $1,
            regular_work_hours = $2,
            overtime_hours = $3,
            night_hours = $4,
            weekend_hours = $5,
            holiday_hours = $6,
            base_wage = $7,
            hourly_wage = $8,
            regular_pay = $9,
            overtime_pay = $10,
            night_shift_pay = $11,
            weekend_pay = $12,
            holiday_pay = $13,
            weekly_rest_allowance = $14,
            meal_allowance = $15,
            transport_allowance = $16,
            total_allowances = $17,
            national_pension = $18,
            health_insurance = $19,
            long_term_care = $20,
            employment_insurance = $21,
            income_tax = $22,
            local_income_tax = $23,
            total_deductions = $24,
            gross_pay = $25,
            net_pay = $26,
            status = 'confirmed',
            updated_at = CURRENT_TIMESTAMP
          WHERE id = $27
        `;

        await client.query(updateQuery, [
          payrollData.workHours.total,
          payrollData.workHours.regular,
          payrollData.workHours.overtime,
          payrollData.workHours.night,
          payrollData.workHours.weekend,
          payrollData.workHours.holiday,
          payrollData.wages.baseWage,
          payrollData.wages.hourlyWage,
          payrollData.wages.regularPay,
          payrollData.wages.overtimePay,
          payrollData.wages.nightShiftPay,
          payrollData.wages.weekendPay,
          payrollData.wages.holidayPay,
          payrollData.allowances.weeklyRest,
          payrollData.allowances.meal,
          payrollData.allowances.transport,
          payrollData.allowances.total,
          payrollData.deductions.nationalPension,
          payrollData.deductions.healthInsurance,
          payrollData.deductions.longTermCare,
          payrollData.deductions.employmentInsurance,
          payrollData.deductions.incomeTax,
          payrollData.deductions.localIncomeTax,
          payrollData.deductions.total,
          payrollData.summary.grossPay,
          payrollData.summary.netPay,
          statementId
        ]);

      } else {
        // 새 명세서 생성
        const insertQuery = `
          INSERT INTO pay_statements (
            business_id, user_id, year, month,
            total_work_hours, regular_work_hours, overtime_hours,
            night_hours, weekend_hours, holiday_hours,
            base_wage, hourly_wage, regular_pay,
            overtime_pay, night_shift_pay, weekend_pay, holiday_pay,
            weekly_rest_allowance, meal_allowance, transport_allowance,
            total_allowances,
            national_pension, health_insurance, long_term_care,
            employment_insurance, income_tax, local_income_tax,
            total_deductions, gross_pay, net_pay, status
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
            $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
            $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, 'confirmed'
          ) RETURNING id
        `;

        const insertResult = await client.query(insertQuery, [
          businessId, userId, year, month,
          payrollData.workHours.total,
          payrollData.workHours.regular,
          payrollData.workHours.overtime,
          payrollData.workHours.night,
          payrollData.workHours.weekend,
          payrollData.workHours.holiday,
          payrollData.wages.baseWage,
          payrollData.wages.hourlyWage,
          payrollData.wages.regularPay,
          payrollData.wages.overtimePay,
          payrollData.wages.nightShiftPay,
          payrollData.wages.weekendPay,
          payrollData.wages.holidayPay,
          payrollData.allowances.weeklyRest,
          payrollData.allowances.meal,
          payrollData.allowances.transport,
          payrollData.allowances.total,
          payrollData.deductions.nationalPension,
          payrollData.deductions.healthInsurance,
          payrollData.deductions.longTermCare,
          payrollData.deductions.employmentInsurance,
          payrollData.deductions.incomeTax,
          payrollData.deductions.localIncomeTax,
          payrollData.deductions.total,
          payrollData.summary.grossPay,
          payrollData.summary.netPay
        ]);

        statementId = insertResult.rows[0].id;
      }

      // 상세 근무 기록 저장
      if (workRecords && workRecords.length > 0) {
        // 기존 상세 기록 삭제
        await client.query(
          'DELETE FROM pay_statement_details WHERE pay_statement_id = $1',
          [statementId]
        );

        // 새 상세 기록 삽입
        for (const record of workRecords) {
          await client.query(`
            INSERT INTO pay_statement_details (
              pay_statement_id, work_date,
              check_in_time, check_out_time,
              break_minutes, work_hours,
              work_type
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
          `, [
            statementId,
            record.work_date,
            record.check_in_time,
            record.check_out_time,
            record.break_minutes || 0,
            record.work_hours,
            record.work_type || 'regular'
          ]);
        }
      }

      await client.query('COMMIT');

      logger.info(`급여 계산 완료: statementId=${statementId}, userId=${userId}`);

      res.json({
        success: true,
        data: {
          statementId,
          ...payrollData
        }
      });

    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('급여 계산 오류:', error);
      res.status(500).json({
        success: false,
        error: '급여 계산 중 오류가 발생했습니다'
      });
    } finally {
      client.release();
    }
  }

  /**
   * 급여 미리보기 (저장하지 않음)
   * POST /api/v1/payroll/calculate/preview
   */
  static async preview(req, res) {
    try {
      const { baseWage, workRecords, allowances } = req.body;

      // 입력값 검증
      if (!baseWage && !workRecords) {
        return res.status(400).json({
          success: false,
          error: '기본급 또는 근무 기록이 필요합니다'
        });
      }

      // 급여 계산
      const payrollData = payrollLib.calculateMonthlyPayroll({
        baseWage: baseWage || 0,
        workRecords: workRecords || [],
        allowances: allowances || {}
      });

      res.json({
        success: true,
        data: payrollData
      });

    } catch (error) {
      logger.error('급여 미리보기 오류:', error);
      res.status(500).json({
        success: false,
        error: '급여 계산 중 오류가 발생했습니다'
      });
    }
  }

  /**
   * 급여명세서 조회
   * GET /api/v1/payroll/statements/:id
   */
  static async getStatement(req, res) {
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

      // 권한 확인
      const isOwner = statement.user_id === req.user.id;
      const isManager = await PayrollController.checkManagerPermission(
        client,
        req.user.id,
        statement.business_id
      );

      if (!isOwner && !isManager && req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          error: '급여명세서를 조회할 권한이 없습니다'
        });
      }

      // 상세 근무 기록 조회
      const detailsQuery = `
        SELECT * FROM pay_statement_details
        WHERE pay_statement_id = $1
        ORDER BY work_date
      `;
      const detailsResult = await client.query(detailsQuery, [statementId]);

      // 응답 데이터 구조화
      const responseData = {
        id: statement.id,
        userId: statement.user_id,
        userName: statement.user_name,
        businessId: statement.business_id,
        businessName: statement.business_name,
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
          total: statement.total_allowances
        },
        deductions: {
          nationalPension: statement.national_pension,
          healthInsurance: statement.health_insurance,
          longTermCare: statement.long_term_care,
          employmentInsurance: statement.employment_insurance,
          incomeTax: statement.income_tax,
          localIncomeTax: statement.local_income_tax,
          total: statement.total_deductions
        },
        summary: {
          grossPay: statement.gross_pay,
          totalDeductions: statement.total_deductions,
          netPay: statement.net_pay
        },
        details: detailsResult.rows,
        status: statement.status,
        createdAt: statement.created_at,
        updatedAt: statement.updated_at
      };

      res.json({
        success: true,
        data: responseData
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
  }

  /**
   * 급여명세서 목록 조회
   * GET /api/v1/payroll/statements/list
   */
  static async listStatements(req, res) {
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

      // 페이지네이션 계산
      const offset = (page - 1) * limit;

      // 쿼리 구성
      let query = `
        SELECT
          ps.*,
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

      // 권한에 따른 필터링
      if (req.user.role !== 'admin') {
        if (businessId) {
          // 사업장 권한 확인
          const authCheck = await client.query(`
            SELECT role FROM user_businesses
            WHERE user_id = $1 AND business_id = $2
          `, [req.user.id, businessId]);

          if (authCheck.rows.length === 0) {
            return res.status(403).json({
              success: false,
              error: '해당 사업장에 대한 권한이 없습니다'
            });
          }

          // 일반 직원은 본인 급여만 조회 가능
          if (authCheck.rows[0].role === 'employee') {
            paramCount++;
            query += ` AND ps.user_id = $${paramCount}`;
            params.push(req.user.id);
          }
        } else {
          // 사업장 지정 없이는 본인 급여만 조회
          paramCount++;
          query += ` AND ps.user_id = $${paramCount}`;
          params.push(req.user.id);
        }
      }

      // 전체 개수 조회
      const countQuery = query.replace(
        'SELECT ps.*, u.name as user_name, b.name as business_name',
        'SELECT COUNT(*) as total'
      );
      const countResult = await client.query(countQuery, params);
      const totalCount = parseInt(countResult.rows[0].total);

      // 정렬 및 페이지네이션
      query += ' ORDER BY ps.year DESC, ps.month DESC, ps.created_at DESC';
      paramCount++;
      query += ` LIMIT $${paramCount}`;
      params.push(limit);
      paramCount++;
      query += ` OFFSET $${paramCount}`;
      params.push(offset);

      const result = await client.query(query, params);

      // 응답 데이터 구조화
      const statements = result.rows.map(row => ({
        id: row.id,
        userId: row.user_id,
        userName: row.user_name,
        businessId: row.business_id,
        businessName: row.business_name,
        period: `${row.year}-${String(row.month).padStart(2, '0')}`,
        grossPay: row.gross_pay,
        netPay: row.net_pay,
        status: row.status,
        createdAt: row.created_at
      }));

      res.json({
        success: true,
        data: {
          statements,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total: totalCount,
            totalPages: Math.ceil(totalCount / limit)
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
  }

  /**
   * 관리자/매니저 권한 확인 헬퍼
   */
  static async checkManagerPermission(client, userId, businessId) {
    const result = await client.query(`
      SELECT 1 FROM user_businesses
      WHERE user_id = $1 AND business_id = $2
      AND role IN ('admin', 'manager')
    `, [userId, businessId]);

    return result.rows.length > 0;
  }
}

module.exports = PayrollController;