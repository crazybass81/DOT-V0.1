/**
 * T211: 사용자 회원가입 계약 테스트
 * POST /api/v1/auth/register 엔드포인트의 계약 준수 확인
 *
 * TDD RED 단계: 모든 테스트는 실패해야 함 (구현 전)
 */

const request = require('supertest');
const app = require('../../../app'); // Express 앱
const { initDatabase } = require('../../../src/config/database');
const redis = require('../../../src/config/redis');

describe('T211: POST /api/v1/auth/register - 사용자 회원가입', () => {
  // 각 테스트 전 데이터베이스 초기화
  let pool;

  beforeAll(async () => {
    pool = await initDatabase();
  });

  beforeEach(async () => {
    // 테스트용 테이블 정리
    await pool.query('DELETE FROM user_roles WHERE user_id IS NOT NULL');
    await pool.query('DELETE FROM users WHERE email LIKE \'%test%\'');

    // Redis 세션 정리
    await redis.flushdb();
  });

  describe('성공 케이스', () => {
    it('유효한 데이터로 회원가입 시 201 응답과 user 객체를 반환해야 함', async () => {
      // 테스트 데이터 준비
      const userData = {
        email: 'test@example.com',
        password: 'SecurePass123!',
        name: '김철수',
        phone: '010-1234-5678'
      };

      // API 요청 실행
      const response = await request(app)
        .post('/api/v1/auth/register')
        .send(userData)
        .expect('Content-Type', /json/);

      // 응답 상태 코드 검증
      expect(response.status).toBe(201);

      // 응답 구조 검증 - auth-api.yaml UserResponse 스키마 준수
      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('email', userData.email);
      expect(response.body).toHaveProperty('name', userData.name);
      expect(response.body).toHaveProperty('phone', userData.phone);
      expect(response.body).toHaveProperty('profileImageUrl');
      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('emailVerified', false);
      expect(response.body).toHaveProperty('phoneVerified', false);
      expect(response.body).toHaveProperty('createdAt');
      expect(response.body).toHaveProperty('lastLoginAt');

      // 비밀번호는 응답에 포함되지 않아야 함
      expect(response.body).not.toHaveProperty('password');

      // 데이터베이스에 사용자가 생성되었는지 확인
      const userInDb = await pool.query(
        'SELECT id, email, name, phone FROM users WHERE email = $1',
        [userData.email]
      );
      expect(userInDb.rows).toHaveLength(1);
      expect(userInDb.rows[0].email).toBe(userData.email);
    });
  });

  describe('유효성 검증 실패 케이스 (400 Bad Request)', () => {
    it('필수 필드 누락 시 400 에러를 반환해야 함', async () => {
      const incompleteData = {
        email: 'test@example.com',
        // password, name, phone 누락
      };

      const response = await request(app)
        .post('/api/v1/auth/register')
        .send(incompleteData)
        .expect('Content-Type', /json/);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('code');
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toMatch(/required/i);
    });

    it('잘못된 이메일 형식 시 400 에러를 반환해야 함', async () => {
      const invalidEmailData = {
        email: 'invalid-email-format',
        password: 'SecurePass123!',
        name: '김철수',
        phone: '010-1234-5678'
      };

      const response = await request(app)
        .post('/api/v1/auth/register')
        .send(invalidEmailData)
        .expect('Content-Type', /json/);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('code');
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toMatch(/email/i);
    });

    it('비밀번호가 8자 미만일 때 400 에러를 반환해야 함', async () => {
      const shortPasswordData = {
        email: 'test@example.com',
        password: 'short',
        name: '김철수',
        phone: '010-1234-5678'
      };

      const response = await request(app)
        .post('/api/v1/auth/register')
        .send(shortPasswordData)
        .expect('Content-Type', /json/);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('code');
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toMatch(/password.*8/i);
    });

    it('잘못된 전화번호 형식 시 400 에러를 반환해야 함', async () => {
      const invalidPhoneData = {
        email: 'test@example.com',
        password: 'SecurePass123!',
        name: '김철수',
        phone: '123-456-7890' // 010으로 시작하지 않음
      };

      const response = await request(app)
        .post('/api/v1/auth/register')
        .send(invalidPhoneData)
        .expect('Content-Type', /json/);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('code');
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toMatch(/phone/i);
    });

    it('이름이 너무 짧거나 길 때 400 에러를 반환해야 함', async () => {
      const invalidNameData = {
        email: 'test@example.com',
        password: 'SecurePass123!',
        name: '김', // 2자 미만
        phone: '010-1234-5678'
      };

      const response = await request(app)
        .post('/api/v1/auth/register')
        .send(invalidNameData)
        .expect('Content-Type', /json/);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('code');
      expect(response.body).toHaveProperty('message');
    });
  });

  describe('중복 데이터 케이스 (409 Conflict)', () => {
    beforeEach(async () => {
      // 기존 사용자 생성
      await pool.query(`
        INSERT INTO users (email, password_hash, name, phone, status, email_verified, phone_verified)
        VALUES ($1, $2, $3, $4, 'active', false, false)
      `, ['existing@example.com', 'hashed_password', '기존사용자', '010-9999-9999']);
    });

    it('중복된 이메일로 회원가입 시 409 에러를 반환해야 함', async () => {
      const duplicateEmailData = {
        email: 'existing@example.com', // 이미 존재하는 이메일
        password: 'SecurePass123!',
        name: '김철수',
        phone: '010-1234-5678'
      };

      const response = await request(app)
        .post('/api/v1/auth/register')
        .send(duplicateEmailData)
        .expect('Content-Type', /json/);

      expect(response.status).toBe(409);
      expect(response.body).toHaveProperty('code');
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toMatch(/email.*already/i);
    });

    it('중복된 전화번호로 회원가입 시 409 에러를 반환해야 함', async () => {
      const duplicatePhoneData = {
        email: 'newuser@example.com',
        password: 'SecurePass123!',
        name: '김철수',
        phone: '010-9999-9999' // 이미 존재하는 전화번호
      };

      const response = await request(app)
        .post('/api/v1/auth/register')
        .send(duplicatePhoneData)
        .expect('Content-Type', /json/);

      expect(response.status).toBe(409);
      expect(response.body).toHaveProperty('code');
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toMatch(/phone.*already/i);
    });
  });

  describe('데이터베이스 연동 검증', () => {
    it('회원가입 성공 시 비밀번호가 해싱되어 저장되어야 함', async () => {
      const userData = {
        email: 'hash-test@example.com',
        password: 'SecurePass123!',
        name: '해시테스트',
        phone: '010-1111-2222'
      };

      await request(app)
        .post('/api/v1/auth/register')
        .send(userData)
        .expect(201);

      // 데이터베이스에서 비밀번호 해시 확인
      const userInDb = await pool.query(
        'SELECT password_hash FROM users WHERE email = $1',
        [userData.email]
      );

      expect(userInDb.rows).toHaveLength(1);
      expect(userInDb.rows[0].password_hash).toBeDefined();
      expect(userInDb.rows[0].password_hash).not.toBe(userData.password); // 원본 비밀번호와 다름
      expect(userInDb.rows[0].password_hash.length).toBeGreaterThan(50); // 해시 길이 확인
    });

    it('회원가입 시 기본 상태값들이 올바르게 설정되어야 함', async () => {
      const userData = {
        email: 'status-test@example.com',
        password: 'SecurePass123!',
        name: '상태테스트',
        phone: '010-3333-4444'
      };

      await request(app)
        .post('/api/v1/auth/register')
        .send(userData)
        .expect(201);

      // 데이터베이스에서 기본값 확인
      const userInDb = await pool.query(
        'SELECT status, email_verified, phone_verified, created_at FROM users WHERE email = $1',
        [userData.email]
      );

      expect(userInDb.rows).toHaveLength(1);
      const user = userInDb.rows[0];
      expect(user.status).toBe('active');
      expect(user.email_verified).toBe(false);
      expect(user.phone_verified).toBe(false);
      expect(user.created_at).toBeDefined();
    });
  });
});