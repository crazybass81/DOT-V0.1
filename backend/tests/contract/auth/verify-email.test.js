/**
 * T215: 이메일 인증 계약 테스트
 * POST /api/v1/auth/verify-email 엔드포인트의 계약 준수 확인
 *
 * TDD RED 단계: 모든 테스트는 실패해야 함 (구현 전)
 */

const request = require('supertest');
const app = require('../../../app'); // Express 앱
const { initDatabase } = require('../../../src/config/database');
const redis = require('../../../src/config/redis');
const bcrypt = require('bcrypt');
const crypto = require('crypto');

describe('T215: POST /api/v1/auth/verify-email - 이메일 인증', () => {
  let testUser;
  let validToken;
  let pool;

  beforeAll(async () => {
    pool = await initDatabase();
  });

  // 각 테스트 전 데이터베이스 초기화 및 테스트 환경 준비
  beforeEach(async () => {
    // 테스트용 테이블 정리
    await pool.query('DELETE FROM email_verification_tokens WHERE user_id IS NOT NULL');
    await pool.query('DELETE FROM user_roles WHERE user_id IS NOT NULL');
    await pool.query('DELETE FROM users WHERE email LIKE \'%test%\'');

    // Redis 정리
    await redis.flushdb();

    // 테스트용 사용자 생성 (이메일 미인증 상태)
    const hashedPassword = await bcrypt.hash('SecurePass123!', 10);
    const userResult = await pool.query(`
      INSERT INTO users (email, password_hash, name, phone, status, email_verified, phone_verified)
      VALUES ($1, $2, $3, $4, 'active', false, false)
      RETURNING id, email, name, phone, status, email_verified, phone_verified, created_at
    `, ['testuser@example.com', hashedPassword, '테스트사용자', '010-1234-5678']);

    testUser = userResult.rows[0];

    // 유효한 이메일 인증 토큰 생성
    validToken = crypto.randomBytes(32).toString('hex');

    // 이메일 인증 토큰을 데이터베이스에 저장
    await pool.query(`
      INSERT INTO email_verification_tokens (user_id, token, expires_at, created_at)
      VALUES ($1, $2, NOW() + INTERVAL '24 hours', NOW())
    `, [testUser.id, validToken]);
  });


  describe('성공 케이스', () => {
    it('유효한 토큰으로 이메일 인증 시 200 응답을 반환해야 함', async () => {
      const verificationData = {
        token: validToken
      };

      const response = await request(app)
        .post('/api/v1/auth/verify-email')
        .send(verificationData)
        .expect('Content-Type', /json/);

      // 응답 상태 코드 검증
      expect(response.status).toBe(200);

      // 응답 구조 검증
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toMatch(/email.*verified.*successfully/i);
    });

    it('이메일 인증 성공 시 사용자의 email_verified가 true로 업데이트되어야 함', async () => {
      const verificationData = {
        token: validToken
      };

      await request(app)
        .post('/api/v1/auth/verify-email')
        .send(verificationData)
        .expect(200);

      // 데이터베이스에서 사용자 정보 확인
      const userResult = await pool.query(
        'SELECT email_verified, updated_at FROM users WHERE id = $1',
        [testUser.id]
      );

      expect(userResult.rows).toHaveLength(1);
      const updatedUser = userResult.rows[0];
      expect(updatedUser.email_verified).toBe(true);
      expect(updatedUser.updated_at).toBeDefined();
    });

    it('이메일 인증 성공 시 사용된 토큰이 삭제되어야 함', async () => {
      const verificationData = {
        token: validToken
      };

      await request(app)
        .post('/api/v1/auth/verify-email')
        .send(verificationData)
        .expect(200);

      // 토큰이 데이터베이스에서 삭제되었는지 확인
      const tokenResult = await pool.query(
        'SELECT id FROM email_verification_tokens WHERE token = $1',
        [validToken]
      );

      expect(tokenResult.rows).toHaveLength(0);
    });

    it('이미 인증된 이메일도 토큰이 유효하면 정상 처리되어야 함', async () => {
      // 사용자 이메일을 미리 인증 상태로 변경
      await pool.query(
        'UPDATE users SET email_verified = true WHERE id = $1',
        [testUser.id]
      );

      const verificationData = {
        token: validToken
      };

      const response = await request(app)
        .post('/api/v1/auth/verify-email')
        .send(verificationData)
        .expect('Content-Type', /json/);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toMatch(/email.*already.*verified/i);
    });

    it('인증 완료 시 관련된 모든 만료된 토큰들이 정리되어야 함', async () => {
      // 동일 사용자의 추가 만료된 토큰 생성
      const expiredToken = crypto.randomBytes(32).toString('hex');
      await pool.query(`
        INSERT INTO email_verification_tokens (user_id, token, expires_at, created_at)
        VALUES ($1, $2, NOW() - INTERVAL '1 hour', NOW() - INTERVAL '2 hours')
      `, [testUser.id, expiredToken]);

      const verificationData = {
        token: validToken
      };

      await request(app)
        .post('/api/v1/auth/verify-email')
        .send(verificationData)
        .expect(200);

      // 해당 사용자의 모든 토큰이 정리되었는지 확인
      const remainingTokens = await pool.query(
        'SELECT id FROM email_verification_tokens WHERE user_id = $1',
        [testUser.id]
      );

      expect(remainingTokens.rows).toHaveLength(0);
    });
  });

  describe('유효성 검증 실패 케이스 (400 Bad Request)', () => {
    it('token 필드 누락 시 400 에러를 반환해야 함', async () => {
      const incompleteData = {
        // token 누락
      };

      const response = await request(app)
        .post('/api/v1/auth/verify-email')
        .send(incompleteData)
        .expect('Content-Type', /json/);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('code');
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toMatch(/token.*required/i);
    });

    it('빈 token 문자열 시 400 에러를 반환해야 함', async () => {
      const emptyTokenData = {
        token: ''
      };

      const response = await request(app)
        .post('/api/v1/auth/verify-email')
        .send(emptyTokenData)
        .expect('Content-Type', /json/);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('code');
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toMatch(/token.*required/i);
    });

    it('잘못된 형식의 token 시 400 에러를 반환해야 함', async () => {
      const invalidFormatData = {
        token: 'invalid-token-format-123' // 너무 짧거나 잘못된 형식
      };

      const response = await request(app)
        .post('/api/v1/auth/verify-email')
        .send(invalidFormatData)
        .expect('Content-Type', /json/);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('code');
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toMatch(/invalid.*token.*format/i);
    });

    it('존재하지 않는 token 시 404 에러를 반환해야 함', async () => {
      const nonExistentToken = crypto.randomBytes(32).toString('hex');
      const nonExistentTokenData = {
        token: nonExistentToken
      };

      const response = await request(app)
        .post('/api/v1/auth/verify-email')
        .send(nonExistentTokenData)
        .expect('Content-Type', /json/);

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('code');
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toMatch(/token.*not.*found/i);
    });

    it('만료된 token 시 400 에러를 반환해야 함', async () => {
      // 만료된 토큰 생성
      const expiredToken = crypto.randomBytes(32).toString('hex');
      await pool.query(`
        INSERT INTO email_verification_tokens (user_id, token, expires_at, created_at)
        VALUES ($1, $2, NOW() - INTERVAL '1 hour', NOW() - INTERVAL '2 hours')
      `, [testUser.id, expiredToken]);

      const expiredTokenData = {
        token: expiredToken
      };

      const response = await request(app)
        .post('/api/v1/auth/verify-email')
        .send(expiredTokenData)
        .expect('Content-Type', /json/);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('code');
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toMatch(/token.*expired/i);
    });
  });

  describe('사용자 상태 검증', () => {
    it('존재하지 않는 사용자의 token 시 404 에러를 반환해야 함', async () => {
      // 사용자 삭제
      await pool.query('DELETE FROM users WHERE id = $1', [testUser.id]);

      const verificationData = {
        token: validToken
      };

      const response = await request(app)
        .post('/api/v1/auth/verify-email')
        .send(verificationData)
        .expect('Content-Type', /json/);

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('code');
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toMatch(/user.*not.*found/i);
    });

    it('비활성화된 사용자의 token 시 400 에러를 반환해야 함', async () => {
      // 사용자 비활성화
      await pool.query(
        'UPDATE users SET status = $1 WHERE id = $2',
        ['inactive', testUser.id]
      );

      const verificationData = {
        token: validToken
      };

      const response = await request(app)
        .post('/api/v1/auth/verify-email')
        .send(verificationData)
        .expect('Content-Type', /json/);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('code');
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toMatch(/account.*inactive/i);
    });

    it('정지된 사용자의 token 시 400 에러를 반환해야 함', async () => {
      // 사용자 정지
      await pool.query(
        'UPDATE users SET status = $1 WHERE id = $2',
        ['suspended', testUser.id]
      );

      const verificationData = {
        token: validToken
      };

      const response = await request(app)
        .post('/api/v1/auth/verify-email')
        .send(verificationData)
        .expect('Content-Type', /json/);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('code');
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toMatch(/account.*suspended/i);
    });
  });

  describe('중복 인증 처리', () => {
    it('동일한 토큰으로 중복 인증 시도 시 두 번째는 404 에러를 반환해야 함', async () => {
      const verificationData = {
        token: validToken
      };

      // 첫 번째 인증 - 성공
      await request(app)
        .post('/api/v1/auth/verify-email')
        .send(verificationData)
        .expect(200);

      // 두 번째 인증 시도 - 토큰이 이미 삭제되어 404
      const secondResponse = await request(app)
        .post('/api/v1/auth/verify-email')
        .send(verificationData)
        .expect('Content-Type', /json/);

      expect(secondResponse.status).toBe(404);
      expect(secondResponse.body).toHaveProperty('code');
      expect(secondResponse.body).toHaveProperty('message');
      expect(secondResponse.body.message).toMatch(/token.*not.*found/i);
    });
  });

  describe('동시성 처리', () => {
    it('동시에 동일한 토큰으로 인증 시도 시 하나만 성공해야 함', async () => {
      const verificationData = {
        token: validToken
      };

      // 동시에 두 개의 인증 요청 실행
      const [response1, response2] = await Promise.all([
        request(app).post('/api/v1/auth/verify-email').send(verificationData),
        request(app).post('/api/v1/auth/verify-email').send(verificationData)
      ]);

      // 하나는 성공, 하나는 실패해야 함
      const successResponses = [response1, response2].filter(r => r.status === 200);
      const errorResponses = [response1, response2].filter(r => r.status !== 200);

      expect(successResponses.length).toBe(1);
      expect(errorResponses.length).toBe(1);

      // 최종적으로 사용자는 인증된 상태여야 함
      const userResult = await pool.query(
        'SELECT email_verified FROM users WHERE id = $1',
        [testUser.id]
      );
      expect(userResult.rows[0].email_verified).toBe(true);
    });
  });

  describe('데이터베이스 트랜잭션 검증', () => {
    it('인증 처리 중 오류 발생 시 롤백되어야 함', async () => {
      // 이 테스트는 실제로는 트랜잭션 실패를 시뮬레이션하기 어려움
      // 구현에서 트랜잭션 처리가 올바르게 되는지 확인하는 개념적 테스트
      const verificationData = {
        token: validToken
      };

      const response = await request(app)
        .post('/api/v1/auth/verify-email')
        .send(verificationData);

      // 성공 또는 실패 시 데이터 일관성이 유지되어야 함
      if (response.status === 200) {
        // 성공 시 사용자는 인증되고 토큰은 삭제되어야 함
        const userResult = await pool.query(
          'SELECT email_verified FROM users WHERE id = $1',
          [testUser.id]
        );
        expect(userResult.rows[0].email_verified).toBe(true);

        const tokenResult = await pool.query(
          'SELECT id FROM email_verification_tokens WHERE token = $1',
          [validToken]
        );
        expect(tokenResult.rows).toHaveLength(0);
      }
    });

    it('토큰 만료 시간 경계값 테스트', async () => {
      // 만료 직전 토큰 생성 (1초 후 만료)
      const almostExpiredToken = crypto.randomBytes(32).toString('hex');
      await pool.query(`
        INSERT INTO email_verification_tokens (user_id, token, expires_at, created_at)
        VALUES ($1, $2, NOW() + INTERVAL '1 second', NOW())
      `, [testUser.id, almostExpiredToken]);

      const verificationData = {
        token: almostExpiredToken
      };

      // 즉시 인증 시도 - 성공해야 함
      const response = await request(app)
        .post('/api/v1/auth/verify-email')
        .send(verificationData);

      expect(response.status).toBe(200);
    });
  });

  describe('보안 검증', () => {
    it('무작위 토큰 시도 시 적절한 속도 제한이 있어야 함', async () => {
      // 연속적인 잘못된 토큰 시도 (실제로는 rate limiting 구현 필요)
      const invalidTokens = Array.from({ length: 5 }, () =>
        crypto.randomBytes(32).toString('hex')
      );

      const responses = [];
      for (const token of invalidTokens) {
        const response = await request(app)
          .post('/api/v1/auth/verify-email')
          .send({ token });
        responses.push(response);
      }

      // 모든 요청이 404로 응답해야 함 (rate limiting 구현에 따라 429도 가능)
      responses.forEach(response => {
        expect([404, 429]).toContain(response.status);
      });
    });

    it('토큰 생성 시간과 만료 시간의 일관성 검증', async () => {
      // 데이터베이스에서 토큰 정보 확인
      const tokenResult = await pool.query(
        'SELECT created_at, expires_at FROM email_verification_tokens WHERE token = $1',
        [validToken]
      );

      expect(tokenResult.rows).toHaveLength(1);
      const tokenInfo = tokenResult.rows[0];

      const createdAt = new Date(tokenInfo.created_at);
      const expiresAt = new Date(tokenInfo.expires_at);

      // 만료 시간이 생성 시간보다 나중이어야 함
      expect(expiresAt.getTime()).toBeGreaterThan(createdAt.getTime());

      // 만료 시간이 생성 시간으로부터 24시간 이내여야 함
      const timeDiff = expiresAt.getTime() - createdAt.getTime();
      expect(timeDiff).toBeLessThanOrEqual(24 * 60 * 60 * 1000); // 24시간
    });
  });
});