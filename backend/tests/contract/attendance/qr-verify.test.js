/**
 * T254: QR 코드 검증 계약 테스트
 * POST /api/v1/attendance/qr/verify, POST /api/v1/attendance/qr/generate
 * QR 코드 생성 및 검증 API 테스트
 * TDD RED 단계: 구현 전 실패하는 테스트
 */

const request = require('supertest');
const app = require('../../../src/app');
const pool = require('../../../src/db');
const crypto = require('crypto');

describe('T254: QR 코드 검증 API', () => {
  let authToken;
  let userId;
  let businessId;
  let workLocationId;

  beforeAll(async () => {
    // 테스트용 사용자 및 사업장 생성
    const userData = {
      email: 'test.qr@dotplatform.kr',
      password: 'TestPassword123!',
      name: 'QR테스터',
      phone: '010-4567-8901'
    };

    // 사용자 등록
    const registerRes = await request(app)
      .post('/api/v1/auth/register')
      .send(userData);

    userId = registerRes.body.data.user.id;

    // 로그인하여 토큰 획득
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: userData.email, password: userData.password });

    authToken = loginRes.body.data.token;

    // 테스트용 사업장 생성
    const businessRes = await request(app)
      .post('/api/v1/business')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        name: 'QR테스트사업장',
        registration_number: '456-78-90123',
        address: '서울시 송파구 테스트동 456-78'
      });

    businessId = businessRes.body.data.id;

    // 테스트용 근무 장소 생성
    const locationRes = await request(app)
      .post('/api/v1/work-locations')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        business_id: businessId,
        name: '본사',
        address: '서울시 송파구 테스트동 456-78',
        latitude: 37.5144,  // 잠실역 좌표
        longitude: 127.1025,
        radius: 50
      });

    workLocationId = locationRes.body.data.id;
  });

  describe('POST /api/v1/attendance/qr/generate - QR 코드 생성', () => {
    it('유효한 근무 장소에 대한 QR 코드 생성 시 201 응답', async () => {
      // QR 코드 생성 요청
      const qrGenerateData = {
        work_location_id: workLocationId,
        validity_duration: 30 // 30초 유효
      };

      const response = await request(app)
        .post('/api/v1/attendance/qr/generate')
        .set('Authorization', `Bearer ${authToken}`)
        .send(qrGenerateData);

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('qr_token');
      expect(response.body.data).toHaveProperty('qr_code_url');
      expect(response.body.data).toHaveProperty('expires_at');
      expect(response.body.data).toHaveProperty('validity_duration');
      expect(response.body.data.validity_duration).toBe(30);
      expect(response.body.data.qr_token).toMatch(/^[A-Za-z0-9+/=]+$/); // Base64 패턴
    });

    it('존재하지 않는 근무 장소로 QR 코드 생성 시 404 에러', async () => {
      // 존재하지 않는 work_location_id로 QR 코드 생성 시도
      const qrGenerateData = {
        work_location_id: 99999,
        validity_duration: 30
      };

      const response = await request(app)
        .post('/api/v1/attendance/qr/generate')
        .set('Authorization', `Bearer ${authToken}`)
        .send(qrGenerateData);

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('WORK_LOCATION_NOT_FOUND');
    });

    it('권한 없는 근무 장소에 대한 QR 코드 생성 시 403 에러', async () => {
      // 다른 사용자 생성
      const otherUserData = {
        email: 'other.qr@dotplatform.kr',
        password: 'OtherPassword123!',
        name: '다른QR테스터',
        phone: '010-7777-6666'
      };

      await request(app)
        .post('/api/v1/auth/register')
        .send(otherUserData);

      const otherLoginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: otherUserData.email, password: otherUserData.password });

      const otherToken = otherLoginRes.body.data.token;

      // 다른 사용자의 토큰으로 QR 코드 생성 시도
      const qrGenerateData = {
        work_location_id: workLocationId,
        validity_duration: 30
      };

      const response = await request(app)
        .post('/api/v1/attendance/qr/generate')
        .set('Authorization', `Bearer ${otherToken}`)
        .send(qrGenerateData);

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('ACCESS_DENIED');
    });

    it('유효 기간 범위 초과 시 400 에러 (최대 300초)', async () => {
      // 300초를 초과하는 유효 기간 설정
      const qrGenerateData = {
        work_location_id: workLocationId,
        validity_duration: 500 // 500초 = 8분 20초 (초과)
      };

      const response = await request(app)
        .post('/api/v1/attendance/qr/generate')
        .set('Authorization', `Bearer ${authToken}`)
        .send(qrGenerateData);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('INVALID_VALIDITY_DURATION');
      expect(response.body.error.message).toContain('유효 기간은 10초 이상 300초 이하여야 합니다');
    });

    it('유효 기간 범위 미만 시 400 에러 (최소 10초)', async () => {
      // 10초 미만의 유효 기간 설정
      const qrGenerateData = {
        work_location_id: workLocationId,
        validity_duration: 5 // 5초 (미만)
      };

      const response = await request(app)
        .post('/api/v1/attendance/qr/generate')
        .set('Authorization', `Bearer ${authToken}`)
        .send(qrGenerateData);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('INVALID_VALIDITY_DURATION');
      expect(response.body.error.message).toContain('유효 기간은 10초 이상 300초 이하여야 합니다');
    });

    it('기본 유효 기간 30초로 QR 코드 생성', async () => {
      // validity_duration 필드 누락 시 기본값 30초
      const qrGenerateData = {
        work_location_id: workLocationId
        // validity_duration 누락
      };

      const response = await request(app)
        .post('/api/v1/attendance/qr/generate')
        .set('Authorization', `Bearer ${authToken}`)
        .send(qrGenerateData);

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.validity_duration).toBe(30); // 기본값 30초
    });
  });

  describe('POST /api/v1/attendance/qr/verify - QR 코드 검증', () => {
    let validQRToken;
    let qrTokenExpiry;

    beforeEach(async () => {
      // 각 테스트 전에 유효한 QR 토큰 생성
      const qrRes = await request(app)
        .post('/api/v1/attendance/qr/generate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          work_location_id: workLocationId,
          validity_duration: 60 // 60초 유효
        });

      validQRToken = qrRes.body.data.qr_token;
      qrTokenExpiry = qrRes.body.data.expires_at;
    });

    it('유효한 QR 토큰 검증 시 200 응답과 검증 정보', async () => {
      // 유효한 QR 토큰 검증
      const qrVerifyData = {
        qr_token: validQRToken
      };

      const response = await request(app)
        .post('/api/v1/attendance/qr/verify')
        .set('Authorization', `Bearer ${authToken}`)
        .send(qrVerifyData);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('valid');
      expect(response.body.data).toHaveProperty('work_location_id');
      expect(response.body.data).toHaveProperty('work_location_name');
      expect(response.body.data).toHaveProperty('expires_at');
      expect(response.body.data).toHaveProperty('remaining_seconds');
      expect(response.body.data.valid).toBe(true);
      expect(response.body.data.work_location_id).toBe(workLocationId);
      expect(response.body.data.remaining_seconds).toBeGreaterThan(0);
    });

    it('만료된 QR 토큰 검증 시 200 응답과 만료 상태', async () => {
      // QR 토큰 만료를 위해 60초 대기
      await new Promise(resolve => setTimeout(resolve, 61000));

      const qrVerifyData = {
        qr_token: validQRToken
      };

      const response = await request(app)
        .post('/api/v1/attendance/qr/verify')
        .set('Authorization', `Bearer ${authToken}`)
        .send(qrVerifyData);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.valid).toBe(false);
      expect(response.body.data).toHaveProperty('expiry_reason');
      expect(response.body.data.expiry_reason).toBe('TOKEN_EXPIRED');
      expect(response.body.data.remaining_seconds).toBeLessThanOrEqual(0);
    });

    it('잘못된 형식의 QR 토큰 검증 시 400 에러', async () => {
      // 잘못된 형식의 QR 토큰
      const qrVerifyData = {
        qr_token: 'invalid_token_format_123'
      };

      const response = await request(app)
        .post('/api/v1/attendance/qr/verify')
        .set('Authorization', `Bearer ${authToken}`)
        .send(qrVerifyData);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('INVALID_QR_TOKEN_FORMAT');
      expect(response.body.error.message).toContain('올바르지 않은 QR 토큰 형식입니다');
    });

    it('존재하지 않는 QR 토큰 검증 시 404 에러', async () => {
      // 존재하지 않는 QR 토큰 (올바른 형식이지만 DB에 없음)
      const fakeToken = crypto.randomBytes(32).toString('base64');

      const qrVerifyData = {
        qr_token: fakeToken
      };

      const response = await request(app)
        .post('/api/v1/attendance/qr/verify')
        .set('Authorization', `Bearer ${authToken}`)
        .send(qrVerifyData);

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('QR_TOKEN_NOT_FOUND');
    });

    it('QR 토큰 누락 시 400 에러', async () => {
      // qr_token 필드 누락
      const response = await request(app)
        .post('/api/v1/attendance/qr/verify')
        .set('Authorization', `Bearer ${authToken}`)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('MISSING_QR_TOKEN');
    });
  });

  describe('QR 코드 보안 검증', () => {
    let qrToken;

    beforeEach(async () => {
      const qrRes = await request(app)
        .post('/api/v1/attendance/qr/generate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          work_location_id: workLocationId,
          validity_duration: 30
        });

      qrToken = qrRes.body.data.qr_token;
    });

    it('QR 토큰은 암호화되어 추측 불가능해야 함', async () => {
      // 다른 QR 토큰 생성
      const qrRes2 = await request(app)
        .post('/api/v1/attendance/qr/generate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          work_location_id: workLocationId,
          validity_duration: 30
        });

      const qrToken2 = qrRes2.body.data.qr_token;

      // 두 토큰이 완전히 달라야 함
      expect(qrToken).not.toBe(qrToken2);
      expect(qrToken.length).toBeGreaterThan(20); // 충분한 길이
      expect(qrToken2.length).toBeGreaterThan(20);
    });

    it('사용된 QR 토큰은 재사용 불가능', async () => {
      // 먼저 체크인에 사용
      await request(app)
        .post('/api/v1/attendance/check-in')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          business_id: businessId,
          work_location_id: workLocationId,
          check_in_method: 'QR',
          qr_token: qrToken
        });

      // 같은 토큰으로 재검증 시도
      const response = await request(app)
        .post('/api/v1/attendance/qr/verify')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ qr_token: qrToken });

      expect(response.status).toBe(200);
      expect(response.body.data.valid).toBe(false);
      expect(response.body.data.expiry_reason).toBe('TOKEN_ALREADY_USED');
    });

    it('QR 토큰에는 타임스탬프와 위치 정보가 포함되어야 함', async () => {
      // QR 토큰 검증을 통해 정보 확인
      const response = await request(app)
        .post('/api/v1/attendance/qr/verify')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ qr_token: qrToken });

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveProperty('work_location_id');
      expect(response.body.data).toHaveProperty('expires_at');
      expect(response.body.data).toHaveProperty('generated_at');
      expect(response.body.data.work_location_id).toBe(workLocationId);
    });

    it('QR 토큰은 특정 근무 장소에서만 유효', async () => {
      // 다른 근무 장소 생성
      const otherLocationRes = await request(app)
        .post('/api/v1/work-locations')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          business_id: businessId,
          name: '지점',
          address: '서울시 강남구 다른동 789-01',
          latitude: 37.5000,
          longitude: 127.0500,
          radius: 50
        });

      const otherLocationId = otherLocationRes.body.data.id;

      // 다른 위치의 QR 토큰 생성
      const otherQRRes = await request(app)
        .post('/api/v1/attendance/qr/generate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          work_location_id: otherLocationId,
          validity_duration: 30
        });

      const otherQRToken = otherQRRes.body.data.qr_token;

      // 원래 위치에서 다른 위치의 QR 토큰 사용 시도
      const response = await request(app)
        .post('/api/v1/attendance/check-in')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          business_id: businessId,
          work_location_id: workLocationId, // 원래 위치
          check_in_method: 'QR',
          qr_token: otherQRToken // 다른 위치의 토큰
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('QR_TOKEN_LOCATION_MISMATCH');
    });
  });

  describe('QR 코드 관리 및 정리', () => {
    it('만료된 QR 토큰 자동 정리 확인', async () => {
      // QR 토큰 생성
      await request(app)
        .post('/api/v1/attendance/qr/generate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          work_location_id: workLocationId,
          validity_duration: 10 // 10초 후 만료
        });

      // 만료 후 정리 작업 실행 (실제로는 크론잡이나 스케줄러)
      await new Promise(resolve => setTimeout(resolve, 11000));

      // 정리 API 호출 (내부 관리 API)
      const cleanupResponse = await request(app)
        .post('/api/v1/attendance/qr/cleanup')
        .set('Authorization', `Bearer ${authToken}`);

      expect(cleanupResponse.status).toBe(200);
      expect(cleanupResponse.body.data).toHaveProperty('cleaned_tokens_count');
      expect(cleanupResponse.body.data.cleaned_tokens_count).toBeGreaterThan(0);
    });

    it('활성 QR 토큰 수 제한 (근무 장소당 최대 5개)', async () => {
      // 5개의 QR 토큰 생성
      for (let i = 0; i < 5; i++) {
        await request(app)
          .post('/api/v1/attendance/qr/generate')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            work_location_id: workLocationId,
            validity_duration: 60
          });
      }

      // 6번째 QR 토큰 생성 시도
      const response = await request(app)
        .post('/api/v1/attendance/qr/generate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          work_location_id: workLocationId,
          validity_duration: 60
        });

      expect(response.status).toBe(429);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('QR_TOKEN_LIMIT_EXCEEDED');
      expect(response.body.error.message).toContain('근무 장소당 최대 5개의 활성 QR 토큰만 허용됩니다');
    });
  });

  describe('인증 및 권한 검증', () => {
    it('인증 토큰 없이 QR 코드 생성 시 401 에러', async () => {
      const response = await request(app)
        .post('/api/v1/attendance/qr/generate')
        .send({
          work_location_id: workLocationId,
          validity_duration: 30
        });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });

    it('인증 토큰 없이 QR 코드 검증 시 401 에러', async () => {
      const response = await request(app)
        .post('/api/v1/attendance/qr/verify')
        .send({ qr_token: 'some_token' });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  afterAll(async () => {
    // 테스트 데이터 정리
    if (userId) {
      await pool.query('DELETE FROM qr_tokens WHERE work_location_id = ?', [workLocationId]);
      await pool.query('DELETE FROM attendance WHERE user_id = ?', [userId]);
      await pool.query('DELETE FROM work_locations WHERE business_id = ?', [businessId]);
      await pool.query('DELETE FROM businesses WHERE id = ?', [businessId]);
      await pool.query('DELETE FROM users WHERE email LIKE "%qr%"');
    }
    await pool.end();
  });
});