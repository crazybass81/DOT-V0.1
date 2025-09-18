/**
 * T253: 휴게시간 관리 계약 테스트
 * POST /api/v1/attendance/break/start, POST /api/v1/attendance/break/end
 * 휴게시간 시작/종료 API 테스트
 * TDD RED 단계: 구현 전 실패하는 테스트
 */

const request = require('supertest');
const app = require('../../../src/app');
const pool = require('../../../src/db');

describe('T253: 휴게시간 관리 API', () => {
  let authToken;
  let userId;
  let businessId;
  let workLocationId;
  let attendanceId;

  beforeAll(async () => {
    // 테스트용 사용자 및 사업장 생성
    const userData = {
      email: 'test.break@dotplatform.kr',
      password: 'TestPassword123!',
      name: '휴게시간테스터',
      phone: '010-3456-7890'
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
        name: '휴게시간테스트사업장',
        registration_number: '345-67-89012',
        address: '서울시 마포구 테스트동 345-67'
      });

    businessId = businessRes.body.data.id;

    // 테스트용 근무 장소 생성
    const locationRes = await request(app)
      .post('/api/v1/work-locations')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        business_id: businessId,
        name: '본사',
        address: '서울시 마포구 테스트동 345-67',
        latitude: 37.5547,  // 홍대입구역 좌표
        longitude: 126.9220,
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
        latitude: 37.5548,
        longitude: 126.9221
      });

    attendanceId = checkInRes.body.data.attendance_id;
  });

  describe('POST /api/v1/attendance/break/start - 휴게시간 시작', () => {
    it('체크인 상태에서 휴게시간 시작 시 201 응답과 휴게 기록 생성', async () => {
      // 휴게시간 시작
      const breakStartData = {
        attendance_id: attendanceId,
        break_type: 'lunch' // 점심휴게
      };

      const response = await request(app)
        .post('/api/v1/attendance/break/start')
        .set('Authorization', `Bearer ${authToken}`)
        .send(breakStartData);

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('break_record_id');
      expect(response.body.data).toHaveProperty('break_start_time');
      expect(response.body.data.break_type).toBe('lunch');
      expect(response.body.data.status).toBe('on_break');
    });

    it('이미 휴게 중인 상태에서 휴게시간 시작 시 409 에러', async () => {
      // 먼저 휴게시간 시작
      await request(app)
        .post('/api/v1/attendance/break/start')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          attendance_id: attendanceId,
          break_type: 'lunch'
        });

      // 다시 휴게시간 시작 시도
      const response = await request(app)
        .post('/api/v1/attendance/break/start')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          attendance_id: attendanceId,
          break_type: 'coffee'
        });

      expect(response.status).toBe(409);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('ALREADY_ON_BREAK');
      expect(response.body.error.message).toContain('이미 휴게 중입니다');
    });

    it('체크인하지 않은 상태에서 휴게시간 시작 시 400 에러', async () => {
      // 존재하지 않는 attendance_id로 휴게시간 시작 시도
      const response = await request(app)
        .post('/api/v1/attendance/break/start')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          attendance_id: 99999,
          break_type: 'lunch'
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('INVALID_ATTENDANCE_STATE');
      expect(response.body.error.message).toContain('유효하지 않은 출근 상태입니다');
    });

    it('휴게 유형 누락 시 400 에러', async () => {
      // break_type 필드 누락
      const response = await request(app)
        .post('/api/v1/attendance/break/start')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          attendance_id: attendanceId
          // break_type 누락
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('MISSING_BREAK_TYPE');
    });

    it('잘못된 휴게 유형 사용 시 400 에러', async () => {
      // 지원하지 않는 break_type
      const response = await request(app)
        .post('/api/v1/attendance/break/start')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          attendance_id: attendanceId,
          break_type: 'invalid_break_type'
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('INVALID_BREAK_TYPE');
      expect(response.body.error.message).toContain('지원하지 않는 휴게 유형입니다');
    });
  });

  describe('POST /api/v1/attendance/break/end - 휴게시간 종료', () => {
    let breakRecordId;

    beforeEach(async () => {
      // 각 테스트 전에 휴게시간 시작
      const breakStartRes = await request(app)
        .post('/api/v1/attendance/break/start')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          attendance_id: attendanceId,
          break_type: 'lunch'
        });

      breakRecordId = breakStartRes.body.data.break_record_id;
    });

    it('휴게 중인 상태에서 휴게시간 종료 시 200 응답과 휴게시간 계산', async () => {
      // 휴게시간 종료
      const breakEndData = {
        break_record_id: breakRecordId
      };

      const response = await request(app)
        .post('/api/v1/attendance/break/end')
        .set('Authorization', `Bearer ${authToken}`)
        .send(breakEndData);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('break_record_id');
      expect(response.body.data).toHaveProperty('break_end_time');
      expect(response.body.data).toHaveProperty('break_duration_minutes');
      expect(response.body.data.status).toBe('working');
      expect(response.body.data.break_duration_minutes).toBeGreaterThan(0);
    });

    it('휴게 중이 아닌 상태에서 휴게시간 종료 시 400 에러', async () => {
      // 먼저 휴게시간 종료
      await request(app)
        .post('/api/v1/attendance/break/end')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ break_record_id: breakRecordId });

      // 다시 휴게시간 종료 시도
      const response = await request(app)
        .post('/api/v1/attendance/break/end')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ break_record_id: breakRecordId });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('NOT_ON_BREAK');
      expect(response.body.error.message).toContain('휴게 중이 아닙니다');
    });

    it('존재하지 않는 휴게 기록으로 종료 시 404 에러', async () => {
      // 존재하지 않는 break_record_id로 종료 시도
      const response = await request(app)
        .post('/api/v1/attendance/break/end')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ break_record_id: 99999 });

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('BREAK_RECORD_NOT_FOUND');
    });

    it('다른 사용자의 휴게 기록 종료 시 403 에러', async () => {
      // 다른 사용자 생성
      const otherUserData = {
        email: 'other.break@dotplatform.kr',
        password: 'OtherPassword123!',
        name: '다른휴게테스터',
        phone: '010-9999-8888'
      };

      await request(app)
        .post('/api/v1/auth/register')
        .send(otherUserData);

      const otherLoginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: otherUserData.email, password: otherUserData.password });

      const otherToken = otherLoginRes.body.data.token;

      // 다른 사용자의 토큰으로 휴게시간 종료 시도
      const response = await request(app)
        .post('/api/v1/attendance/break/end')
        .set('Authorization', `Bearer ${otherToken}`)
        .send({ break_record_id: breakRecordId });

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('ACCESS_DENIED');
    });
  });

  describe('휴게시간 제한 및 규칙 검증', () => {
    it('하루 최대 휴게시간 초과 시 400 에러 (예: 3시간)', async () => {
      // 이미 3시간의 휴게시간이 있는 상태로 DB 설정
      await pool.query(
        `INSERT INTO break_records (attendance_id, break_type, break_start_time, break_end_time, break_duration_minutes)
         VALUES (?, 'lunch', DATE_SUB(NOW(), INTERVAL 4 HOUR), DATE_SUB(NOW(), INTERVAL 1 HOUR), 180)`,
        [attendanceId]
      );

      // 추가 휴게시간 시작 시도
      const response = await request(app)
        .post('/api/v1/attendance/break/start')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          attendance_id: attendanceId,
          break_type: 'coffee'
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('DAILY_BREAK_LIMIT_EXCEEDED');
      expect(response.body.error.message).toContain('일일 최대 휴게시간을 초과했습니다');
    });

    it('점심휴게는 하루 1회만 허용', async () => {
      // 이미 점심휴게 기록이 있는 상태로 DB 설정
      await pool.query(
        `INSERT INTO break_records (attendance_id, break_type, break_start_time, break_end_time, break_duration_minutes)
         VALUES (?, 'lunch', DATE_SUB(NOW(), INTERVAL 2 HOUR), DATE_SUB(NOW(), INTERVAL 1 HOUR), 60)`,
        [attendanceId]
      );

      // 다시 점심휴게 시작 시도
      const response = await request(app)
        .post('/api/v1/attendance/break/start')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          attendance_id: attendanceId,
          break_type: 'lunch'
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('LUNCH_BREAK_ALREADY_TAKEN');
      expect(response.body.error.message).toContain('점심휴게는 하루에 한 번만 가능합니다');
    });

    it('연속 휴게시간 제한 검증 (예: 최대 2시간)', async () => {
      // 2시간 전에 휴게시간 시작으로 DB 설정
      await pool.query(
        'UPDATE break_records SET break_start_time = DATE_SUB(NOW(), INTERVAL 2 HOUR 1 MINUTE) WHERE attendance_id = ?',
        [attendanceId]
      );

      // 2시간 초과된 휴게시간 종료 시도
      const breakStartRes = await request(app)
        .post('/api/v1/attendance/break/start')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          attendance_id: attendanceId,
          break_type: 'lunch'
        });

      const breakRecordId = breakStartRes.body.data.break_record_id;

      // 장시간 후 종료 시도 (실제로는 DB 직접 조작)
      const response = await request(app)
        .post('/api/v1/attendance/break/end')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ break_record_id: breakRecordId });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('BREAK_DURATION_EXCEEDED');
      expect(response.body.error.message).toContain('연속 휴게시간이 제한을 초과했습니다');
    });
  });

  describe('휴게시간 통계 조회', () => {
    it('일일 총 휴게시간 조회', async () => {
      // 여러 휴게 기록 추가
      await pool.query(
        `INSERT INTO break_records (attendance_id, break_type, break_start_time, break_end_time, break_duration_minutes)
         VALUES
         (?, 'lunch', DATE_SUB(NOW(), INTERVAL 4 HOUR), DATE_SUB(NOW(), INTERVAL 3 HOUR), 60),
         (?, 'coffee', DATE_SUB(NOW(), INTERVAL 2 HOUR), DATE_SUB(NOW(), INTERVAL 1 HOUR 45 MINUTE), 15)`,
        [attendanceId, attendanceId]
      );

      const response = await request(app)
        .get(`/api/v1/attendance/${attendanceId}/break-summary`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('total_break_minutes');
      expect(response.body.data).toHaveProperty('break_count');
      expect(response.body.data).toHaveProperty('break_records');
      expect(response.body.data.total_break_minutes).toBe(75); // 60 + 15분
      expect(response.body.data.break_count).toBe(2);
    });
  });

  describe('인증 및 권한 검증', () => {
    it('인증 토큰 없이 휴게시간 시작 시 401 에러', async () => {
      const response = await request(app)
        .post('/api/v1/attendance/break/start')
        .send({
          attendance_id: attendanceId,
          break_type: 'lunch'
        });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });

    it('인증 토큰 없이 휴게시간 종료 시 401 에러', async () => {
      const response = await request(app)
        .post('/api/v1/attendance/break/end')
        .send({ break_record_id: 1 });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  afterAll(async () => {
    // 테스트 데이터 정리
    if (userId) {
      await pool.query('DELETE FROM break_records WHERE attendance_id IN (SELECT id FROM attendance WHERE user_id = ?)', [userId]);
      await pool.query('DELETE FROM attendance WHERE user_id = ?', [userId]);
      await pool.query('DELETE FROM work_locations WHERE business_id = ?', [businessId]);
      await pool.query('DELETE FROM businesses WHERE id = ?', [businessId]);
      await pool.query('DELETE FROM users WHERE email LIKE "%break%"');
    }
    await pool.end();
  });
});