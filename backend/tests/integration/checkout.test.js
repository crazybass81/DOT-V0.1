/**
 * T138-T139: 체크아웃 및 근무 시간 계산 통합 테스트
 * 실제 PostgreSQL 사용 (Mock 없음)
 */

const request = require('supertest');
const app = require('../../src/app');
const { pool } = require('../../src/config/database');
const { generateToken } = require('../../src/lib/auth-lib/token');
const { hashPassword } = require('../../src/lib/auth-lib/password');

describe('체크아웃 API 통합 테스트', () => {
  let testUser;
  let testBusiness;
  let authToken;
  let attendanceId;

  beforeAll(async () => {
    // 테스트 데이터베이스 초기화
    await pool.query('DELETE FROM attendance_breaks WHERE true');
    await pool.query('DELETE FROM attendance_logs WHERE true');
    await pool.query('DELETE FROM attendance WHERE true');
    await pool.query('DELETE FROM user_roles WHERE true');
    await pool.query('DELETE FROM users WHERE email LIKE $1', ['%@test.com']);
    await pool.query('DELETE FROM businesses WHERE name LIKE $1', ['%테스트%']);

    // 필요한 테이블이 없으면 생성
    await pool.query(`
      CREATE TABLE IF NOT EXISTS attendance_breaks (
        id SERIAL PRIMARY KEY,
        attendance_id INTEGER REFERENCES attendance(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        start_time TIMESTAMP NOT NULL,
        end_time TIMESTAMP,
        break_type VARCHAR(20) DEFAULT 'normal',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `).catch(() => {});
  });

  beforeEach(async () => {
    // 테스트용 사업장 생성
    const businessResult = await pool.query(
      `INSERT INTO businesses (name, address, gps_location, gps_radius)
       VALUES ($1, $2, ST_GeogFromText($3), $4)
       RETURNING *`,
      [
        '테스트 카페',
        '서울시 강남구',
        'POINT(127.0276 37.4979)',
        50
      ]
    );
    testBusiness = businessResult.rows[0];

    // 테스트용 사용자 생성
    const hashedPassword = await hashPassword('password123');
    const userResult = await pool.query(
      `INSERT INTO users (email, password_hash, name, phone, status)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      ['employee@test.com', hashedPassword, '테스트직원', '01012345678', 'active']
    );
    testUser = userResult.rows[0];

    // 사용자 역할 할당
    await pool.query(
      `INSERT INTO user_roles (user_id, business_id, role_type, is_active)
       VALUES ($1, $2, $3, $4)`,
      [testUser.id, testBusiness.id, 'employee', true]
    );

    // JWT 토큰 생성
    authToken = generateToken({
      userId: testUser.id,
      email: testUser.email,
      type: 'access'
    });

    // 테스트용 체크인 생성
    const today = new Date().toISOString().split('T')[0];
    const checkInResult = await pool.query(
      `INSERT INTO attendance (
        user_id, business_id, date, check_in_time,
        check_in_location, check_in_method, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id`,
      [
        testUser.id,
        testBusiness.id,
        today,
        new Date(),
        { type: 'Point', coordinates: [127.0276, 37.4979] },
        'gps',
        'checked_in'
      ]
    );
    attendanceId = checkInResult.rows[0].id;
  });

  afterEach(async () => {
    // 테스트 데이터 정리
    await pool.query('DELETE FROM attendance_breaks WHERE attendance_id = $1', [attendanceId]);
    await pool.query('DELETE FROM attendance_logs WHERE user_id = $1', [testUser.id]);
    await pool.query('DELETE FROM attendance WHERE business_id = $1', [testBusiness.id]);
    await pool.query('DELETE FROM user_roles WHERE business_id = $1', [testBusiness.id]);
    await pool.query('DELETE FROM users WHERE id = $1', [testUser.id]);
    await pool.query('DELETE FROM businesses WHERE id = $1', [testBusiness.id]);
  });

  afterAll(async () => {
    await pool.end();
  });

  describe('T138: POST /api/v1/attendance/checkout', () => {
    test('정상적인 체크아웃', async () => {
      const response = await request(app)
        .post('/api/v1/attendance/checkout')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          businessId: testBusiness.id
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.attendanceId).toBe(attendanceId);
      expect(response.body.data.checkOutTime).toBeDefined();
      expect(response.body.data.workDuration).toBeDefined();
      expect(response.body.data.status).toBe('checked_out');

      // DB 확인
      const result = await pool.query(
        'SELECT * FROM attendance WHERE id = $1',
        [attendanceId]
      );
      expect(result.rows[0].check_out_time).not.toBeNull();
      expect(result.rows[0].status).toBe('checked_out');
    });

    test('위치 정보와 함께 체크아웃', async () => {
      const response = await request(app)
        .post('/api/v1/attendance/checkout')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          businessId: testBusiness.id,
          location: {
            latitude: 37.4979,
            longitude: 127.0276
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      // DB에서 위치 정보 확인
      const result = await pool.query(
        'SELECT check_out_location FROM attendance WHERE id = $1',
        [attendanceId]
      );
      expect(result.rows[0].check_out_location).not.toBeNull();
    });

    test('체크인 없이 체크아웃 시도', async () => {
      // 기존 attendance 삭제
      await pool.query('DELETE FROM attendance WHERE id = $1', [attendanceId]);

      const response = await request(app)
        .post('/api/v1/attendance/checkout')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          businessId: testBusiness.id
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('NO_ACTIVE_CHECK_IN');
    });

    test('이미 체크아웃한 경우', async () => {
      // 첫 번째 체크아웃
      await request(app)
        .post('/api/v1/attendance/checkout')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          businessId: testBusiness.id
        });

      // 두 번째 체크아웃 시도
      const response = await request(app)
        .post('/api/v1/attendance/checkout')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          businessId: testBusiness.id
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('NO_ACTIVE_CHECK_IN');
    });

    test('진행중인 휴게가 있을 때 체크아웃', async () => {
      // 휴게 시작
      await pool.query(
        `INSERT INTO attendance_breaks (
          attendance_id, user_id, start_time, break_type
        ) VALUES ($1, $2, $3, $4)`,
        [attendanceId, testUser.id, new Date(), 'normal']
      );

      const response = await request(app)
        .post('/api/v1/attendance/checkout')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          businessId: testBusiness.id
        });

      expect(response.status).toBe(200);

      // 휴게가 종료되었는지 확인
      const breakResult = await pool.query(
        'SELECT end_time FROM attendance_breaks WHERE attendance_id = $1',
        [attendanceId]
      );
      expect(breakResult.rows[0].end_time).not.toBeNull();
    });
  });

  describe('T139: 근무 시간 계산', () => {
    test('휴게 시간이 없는 경우 근무 시간 계산', async () => {
      // 3시간 전 체크인으로 수정
      const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000);
      await pool.query(
        'UPDATE attendance SET check_in_time = $1 WHERE id = $2',
        [threeHoursAgo, attendanceId]
      );

      const response = await request(app)
        .post('/api/v1/attendance/checkout')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          businessId: testBusiness.id
        });

      expect(response.status).toBe(200);
      const { workDuration } = response.body.data;
      expect(workDuration.totalMinutes).toBeCloseTo(180, -1); // 약 180분
      expect(workDuration.breakMinutes).toBe(0);
      expect(workDuration.actualWorkMinutes).toBeCloseTo(180, -1);
      expect(workDuration.hours).toBe(3);
    });

    test('휴게 시간이 있는 경우 근무 시간 계산', async () => {
      // 4시간 전 체크인
      const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000);
      await pool.query(
        'UPDATE attendance SET check_in_time = $1 WHERE id = $2',
        [fourHoursAgo, attendanceId]
      );

      // 30분 휴게 기록 추가 (2시간 전에 시작, 1시간 30분 전에 종료)
      const breakStart = new Date(Date.now() - 2 * 60 * 60 * 1000);
      const breakEnd = new Date(Date.now() - 1.5 * 60 * 60 * 1000);
      await pool.query(
        `INSERT INTO attendance_breaks (
          attendance_id, user_id, start_time, end_time, break_type
        ) VALUES ($1, $2, $3, $4, $5)`,
        [attendanceId, testUser.id, breakStart, breakEnd, 'normal']
      );

      const response = await request(app)
        .post('/api/v1/attendance/checkout')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          businessId: testBusiness.id
        });

      expect(response.status).toBe(200);
      const { workDuration } = response.body.data;
      expect(workDuration.totalMinutes).toBeCloseTo(240, -1); // 총 240분
      expect(workDuration.breakMinutes).toBeCloseTo(30, -1); // 휴게 30분
      expect(workDuration.actualWorkMinutes).toBeCloseTo(210, -1); // 실제 210분
    });

    test('여러 휴게 시간 계산', async () => {
      // 5시간 전 체크인
      const fiveHoursAgo = new Date(Date.now() - 5 * 60 * 60 * 1000);
      await pool.query(
        'UPDATE attendance SET check_in_time = $1 WHERE id = $2',
        [fiveHoursAgo, attendanceId]
      );

      // 첫 번째 휴게: 30분
      await pool.query(
        `INSERT INTO attendance_breaks (
          attendance_id, user_id, start_time, end_time, break_type
        ) VALUES ($1, $2, $3, $4, $5)`,
        [
          attendanceId,
          testUser.id,
          new Date(Date.now() - 4 * 60 * 60 * 1000),
          new Date(Date.now() - 3.5 * 60 * 60 * 1000),
          'normal'
        ]
      );

      // 두 번째 휴게: 60분 (식사)
      await pool.query(
        `INSERT INTO attendance_breaks (
          attendance_id, user_id, start_time, end_time, break_type
        ) VALUES ($1, $2, $3, $4, $5)`,
        [
          attendanceId,
          testUser.id,
          new Date(Date.now() - 2.5 * 60 * 60 * 1000),
          new Date(Date.now() - 1.5 * 60 * 60 * 1000),
          'meal'
        ]
      );

      const response = await request(app)
        .post('/api/v1/attendance/checkout')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          businessId: testBusiness.id
        });

      expect(response.status).toBe(200);
      const { workDuration } = response.body.data;
      expect(workDuration.totalMinutes).toBeCloseTo(300, -1); // 총 300분
      expect(workDuration.breakMinutes).toBeCloseTo(90, -1); // 휴게 90분
      expect(workDuration.actualWorkMinutes).toBeCloseTo(210, -1); // 실제 210분
    });
  });

  describe('휴게 시간 관리', () => {
    test('휴게 시작', async () => {
      const response = await request(app)
        .post('/api/v1/attendance/break/start')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          businessId: testBusiness.id,
          attendanceId: attendanceId,
          breakType: 'normal'
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.breakId).toBeDefined();
      expect(response.body.data.breakType).toBe('normal');

      // 상태 확인
      const result = await pool.query(
        'SELECT status FROM attendance WHERE id = $1',
        [attendanceId]
      );
      expect(result.rows[0].status).toBe('on_break');
    });

    test('중복 휴게 시작 방지', async () => {
      // 첫 번째 휴게 시작
      await request(app)
        .post('/api/v1/attendance/break/start')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          businessId: testBusiness.id,
          attendanceId: attendanceId
        });

      // 두 번째 휴게 시작 시도
      const response = await request(app)
        .post('/api/v1/attendance/break/start')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          businessId: testBusiness.id,
          attendanceId: attendanceId
        });

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('ALREADY_ON_BREAK');
    });

    test('휴게 종료', async () => {
      // 휴게 시작
      const startResponse = await request(app)
        .post('/api/v1/attendance/break/start')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          businessId: testBusiness.id,
          attendanceId: attendanceId
        });

      const breakId = startResponse.body.data.breakId;

      // 휴게 종료
      const response = await request(app)
        .post('/api/v1/attendance/break/end')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          businessId: testBusiness.id,
          attendanceId: attendanceId,
          breakId: breakId
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.durationMinutes).toBeDefined();

      // 상태 확인
      const result = await pool.query(
        'SELECT status FROM attendance WHERE id = $1',
        [attendanceId]
      );
      expect(result.rows[0].status).toBe('checked_in');
    });
  });

  describe('오늘의 근무 요약', () => {
    test('GET /api/v1/attendance/today-summary', async () => {
      // 휴게 기록 추가
      await pool.query(
        `INSERT INTO attendance_breaks (
          attendance_id, user_id, start_time, end_time, break_type
        ) VALUES ($1, $2, $3, $4, $5)`,
        [
          attendanceId,
          testUser.id,
          new Date(Date.now() - 60 * 60 * 1000),
          new Date(Date.now() - 30 * 60 * 1000),
          'normal'
        ]
      );

      const response = await request(app)
        .get('/api/v1/attendance/today-summary')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ businessId: testBusiness.id });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.hasCheckIn).toBe(true);
      expect(response.body.data.attendanceId).toBe(attendanceId);
      expect(response.body.data.breaks).toHaveLength(1);
      expect(response.body.data.breaks[0].duration_minutes).toBeCloseTo(30, -1);
    });

    test('체크인 없을 때 요약', async () => {
      // attendance 삭제
      await pool.query('DELETE FROM attendance WHERE id = $1', [attendanceId]);

      const response = await request(app)
        .get('/api/v1/attendance/today-summary')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ businessId: testBusiness.id });

      expect(response.status).toBe(200);
      expect(response.body.data.hasCheckIn).toBe(false);
      expect(response.body.data.message).toBe('오늘 출근 기록이 없습니다.');
    });
  });

  describe('근무 시간 계산 API', () => {
    test('GET /api/v1/attendance/work-duration/:attendanceId', async () => {
      // 체크아웃 처리
      await pool.query(
        `UPDATE attendance
         SET check_out_time = $1, status = 'checked_out'
         WHERE id = $2`,
        [new Date(), attendanceId]
      );

      const response = await request(app)
        .get(`/api/v1/attendance/work-duration/${attendanceId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.totalMinutes).toBeDefined();
      expect(response.body.data.actualWorkMinutes).toBeDefined();
    });

    test('체크아웃 전 근무 시간 조회', async () => {
      const response = await request(app)
        .get(`/api/v1/attendance/work-duration/${attendanceId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.message).toBe('아직 체크아웃하지 않았습니다.');
    });

    test('다른 사용자의 근무 시간 조회 불가', async () => {
      // 다른 사용자 생성
      const hashedPassword = await hashPassword('password123');
      const otherUserResult = await pool.query(
        `INSERT INTO users (email, password_hash, name, phone, status)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        ['other@test.com', hashedPassword, '다른직원', '01098765432', 'active']
      );
      const otherUser = otherUserResult.rows[0];

      const otherToken = generateToken({
        userId: otherUser.id,
        email: otherUser.email,
        type: 'access'
      });

      const response = await request(app)
        .get(`/api/v1/attendance/work-duration/${attendanceId}`)
        .set('Authorization', `Bearer ${otherToken}`);

      expect(response.status).toBe(404);

      // 정리
      await pool.query('DELETE FROM users WHERE id = $1', [otherUser.id]);
    });
  });
});