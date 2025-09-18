/**
 * T251: POST /api/v1/attendance/check-in 계약 테스트
 * GPS 또는 QR 코드를 통한 출근 체크인 API 테스트
 * TDD RED 단계: 구현 전 실패하는 테스트
 */

const request = require('supertest');
const app = require('../../../src/app');
const pool = require('../../../src/db');

describe('T251: POST /api/v1/attendance/check-in', () => {
  let authToken;
  let userId;
  let businessId;
  let workLocationId;

  beforeAll(async () => {
    // 테스트용 사용자 및 사업장 생성
    const userData = {
      email: 'test.checkin@dotplatform.kr',
      password: 'TestPassword123!',
      name: '체크인테스터',
      phone: '010-1234-5678'
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
        name: '체크인테스트사업장',
        registration_number: '123-45-67890',
        address: '서울시 강남구 테스트동 123-45'
      });

    businessId = businessRes.body.data.id;

    // 테스트용 근무 장소 생성 (GPS 좌표 포함)
    const locationRes = await request(app)
      .post('/api/v1/work-locations')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        business_id: businessId,
        name: '본사',
        address: '서울시 강남구 테스트동 123-45',
        latitude: 37.5665,  // 서울시청 좌표
        longitude: 126.9780,
        radius: 50  // 50미터 반경
      });

    workLocationId = locationRes.body.data.id;
  });

  describe('GPS 기반 체크인', () => {
    it('GPS 50m 반경 내에서 체크인 시 201 응답과 출근 기록 생성', async () => {
      // 근무 장소 반경 내 GPS 좌표로 체크인 시도
      const checkInData = {
        business_id: businessId,
        work_location_id: workLocationId,
        check_in_method: 'GPS',
        latitude: 37.5666,  // 반경 내 좌표
        longitude: 126.9781
      };

      const response = await request(app)
        .post('/api/v1/attendance/check-in')
        .set('Authorization', `Bearer ${authToken}`)
        .send(checkInData);

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('attendance_id');
      expect(response.body.data).toHaveProperty('check_in_time');
      expect(response.body.data.check_in_method).toBe('GPS');
      expect(response.body.data.status).toBe('checked_in');
    });

    it('GPS 50m 반경 밖에서 체크인 시 400 에러와 거리 초과 메시지', async () => {
      // 근무 장소 반경 밖 GPS 좌표로 체크인 시도
      const checkInData = {
        business_id: businessId,
        work_location_id: workLocationId,
        check_in_method: 'GPS',
        latitude: 37.5700,  // 반경 밖 좌표 (약 400m 거리)
        longitude: 126.9800
      };

      const response = await request(app)
        .post('/api/v1/attendance/check-in')
        .set('Authorization', `Bearer ${authToken}`)
        .send(checkInData);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('LOCATION_OUT_OF_RANGE');
      expect(response.body.error.message).toContain('근무 장소 반경을 벗어났습니다');
    });

    it('필수 GPS 좌표 누락 시 400 에러', async () => {
      // GPS 좌표 없이 체크인 시도
      const checkInData = {
        business_id: businessId,
        work_location_id: workLocationId,
        check_in_method: 'GPS'
        // latitude, longitude 누락
      };

      const response = await request(app)
        .post('/api/v1/attendance/check-in')
        .set('Authorization', `Bearer ${authToken}`)
        .send(checkInData);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('MISSING_GPS_COORDINATES');
    });
  });

  describe('QR 코드 기반 체크인', () => {
    let validQRToken;

    beforeEach(async () => {
      // 유효한 QR 토큰 생성 (30초 만료)
      const qrRes = await request(app)
        .post('/api/v1/attendance/qr/generate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ work_location_id: workLocationId });

      validQRToken = qrRes.body.data.qr_token;
    });

    it('유효한 QR 코드로 체크인 시 201 응답과 출근 기록 생성', async () => {
      // 유효한 QR 토큰으로 체크인 시도
      const checkInData = {
        business_id: businessId,
        work_location_id: workLocationId,
        check_in_method: 'QR',
        qr_token: validQRToken
      };

      const response = await request(app)
        .post('/api/v1/attendance/check-in')
        .set('Authorization', `Bearer ${authToken}`)
        .send(checkInData);

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('attendance_id');
      expect(response.body.data).toHaveProperty('check_in_time');
      expect(response.body.data.check_in_method).toBe('QR');
      expect(response.body.data.status).toBe('checked_in');
    });

    it('만료된 QR 코드로 체크인 시 400 에러', async () => {
      // 30초 대기하여 QR 토큰 만료시킴
      await new Promise(resolve => setTimeout(resolve, 31000));

      const checkInData = {
        business_id: businessId,
        work_location_id: workLocationId,
        check_in_method: 'QR',
        qr_token: validQRToken
      };

      const response = await request(app)
        .post('/api/v1/attendance/check-in')
        .set('Authorization', `Bearer ${authToken}`)
        .send(checkInData);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('QR_TOKEN_EXPIRED');
      expect(response.body.error.message).toContain('QR 코드가 만료되었습니다');
    });

    it('잘못된 QR 토큰으로 체크인 시 400 에러', async () => {
      // 유효하지 않은 QR 토큰으로 체크인 시도
      const checkInData = {
        business_id: businessId,
        work_location_id: workLocationId,
        check_in_method: 'QR',
        qr_token: 'invalid_qr_token_12345'
      };

      const response = await request(app)
        .post('/api/v1/attendance/check-in')
        .set('Authorization', `Bearer ${authToken}`)
        .send(checkInData);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('INVALID_QR_TOKEN');
    });
  });

  describe('중복 체크인 방지', () => {
    beforeEach(async () => {
      // 이미 체크인된 상태로 만들기
      await request(app)
        .post('/api/v1/attendance/check-in')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          business_id: businessId,
          work_location_id: workLocationId,
          check_in_method: 'GPS',
          latitude: 37.5666,
          longitude: 126.9781
        });
    });

    it('이미 체크인된 상태에서 재체크인 시 409 에러', async () => {
      // 이미 체크인된 상태에서 다시 체크인 시도
      const checkInData = {
        business_id: businessId,
        work_location_id: workLocationId,
        check_in_method: 'GPS',
        latitude: 37.5666,
        longitude: 126.9781
      };

      const response = await request(app)
        .post('/api/v1/attendance/check-in')
        .set('Authorization', `Bearer ${authToken}`)
        .send(checkInData);

      expect(response.status).toBe(409);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('ALREADY_CHECKED_IN');
      expect(response.body.error.message).toContain('이미 체크인된 상태입니다');
    });
  });

  describe('인증 및 권한 검증', () => {
    it('인증 토큰 없이 체크인 시 401 에러', async () => {
      const checkInData = {
        business_id: businessId,
        work_location_id: workLocationId,
        check_in_method: 'GPS',
        latitude: 37.5666,
        longitude: 126.9781
      };

      const response = await request(app)
        .post('/api/v1/attendance/check-in')
        .send(checkInData);

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });

    it('권한 없는 사업장에 체크인 시 403 에러', async () => {
      // 다른 사용자의 사업장에 체크인 시도
      const checkInData = {
        business_id: 99999, // 존재하지 않는 사업장 ID
        work_location_id: workLocationId,
        check_in_method: 'GPS',
        latitude: 37.5666,
        longitude: 126.9781
      };

      const response = await request(app)
        .post('/api/v1/attendance/check-in')
        .set('Authorization', `Bearer ${authToken}`)
        .send(checkInData);

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('ACCESS_DENIED');
    });
  });

  afterAll(async () => {
    // 테스트 데이터 정리
    if (userId) {
      await pool.query('DELETE FROM attendance WHERE user_id = ?', [userId]);
      await pool.query('DELETE FROM work_locations WHERE business_id = ?', [businessId]);
      await pool.query('DELETE FROM businesses WHERE id = ?', [businessId]);
      await pool.query('DELETE FROM users WHERE id = ?', [userId]);
    }
    await pool.end();
  });
});