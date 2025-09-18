/**
 * @fileoverview 인증 API 계약 테스트
 * TDD 원칙에 따라 구현 전 테스트를 먼저 작성
 * Mock 사용 금지 - 실제 DB와 Redis 사용
 */

const request = require('supertest');
const { Pool } = require('pg');
const redis = require('redis');

// 테스트용 앱 인스턴스 (실제 구현 필요)
let app;
let pgPool;
let redisClient;

beforeAll(async () => {
  // PostgreSQL 연결
  pgPool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5435,
    database: process.env.DB_NAME || 'dot_platform_test',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres123'
  });

  // Redis 연결
  redisClient = redis.createClient({
    url: `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}`
  });
  await redisClient.connect();

  // Express 앱 초기화 (실제 구현 필요)
  app = require('../../src/app');
});

afterAll(async () => {
  // 연결 정리
  await pgPool.end();
  await redisClient.quit();
});

beforeEach(async () => {
  // 테스트 데이터 초기화
  await pgPool.query('DELETE FROM user_roles');
  await pgPool.query('DELETE FROM users');
  await redisClient.flushDb();
});

describe('POST /api/v1/auth/register - 회원가입', () => {
  describe('성공 케이스', () => {
    it('올바른 정보로 회원가입 시 201 응답과 사용자 정보를 반환한다', async () => {
      // Given: 유효한 회원가입 정보
      const registerData = {
        email: 'test@example.com',
        password: 'SecurePass123!',
        name: '김철수',
        phone: '010-1234-5678'
      };

      // When: 회원가입 요청
      const response = await request(app)
        .post('/api/v1/auth/register')
        .send(registerData)
        .expect('Content-Type', /json/)
        .expect(201);

      // Then: 응답 검증
      expect(response.body).toHaveProperty('user');
      expect(response.body.user).toHaveProperty('id');
      expect(response.body.user.email).toBe(registerData.email);
      expect(response.body.user.name).toBe(registerData.name);
      expect(response.body.user.phone).toBe(registerData.phone);
      expect(response.body.user).not.toHaveProperty('password');
      expect(response.body.user).not.toHaveProperty('password_hash');

      // 데이터베이스에 실제로 저장되었는지 확인
      const result = await pgPool.query(
        'SELECT * FROM users WHERE email = $1',
        [registerData.email]
      );
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].status).toBe('active');

      // Seeker 역할이 자동으로 부여되었는지 확인
      const roleResult = await pgPool.query(
        'SELECT * FROM user_roles WHERE user_id = $1',
        [result.rows[0].id]
      );
      expect(roleResult.rows).toHaveLength(1);
      expect(roleResult.rows[0].role_type).toBe('seeker');
    });

    it('한글 이름과 전화번호 형식이 올바르게 처리된다', async () => {
      const registerData = {
        email: 'korean@example.com',
        password: 'ValidPass123!',
        name: '홍길동',
        phone: '010-9876-5432'
      };

      const response = await request(app)
        .post('/api/v1/auth/register')
        .send(registerData)
        .expect(201);

      expect(response.body.user.name).toBe('홍길동');
      expect(response.body.user.phone).toBe('010-9876-5432');
    });
  });

  describe('실패 케이스', () => {
    it('이메일 중복 시 409 응답을 반환한다', async () => {
      // Given: 기존 사용자 생성
      const existingUser = {
        email: 'existing@example.com',
        password: 'ExistingPass123!',
        name: '기존사용자',
        phone: '010-1111-1111'
      };

      await request(app)
        .post('/api/v1/auth/register')
        .send(existingUser)
        .expect(201);

      // When: 같은 이메일로 다시 가입 시도
      const duplicateEmailUser = {
        email: 'existing@example.com',
        password: 'NewPass123!',
        name: '새사용자',
        phone: '010-2222-2222'
      };

      const response = await request(app)
        .post('/api/v1/auth/register')
        .send(duplicateEmailUser)
        .expect(409);

      // Then: 오류 메시지 검증
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('이미 사용 중인 이메일');
    });

    it('전화번호 중복 시 409 응답을 반환한다', async () => {
      // Given: 기존 사용자 생성
      await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'first@example.com',
          password: 'FirstPass123!',
          name: '첫번째',
          phone: '010-3333-3333'
        })
        .expect(201);

      // When: 같은 전화번호로 가입 시도
      const response = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'second@example.com',
          password: 'SecondPass123!',
          name: '두번째',
          phone: '010-3333-3333'
        })
        .expect(409);

      // Then
      expect(response.body.error).toContain('이미 사용 중인 전화번호');
    });

    it('이메일 형식이 잘못된 경우 400 응답을 반환한다', async () => {
      const invalidEmails = [
        'notanemail',
        '@example.com',
        'user@',
        'user@.com',
        'user@domain',
        'user space@example.com'
      ];

      for (const email of invalidEmails) {
        const response = await request(app)
          .post('/api/v1/auth/register')
          .send({
            email,
            password: 'ValidPass123!',
            name: '테스트',
            phone: '010-1234-5678'
          })
          .expect(400);

        expect(response.body.error).toContain('이메일 형식');
      }
    });

    it('비밀번호가 보안 요구사항을 충족하지 않으면 400 응답을 반환한다', async () => {
      const weakPasswords = [
        'short',          // 너무 짧음
        'alllowercase',   // 대문자 없음
        'ALLUPPERCASE',   // 소문자 없음
        'NoNumbers!',     // 숫자 없음
        'NoSpecial123',   // 특수문자 없음
        '12345678'        // 문자 없음
      ];

      for (const password of weakPasswords) {
        const response = await request(app)
          .post('/api/v1/auth/register')
          .send({
            email: 'test@example.com',
            password,
            name: '테스트',
            phone: '010-1234-5678'
          })
          .expect(400);

        expect(response.body.error).toContain('비밀번호');
      }
    });

    it('전화번호 형식이 잘못된 경우 400 응답을 반환한다', async () => {
      const invalidPhones = [
        '01012345678',      // 하이픈 없음
        '010-123-5678',     // 잘못된 형식
        '011-1234-5678',    // 010이 아님
        '010-12345-678',    // 잘못된 구분
        '+82-10-1234-5678'  // 국가번호 포함
      ];

      for (const phone of invalidPhones) {
        const response = await request(app)
          .post('/api/v1/auth/register')
          .send({
            email: 'test@example.com',
            password: 'ValidPass123!',
            name: '테스트',
            phone
          })
          .expect(400);

        expect(response.body.error).toContain('전화번호 형식');
      }
    });

    it('필수 필드가 누락된 경우 400 응답을 반환한다', async () => {
      // 이메일 누락
      let response = await request(app)
        .post('/api/v1/auth/register')
        .send({
          password: 'ValidPass123!',
          name: '테스트',
          phone: '010-1234-5678'
        })
        .expect(400);
      expect(response.body.error).toContain('이메일');

      // 비밀번호 누락
      response = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'test@example.com',
          name: '테스트',
          phone: '010-1234-5678'
        })
        .expect(400);
      expect(response.body.error).toContain('비밀번호');

      // 이름 누락
      response = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'test@example.com',
          password: 'ValidPass123!',
          phone: '010-1234-5678'
        })
        .expect(400);
      expect(response.body.error).toContain('이름');

      // 전화번호 누락
      response = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'test@example.com',
          password: 'ValidPass123!',
          name: '테스트'
        })
        .expect(400);
      expect(response.body.error).toContain('전화번호');
    });

    it('이름이 너무 짧거나 긴 경우 400 응답을 반환한다', async () => {
      // 너무 짧은 이름
      let response = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'test@example.com',
          password: 'ValidPass123!',
          name: '김',
          phone: '010-1234-5678'
        })
        .expect(400);
      expect(response.body.error).toContain('이름은 최소 2자');

      // 너무 긴 이름
      response = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'test@example.com',
          password: 'ValidPass123!',
          name: '김'.repeat(51),
          phone: '010-1234-5678'
        })
        .expect(400);
      expect(response.body.error).toContain('이름은 최대 50자');
    });
  });

  describe('보안 및 성능', () => {
    it('비밀번호는 해시되어 저장된다', async () => {
      const registerData = {
        email: 'security@example.com',
        password: 'PlainTextPass123!',
        name: '보안테스트',
        phone: '010-5555-5555'
      };

      await request(app)
        .post('/api/v1/auth/register')
        .send(registerData)
        .expect(201);

      // 데이터베이스에서 직접 확인
      const result = await pgPool.query(
        'SELECT password_hash FROM users WHERE email = $1',
        [registerData.email]
      );

      // 해시된 비밀번호는 원본과 다름
      expect(result.rows[0].password_hash).not.toBe(registerData.password);
      // bcrypt 해시 형식 확인
      expect(result.rows[0].password_hash).toMatch(/^\$2[aby]\$/);
    });

    it('SQL 인젝션 공격을 방어한다', async () => {
      const maliciousData = {
        email: "test@example.com'; DROP TABLE users; --",
        password: 'ValidPass123!',
        name: "김철수'; DELETE FROM users; --",
        phone: '010-1234-5678'
      };

      const response = await request(app)
        .post('/api/v1/auth/register')
        .send(maliciousData)
        .expect(400); // 유효성 검사 실패

      // 테이블이 여전히 존재하는지 확인
      const tableExists = await pgPool.query(
        "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'users')"
      );
      expect(tableExists.rows[0].exists).toBe(true);
    });

    it('동시 요청 시 중복 방지가 올바르게 작동한다', async () => {
      const registerData = {
        email: 'concurrent@example.com',
        password: 'ConcurrentPass123!',
        name: '동시테스트',
        phone: '010-7777-7777'
      };

      // 동시에 같은 이메일로 여러 요청 보내기
      const promises = Array(5).fill(null).map(() =>
        request(app)
          .post('/api/v1/auth/register')
          .send(registerData)
      );

      const responses = await Promise.all(promises);

      // 성공 응답은 하나뿐이어야 함
      const successResponses = responses.filter(r => r.status === 201);
      const conflictResponses = responses.filter(r => r.status === 409);

      expect(successResponses).toHaveLength(1);
      expect(conflictResponses).toHaveLength(4);

      // DB에는 하나의 레코드만 존재
      const result = await pgPool.query(
        'SELECT COUNT(*) FROM users WHERE email = $1',
        [registerData.email]
      );
      expect(parseInt(result.rows[0].count)).toBe(1);
    });
  });
});