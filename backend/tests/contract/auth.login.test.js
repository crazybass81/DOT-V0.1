/**
 * @fileoverview 로그인 API 계약 테스트
 * T061: POST /api/v1/auth/login 테스트
 */

const request = require('supertest');
const { Pool } = require('pg');
const redis = require('redis');
const { hashPassword } = require('../../src/lib/auth-lib/password');

let app;
let pgPool;
let redisClient;

beforeAll(async () => {
  // PostgreSQL 연결
  pgPool = new Pool({
    host: 'localhost',
    port: 5435,
    database: 'dot_platform_test',
    user: 'postgres',
    password: 'postgres123'
  });

  // Redis 연결
  redisClient = redis.createClient({
    url: 'redis://localhost:6379'
  });
  await redisClient.connect();

  // Express 앱 초기화
  process.env.NODE_ENV = 'test';
  app = require('../../src/app');
});

afterAll(async () => {
  await pgPool.end();
  await redisClient.quit();
});

beforeEach(async () => {
  // 테스트 데이터 초기화
  await pgPool.query('DELETE FROM user_roles WHERE 1=1');
  await pgPool.query('DELETE FROM users WHERE 1=1');
  await redisClient.flushDb();
});

describe('POST /api/v1/auth/login - 로그인', () => {
  // 테스트용 사용자 생성 헬퍼
  async function createTestUser(email = 'test@example.com', password = 'Test123!@#') {
    const passwordHash = await hashPassword(password);
    const result = await pgPool.query(
      `INSERT INTO users (email, password_hash, name, phone, status, created_at, updated_at)
       VALUES ($1, $2, '테스트유저', '010-1234-5678', 'active', NOW(), NOW())
       RETURNING id`,
      [email, passwordHash]
    );

    // Seeker 역할 부여
    await pgPool.query(
      `INSERT INTO user_roles (user_id, role_type, is_active, created_at, updated_at)
       VALUES ($1, 'seeker', true, NOW(), NOW())`,
      [result.rows[0].id]
    );

    return result.rows[0].id;
  }

  describe('성공 케이스', () => {
    it('올바른 이메일과 비밀번호로 로그인 시 토큰을 반환한다', async () => {
      // Given: 사용자 생성
      await createTestUser('login@example.com', 'ValidPass123!');

      // When: 로그인 요청
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'login@example.com',
          password: 'ValidPass123!'
        })
        .expect('Content-Type', /json/)
        .expect(200);

      // Then: 응답 검증
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('user');
      expect(response.body.user).toHaveProperty('id');
      expect(response.body.user).toHaveProperty('email', 'login@example.com');
      expect(response.body.user).toHaveProperty('name');
      expect(response.body.user).not.toHaveProperty('password_hash');

      // 토큰 검증
      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('refreshToken');
      expect(response.body.accessToken).toMatch(/^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/); // JWT 형식

      // Redis에 세션 저장 확인
      const sessionKey = `session:${response.body.user.id}`;
      const session = await redisClient.get(sessionKey);
      expect(session).toBeTruthy();
    });

    it('대소문자 구분 없이 이메일로 로그인 가능하다', async () => {
      await createTestUser('test@example.com', 'Password123!');

      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'TEST@EXAMPLE.COM',  // 대문자로 입력
          password: 'Password123!'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.user.email).toBe('test@example.com');  // 저장된 소문자 형태
    });
  });

  describe('실패 케이스', () => {
    it('존재하지 않는 이메일로 로그인 시도 시 401 에러', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'AnyPass123!'
        })
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('이메일 또는 비밀번호가 올바르지 않습니다');
    });

    it('잘못된 비밀번호로 로그인 시도 시 401 에러', async () => {
      await createTestUser('test@example.com', 'CorrectPass123!');

      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'test@example.com',
          password: 'WrongPass123!'
        })
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('이메일 또는 비밀번호가 올바르지 않습니다');
    });

    it('비활성화된 계정으로 로그인 시도 시 403 에러', async () => {
      // 사용자 생성 후 비활성화
      const userId = await createTestUser('inactive@example.com', 'Password123!');
      await pgPool.query(
        'UPDATE users SET status = $1 WHERE id = $2',
        ['inactive', userId]
      );

      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'inactive@example.com',
          password: 'Password123!'
        })
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('비활성화된 계정');
    });

    it('정지된 계정으로 로그인 시도 시 403 에러', async () => {
      const userId = await createTestUser('suspended@example.com', 'Password123!');
      await pgPool.query(
        'UPDATE users SET status = $1 WHERE id = $2',
        ['suspended', userId]
      );

      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'suspended@example.com',
          password: 'Password123!'
        })
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('정지된 계정');
    });

    it('필수 필드가 누락된 경우 400 에러', async () => {
      // 이메일 누락
      let response = await request(app)
        .post('/api/v1/auth/login')
        .send({ password: 'Password123!' })
        .expect(400);
      expect(response.body.error).toContain('이메일');

      // 비밀번호 누락
      response = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'test@example.com' })
        .expect(400);
      expect(response.body.error).toContain('비밀번호');
    });

    it('이메일 형식이 잘못된 경우 400 에러', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'invalid-email',
          password: 'Password123!'
        })
        .expect(400);

      expect(response.body.error).toContain('이메일 형식');
    });
  });

  describe('보안 기능', () => {
    it('연속된 로그인 실패 시 잠시 차단된다', async () => {
      await createTestUser('bruteforce@example.com', 'RealPass123!');

      // 5번 연속 실패
      for (let i = 0; i < 5; i++) {
        await request(app)
          .post('/api/v1/auth/login')
          .send({
            email: 'bruteforce@example.com',
            password: 'WrongPass123!'
          })
          .expect(401);
      }

      // 6번째 시도는 차단
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'bruteforce@example.com',
          password: 'RealPass123!'  // 올바른 비밀번호도 차단
        })
        .expect(429);  // Too Many Requests

      expect(response.body.error).toContain('너무 많은 시도');
    });

    it('로그인 성공 시 실패 카운터가 초기화된다', async () => {
      await createTestUser('counter@example.com', 'RealPass123!');

      // 3번 실패
      for (let i = 0; i < 3; i++) {
        await request(app)
          .post('/api/v1/auth/login')
          .send({
            email: 'counter@example.com',
            password: 'WrongPass123!'
          });
      }

      // 성공
      await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'counter@example.com',
          password: 'RealPass123!'
        })
        .expect(200);

      // 실패 카운터 확인 (Redis에서)
      const failCount = await redisClient.get('login_fail:counter@example.com');
      expect(failCount).toBeNull();
    });

    it('SQL 인젝션 공격을 방어한다', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: "admin@example.com' OR '1'='1",
          password: "' OR '1'='1"
        })
        .expect(400);  // 이메일 형식 검증에서 걸림

      expect(response.body.error).toContain('이메일 형식');
    });
  });

  describe('토큰 관리', () => {
    it('액세스 토큰은 15분 유효기간을 가진다', async () => {
      await createTestUser('token@example.com', 'Password123!');

      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'token@example.com',
          password: 'Password123!'
        })
        .expect(200);

      // JWT 디코드 (헤더.페이로드.서명)
      const tokenParts = response.body.accessToken.split('.');
      const payload = JSON.parse(Buffer.from(tokenParts[1], 'base64').toString());

      const now = Math.floor(Date.now() / 1000);
      const expiresIn = payload.exp - now;

      expect(expiresIn).toBeGreaterThan(890);  // 약 15분 (900초)
      expect(expiresIn).toBeLessThan(910);
    });

    it('리프레시 토큰은 7일 유효기간을 가진다', async () => {
      await createTestUser('refresh@example.com', 'Password123!');

      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'refresh@example.com',
          password: 'Password123!'
        })
        .expect(200);

      const tokenParts = response.body.refreshToken.split('.');
      const payload = JSON.parse(Buffer.from(tokenParts[1], 'base64').toString());

      const now = Math.floor(Date.now() / 1000);
      const expiresIn = payload.exp - now;

      expect(expiresIn).toBeGreaterThan(604700);  // 약 7일 (604800초)
      expect(expiresIn).toBeLessThan(604900);
    });
  });
});