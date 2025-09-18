/**
 * T198-T200: 급여 컨트롤러 구현
 * 급여 계산 비즈니스 로직 처리
 */

const pool = require('../config/database');
const Calculator = require('../lib/payroll-lib/src/calculator');
const Deductions = require('../lib/payroll-lib/src/deductions');
const StatementGenerator = require('../lib/payroll-lib/src/statement');

class PayrollController {
  constructor() {
    this.calculator = new Calculator();
    this.deductions = new Deductions();
    this.statementGenerator = new StatementGenerator();
  }

  /**
   * 급여 계산
   */
  async calculatePay(req, res, next) {
    const { employeeId, startDate, endDate } = req.body;
    const userId = req.user.id;

    try {
      // 권한 확인
      const hasPermission = await this.checkManagerPermission(userId, employeeId);
      if (!hasPermission) {
        return res.status(403).json({ error: 'Permission denied' });
      }

      // 근무 데이터 조회
      const workData = await this.getWorkData(employeeId, startDate, endDate);

      // 급여 계산
      const payData = this.calculator.calculateTotalPay(workData);

      // 공제 계산
      const deductionData = this.deductions.calculate(payData.totalPay);

      // 실수령액 계산
      const netPay = this.deductions.calculateNetPay(payData.totalPay, deductionData);

      const result = {
        employeeId,
        period: { startDate, endDate },
        payData: {
          ...payData,
          grossPay: payData.totalPay,
          deductions: deductionData,
          netPay
        }
      };

      res.json(result);
    } catch (error) {
      console.error('급여 계산 실패:', error);
      next(error);
    }
  }

  /**
   * 일괄 급여 계산
   */
  async calculateBatchPay(req, res, next) {
    const { businessId, startDate, endDate } = req.body;
    const userId = req.user.id;

    try {
      // 권한 확인
      const hasPermission = await this.checkOwnerPermission(userId, businessId);
      if (!hasPermission) {
        return res.status(403).json({ error: 'Permission denied' });
      }

      // 모든 직원 조회
      const employees = await this.getEmployees(businessId);

      const results = [];

      for (const employee of employees) {
        const workData = await this.getWorkData(employee.id, startDate, endDate);
        const payData = this.calculator.calculateTotalPay(workData);
        const deductionData = this.deductions.calculate(payData.totalPay);
        const netPay = this.deductions.calculateNetPay(payData.totalPay, deductionData);

        results.push({
          employeeId: employee.id,
          employeeName: employee.name,
          payData: {
            ...payData,
            grossPay: payData.totalPay,
            deductions: deductionData,
            netPay
          }
        });
      }

      res.json({
        businessId,
        period: { startDate, endDate },
        employees: results,
        summary: {
          totalEmployees: results.length,
          totalGrossPay: results.reduce((sum, r) => sum + r.payData.grossPay, 0),
          totalNetPay: results.reduce((sum, r) => sum + r.payData.netPay, 0)
        }
      });
    } catch (error) {
      console.error('일괄 급여 계산 실패:', error);
      next(error);
    }
  }

  /**
   * 공제 계산
   */
  async calculateDeductions(req, res, next) {
    const { grossPay, dependents } = req.body;

    try {
      const deductionData = this.deductions.calculate(grossPay);
      const incomeTax = this.deductions.calculateIncomeTax(grossPay, dependents);

      res.json({
        grossPay,
        deductions: {
          ...deductionData,
          incomeTax
        },
        netPay: this.deductions.calculateNetPay(grossPay, deductionData)
      });
    } catch (error) {
      console.error('공제 계산 실패:', error);
      next(error);
    }
  }

  /**
   * 급여명세서 생성
   */
  async generateStatement(req, res, next) {
    const { employeeId, payData, period } = req.body;
    const userId = req.user.id;

    try {
      // 권한 확인
      const hasPermission = await this.checkManagerPermission(userId, employeeId);
      if (!hasPermission) {
        return res.status(403).json({ error: 'Permission denied' });
      }

      // 직원 정보 조회
      const employeeInfo = await this.getEmployeeInfo(employeeId);

      // 명세서 생성
      const statement = this.statementGenerator.generate(employeeInfo, payData, period);

      // DB 저장
      const savedStatement = await this.saveStatement(statement);

      res.json({
        statementId: savedStatement.id,
        ...statement
      });
    } catch (error) {
      console.error('명세서 생성 실패:', error);
      next(error);
    }
  }

