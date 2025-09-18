/**
 * T212: 사용자 로그인 계약 테스트
 * POST /api/v1/auth/login 엔드포인트의 계약 준수 확인
 *
 * TDD RED 단계: 모든 테스트는 실패해야 함 (구현 전)
 */

const request = require('supertest');
const app = require('../../../app'); // Express 앱
const { initDatabase } = require('../../../src/config/database');
const redis = require('../../../src/config/redis');
const bcrypt = require('bcrypt');

describe('T212: POST /api/v1/auth/login - 사용자 로그인', () => {
  let testUser;
  let pool;

  beforeAll(async () => {
    pool = await initDatabase();
  });

  // 각 테스트 전 데이터베이스 초기화 및 테스트 사용자 생성
  beforeEach(async () => {
    // 테스트용 테이블 정리
    await pool.query('DELETE FROM user_roles WHERE user_id IS NOT NULL');
    await pool.query('DELETE FROM users WHERE email LIKE \'%test%\'');

    // Redis 세션 정리
    await redis.flushdb();

    // 테스트용 사용자 생성
    const hashedPassword = await bcrypt.hash('SecurePass123!', 10);
    const userResult = await pool.query(`
      INSERT INTO users (email, password_hash, name, phone, status, email_verified, phone_verified)
      VALUES ($1, $2, $3, $4, 'active', true, true)
      RETURNING id, email, name, phone, status, email_verified, phone_verified, created_at
    `, ['testuser@example.com', hashedPassword, '테스트사용자', '010-1234-5678']);

    testUser = userResult.rows[0];

    // 테스트 사용자 역할 생성
    await pool.query(`
      INSERT INTO user_roles (user_id, role_type, business_id, business_name, is_active, permissions, valid_from)
      VALUES ($1, 'seeker', NULL, NULL, true, $2, NOW())
    `, [testUser.id, JSON.stringify(['profile:read', 'job:search'])]);
  });


  describe('성공 케이스', () => {
    it('유효한 이메일과 비밀번호로 로그인 시 200 응답과 토큰을 반환해야 함', async () => {
      const loginData = {
        email: 'testuser@example.com',
        password: 'SecurePass123!'
      };

      const response = await request(app)
        .post('/api/v1/auth/login')
        .send(loginData)
        .expect('Content-Type', /json/);

      // 응답 상태 코드 검증
      expect(response.status).toBe(200);

      // 응답 구조 검증 - auth-api.yaml 스키마 준수
      expect(response.body).toHaveProperty('user');
      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('refreshToken');
      expect(response.body).toHaveProperty('roles');

      // 사용자 정보 검증
      const { user } = response.body;
      expect(user).toHaveProperty('id', testUser.id);
      expect(user).toHaveProperty('email', testUser.email);
      expect(user).toHaveProperty('name', testUser.name);
      expect(user).toHaveProperty('phone', testUser.phone);
      expect(user).toHaveProperty('status', 'active');
      expect(user).toHaveProperty('emailVerified', true);
      expect(user).toHaveProperty('phoneVerified', true);
      expect(user).not.toHaveProperty('password');
      expect(user).not.toHaveProperty('password_hash');

      // 토큰 형식 검증
      expect(typeof response.body.accessToken).toBe('string');
      expect(response.body.accessToken.length).toBeGreaterThan(0);
      expect(typeof response.body.refreshToken).toBe('string');
      expect(response.body.refreshToken.length).toBeGreaterThan(0);

      // 역할 정보 검증
      expect(Array.isArray(response.body.roles)).toBe(true);
      expect(response.body.roles.length).toBeGreaterThan(0);
      expect(response.body.roles[0]).toHaveProperty('roleType', 'seeker');
      expect(response.body.roles[0]).toHaveProperty('isActive', true);
      expect(response.body.roles[0]).toHaveProperty('permissions');
    });

    it('로그인 성공 시 Redis에 세션이 저장되어야 함', async () => {
      const loginData = {
        email: 'testuser@example.com',
        password: 'SecurePass123!'
      };

      const response = await request(app)
        .post('/api/v1/auth/login')
        .send(loginData)
        .expect(200);

      // Redis에서 사용자 세션 확인
      const sessionKeys = await redis.keys(`session:${testUser.id}:*`);
      expect(sessionKeys.length).toBeGreaterThan(0);

      // 세션 데이터 확인
      const sessionData = await redis.get(sessionKeys[0]);
      expect(sessionData).toBeDefined();

      const session = JSON.parse(sessionData);
      expect(session).toHaveProperty('userId', testUser.id);
      expect(session).toHaveProperty('email', testUser.email);
    });

    it('로그인 성공 시 데이터베이스에 lastLoginAt이 업데이트되어야 함', async () => {
      const loginData = {
        email: 'testuser@example.com',
        password: 'SecurePass123!'
      };

      const beforeLogin = new Date();

      await request(app)
        .post('/api/v1/auth/login')
        .send(loginData)
        .expect(200);

      // 데이터베이스에서 lastLoginAt 확인
      const userResult = await pool.query(
        'SELECT last_login_at FROM users WHERE id = $1',
        [testUser.id]
      );

      expect(userResult.rows).toHaveLength(1);
      const lastLoginAt = new Date(userResult.rows[0].last_login_at);
      expect(lastLoginAt).toBeInstanceOf(Date);
      expect(lastLoginAt.getTime()).toBeGreaterThanOrEqual(beforeLogin.getTime());
    });
  });

  describe('인증 실패 케이스 (401 Unauthorized)', () => {
    it('존재하지 않는 이메일로 로그인 시 401 에러를 반환해야 함', async () => {
      const invalidEmailData = {
        email: 'nonexistent@example.com',
        password: 'SecurePass123!'
      };

      const response = await request(app)
        .post('/api/v1/auth/login')
        .send(invalidEmailData)
        .expect('Content-Type', /json/);

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('code');
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toMatch(/invalid.*credentials/i);
    });

    it('잘못된 비밀번호로 로그인 시 401 에러를 반환해야 함', async () => {
      const wrongPasswordData = {
        email: 'testuser@example.com',
        password: 'WrongPassword123!'
      };

      const response = await request(app)
        .post('/api/v1/auth/login')
        .send(wrongPasswordData)
        .expect('Content-Type', /json/);

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('code');
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toMatch(/invalid.*credentials/i);
    });

    it('비활성화된 사용자로 로그인 시 401 에러를 반환해야 함', async () => {
      // 사용자 비활성화
      await pool.query(
        'UPDATE users SET status = $1 WHERE id = $2',
        ['inactive', testUser.id]
      );

      const loginData = {
        email: 'testuser@example.com',
        password: 'SecurePass123!'
      };

      const response = await request(app)
        .post('/api/v1/auth/login')
        .send(loginData)
        .expect('Content-Type', /json/);

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('code');
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toMatch(/account.*inactive/i);
    });

    it('정지된 사용자로 로그인 시 401 에러를 반환해야 함', async () => {
      // 사용자 정지
      await pool.query(
        'UPDATE users SET status = $1 WHERE id = $2',
        ['suspended', testUser.id]
      );

      const loginData = {
        email: 'testuser@example.com',
        password: 'SecurePass123!'
      };

      const response = await request(app)
        .post('/api/v1/auth/login')
        .send(loginData)
        .expect('Content-Type', /json/);

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('code');
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toMatch(/account.*suspended/i);
    });
  });

  describe('유효성 검증 실패 케이스 (400 Bad Request)', () => {
    it('이메일 필드 누락 시 400 에러를 반환해야 함', async () => {
      const incompleteData = {
        // email 누락
        password: 'SecurePass123!'
      };

      const response = await request(app)
        .post('/api/v1/auth/login')
        .send(incompleteData)
        .expect('Content-Type', /json/);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('code');
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toMatch(/email.*required/i);
    });

    it('비밀번호 필드 누락 시 400 에러를 반환해야 함', async () => {
      const incompleteData = {
        email: 'testuser@example.com'
        // password 누락
      };

      const response = await request(app)
        .post('/api/v1/auth/login')
        .send(incompleteData)
        .expect('Content-Type', /json/);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('code');
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toMatch(/password.*required/i);
    });

    it('잘못된 이메일 형식 시 400 에러를 반환해야 함', async () => {
      const invalidEmailData = {
        email: 'invalid-email-format',
        password: 'SecurePass123!'
      };

      const response = await request(app)
        .post('/api/v1/auth/login')
        .send(invalidEmailData)
        .expect('Content-Type', /json/);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('code');
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toMatch(/email.*format/i);
    });

    it('빈 문자열 입력 시 400 에러를 반환해야 함', async () => {
      const emptyData = {
        email: '',
        password: ''
      };

      const response = await request(app)
        .post('/api/v1/auth/login')
        .send(emptyData)
        .expect('Content-Type', /json/);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('code');
      expect(response.body).toHaveProperty('message');
    });
  });

  describe('보안 검증', () => {
    it('로그인 실패 시 Redis에 세션이 생성되지 않아야 함', async () => {
      const wrongPasswordData = {
        email: 'testuser@example.com',
        password: 'WrongPassword123!'
      };

      await request(app)
        .post('/api/v1/auth/login')
        .send(wrongPasswordData)
        .expect(401);

      // Redis에서 세션 확인 - 없어야 함
      const sessionKeys = await redis.keys(`session:${testUser.id}:*`);
      expect(sessionKeys.length).toBe(0);
    });

    it('로그인 실패 시 lastLoginAt이 업데이트되지 않아야 함', async () => {
      const originalLastLogin = testUser.last_login_at;

      const wrongPasswordData = {
        email: 'testuser@example.com',
        password: 'WrongPassword123!'
      };

      await request(app)
        .post('/api/v1/auth/login')
        .send(wrongPasswordData)
        .expect(401);

      // 데이터베이스에서 lastLoginAt 확인 - 변경되지 않아야 함
      const userResult = await pool.query(
        'SELECT last_login_at FROM users WHERE id = $1',
        [testUser.id]
      );

      expect(userResult.rows[0].last_login_at).toEqual(originalLastLogin);
    });
  });
});