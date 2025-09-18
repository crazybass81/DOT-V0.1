/**
 * 급여 API 통합 테스트
 * T196-T200 엔드포인트 검증
 */

const request = require('supertest');
const app = require('../../src/app');
const pool = require('../../src/db');
const { generateToken } = require('../../src/utils/auth');

describe('급여 API 엔드포인트', () => {
  let authToken;
  let testUserId;
  let testBusinessId;
  let testStatementId;

  beforeAll(async () => {
    // 테스트 사용자 생성
    const client = await pool.connect();
    try {
      // 테스트 비즈니스 생성
      const businessResult = await client.query(`
        INSERT INTO businesses (name, registration_number, owner_name, phone, address)
        VALUES ('테스트 카페', '123-45-67890', '홍길동', '02-1234-5678', '서울시 강남구')
        RETURNING id
      `);
      testBusinessId = businessResult.rows[0].id;

      // 테스트 사용자 생성
      const userResult = await client.query(`
        INSERT INTO users (email, password_hash, name, phone, role)
        VALUES ('test@example.com', 'hash', '테스트 사용자', '010-1234-5678', 'manager')
        RETURNING id
      `);
      testUserId = userResult.rows[0].id;

      // 사용자-비즈니스 연결
      await client.query(`
        INSERT INTO user_businesses (user_id, business_id, role)
        VALUES ($1, $2, 'manager')
      `, [testUserId, testBusinessId]);

      // 테스트용 토큰 생성
      authToken = await generateToken({
        id: testUserId,
        email: 'test@example.com',
        role: 'manager'
      });

      // 테스트 급여명세서 생성
      const statementResult = await client.query(`
        INSERT INTO pay_statements (
          business_id, user_id, year, month,
          total_work_hours, regular_work_hours,
          base_wage, hourly_wage, regular_pay,
          gross_pay, total_deductions, net_pay,
          status
        ) VALUES (
          $1, $2, 2024, 1,
          176, 160,
          3000000, 14329, 2292640,
          3302380, 432122, 2870258,
          'draft'
        ) RETURNING id
      `, [testBusinessId, testUserId]);
      testStatementId = statementResult.rows[0].id;

    } finally {
      client.release();
    }
  });

  afterAll(async () => {
    // 테스트 데이터 정리
    const client = await pool.connect();
    try {
      await client.query('DELETE FROM businesses WHERE id = $1', [testBusinessId]);
      await client.query('DELETE FROM users WHERE id = $1', [testUserId]);
    } finally {
      client.release();
      await pool.end();
    }
  });

  describe('POST /api/v1/payroll/calculate/preview', () => {
    test('급여 미리보기 계산', async () => {
      const response = await request(app)
        .post('/api/v1/payroll/calculate/preview')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          baseWage: 3000000,
          workRecords: [
            {
              check_in_time: new Date('2024-01-01T09:00:00'),
              check_out_time: new Date('2024-01-01T18:00:00')
            }
          ],
          allowances: {
            meal: 100000,
            transport: 50000
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('summary');
      expect(response.body.data.summary).toHaveProperty('grossPay');
      expect(response.body.data.summary).toHaveProperty('netPay');
    });

    test('필수 파라미터 누락시 에러', async () => {
      const response = await request(app)
        .post('/api/v1/payroll/calculate/preview')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          // baseWage 누락
          workRecords: []
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/v1/payroll/statements/:id', () => {
    test('급여명세서 개별 조회', async () => {
      const response = await request(app)
        .get(`/api/v1/payroll/statements/${testStatementId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('id', testStatementId);
      expect(response.body.data).toHaveProperty('userId', testUserId);
      expect(response.body.data).toHaveProperty('summary');
    });

    test('존재하지 않는 급여명세서 조회시 404', async () => {
      const response = await request(app)
        .get('/api/v1/payroll/statements/99999')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/v1/payroll/statements/list', () => {
    test('급여명세서 목록 조회', async () => {
      const response = await request(app)
        .get('/api/v1/payroll/statements/list')
        .set('Authorization', `Bearer ${authToken}`)
        .query({
          businessId: testBusinessId,
          year: 2024,
          page: 1,
          limit: 10
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('statements');
      expect(response.body.data).toHaveProperty('pagination');
      expect(Array.isArray(response.body.data.statements)).toBe(true);
    });

    test('페이지네이션 동작 확인', async () => {
      const response = await request(app)
        .get('/api/v1/payroll/statements/list')
        .set('Authorization', `Bearer ${authToken}`)
        .query({
          page: 1,
          limit: 5
        });

      expect(response.status).toBe(200);
      expect(response.body.data.pagination).toHaveProperty('page', 1);
      expect(response.body.data.pagination).toHaveProperty('limit', 5);
      expect(response.body.data.pagination).toHaveProperty('total');
    });
  });

  describe('GET /api/v1/payroll/pdf/:id/pdf', () => {
    test('PDF 다운로드 요청', async () => {
      const response = await request(app)
        .get(`/api/v1/payroll/pdf/${testStatementId}/pdf`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toBe('application/pdf');
      expect(response.headers['content-disposition']).toContain('attachment');
      expect(Buffer.isBuffer(response.body)).toBe(true);
    });

    test('권한 없는 PDF 접근시 403', async () => {
      // 다른 사용자 토큰 생성
      const otherToken = await generateToken({
        id: 99999,
        email: 'other@example.com',
        role: 'employee'
      });

      const response = await request(app)
        .get(`/api/v1/payroll/pdf/${testStatementId}/pdf`)
        .set('Authorization', `Bearer ${otherToken}`);

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/v1/payroll/pdf/bulk-pdf', () => {
    test('일괄 PDF 다운로드', async () => {
      const response = await request(app)
        .post('/api/v1/payroll/pdf/bulk-pdf')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          businessId: testBusinessId,
          year: 2024,
          month: 1
        });

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toBe('application/zip');
      expect(Buffer.isBuffer(response.body)).toBe(true);
    });

    test('조회 조건 없이 요청시 400', async () => {
      const response = await request(app)
        .post('/api/v1/payroll/pdf/bulk-pdf')
        .set('Authorization', `Bearer ${authToken}`)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  describe('인증 및 권한 검증', () => {
    test('인증 토큰 없이 요청시 401', async () => {
      const response = await request(app)
        .get(`/api/v1/payroll/statements/${testStatementId}`);

      expect(response.status).toBe(401);
    });

    test('잘못된 토큰으로 요청시 401', async () => {
      const response = await request(app)
        .get(`/api/v1/payroll/statements/${testStatementId}`)
        .set('Authorization', 'Bearer invalid_token');

      expect(response.status).toBe(401);
    });
  });
});