/**
 * T128: 출퇴근 상태 조회 통합 테스트
 * 실제 PostgreSQL 사용 (Mock 없음)
 */

const request = require('supertest');
const app = require('../../src/app');
const { pool } = require('../../src/config/database');
const { generateToken } = require('../../src/lib/auth-lib/token');
const { hashPassword } = require('../../src/lib/auth-lib/password');

describe('출퇴근 API 통합 테스트', () => {
  let testUser;
  let testBusiness;
  let authToken;
  let managerUser;
  let managerToken;

  beforeAll(async () => {
    // 테스트 데이터베이스 초기화
    await pool.query('DELETE FROM attendance WHERE true');
    await pool.query('DELETE FROM user_roles WHERE true');
    await pool.query('DELETE FROM users WHERE email LIKE $1', ['%@test.com']);
    await pool.query('DELETE FROM businesses WHERE name LIKE $1', ['%테스트%']);
  });

  beforeEach(async () => {
    // 테스트용 사업장 생성
    const businessResult = await pool.query(
      `INSERT INTO businesses (name, address, gps_location, gps_radius)
       VALUES ($1, $2, ST_GeogFromText($3), $4)
       RETURNING *`,
      [
        '테스트 카페',
        '서울시 강남구',
        'POINT(127.0276 37.4979)',
        50
      ]
    );
    testBusiness = businessResult.rows[0];

    // 일반 직원 생성
    const hashedPassword = await hashPassword('password123');
    const userResult = await pool.query(
      `INSERT INTO users (email, password_hash, name, phone, status)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      ['employee@test.com', hashedPassword, '테스트직원', '01012345678', 'active']
    );
    testUser = userResult.rows[0];

    // 직원 역할 할당
    await pool.query(
      `INSERT INTO user_roles (user_id, business_id, role_type, is_active)
       VALUES ($1, $2, $3, $4)`,
      [testUser.id, testBusiness.id, 'employee', true]
    );

    // 관리자 생성
    const managerResult = await pool.query(
      `INSERT INTO users (email, password_hash, name, phone, status)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      ['manager@test.com', hashedPassword, '테스트매니저', '01087654321', 'active']
    );
    managerUser = managerResult.rows[0];

    // 관리자 역할 할당
    await pool.query(
      `INSERT INTO user_roles (user_id, business_id, role_type, is_active)
       VALUES ($1, $2, $3, $4)`,
      [managerUser.id, testBusiness.id, 'manager', true]
    );

    // JWT 토큰 생성
    authToken = generateToken({
      userId: testUser.id,
      email: testUser.email,
      type: 'access'
    });

    managerToken = generateToken({
      userId: managerUser.id,
      email: managerUser.email,
      type: 'access'
    });
  });

  afterEach(async () => {
    // 테스트 데이터 정리
    await pool.query('DELETE FROM attendance WHERE business_id = $1', [testBusiness.id]);
    await pool.query('DELETE FROM user_roles WHERE business_id = $1', [testBusiness.id]);
    await pool.query('DELETE FROM users WHERE id IN ($1, $2)', [testUser.id, managerUser.id]);
    await pool.query('DELETE FROM businesses WHERE id = $1', [testBusiness.id]);
  });

  afterAll(async () => {
    await pool.end();
  });

  describe('GET /api/v1/attendance/status', () => {
    test('인증 없이 접근 시 401 응답', async () => {
      const response = await request(app)
        .get('/api/v1/attendance/status')
        .query({ businessId: testBusiness.id });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Authorization header required');
    });

    test('잘못된 토큰으로 접근 시 401 응답', async () => {
      const response = await request(app)
        .get('/api/v1/attendance/status')
        .set('Authorization', 'Bearer invalid-token')
        .query({ businessId: testBusiness.id });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid token');
    });

    test('businessId 없이 요청 시 400 응답', async () => {
      const response = await request(app)
        .get('/api/v1/attendance/status')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('businessId is required');
    });

    test('출근 기록이 없을 때 not_checked_in 상태 반환', async () => {
      const response = await request(app)
        .get('/api/v1/attendance/status')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ businessId: testBusiness.id });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('not_checked_in');
      expect(response.body.data.message).toBe('출근 기록이 없습니다.');
    });

    test('출근 기록이 있을 때 상태 반환', async () => {
      // 출근 기록 생성
      const today = new Date().toISOString().split('T')[0];
      await pool.query(
        `INSERT INTO attendance (
          user_id, business_id, date, check_in_time,
          check_in_location, check_in_method, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          testUser.id,
          testBusiness.id,
          today,
          new Date(),
          { type: 'Point', coordinates: [127.0276, 37.4979] },
          'gps',
          'checked_in'
        ]
      );

      const response = await request(app)
        .get('/api/v1/attendance/status')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ businessId: testBusiness.id });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('checked_in');
      expect(response.body.data.checkIn).toBeDefined();
      expect(response.body.data.checkIn.method).toBe('gps');
      expect(response.body.data.checkOut).toBeNull();
    });

    test('퇴근 기록이 있을 때 근무 시간 계산', async () => {
      // 출퇴근 기록 생성
      const today = new Date().toISOString().split('T')[0];
      const checkInTime = new Date();
      checkInTime.setHours(9, 0, 0, 0);
      const checkOutTime = new Date();
      checkOutTime.setHours(18, 0, 0, 0);

      await pool.query(
        `INSERT INTO attendance (
          user_id, business_id, date, check_in_time, check_out_time,
          check_in_location, check_out_location,
          check_in_method, check_out_method, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          testUser.id,
          testBusiness.id,
          today,
          checkInTime,
          checkOutTime,
          { type: 'Point', coordinates: [127.0276, 37.4979] },
          { type: 'Point', coordinates: [127.0276, 37.4979] },
          'gps',
          'gps',
          'checked_out'
        ]
      );

      const response = await request(app)
        .get('/api/v1/attendance/status')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ businessId: testBusiness.id });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('checked_out');
      expect(response.body.data.workDuration).toBe(540); // 9시간 = 540분
    });

    test('날짜 파라미터로 특정 날짜 조회', async () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const dateStr = yesterday.toISOString().split('T')[0];

      const response = await request(app)
        .get('/api/v1/attendance/status')
        .set('Authorization', `Bearer ${authToken}`)
        .query({
          businessId: testBusiness.id,
          date: dateStr
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.date).toBe(dateStr);
    });
  });

  describe('GET /api/v1/attendance/status/:userId (관리자용)', () => {
    test('일반 직원이 접근 시 403 응답', async () => {
      const response = await request(app)
        .get(`/api/v1/attendance/status/${managerUser.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .query({ businessId: testBusiness.id });

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('INSUFFICIENT_ROLE');
    });

    test('관리자가 직원 상태 조회 성공', async () => {
      const response = await request(app)
        .get(`/api/v1/attendance/status/${testUser.id}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .query({ businessId: testBusiness.id });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('not_checked_in');
    });

    test('존재하지 않는 직원 조회 시 404 응답', async () => {
      const response = await request(app)
        .get('/api/v1/attendance/status/99999')
        .set('Authorization', `Bearer ${managerToken}`)
        .query({ businessId: testBusiness.id });

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/v1/attendance/status/business/:businessId', () => {
    test('사업장 전체 직원 상태 조회', async () => {
      // 추가 직원 생성
      const hashedPassword = await hashPassword('password123');
      const employee2Result = await pool.query(
        `INSERT INTO users (email, password_hash, name, phone, status)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        ['employee2@test.com', hashedPassword, '테스트직원2', '01099998888', 'active']
      );
      const employee2 = employee2Result.rows[0];

      await pool.query(
        `INSERT INTO user_roles (user_id, business_id, role_type, is_active)
         VALUES ($1, $2, $3, $4)`,
        [employee2.id, testBusiness.id, 'employee', true]
      );

      // 한 명만 출근
      const today = new Date().toISOString().split('T')[0];
      await pool.query(
        `INSERT INTO attendance (
          user_id, business_id, date, check_in_time,
          check_in_location, check_in_method, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          testUser.id,
          testBusiness.id,
          today,
          new Date(),
          { type: 'Point', coordinates: [127.0276, 37.4979] },
          'gps',
          'checked_in'
        ]
      );

      const response = await request(app)
        .get(`/api/v1/attendance/status/business/${testBusiness.id}`)
        .set('Authorization', `Bearer ${managerToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.stats.total).toBe(3); // 직원2명 + 매니저1명
      expect(response.body.data.stats.checkedIn).toBe(1);
      expect(response.body.data.stats.notCheckedIn).toBe(2);
      expect(response.body.data.employees).toHaveLength(3);

      // 정리
      await pool.query('DELETE FROM user_roles WHERE user_id = $1', [employee2.id]);
      await pool.query('DELETE FROM users WHERE id = $1', [employee2.id]);
    });
  });

  describe('Rate Limiting', () => {
    test('API Rate Limit 적용 확인', async () => {
      // Rate limit 설정이 60/분이므로 빠르게 많은 요청
      const promises = [];
      for (let i = 0; i < 65; i++) {
        promises.push(
          request(app)
            .get('/api/v1/attendance/status')
            .set('Authorization', `Bearer ${authToken}`)
            .query({ businessId: testBusiness.id })
        );
      }

      const responses = await Promise.all(promises);

      // 처음 60개는 성공, 이후는 429
      const successCount = responses.filter(r => r.status === 200).length;
      const rateLimitCount = responses.filter(r => r.status === 429).length;

      expect(successCount).toBeLessThanOrEqual(60);
      expect(rateLimitCount).toBeGreaterThan(0);
    });
  });
});