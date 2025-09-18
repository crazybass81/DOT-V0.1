/**
 * T252: POST /api/v1/attendance/check-out 계약 테스트
 * GPS 또는 QR 코드를 통한 퇴근 체크아웃 API 테스트
 * TDD RED 단계: 구현 전 실패하는 테스트
 */

const request = require('supertest');
const app = require('../../../src/app');
const pool = require('../../../src/db');

describe('T252: POST /api/v1/attendance/check-out', () => {
  let authToken;
  let userId;
  let businessId;
  let workLocationId;
  let attendanceId;

  beforeAll(async () => {
    // 테스트용 사용자 및 사업장 생성
    const userData = {
      email: 'test.checkout@dotplatform.kr',
      password: 'TestPassword123!',
      name: '체크아웃테스터',
      phone: '010-2345-6789'
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
        name: '체크아웃테스트사업장',
        registration_number: '234-56-78901',
        address: '서울시 서초구 테스트동 234-56'
      });

    businessId = businessRes.body.data.id;

    // 테스트용 근무 장소 생성
    const locationRes = await request(app)
      .post('/api/v1/work-locations')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        business_id: businessId,
        name: '본사',
        address: '서울시 서초구 테스트동 234-56',
        latitude: 37.4814,  // 강남역 좌표
        longitude: 127.0366,
        radius: 50
      });

    workLocationId = locationRes.body.data.id;
  });

  beforeEach(async () => {
    // 각 테스트 전에 체크인 상태로 만들기
    const checkInRes = await request(app)
      .post('/api/v1/attendance/check-in')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        business_id: businessId,
        work_location_id: workLocationId,
        check_in_method: 'GPS',
        latitude: 37.4815,
        longitude: 127.0367
      });

    attendanceId = checkInRes.body.data.attendance_id;
  });

  describe('GPS 기반 체크아웃', () => {
    it('GPS 50m 반경 내에서 체크아웃 시 200 응답과 근무시간 계산', async () => {
      // 1시간 후 체크아웃 시뮬레이션을 위한 시간 대기 (실제로는 DB 직접 조작)
      const checkOutData = {
        attendance_id: attendanceId,
        check_out_method: 'GPS',
        latitude: 37.4816,  // 반경 내 좌표
        longitude: 127.0368
      };

      const response = await request(app)
        .post('/api/v1/attendance/check-out')
        .set('Authorization', `Bearer ${authToken}`)
        .send(checkOutData);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('attendance_id');
      expect(response.body.data).toHaveProperty('check_out_time');
      expect(response.body.data).toHaveProperty('work_duration_minutes');
      expect(response.body.data.check_out_method).toBe('GPS');
      expect(response.body.data.status).toBe('checked_out');
      expect(response.body.data.work_duration_minutes).toBeGreaterThan(0);
    });

    it('GPS 50m 반경 밖에서 체크아웃 시 400 에러와 거리 초과 메시지', async () => {
      // 근무 장소 반경 밖 GPS 좌표로 체크아웃 시도
      const checkOutData = {
        attendance_id: attendanceId,
        check_out_method: 'GPS',
        latitude: 37.4850,  // 반경 밖 좌표 (약 400m 거리)
        longitude: 127.0400
      };

      const response = await request(app)
        .post('/api/v1/attendance/check-out')
        .set('Authorization', `Bearer ${authToken}`)
        .send(checkOutData);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('LOCATION_OUT_OF_RANGE');
      expect(response.body.error.message).toContain('근무 장소 반경을 벗어났습니다');
    });

    it('필수 GPS 좌표 누락 시 400 에러', async () => {
      // GPS 좌표 없이 체크아웃 시도
      const checkOutData = {
        attendance_id: attendanceId,
        check_out_method: 'GPS'
        // latitude, longitude 누락
      };

      const response = await request(app)
        .post('/api/v1/attendance/check-out')
        .set('Authorization', `Bearer ${authToken}`)
        .send(checkOutData);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('MISSING_GPS_COORDINATES');
    });
  });

  describe('QR 코드 기반 체크아웃', () => {
    let validQRToken;

    beforeEach(async () => {
      // 유효한 QR 토큰 생성
      const qrRes = await request(app)
        .post('/api/v1/attendance/qr/generate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ work_location_id: workLocationId });

      validQRToken = qrRes.body.data.qr_token;
    });

    it('유효한 QR 코드로 체크아웃 시 200 응답과 근무시간 계산', async () => {
      // 유효한 QR 토큰으로 체크아웃 시도
      const checkOutData = {
        attendance_id: attendanceId,
        check_out_method: 'QR',
        qr_token: validQRToken
      };

      const response = await request(app)
        .post('/api/v1/attendance/check-out')
        .set('Authorization', `Bearer ${authToken}`)
        .send(checkOutData);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('attendance_id');
      expect(response.body.data).toHaveProperty('check_out_time');
      expect(response.body.data).toHaveProperty('work_duration_minutes');
      expect(response.body.data.check_out_method).toBe('QR');
      expect(response.body.data.status).toBe('checked_out');
    });

    it('만료된 QR 코드로 체크아웃 시 400 에러', async () => {
      // 30초 대기하여 QR 토큰 만료시킴
      await new Promise(resolve => setTimeout(resolve, 31000));

      const checkOutData = {
        attendance_id: attendanceId,
        check_out_method: 'QR',
        qr_token: validQRToken
      };

      const response = await request(app)
        .post('/api/v1/attendance/check-out')
        .set('Authorization', `Bearer ${authToken}`)
        .send(checkOutData);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('QR_TOKEN_EXPIRED');
      expect(response.body.error.message).toContain('QR 코드가 만료되었습니다');
    });

    it('잘못된 QR 토큰으로 체크아웃 시 400 에러', async () => {
      // 유효하지 않은 QR 토큰으로 체크아웃 시도
      const checkOutData = {
        attendance_id: attendanceId,
        check_out_method: 'QR',
        qr_token: 'invalid_qr_token_54321'
      };

      const response = await request(app)
        .post('/api/v1/attendance/check-out')
        .set('Authorization', `Bearer ${authToken}`)
        .send(checkOutData);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('INVALID_QR_TOKEN');
    });
  });

  describe('체크아웃 상태 검증', () => {
    it('체크인하지 않은 상태에서 체크아웃 시 400 에러', async () => {
      // 이미 체크아웃된 상태로 만들기
      await request(app)
        .post('/api/v1/attendance/check-out')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          attendance_id: attendanceId,
          check_out_method: 'GPS',
          latitude: 37.4816,
          longitude: 127.0368
        });

      // 다시 체크아웃 시도
      const checkOutData = {
        attendance_id: attendanceId,
        check_out_method: 'GPS',
        latitude: 37.4816,
        longitude: 127.0368
      };

      const response = await request(app)
        .post('/api/v1/attendance/check-out')
        .set('Authorization', `Bearer ${authToken}`)
        .send(checkOutData);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('ALREADY_CHECKED_OUT');
      expect(response.body.error.message).toContain('이미 체크아웃된 상태입니다');
    });

    it('존재하지 않는 출근 기록에 체크아웃 시 404 에러', async () => {
      // 존재하지 않는 attendance_id로 체크아웃 시도
      const checkOutData = {
        attendance_id: 99999,
        check_out_method: 'GPS',
        latitude: 37.4816,
        longitude: 127.0368
      };

      const response = await request(app)
        .post('/api/v1/attendance/check-out')
        .set('Authorization', `Bearer ${authToken}`)
        .send(checkOutData);

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('ATTENDANCE_NOT_FOUND');
    });
  });

  describe('근무시간 계산 검증', () => {
    it('8시간 초과 근무시 연장근무 시간 계산', async () => {
      // DB에서 체크인 시간을 8시간 전으로 변경
      await pool.query(
        'UPDATE attendance SET check_in_time = DATE_SUB(NOW(), INTERVAL 9 HOUR) WHERE id = ?',
        [attendanceId]
      );

      const checkOutData = {
        attendance_id: attendanceId,
        check_out_method: 'GPS',
        latitude: 37.4816,
        longitude: 127.0368
      };

      const response = await request(app)
        .post('/api/v1/attendance/check-out')
        .set('Authorization', `Bearer ${authToken}`)
        .send(checkOutData);

      expect(response.status).toBe(200);
      expect(response.body.data.work_duration_minutes).toBeGreaterThan(480); // 8시간 = 480분
      expect(response.body.data).toHaveProperty('overtime_minutes');
      expect(response.body.data.overtime_minutes).toBeGreaterThan(0);
    });

    it('휴게시간 제외한 실 근무시간 계산', async () => {
      // 체크인 후 휴게시간 기록 추가
      await pool.query(
        `INSERT INTO break_records (attendance_id, break_start_time, break_end_time)
         VALUES (?, DATE_SUB(NOW(), INTERVAL 2 HOUR), DATE_SUB(NOW(), INTERVAL 1 HOUR))`,
        [attendanceId]
      );

      const checkOutData = {
        attendance_id: attendanceId,
        check_out_method: 'GPS',
        latitude: 37.4816,
        longitude: 127.0368
      };

      const response = await request(app)
        .post('/api/v1/attendance/check-out')
        .set('Authorization', `Bearer ${authToken}`)
        .send(checkOutData);

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveProperty('total_break_minutes');
      expect(response.body.data).toHaveProperty('actual_work_minutes');
      expect(response.body.data.total_break_minutes).toBe(60); // 1시간 휴게
    });
  });

  describe('인증 및 권한 검증', () => {
    it('인증 토큰 없이 체크아웃 시 401 에러', async () => {
      const checkOutData = {
        attendance_id: attendanceId,
        check_out_method: 'GPS',
        latitude: 37.4816,
        longitude: 127.0368
      };

      const response = await request(app)
        .post('/api/v1/attendance/check-out')
        .send(checkOutData);

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });

    it('다른 사용자의 출근 기록에 체크아웃 시 403 에러', async () => {
      // 다른 사용자 생성
      const otherUserData = {
        email: 'other.user@dotplatform.kr',
        password: 'OtherPassword123!',
        name: '다른사용자',
        phone: '010-9876-5432'
      };

      await request(app)
        .post('/api/v1/auth/register')
        .send(otherUserData);

      const otherLoginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: otherUserData.email, password: otherUserData.password });

      const otherToken = otherLoginRes.body.data.token;

      // 다른 사용자의 토큰으로 체크아웃 시도
      const checkOutData = {
        attendance_id: attendanceId,
        check_out_method: 'GPS',
        latitude: 37.4816,
        longitude: 127.0368
      };

      const response = await request(app)
        .post('/api/v1/attendance/check-out')
        .set('Authorization', `Bearer ${otherToken}`)
        .send(checkOutData);

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('ACCESS_DENIED');
    });
  });

  afterAll(async () => {
    // 테스트 데이터 정리
    if (userId) {
      await pool.query('DELETE FROM break_records WHERE attendance_id IN (SELECT id FROM attendance WHERE user_id = ?)', [userId]);
      await pool.query('DELETE FROM attendance WHERE user_id = ?', [userId]);
      await pool.query('DELETE FROM work_locations WHERE business_id = ?', [businessId]);
      await pool.query('DELETE FROM businesses WHERE id = ?', [businessId]);
      await pool.query('DELETE FROM users WHERE email LIKE "%test%"');
    }
    await pool.end();
  });
});