  /**
   * 급여명세서 조회
   */
  async getStatement(req, res, next) {
    const { statementId } = req.params;
    const userId = req.user.id;

    try {
      const query = `
        SELECT * FROM pay_statements
        WHERE id = $1
      `;
      const result = await pool.query(query, [statementId]);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Statement not found' });
      }

      const statement = result.rows[0];

      // 권한 확인 (본인 또는 매니저)
      const hasPermission = await this.checkStatementPermission(userId, statement);
      if (!hasPermission) {
        return res.status(403).json({ error: 'Permission denied' });
      }

      res.json(statement);
    } catch (error) {
      console.error('명세서 조회 실패:', error);
      next(error);
    }
  }

  /**
   * 급여명세서 목록 조회
   */
  async getStatements(req, res, next) {
    const { employeeId, startDate, endDate, limit = 20, offset = 0 } = req.query;
    const userId = req.user.id;

    try {
      let query = `
        SELECT * FROM pay_statements
        WHERE 1=1
      `;
      const params = [];
      let paramCount = 0;

      if (employeeId) {
        paramCount++;
        query += ` AND employee_id = $${paramCount}`;
        params.push(employeeId);
      }

      if (startDate) {
        paramCount++;
        query += ` AND pay_period_start >= $${paramCount}`;
        params.push(startDate);
      }

      if (endDate) {
        paramCount++;
        query += ` AND pay_period_end <= $${paramCount}`;
        params.push(endDate);
      }

      query += ` ORDER BY pay_period_end DESC`;

      paramCount++;
      query += ` LIMIT $${paramCount}`;
      params.push(limit);

      paramCount++;
      query += ` OFFSET $${paramCount}`;
      params.push(offset);

      const result = await pool.query(query, params);

      res.json({
        statements: result.rows,
        pagination: {
          limit: parseInt(limit),
          offset: parseInt(offset),
          total: result.rowCount
        }
      });
    } catch (error) {
      console.error('명세서 목록 조회 실패:', error);
      next(error);
    }
  }

  /**
   * 급여명세서 PDF 생성
   */
  async generatePDF(req, res, next) {
    const { statementId } = req.params;
    const userId = req.user.id;

    try {
      const statement = await this.getStatementById(statementId);

      if (!statement) {
        return res.status(404).json({ error: 'Statement not found' });
      }

      // 권한 확인
      const hasPermission = await this.checkStatementPermission(userId, statement);
      if (!hasPermission) {
        return res.status(403).json({ error: 'Permission denied' });
      }

      // PDF 생성
      const pdfPath = await this.statementGenerator.generatePDF(statement);

      res.json({
        message: 'PDF generated successfully',
        path: pdfPath
      });
    } catch (error) {
      console.error('PDF 생성 실패:', error);
      next(error);
    }
  }

  /**
   * 급여 승인
   */
  async approvePay(req, res, next) {
    const { statementIds, approvalNote } = req.body;
    const userId = req.user.id;

    try {
      // 권한 확인 (Owner만 가능)
      const hasPermission = await this.checkOwnerPermissionByStatements(userId, statementIds);
      if (!hasPermission) {
        return res.status(403).json({ error: 'Permission denied. Owner only' });
      }

      const query = `
        UPDATE pay_statements
        SET
          approval_status = 'approved',
          approved_by = $1,
          approved_at = NOW(),
          approval_note = $2
        WHERE id = ANY($3)
        RETURNING id
      `;

      const result = await pool.query(query, [userId, approvalNote, statementIds]);

      res.json({
        message: 'Payroll approved successfully',
        approvedCount: result.rowCount,
        statementIds: result.rows.map(r => r.id)
      });
    } catch (error) {
      console.error('급여 승인 실패:', error);
      next(error);
    }
  }

  /**
   * 급여 요약 조회
   */
  async getPayrollSummary(req, res, next) {
    const { businessId, year, month } = req.query;
    const userId = req.user.id;

    try {
      // 권한 확인
      const hasPermission = await this.checkManagerPermission(userId, null, businessId);
      if (!hasPermission) {
        return res.status(403).json({ error: 'Permission denied' });
      }

      const query = `
        SELECT
          COUNT(DISTINCT employee_id) as employee_count,
          SUM(gross_pay) as total_gross,
          SUM(net_pay) as total_net,
          SUM(national_pension + health_insurance + long_term_care + employment_insurance) as total_insurance,
          SUM(income_tax + local_income_tax) as total_tax,
          AVG(gross_pay) as avg_gross,
          AVG(net_pay) as avg_net
        FROM pay_statements
        WHERE business_id = $1
          AND EXTRACT(YEAR FROM pay_period_end) = $2
          AND EXTRACT(MONTH FROM pay_period_end) = $3
      `;

      const result = await pool.query(query, [businessId, year, month]);

      res.json({
        businessId,
        period: { year, month },
        summary: result.rows[0]
      });
    } catch (error) {
      console.error('급여 요약 조회 실패:', error);
      next(error);
    }
  }

  /**
   * 급여 데이터 검증
   */
  async validatePayroll(req, res, next) {
    const { payData } = req.body;

    try {
      const isValid = this.statementGenerator.validateStatement(payData);
      const warnings = [];
      const errors = [];

      // 최저임금 검증
      if (payData.hourlyRate && payData.hourlyRate < this.calculator.minimumWage) {
        warnings.push(`시급이 최저임금(${this.calculator.minimumWage}원)보다 낮습니다`);
      }

      // 음수 검증
      if (payData.grossPay < 0 || payData.netPay < 0) {
        errors.push('급여가 음수일 수 없습니다');
      }

      // 계산 검증
      if (!isValid) {
        errors.push('총급여와 공제액의 차이가 실수령액과 일치하지 않습니다');
      }

      res.json({
        isValid: isValid && errors.length === 0,
        warnings,
        errors
      });
    } catch (error) {
      console.error('급여 검증 실패:', error);
      next(error);
    }
  }

  // Helper 메소드들
  async checkManagerPermission(userId, employeeId = null, businessId = null) {
    const query = `
      SELECT role_type FROM user_roles
      WHERE user_id = $1
        AND ($2::INTEGER IS NULL OR business_id = $2)
      LIMIT 1
    `;
    const result = await pool.query(query, [userId, businessId]);
    return result.rows.length > 0 && ['Manager', 'Owner'].includes(result.rows[0].role_type);
  }

  async checkOwnerPermission(userId, businessId) {
    const query = `
      SELECT role_type FROM user_roles
      WHERE user_id = $1 AND business_id = $2
      LIMIT 1
    `;
    const result = await pool.query(query, [userId, businessId]);
    return result.rows.length > 0 && result.rows[0].role_type === 'Owner';
  }

  async checkOwnerPermissionByStatements(userId, statementIds) {
    const query = `
      SELECT DISTINCT ps.business_id, ur.role_type
      FROM pay_statements ps
      JOIN user_roles ur ON ur.business_id = ps.business_id
      WHERE ps.id = ANY($1) AND ur.user_id = $2
    `;
    const result = await pool.query(query, [statementIds, userId]);
    return result.rows.length > 0 && result.rows.every(r => r.role_type === 'Owner');
  }

  async checkStatementPermission(userId, statement) {
    // 본인 확인
    if (statement.employee_id === userId) {
      return true;
    }
    // 매니저/오너 확인
    return this.checkManagerPermission(userId, null, statement.business_id);
  }

  async getWorkData(employeeId, startDate, endDate) {
    const query = `
      SELECT
        SUM(CASE WHEN overtime_hours > 0 THEN regular_hours ELSE total_hours END) as regular_hours,
        SUM(overtime_hours) as overtime_hours,
        SUM(night_hours) as night_hours,
        SUM(holiday_hours) as holiday_hours,
        AVG(hourly_rate) as hourly_rate
      FROM work_records
      WHERE employee_id = $1
        AND work_date BETWEEN $2 AND $3
    `;

    const result = await pool.query(query, [employeeId, startDate, endDate]);

    // 주당 근무시간 계산 (주휴수당용)
    const weeks = Math.ceil((new Date(endDate) - new Date(startDate)) / (7 * 24 * 60 * 60 * 1000));
    const weeklyHours = (result.rows[0].regular_hours || 0) / weeks;

    return {
      hourlyRate: result.rows[0].hourly_rate || 0,
      regularHours: result.rows[0].regular_hours || 0,
      overtimeHours: result.rows[0].overtime_hours || 0,
      nightHours: result.rows[0].night_hours || 0,
      holidayHours: result.rows[0].holiday_hours || 0,
      weeklyHours
    };
  }

  async getEmployees(businessId) {
    const query = `
      SELECT id, name, employee_code, department, position
      FROM employees
      WHERE business_id = $1 AND status = 'active'
    `;
    const result = await pool.query(query, [businessId]);
    return result.rows;
  }

  async getEmployeeInfo(employeeId) {
    const query = `
      SELECT id, name, employee_code, department, position
      FROM employees
      WHERE id = $1
    `;
    const result = await pool.query(query, [employeeId]);
    return result.rows[0];
  }

  async getStatementById(statementId) {
    const query = `
      SELECT * FROM pay_statements
      WHERE id = $1
    `;
    const result = await pool.query(query, [statementId]);
    return result.rows[0];
  }

  async saveStatement(statement) {
    const query = `
      INSERT INTO pay_statements (
        business_id, employee_id, pay_period_start, pay_period_end, payment_date,
        base_pay, overtime_pay, night_pay, holiday_pay, weekly_allowance,
        national_pension, health_insurance, long_term_care, employment_insurance,
        income_tax, local_income_tax
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      RETURNING *
    `;

    const params = [
      statement.businessId,
      statement.employeeInfo.id,
      statement.period.startDate,
      statement.period.endDate,
      statement.period.paymentDate,
      statement.payData.basePay,
      statement.payData.overtimePay,
      statement.payData.nightPay,
      statement.payData.holidayPay,
      statement.payData.weeklyAllowance,
      statement.payData.deductions.nationalPension,
      statement.payData.deductions.healthInsurance,
      statement.payData.deductions.longTermCare,
      statement.payData.deductions.employmentInsurance,
      statement.payData.deductions.incomeTax,
      statement.payData.deductions.localIncomeTax
    ];

    const result = await pool.query(query, params);
    return result.rows[0];
  }
}

module.exports = PayrollController;