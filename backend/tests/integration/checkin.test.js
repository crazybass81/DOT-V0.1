/**
 * T133-T134: GPS 및 QR 체크인 통합 테스트
 * 실제 PostgreSQL과 PostGIS 사용 (Mock 없음)
 */

const request = require('supertest');
const app = require('../../src/app');
const { pool } = require('../../src/config/database');
const { generateToken } = require('../../src/lib/auth-lib/token');
const { generateQRCode } = require('../../src/lib/attendance-lib/qr');
const { hashPassword } = require('../../src/lib/auth-lib/password');

describe('체크인 API 통합 테스트', () => {
  let testUser;
  let testBusiness;
  let authToken;

  beforeAll(async () => {
    // 테스트 데이터베이스 초기화
    await pool.query('DELETE FROM attendance_logs WHERE true');
    await pool.query('DELETE FROM attendance WHERE true');
    await pool.query('DELETE FROM user_roles WHERE true');
    await pool.query('DELETE FROM users WHERE email LIKE $1', ['%@test.com']);
    await pool.query('DELETE FROM businesses WHERE name LIKE $1', ['%테스트%']);

    // attendance_logs 테이블이 없으면 생성
    await pool.query(`
      CREATE TABLE IF NOT EXISTS attendance_logs (
        id SERIAL PRIMARY KEY,
        attendance_id INTEGER REFERENCES attendance(id) ON DELETE SET NULL,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        action VARCHAR(50) NOT NULL,
        details JSONB,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `).catch(() => {}); // 이미 있으면 무시
  });

  beforeEach(async () => {
    // 테스트용 사업장 생성 (GPS 위치 포함)
    const businessResult = await pool.query(
      `INSERT INTO businesses (name, address, gps_location, gps_radius)
       VALUES ($1, $2, ST_GeogFromText($3), $4)
       RETURNING *`,
      [
        '테스트 카페',
        '서울시 강남구 테헤란로',
        'POINT(127.0276 37.4979)', // 경도 위도
        50 // 50m 반경
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
  });

  afterEach(async () => {
    // 테스트 데이터 정리
    await pool.query('DELETE FROM attendance_logs WHERE user_id = $1', [testUser.id]);
    await pool.query('DELETE FROM attendance WHERE business_id = $1', [testBusiness.id]);
    await pool.query('DELETE FROM user_roles WHERE business_id = $1', [testBusiness.id]);
    await pool.query('DELETE FROM users WHERE id = $1', [testUser.id]);
    await pool.query('DELETE FROM businesses WHERE id = $1', [testBusiness.id]);
  });

  afterAll(async () => {
    await pool.end();
  });

  describe('POST /api/v1/attendance/checkin', () => {
    describe('기본 검증', () => {
      test('인증 없이 요청 시 401 응답', async () => {
        const response = await request(app)
          .post('/api/v1/attendance/checkin')
          .send({
            businessId: testBusiness.id,
            method: 'gps',
            location: { latitude: 37.4979, longitude: 127.0276 }
          });

        expect(response.status).toBe(401);
        expect(response.body.success).toBe(false);
      });

      test('필수 파라미터 누락 시 400 응답', async () => {
        const response = await request(app)
          .post('/api/v1/attendance/checkin')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            method: 'gps'
            // businessId 누락
          });

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('businessId is required');
      });

      test('잘못된 method 값 시 400 응답', async () => {
        const response = await request(app)
          .post('/api/v1/attendance/checkin')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            businessId: testBusiness.id,
            method: 'invalid'
          });

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('method must be either "gps" or "qr"');
      });
    });

    describe('T133: GPS 체크인', () => {
      test('GPS 범위 내에서 체크인 성공', async () => {
        const response = await request(app)
          .post('/api/v1/attendance/checkin')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            businessId: testBusiness.id,
            method: 'gps',
            location: {
              latitude: 37.4979, // 정확한 위치
              longitude: 127.0276
            }
          });

        expect(response.status).toBe(201);
        expect(response.body.success).toBe(true);
        expect(response.body.data.attendanceId).toBeDefined();
        expect(response.body.data.method).toBe('gps');
        expect(response.body.data.status).toBe('checked_in');

        // DB 확인
        const result = await pool.query(
          'SELECT * FROM attendance WHERE user_id = $1 AND business_id = $2',
          [testUser.id, testBusiness.id]
        );
        expect(result.rows.length).toBe(1);
        expect(result.rows[0].check_in_method).toBe('gps');
      });

      test('GPS 범위 밖에서 체크인 실패', async () => {
        const response = await request(app)
          .post('/api/v1/attendance/checkin')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            businessId: testBusiness.id,
            method: 'gps',
            location: {
              latitude: 37.5000, // 범위 밖 (약 200m 떨어짐)
              longitude: 127.0300
            }
          });

        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
        expect(response.body.error).toContain('허용 범위');
        expect(response.body.code).toBe('VALIDATION_FAILED');
      });

      test('GPS location 없이 요청 시 400 응답', async () => {
        const response = await request(app)
          .post('/api/v1/attendance/checkin')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            businessId: testBusiness.id,
            method: 'gps'
            // location 누락
          });

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('location is required for GPS check-in');
      });

      test('잘못된 GPS 좌표 형식', async () => {
        const response = await request(app)
          .post('/api/v1/attendance/checkin')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            businessId: testBusiness.id,
            method: 'gps',
            location: {
              latitude: 'invalid',
              longitude: 127.0276
            }
          });

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('location must have numeric latitude and longitude');
      });

      test('GPS 좌표 범위 검증 (위도 -90 ~ 90)', async () => {
        const response = await request(app)
          .post('/api/v1/attendance/checkin')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            businessId: testBusiness.id,
            method: 'gps',
            location: {
              latitude: 100, // 범위 초과
              longitude: 127.0276
            }
          });

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('latitude must be between -90 and 90');
      });
    });

    describe('T134: QR 체크인', () => {
      test('유효한 QR 코드로 체크인 성공', async () => {
        // QR 코드 생성
        const qrToken = await generateQRCode(testBusiness.id);

        const response = await request(app)
          .post('/api/v1/attendance/checkin')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            businessId: testBusiness.id,
            method: 'qr',
            qrToken: qrToken
          });

        expect(response.status).toBe(201);
        expect(response.body.success).toBe(true);
        expect(response.body.data.method).toBe('qr');
        expect(response.body.data.status).toBe('checked_in');

        // 로그 확인
        const logResult = await pool.query(
          'SELECT * FROM attendance_logs WHERE user_id = $1',
          [testUser.id]
        );
        expect(logResult.rows.length).toBe(1);
        expect(logResult.rows[0].action).toBe('check_in');
      });

      test('만료된 QR 코드로 체크인 실패', async () => {
        // 만료된 QR 토큰 생성 (31초 전)
        const expiredTimestamp = Date.now() - 31000;
        const expiredData = `${testBusiness.id}:${expiredTimestamp}`;
        const expiredToken = Buffer.from(expiredData).toString('base64') + ':invalidsignature';

        const response = await request(app)
          .post('/api/v1/attendance/checkin')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            businessId: testBusiness.id,
            method: 'qr',
            qrToken: expiredToken
          });

        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
        expect(response.body.error).toContain('유효하지 않거나 만료');
      });

      test('잘못된 QR 토큰 형식', async () => {
        const response = await request(app)
          .post('/api/v1/attendance/checkin')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            businessId: testBusiness.id,
            method: 'qr',
            qrToken: 'invalid'
          });

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Invalid QR token format');
      });

      test('QR 방식에서 qrToken 누락', async () => {
        const response = await request(app)
          .post('/api/v1/attendance/checkin')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            businessId: testBusiness.id,
            method: 'qr'
            // qrToken 누락
          });

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('qrToken is required for QR check-in');
      });
    });

    describe('중복 체크인 방지', () => {
      test('이미 체크인한 경우 409 응답', async () => {
        // 첫 번째 체크인
        await request(app)
          .post('/api/v1/attendance/checkin')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            businessId: testBusiness.id,
            method: 'gps',
            location: { latitude: 37.4979, longitude: 127.0276 }
          });

        // 두 번째 체크인 시도
        const response = await request(app)
          .post('/api/v1/attendance/checkin')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            businessId: testBusiness.id,
            method: 'gps',
            location: { latitude: 37.4979, longitude: 127.0276 }
          });

        expect(response.status).toBe(409);
        expect(response.body.success).toBe(false);
        expect(response.body.code).toBe('ALREADY_CHECKED_IN');
      });

      test('이미 퇴근한 경우 체크인 불가', async () => {
        // 체크인 및 체크아웃 기록 생성
        const today = new Date().toISOString().split('T')[0];
        await pool.query(
          `INSERT INTO attendance (
            user_id, business_id, date, check_in_time, check_out_time,
            check_in_location, check_in_method, status
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            testUser.id,
            testBusiness.id,
            today,
            new Date(Date.now() - 3600000), // 1시간 전
            new Date(), // 지금
            { type: 'Point', coordinates: [127.0276, 37.4979] },
            'gps',
            'checked_out'
          ]
        );

        // 체크인 시도
        const response = await request(app)
          .post('/api/v1/attendance/checkin')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            businessId: testBusiness.id,
            method: 'gps',
            location: { latitude: 37.4979, longitude: 127.0276 }
          });

        expect(response.status).toBe(409);
        expect(response.body.code).toBe('ALREADY_CHECKED_OUT');
      });
    });
  });

  describe('POST /api/v1/attendance/checkin/validate', () => {
    test('체크인 가능 여부 확인 - 가능', async () => {
      const response = await request(app)
        .post('/api/v1/attendance/checkin/validate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          businessId: testBusiness.id,
          location: { latitude: 37.4979, longitude: 127.0276 }
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.canCheckIn).toBe(true);
      expect(response.body.data.currentStatus).toBe('not_checked_in');
    });

    test('체크인 가능 여부 확인 - 범위 밖', async () => {
      const response = await request(app)
        .post('/api/v1/attendance/checkin/validate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          businessId: testBusiness.id,
          location: { latitude: 37.5000, longitude: 127.0300 }
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.canCheckIn).toBe(false);
      expect(response.body.data.reason).toContain('허용 범위');
    });

    test('이미 체크인한 경우', async () => {
      // 먼저 체크인
      await request(app)
        .post('/api/v1/attendance/checkin')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          businessId: testBusiness.id,
          method: 'gps',
          location: { latitude: 37.4979, longitude: 127.0276 }
        });

      // 검증 요청
      const response = await request(app)
        .post('/api/v1/attendance/checkin/validate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          businessId: testBusiness.id
        });

      expect(response.status).toBe(200);
      expect(response.body.data.canCheckIn).toBe(false);
      expect(response.body.data.reason).toBe('이미 출근한 상태입니다.');
      expect(response.body.data.currentStatus).toBe('checked_in');
    });
  });

  describe('POST /api/v1/attendance/checkin/cancel', () => {
    test('5분 이내 체크인 취소 성공', async () => {
      // 체크인
      const checkInResponse = await request(app)
        .post('/api/v1/attendance/checkin')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          businessId: testBusiness.id,
          method: 'gps',
          location: { latitude: 37.4979, longitude: 127.0276 }
        });

      const attendanceId = checkInResponse.body.data.attendanceId;

      // 즉시 취소
      const response = await request(app)
        .post('/api/v1/attendance/checkin/cancel')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          businessId: testBusiness.id,
          attendanceId: attendanceId,
          reason: '실수로 체크인'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.message).toBe('체크인이 취소되었습니다.');

      // DB 확인 - 레코드 삭제됨
      const result = await pool.query(
        'SELECT * FROM attendance WHERE id = $1',
        [attendanceId]
      );
      expect(result.rows.length).toBe(0);

      // 로그 확인
      const logResult = await pool.query(
        'SELECT * FROM attendance_logs WHERE user_id = $1 AND action = $2',
        [testUser.id, 'check_in_cancelled']
      );
      expect(logResult.rows.length).toBe(1);
    });

    test('5분 초과 후 취소 실패', async () => {
      // 6분 전 체크인 기록 생성
      const sixMinutesAgo = new Date(Date.now() - 360000);
      const today = new Date().toISOString().split('T')[0];

      const insertResult = await pool.query(
        `INSERT INTO attendance (
          user_id, business_id, date, check_in_time,
          check_in_location, check_in_method, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id`,
        [
          testUser.id,
          testBusiness.id,
          today,
          sixMinutesAgo,
          { type: 'Point', coordinates: [127.0276, 37.4979] },
          'gps',
          'checked_in'
        ]
      );

      const attendanceId = insertResult.rows[0].id;

      // 취소 시도
      const response = await request(app)
        .post('/api/v1/attendance/checkin/cancel')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          businessId: testBusiness.id,
          attendanceId: attendanceId,
          reason: '늦은 취소'
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('CANCELLATION_TIME_EXPIRED');
    });

    test('다른 사용자의 체크인은 취소 불가', async () => {
      // 다른 사용자 생성
      const hashedPassword = await hashPassword('password123');
      const otherUserResult = await pool.query(
        `INSERT INTO users (email, password_hash, name, phone, status)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        ['other@test.com', hashedPassword, '다른직원', '01098765432', 'active']
      );
      const otherUser = otherUserResult.rows[0];

      await pool.query(
        `INSERT INTO user_roles (user_id, business_id, role_type, is_active)
         VALUES ($1, $2, $3, $4)`,
        [otherUser.id, testBusiness.id, 'employee', true]
      );

      // 다른 사용자가 체크인
      const today = new Date().toISOString().split('T')[0];
      const insertResult = await pool.query(
        `INSERT INTO attendance (
          user_id, business_id, date, check_in_time,
          check_in_location, check_in_method, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id`,
        [
          otherUser.id,
          testBusiness.id,
          today,
          new Date(),
          { type: 'Point', coordinates: [127.0276, 37.4979] },
          'gps',
          'checked_in'
        ]
      );

      const attendanceId = insertResult.rows[0].id;

      // 현재 사용자가 취소 시도
      const response = await request(app)
        .post('/api/v1/attendance/checkin/cancel')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          businessId: testBusiness.id,
          attendanceId: attendanceId,
          reason: '다른 사람 취소'
        });

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);

      // 정리
      await pool.query('DELETE FROM user_roles WHERE user_id = $1', [otherUser.id]);
      await pool.query('DELETE FROM users WHERE id = $1', [otherUser.id]);
    });
  });
});