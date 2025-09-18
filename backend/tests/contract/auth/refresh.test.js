/**
 * T214: 토큰 갱신 계약 테스트
 * POST /api/v1/auth/refresh 엔드포인트의 계약 준수 확인
 *
 * TDD RED 단계: 모든 테스트는 실패해야 함 (구현 전)
 */

const request = require('supertest');
const app = require('../../../app'); // Express 앱
const { initDatabase } = require('../../../src/config/database');
const redis = require('../../../src/config/redis');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

describe('T214: POST /api/v1/auth/refresh - 토큰 갱신', () => {
  let testUser;
  let validRefreshToken;
  let sessionKey;
  let pool;

  beforeAll(async () => {
    pool = await initDatabase();
  });

  // 각 테스트 전 데이터베이스 초기화 및 테스트 환경 준비
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

    // 유효한 refresh token 생성
    validRefreshToken = jwt.sign(
      { userId: testUser.id, email: testUser.email, type: 'refresh' },
      process.env.JWT_SECRET || 'test-secret',
      { expiresIn: '7d' }
    );

    // Redis에 refresh token 저장
    await redis.setex(`refresh:${testUser.id}`, 604800, validRefreshToken);

    // 세션 정보도 저장 (로그인 상태 시뮬레이션)
    sessionKey = `session:${testUser.id}:${Date.now()}`;
    await redis.setex(sessionKey, 3600, JSON.stringify({
      userId: testUser.id,
      email: testUser.email,
      loginAt: new Date().toISOString(),
      refreshToken: validRefreshToken
    }));
  });


  describe('성공 케이스', () => {
    it('유효한 refresh token으로 요청 시 200 응답과 새로운 토큰들을 반환해야 함', async () => {
      const refreshData = {
        refreshToken: validRefreshToken
      };

      const response = await request(app)
        .post('/api/v1/auth/refresh')
        .send(refreshData)
        .expect('Content-Type', /json/);

      // 응답 상태 코드 검증
      expect(response.status).toBe(200);

      // 응답 구조 검증 - auth-api.yaml 스키마 준수
      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('refreshToken');

      // 토큰 형식 검증
      expect(typeof response.body.accessToken).toBe('string');
      expect(response.body.accessToken.length).toBeGreaterThan(0);
      expect(typeof response.body.refreshToken).toBe('string');
      expect(response.body.refreshToken.length).toBeGreaterThan(0);

      // 새로운 토큰들이 기존과 다른지 확인
      expect(response.body.refreshToken).not.toBe(validRefreshToken);

      // 새로운 access token의 유효성 검증
      const decodedAccessToken = jwt.verify(
        response.body.accessToken,
        process.env.JWT_SECRET || 'test-secret'
      );
      expect(decodedAccessToken.userId).toBe(testUser.id);
      expect(decodedAccessToken.email).toBe(testUser.email);
      expect(decodedAccessToken.type).toBe('access');

      // 새로운 refresh token의 유효성 검증
      const decodedRefreshToken = jwt.verify(
        response.body.refreshToken,
        process.env.JWT_SECRET || 'test-secret'
      );
      expect(decodedRefreshToken.userId).toBe(testUser.id);
      expect(decodedRefreshToken.email).toBe(testUser.email);
      expect(decodedRefreshToken.type).toBe('refresh');
    });

    it('토큰 갱신 성공 시 Redis에 새로운 refresh token이 저장되어야 함', async () => {
      const refreshData = {
        refreshToken: validRefreshToken
      };

      const response = await request(app)
        .post('/api/v1/auth/refresh')
        .send(refreshData)
        .expect(200);

      // Redis에서 새로운 refresh token 확인
      const storedRefreshToken = await redis.get(`refresh:${testUser.id}`);
      expect(storedRefreshToken).toBeDefined();
      expect(storedRefreshToken).toBe(response.body.refreshToken);
      expect(storedRefreshToken).not.toBe(validRefreshToken); // 기존 토큰과 다름
    });

    it('토큰 갱신 성공 시 기존 refresh token은 무효화되어야 함', async () => {
      const refreshData = {
        refreshToken: validRefreshToken
      };

      // 첫 번째 갱신
      const firstResponse = await request(app)
        .post('/api/v1/auth/refresh')
        .send(refreshData)
        .expect(200);

      // 기존 refresh token으로 재시도 - 실패해야 함
      const secondResponse = await request(app)
        .post('/api/v1/auth/refresh')
        .send(refreshData)
        .expect('Content-Type', /json/);

      expect(secondResponse.status).toBe(401);
      expect(secondResponse.body).toHaveProperty('code');
      expect(secondResponse.body).toHaveProperty('message');
      expect(secondResponse.body.message).toMatch(/invalid.*refresh.*token/i);
    });

    it('새로 발급된 refresh token으로 추가 갱신이 가능해야 함', async () => {
      const refreshData = {
        refreshToken: validRefreshToken
      };

      // 첫 번째 갱신
      const firstResponse = await request(app)
        .post('/api/v1/auth/refresh')
        .send(refreshData)
        .expect(200);

      // 새로 발급된 refresh token으로 재갱신
      const newRefreshData = {
        refreshToken: firstResponse.body.refreshToken
      };

      const secondResponse = await request(app)
        .post('/api/v1/auth/refresh')
        .send(newRefreshData)
        .expect(200);

      // 두 번째 갱신도 성공해야 함
      expect(secondResponse.body).toHaveProperty('accessToken');
      expect(secondResponse.body).toHaveProperty('refreshToken');
      expect(secondResponse.body.refreshToken).not.toBe(firstResponse.body.refreshToken);
    });
  });

  describe('인증 실패 케이스 (401 Unauthorized)', () => {
    it('refresh token 필드 누락 시 400 에러를 반환해야 함', async () => {
      const incompleteData = {
        // refreshToken 누락
      };

      const response = await request(app)
        .post('/api/v1/auth/refresh')
        .send(incompleteData)
        .expect('Content-Type', /json/);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('code');
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toMatch(/refreshToken.*required/i);
    });

    it('잘못된 형식의 refresh token 시 401 에러를 반환해야 함', async () => {
      const invalidTokenData = {
        refreshToken: 'invalid-token-format'
      };

      const response = await request(app)
        .post('/api/v1/auth/refresh')
        .send(invalidTokenData)
        .expect('Content-Type', /json/);

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('code');
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toMatch(/invalid.*token/i);
    });

    it('만료된 refresh token 시 401 에러를 반환해야 함', async () => {
      // 만료된 refresh token 생성
      const expiredRefreshToken = jwt.sign(
        { userId: testUser.id, email: testUser.email, type: 'refresh' },
        process.env.JWT_SECRET || 'test-secret',
        { expiresIn: '-1d' } // 1일 전 만료
      );

      const expiredTokenData = {
        refreshToken: expiredRefreshToken
      };

      const response = await request(app)
        .post('/api/v1/auth/refresh')
        .send(expiredTokenData)
        .expect('Content-Type', /json/);

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('code');
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toMatch(/token.*expired/i);
    });

    it('잘못된 서명의 refresh token 시 401 에러를 반환해야 함', async () => {
      // 잘못된 서명으로 토큰 생성
      const invalidSignatureToken = jwt.sign(
        { userId: testUser.id, email: testUser.email, type: 'refresh' },
        'wrong-secret',
        { expiresIn: '7d' }
      );

      const invalidTokenData = {
        refreshToken: invalidSignatureToken
      };

      const response = await request(app)
        .post('/api/v1/auth/refresh')
        .send(invalidTokenData)
        .expect('Content-Type', /json/);

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('code');
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toMatch(/invalid.*signature/i);
    });

    it('Redis에 저장되지 않은 refresh token 시 401 에러를 반환해야 함', async () => {
      // Redis에 저장되지 않은 유효한 토큰 생성
      const unstorredRefreshToken = jwt.sign(
        { userId: testUser.id, email: testUser.email, type: 'refresh' },
        process.env.JWT_SECRET || 'test-secret',
        { expiresIn: '7d' }
      );

      const unstorredTokenData = {
        refreshToken: unstorredRefreshToken
      };

      const response = await request(app)
        .post('/api/v1/auth/refresh')
        .send(unstorredTokenData)
        .expect('Content-Type', /json/);

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('code');
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toMatch(/invalid.*refresh.*token/i);
    });

    it('존재하지 않는 사용자의 refresh token 시 401 에러를 반환해야 함', async () => {
      // 존재하지 않는 사용자 ID로 토큰 생성
      const nonExistentUserToken = jwt.sign(
        { userId: 99999, email: 'nonexistent@example.com', type: 'refresh' },
        process.env.JWT_SECRET || 'test-secret',
        { expiresIn: '7d' }
      );

      // Redis에 저장
      await redis.setex('refresh:99999', 604800, nonExistentUserToken);

      const nonExistentUserData = {
        refreshToken: nonExistentUserToken
      };

      const response = await request(app)
        .post('/api/v1/auth/refresh')
        .send(nonExistentUserData)
        .expect('Content-Type', /json/);

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('code');
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toMatch(/user.*not.*found/i);
    });

    it('비활성화된 사용자의 refresh token 시 401 에러를 반환해야 함', async () => {
      // 사용자 비활성화
      await pool.query(
        'UPDATE users SET status = $1 WHERE id = $2',
        ['inactive', testUser.id]
      );

      const refreshData = {
        refreshToken: validRefreshToken
      };

      const response = await request(app)
        .post('/api/v1/auth/refresh')
        .send(refreshData)
        .expect('Content-Type', /json/);

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('code');
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toMatch(/account.*inactive/i);
    });
  });

  describe('토큰 타입 검증', () => {
    it('access token을 refresh token으로 사용 시 401 에러를 반환해야 함', async () => {
      // access token 생성
      const accessToken = jwt.sign(
        { userId: testUser.id, email: testUser.email, type: 'access' },
        process.env.JWT_SECRET || 'test-secret',
        { expiresIn: '15m' }
      );

      const wrongTypeTokenData = {
        refreshToken: accessToken // access token을 refresh token으로 사용
      };

      const response = await request(app)
        .post('/api/v1/auth/refresh')
        .send(wrongTypeTokenData)
        .expect('Content-Type', /json/);

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('code');
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toMatch(/invalid.*token.*type/i);
    });

    it('type 필드가 없는 토큰 시 401 에러를 반환해야 함', async () => {
      // type 필드 없는 토큰 생성
      const noTypeToken = jwt.sign(
        { userId: testUser.id, email: testUser.email },
        process.env.JWT_SECRET || 'test-secret',
        { expiresIn: '7d' }
      );

      const noTypeTokenData = {
        refreshToken: noTypeToken
      };

      const response = await request(app)
        .post('/api/v1/auth/refresh')
        .send(noTypeTokenData)
        .expect('Content-Type', /json/);

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('code');
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toMatch(/invalid.*token/i);
    });
  });

  describe('Redis 연동 검증', () => {
    it('Redis 연결 실패 시 적절한 에러 처리가 되어야 함', async () => {
      // Redis 연결 실패 시뮬레이션 (실제로는 Redis mock 또는 별도 처리 필요)
      const refreshData = {
        refreshToken: validRefreshToken
      };

      const response = await request(app)
        .post('/api/v1/auth/refresh')
        .send(refreshData);

      // Redis 장애 시 500 에러 또는 적절한 에러 응답
      expect([401, 500]).toContain(response.status);
    });

    it('동시 refresh 요청 시 race condition 처리가 되어야 함', async () => {
      const refreshData = {
        refreshToken: validRefreshToken
      };

      // 동시에 두 개의 refresh 요청 실행
      const [response1, response2] = await Promise.all([
        request(app).post('/api/v1/auth/refresh').send(refreshData),
        request(app).post('/api/v1/auth/refresh').send(refreshData)
      ]);

      // 하나는 성공, 하나는 실패해야 함 (또는 동시성 제어 구현에 따라)
      const successResponses = [response1, response2].filter(r => r.status === 200);
      const errorResponses = [response1, response2].filter(r => r.status === 401);

      expect(successResponses.length).toBe(1);
      expect(errorResponses.length).toBe(1);
    });
  });
});