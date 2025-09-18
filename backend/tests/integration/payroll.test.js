/**
 * T199-T200: 급여 API 통합 테스트
 * 실제 PostgreSQL 사용 (no mocks)
 */

const { expect } = require('chai');
const request = require('supertest');
const app = require('../../src/app');
const pool = require('../../src/config/database');

describe('급여 API 테스트', () => {
  let authToken;
  let businessId;
  let employeeId;
  let statementId;

  before(async () => {
    // 테스트 데이터 초기화
    await pool.query('DELETE FROM pay_statements WHERE business_id > 0');
    await pool.query('DELETE FROM work_records WHERE employee_id > 0');
    await pool.query('DELETE FROM employees WHERE business_id > 0');
    await pool.query('DELETE FROM user_roles WHERE business_id > 0');
    await pool.query('DELETE FROM businesses WHERE id > 0');
    await pool.query('DELETE FROM users WHERE email LIKE $1', ['%test%']);

    // 테스트 사용자 생성
    const userResult = await pool.query(`
      INSERT INTO users (name, email, phone, password_hash, status)
      VALUES ('Test Manager', 'manager@test.com', '010-1234-5678', 'hash', 'active')
      RETURNING id
    `);
    const userId = userResult.rows[0].id;

    // 테스트 사업체 생성
    const businessResult = await pool.query(`
      INSERT INTO businesses (
        name, registration_number, owner_name, type, industry_type,
        address, phone, email, status, location
      ) VALUES (
        'Test Company', '123-45-67890', 'Owner', 'corporation', 'IT',
        'Seoul', '02-1234-5678', 'test@company.com', 'active',
        ST_SetSRID(ST_MakePoint(127.0, 37.5), 4326)
      )
      RETURNING id
    `);
    businessId = businessResult.rows[0].id;

    // Manager 권한 부여
    await pool.query(`
      INSERT INTO user_roles (user_id, business_id, role_type)
      VALUES ($1, $2, 'Manager')
    `, [userId, businessId]);

    // 테스트 직원 생성
    const employeeResult = await pool.query(`
      INSERT INTO employees (
        business_id, name, employee_code, department, position,
        email, phone, hire_date, status
      ) VALUES (
        $1, 'Test Employee', 'EMP001', 'Development', 'Staff',
        'employee@test.com', '010-9876-5432', '2024-01-01', 'active'
      )
      RETURNING id
    `, [businessId]);
    employeeId = employeeResult.rows[0].id;

    // 근무 기록 생성
    await pool.query(`
      INSERT INTO work_records (
        business_id, employee_id, work_date, check_in, check_out,
        total_hours, regular_hours, overtime_hours, night_hours,
        holiday_hours, hourly_rate, status
      ) VALUES
        ($1, $2, '2024-01-01', '09:00', '18:00', 8, 8, 0, 0, 0, 15000, 'approved'),
        ($1, $2, '2024-01-02', '09:00', '20:00', 10, 8, 2, 0, 0, 15000, 'approved'),
        ($1, $2, '2024-01-03', '09:00', '23:00', 13, 8, 3, 2, 0, 15000, 'approved')
    `, [businessId, employeeId]);

    // 인증 토큰 생성 (테스트용 간단 JWT 생성)
    const { createToken } = require('../../src/lib/auth-lib/token');
    authToken = createToken(userId, 'test@test.com');
  });

  after(async () => {
    // 테스트 데이터 정리
    await pool.query('DELETE FROM pay_statements WHERE business_id = $1', [businessId]);
    await pool.query('DELETE FROM work_records WHERE business_id = $1', [businessId]);
    await pool.query('DELETE FROM employees WHERE business_id = $1', [businessId]);
    await pool.query('DELETE FROM user_roles WHERE business_id = $1', [businessId]);
    await pool.query('DELETE FROM businesses WHERE id = $1', [businessId]);
    await pool.query('DELETE FROM users WHERE email LIKE $1', ['%test%']);
  });

  describe('POST /api/payroll/calculate', () => {
    it('급여를 계산해야 한다', async () => {
      const res = await request(app)
        .post('/api/payroll/calculate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          employeeId,
          startDate: '2024-01-01',
          endDate: '2024-01-03'
        });

      expect(res.status).to.equal(200);
      expect(res.body).to.have.property('employeeId', employeeId);
      expect(res.body).to.have.property('payData');
      expect(res.body.payData).to.have.property('basePay');
      expect(res.body.payData).to.have.property('overtimePay');
      expect(res.body.payData).to.have.property('deductions');
      expect(res.body.payData).to.have.property('netPay');
    });

    it('권한이 없으면 거부해야 한다', async () => {
      // 권한 없는 사용자 생성
      const unauthorizedUser = await pool.query(`
        INSERT INTO users (name, email, phone, password_hash, status)
        VALUES ('Unauthorized', 'unauth@test.com', '010-0000-0000', 'hash', 'active')
        RETURNING id
      `);
      const { createToken } = require('../../src/lib/auth-lib/token');
      const unauthorizedToken = createToken(unauthorizedUser.rows[0].id, 'unauth@test.com');

      const res = await request(app)
        .post('/api/payroll/calculate')
        .set('Authorization', `Bearer ${unauthorizedToken}`)
        .send({
          employeeId,
          startDate: '2024-01-01',
          endDate: '2024-01-03'
        });

      expect(res.status).to.equal(403);
      expect(res.body).to.have.property('error', 'Permission denied');

      // 정리
      await pool.query('DELETE FROM users WHERE id = $1', [unauthorizedUser.rows[0].id]);
    });
  });

  describe('POST /api/payroll/deductions', () => {
    it('4대보험 공제를 계산해야 한다', async () => {
      const res = await request(app)
        .post('/api/payroll/deductions')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          grossPay: 3000000,
          dependents: 1
        });

      expect(res.status).to.equal(200);
      expect(res.body).to.have.property('grossPay', 3000000);
      expect(res.body).to.have.property('deductions');
      expect(res.body.deductions).to.have.property('nationalPension');
      expect(res.body.deductions).to.have.property('healthInsurance');
      expect(res.body.deductions).to.have.property('employmentInsurance');
      expect(res.body).to.have.property('netPay');
    });
  });

  describe('POST /api/payroll/statement', () => {
    it('급여명세서를 생성해야 한다', async () => {
      const res = await request(app)
        .post('/api/payroll/statement')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          employeeId,
          payData: {
            basePay: 2400000,
            overtimePay: 300000,
            nightPay: 50000,
            holidayPay: 0,
            weeklyAllowance: 100000,
            grossPay: 2850000,
            deductions: {
              nationalPension: 128250,
              healthInsurance: 101032,
              longTermCare: 12942,
              employmentInsurance: 25650,
              incomeTax: 150000,
              localIncomeTax: 15000,
              total: 432874
            },
            netPay: 2417126
          },
          period: {
            startDate: '2024-01-01',
            endDate: '2024-01-31',
            paymentDate: '2024-02-10'
          }
        });

      expect(res.status).to.equal(200);
      expect(res.body).to.have.property('statementId');
      expect(res.body).to.have.property('employeeInfo');
      expect(res.body).to.have.property('payData');

      statementId = res.body.statementId;
    });
  });

  describe('GET /api/payroll/statement/:id', () => {
    it('급여명세서를 조회해야 한다', async () => {
      // 먼저 명세서 생성
      const createRes = await request(app)
        .post('/api/payroll/statement')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          employeeId,
          payData: {
            basePay: 2400000,
            overtimePay: 0,
            nightPay: 0,
            holidayPay: 0,
            weeklyAllowance: 0,
            grossPay: 2400000,
            deductions: {
              nationalPension: 108000,
              healthInsurance: 85068,
              longTermCare: 10896,
              employmentInsurance: 21600,
              incomeTax: 100000,
              localIncomeTax: 10000,
              total: 335564
            },
            netPay: 2064436
          },
          period: {
            startDate: '2024-02-01',
            endDate: '2024-02-29',
            paymentDate: '2024-03-10'
          }
        });

      const statementId = createRes.body.statementId;

      // 조회 테스트
      const res = await request(app)
        .get(`/api/payroll/statement/${statementId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).to.equal(200);
      expect(res.body).to.have.property('id', statementId);
    });

    it('존재하지 않는 명세서는 404를 반환해야 한다', async () => {
      const res = await request(app)
        .get('/api/payroll/statement/99999')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).to.equal(404);
      expect(res.body).to.have.property('error', 'Statement not found');
    });
  });

  describe('GET /api/payroll/statements', () => {
    it('급여명세서 목록을 조회해야 한다', async () => {
      const res = await request(app)
        .get('/api/payroll/statements')
        .set('Authorization', `Bearer ${authToken}`)
        .query({
          employeeId,
          startDate: '2024-01-01',
          endDate: '2024-12-31',
          limit: 10,
          offset: 0
        });

      expect(res.status).to.equal(200);
      expect(res.body).to.have.property('statements');
      expect(res.body.statements).to.be.an('array');
      expect(res.body).to.have.property('pagination');
    });
  });

  describe('POST /api/payroll/validate', () => {
    it('유효한 급여 데이터를 검증해야 한다', async () => {
      const res = await request(app)
        .post('/api/payroll/validate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          payData: {
            hourlyRate: 15000,
            grossPay: 3000000,
            deductions: { total: 500000 },
            netPay: 2500000
          }
        });

      expect(res.status).to.equal(200);
      expect(res.body).to.have.property('isValid', true);
      expect(res.body).to.have.property('warnings');
      expect(res.body).to.have.property('errors');
    });

    it('최저임금 미달을 경고해야 한다', async () => {
      const res = await request(app)
        .post('/api/payroll/validate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          payData: {
            hourlyRate: 9000,
            grossPay: 1800000,
            deductions: { total: 300000 },
            netPay: 1500000
          }
        });

      expect(res.status).to.equal(200);
      expect(res.body).to.have.property('isValid', true);
      expect(res.body.warnings).to.include.members(['시급이 최저임금(9860원)보다 낮습니다']);
    });

    it('음수 급여를 거부해야 한다', async () => {
      const res = await request(app)
        .post('/api/payroll/validate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          payData: {
            grossPay: -1000000,
            deductions: { total: 0 },
            netPay: -1000000
          }
        });

      expect(res.status).to.equal(200);
      expect(res.body).to.have.property('isValid', false);
      expect(res.body.errors).to.include.members(['급여가 음수일 수 없습니다']);
    });
  });

  describe('POST /api/payroll/calculate-batch', () => {
    it('일괄 급여 계산을 수행해야 한다 (Owner 권한)', async () => {
      // Owner 권한 부여
      await pool.query(`
        UPDATE user_roles SET role_type = 'Owner'
        WHERE user_id = (SELECT id FROM users WHERE email = 'manager@test.com')
          AND business_id = $1
      `, [businessId]);

      const res = await request(app)
        .post('/api/payroll/calculate-batch')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          businessId,
          startDate: '2024-01-01',
          endDate: '2024-01-31'
        });

      expect(res.status).to.equal(200);
      expect(res.body).to.have.property('businessId', businessId);
      expect(res.body).to.have.property('employees');
      expect(res.body).to.have.property('summary');
      expect(res.body.summary).to.have.property('totalEmployees');
      expect(res.body.summary).to.have.property('totalGrossPay');

      // 권한 복구
      await pool.query(`
        UPDATE user_roles SET role_type = 'Manager'
        WHERE user_id = (SELECT id FROM users WHERE email = 'manager@test.com')
          AND business_id = $1
      `, [businessId]);
    });
  });
});