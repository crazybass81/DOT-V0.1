/**
 * T066: 토큰 갱신 컨트렉트 테스트
 * POST /api/v1/auth/refresh
 *
 * 리프레시 토큰을 사용한 액세스 토큰 갱신 테스트
 * Mock 사용 금지 - 실제 PostgreSQL과 Redis 사용
 */

const request = require('supertest');
const { Pool } = require('pg');
const redis = require('redis');
const { generateToken } = require('../../src/lib/auth-lib/token');

describe('토큰 갱신 API 컨트렉트 테스트', () => {
  let app;
  let pgPool;
  let redisClient;
  let testUserId;
  let validRefreshToken;

  beforeAll(async () => {
    // 테스트용 DB 연결
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
    await redisClient.disconnect();
  });

  beforeEach(async () => {
    // 테이블 초기화
    await pgPool.query('DELETE FROM user_roles WHERE 1=1');
    await pgPool.query('DELETE FROM users WHERE 1=1');

    // Redis 초기화
    await redisClient.flushDb();

    // 테스트 사용자 생성
    const userResult = await pgPool.query(`
      INSERT INTO users (email, password_hash, name, phone, status)
      VALUES ('refresh_test@example.com', 'hashed_password', '테스트유저', '010-1234-5678', 'active')
      RETURNING id
    `);
    testUserId = userResult.rows[0].id;

    // 역할 추가
    await pgPool.query(`
      INSERT INTO user_roles (user_id, role_type, is_active)
      VALUES ($1, 'seeker', true)
    `, [testUserId]);

    // 유효한 리프레시 토큰 생성
    validRefreshToken = await generateToken(
      { userId: testUserId, type: 'refresh' },
      null,
      '7d'
    );

    // Redis에 리프레시 토큰 저장
    await redisClient.setEx(
      `refresh_token:${testUserId}`,
      604800,
      validRefreshToken
    );
  });

  describe('POST /api/v1/auth/refresh', () => {
    it('유효한 리프레시 토큰으로 새로운 토큰 쌍을 발급받아야 함', async () => {
      const response = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: validRefreshToken })
        .expect(200);

      // 응답 검증
      expect(response.body.success).toBe(true);
      expect(response.body.accessToken).toBeDefined();
      expect(response.body.refreshToken).toBeDefined();

      // 새로운 토큰들이 기존 토큰과 다른지 확인
      expect(response.body.refreshToken).not.toBe(validRefreshToken);

      // Redis에 새 리프레시 토큰이 저장되었는지 확인
      const storedToken = await redisClient.get(`refresh_token:${testUserId}`);
      expect(storedToken).toBe(response.body.refreshToken);
    });

    it('리프레시 토큰이 없으면 400 에러를 반환해야 함', async () => {
      const response = await request(app)
        .post('/api/v1/auth/refresh')
        .send({})
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('토큰');
    });

    it('잘못된 형식의 리프레시 토큰이면 401 에러를 반환해야 함', async () => {
      const response = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: 'invalid_token_format' })
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('유효하지 않은');
    });

    it('Redis에 없는 리프레시 토큰이면 401 에러를 반환해야 함', async () => {
      // Redis에서 토큰 삭제
      await redisClient.del(`refresh_token:${testUserId}`);

      const response = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: validRefreshToken })
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('유효하지 않은');
    });

    it('만료된 리프레시 토큰이면 401 에러를 반환해야 함', async () => {
      // 만료된 토큰 생성 (음수 시간)
      const expiredToken = await generateToken(
        { userId: testUserId, type: 'refresh' },
        null,
        '-1s'
      );

      const response = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: expiredToken })
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('유효하지 않은');
    });

    it('타입이 refresh가 아닌 토큰이면 401 에러를 반환해야 함', async () => {
      // access 토큰 생성
      const accessToken = await generateToken(
        { userId: testUserId, email: 'test@example.com' },
        null,
        '15m'
      );

      const response = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: accessToken })
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('유효하지 않은');
    });

    it('비활성화된 사용자의 토큰이면 403 에러를 반환해야 함', async () => {
      // 사용자 비활성화
      await pgPool.query(
        'UPDATE users SET status = $1 WHERE id = $2',
        ['inactive', testUserId]
      );

      const response = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: validRefreshToken })
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('활성');
    });

    it('정지된 사용자의 토큰이면 403 에러를 반환해야 함', async () => {
      // 사용자 정지
      await pgPool.query(
        'UPDATE users SET status = $1 WHERE id = $2',
        ['suspended', testUserId]
      );

      const response = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: validRefreshToken })
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('활성');
    });

    it('삭제된 사용자의 토큰이면 401 에러를 반환해야 함', async () => {
      // 사용자 삭제
      await pgPool.query('DELETE FROM user_roles WHERE user_id = $1', [testUserId]);
      await pgPool.query('DELETE FROM users WHERE id = $1', [testUserId]);

      const response = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: validRefreshToken })
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('사용자');
    });

    it('동일한 토큰으로 연속 요청 시 두 번째 요청은 실패해야 함', async () => {
      // 첫 번째 요청 - 성공
      const firstResponse = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: validRefreshToken })
        .expect(200);

      expect(firstResponse.body.success).toBe(true);
      const newRefreshToken = firstResponse.body.refreshToken;

      // 두 번째 요청 - 실패 (이미 사용된 토큰)
      const secondResponse = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: validRefreshToken })
        .expect(401);

      expect(secondResponse.body.success).toBe(false);
      expect(secondResponse.body.error).toContain('유효하지 않은');

      // 새 토큰으로는 성공해야 함
      const thirdResponse = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: newRefreshToken })
        .expect(200);

      expect(thirdResponse.body.success).toBe(true);
    });
  });
});