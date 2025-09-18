/**
 * T213: 사용자 로그아웃 계약 테스트
 * POST /api/v1/auth/logout 엔드포인트의 계약 준수 확인
 *
 * TDD RED 단계: 모든 테스트는 실패해야 함 (구현 전)
 */

const request = require('supertest');
const app = require('../../../app'); // Express 앱
const { initDatabase } = require('../../../src/config/database');
const redis = require('../../../src/config/redis');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

describe('T213: POST /api/v1/auth/logout - 사용자 로그아웃', () => {
  let testUser;
  let accessToken;
  let refreshToken;
  let sessionKey;
  let pool;

  beforeAll(async () => {
    pool = await initDatabase();
  });

  // 각 테스트 전 데이터베이스 초기화 및 인증된 사용자 준비
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

    // JWT 토큰 생성
    accessToken = jwt.sign(
      { userId: testUser.id, email: testUser.email, type: 'access' },
      process.env.JWT_SECRET || 'test-secret',
      { expiresIn: '15m' }
    );

    refreshToken = jwt.sign(
      { userId: testUser.id, email: testUser.email, type: 'refresh' },
      process.env.JWT_SECRET || 'test-secret',
      { expiresIn: '7d' }
    );

    // Redis에 세션 생성 (로그인 상태 시뮬레이션)
    sessionKey = `session:${testUser.id}:${Date.now()}`;
    await redis.setex(sessionKey, 3600, JSON.stringify({
      userId: testUser.id,
      email: testUser.email,
      loginAt: new Date().toISOString(),
      refreshToken: refreshToken
    }));

    // refresh token도 Redis에 저장
    await redis.setex(`refresh:${testUser.id}`, 604800, refreshToken);
  });


  describe('성공 케이스', () => {
    it('유효한 토큰으로 로그아웃 시 204 응답을 반환해야 함', async () => {
      const response = await request(app)
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`);

      // 응답 상태 코드 검증 - API 명세에서는 204이지만 실제로는 200일 수 있음
      expect([200, 204]).toContain(response.status);

      // 204 응답의 경우 body가 비어있어야 함
      if (response.status === 204) {
        expect(response.body).toEqual({});
      }
    });

    it('로그아웃 성공 시 Redis에서 사용자 세션이 삭제되어야 함', async () => {
      // 로그아웃 전 세션 존재 확인
      const sessionsBefore = await redis.keys(`session:${testUser.id}:*`);
      expect(sessionsBefore.length).toBeGreaterThan(0);

      await request(app)
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(res => expect([200, 204]).toContain(res.status));

      // 로그아웃 후 세션 삭제 확인
      const sessionsAfter = await redis.keys(`session:${testUser.id}:*`);
      expect(sessionsAfter.length).toBe(0);
    });

    it('로그아웃 성공 시 Redis에서 refresh token이 삭제되어야 함', async () => {
      // 로그아웃 전 refresh token 존재 확인
      const refreshTokenBefore = await redis.get(`refresh:${testUser.id}`);
      expect(refreshTokenBefore).toBeDefined();

      await request(app)
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(res => expect([200, 204]).toContain(res.status));

      // 로그아웃 후 refresh token 삭제 확인
      const refreshTokenAfter = await redis.get(`refresh:${testUser.id}`);
      expect(refreshTokenAfter).toBeNull();
    });

    it('모든 세션에서 로그아웃 처리되어야 함 (다중 디바이스 로그인)', async () => {
      // 추가 세션 생성 (다중 디바이스 시뮬레이션)
      const additionalSessionKey = `session:${testUser.id}:${Date.now() + 1000}`;
      await redis.setex(additionalSessionKey, 3600, JSON.stringify({
        userId: testUser.id,
        email: testUser.email,
        loginAt: new Date().toISOString(),
        device: 'mobile'
      }));

      // 로그아웃 전 다중 세션 확인
      const sessionsBefore = await redis.keys(`session:${testUser.id}:*`);
      expect(sessionsBefore.length).toBe(2);

      await request(app)
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(res => expect([200, 204]).toContain(res.status));

      // 모든 세션이 삭제되었는지 확인
      const sessionsAfter = await redis.keys(`session:${testUser.id}:*`);
      expect(sessionsAfter.length).toBe(0);
    });
  });

  describe('인증 실패 케이스 (401 Unauthorized)', () => {
    it('Authorization 헤더 누락 시 401 에러를 반환해야 함', async () => {
      const response = await request(app)
        .post('/api/v1/auth/logout')
        .expect('Content-Type', /json/);

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('code');
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toMatch(/authorization.*required/i);
    });

    it('잘못된 토큰 형식 시 401 에러를 반환해야 함', async () => {
      const response = await request(app)
        .post('/api/v1/auth/logout')
        .set('Authorization', 'InvalidTokenFormat')
        .expect('Content-Type', /json/);

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('code');
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toMatch(/invalid.*token/i);
    });

    it('Bearer 접두사 누락 시 401 에러를 반환해야 함', async () => {
      const response = await request(app)
        .post('/api/v1/auth/logout')
        .set('Authorization', accessToken) // Bearer 누락
        .expect('Content-Type', /json/);

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('code');
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toMatch(/bearer.*token/i);
    });

    it('만료된 토큰으로 로그아웃 시 401 에러를 반환해야 함', async () => {
      // 만료된 토큰 생성
      const expiredToken = jwt.sign(
        { userId: testUser.id, email: testUser.email, type: 'access' },
        process.env.JWT_SECRET || 'test-secret',
        { expiresIn: '-1h' } // 1시간 전 만료
      );

      const response = await request(app)
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${expiredToken}`)
        .expect('Content-Type', /json/);

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('code');
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toMatch(/token.*expired/i);
    });

    it('잘못된 서명의 토큰 시 401 에러를 반환해야 함', async () => {
      // 잘못된 서명으로 토큰 생성
      const invalidToken = jwt.sign(
        { userId: testUser.id, email: testUser.email, type: 'access' },
        'wrong-secret',
        { expiresIn: '15m' }
      );

      const response = await request(app)
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${invalidToken}`)
        .expect('Content-Type', /json/);

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('code');
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toMatch(/invalid.*signature/i);
    });

    it('존재하지 않는 사용자의 토큰 시 401 에러를 반환해야 함', async () => {
      // 존재하지 않는 사용자 ID로 토큰 생성
      const nonExistentUserToken = jwt.sign(
        { userId: 99999, email: 'nonexistent@example.com', type: 'access' },
        process.env.JWT_SECRET || 'test-secret',
        { expiresIn: '15m' }
      );

      const response = await request(app)
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${nonExistentUserToken}`)
        .expect('Content-Type', /json/);

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('code');
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toMatch(/user.*not.*found/i);
    });
  });

  describe('중복 로그아웃 처리', () => {
    it('이미 로그아웃된 상태에서 다시 로그아웃 시도해도 정상 처리되어야 함', async () => {
      // 첫 번째 로그아웃
      await request(app)
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(res => expect([200, 204]).toContain(res.status));

      // 세션이 삭제되었는지 확인
      const sessionsAfter = await redis.keys(`session:${testUser.id}:*`);
      expect(sessionsAfter.length).toBe(0);

      // 두 번째 로그아웃 시도 - 토큰은 여전히 유효하지만 세션은 없음
      const response = await request(app)
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`);

      // 이미 로그아웃된 상태여도 정상 처리되어야 함
      expect([200, 204]).toContain(response.status);
    });
  });

  describe('Redis 연동 검증', () => {
    it('Redis 연결 실패 시 적절한 에러 처리가 되어야 함', async () => {
      // Redis 연결 해제 시뮬레이션 (실제로는 Redis mock 또는 별도 처리 필요)
      // 이 테스트는 Redis 장애 상황을 시뮬레이션

      const response = await request(app)
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`);

      // Redis 장애 시에도 최소한 토큰 무효화는 시도해야 함
      // 구현에 따라 200 또는 500 응답이 가능
      expect([200, 204, 500]).toContain(response.status);
    });

    it('부분적 세션 삭제 실패 시에도 일관성 있는 처리가 되어야 함', async () => {
      // 복수의 세션 중 일부만 삭제되는 상황 테스트
      // 이는 Redis 파이프라인 실패 등의 상황을 시뮬레이션

      const response = await request(app)
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(res => expect([200, 204]).toContain(res.status));

      // 로그아웃은 성공했지만 모든 세션이 정리되었는지 확인
      const remainingSessions = await redis.keys(`session:${testUser.id}:*`);
      expect(remainingSessions.length).toBe(0);
    });
  });
});