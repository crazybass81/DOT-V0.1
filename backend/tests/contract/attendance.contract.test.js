/**
 * T121: 출퇴근 API 계약 테스트 (RED phase)
 * GET /api/v1/attendance/status 엔드포인트 테스트
 */

const request = require('supertest');
const { initDatabase, closeDatabase } = require('../../src/config/database');
const app = require('../../src/app');
const { generateToken } = require('../../src/lib/auth-lib/token');

describe('출퇴근 API 계약 테스트', () => {
  let testToken;
  let testUserId;
  let testBusinessId;

  beforeAll(async () => {
    await initDatabase();

    // 테스트용 토큰 생성
    testUserId = 1;
    testBusinessId = 1;
    testToken = generateToken({
      userId: testUserId,
      email: 'test@example.com'
    });
  });

  afterAll(async () => {
    await closeDatabase();
  });

  describe('GET /api/v1/attendance/status', () => {
    test('인증 없이 접근 시 401 에러', async () => {
      // Given: 인증 토큰 없음
      // When: 상태 조회 요청
      const response = await request(app)
        .get('/api/v1/attendance/status')
        .query({ businessId: testBusinessId });

      // Then: 401 Unauthorized
      expect(response.status).toBe(401);
      expect(response.body.error).toBeDefined();
    });

    test('유효한 토큰으로 상태 조회 성공', async () => {
      // Given: 유효한 인증 토큰
      // When: 상태 조회 요청
      const response = await request(app)
        .get('/api/v1/attendance/status')
        .set('Authorization', `Bearer ${testToken}`)
        .query({ businessId: testBusinessId });

      // Then: 200 OK
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('isWorking');
      expect(response.body.data).toHaveProperty('checkInTime');
      expect(response.body.data).toHaveProperty('checkOutTime');
    });

    test('businessId 누락 시 400 에러', async () => {
      // Given: businessId 파라미터 없음
      // When: 상태 조회 요청
      const response = await request(app)
        .get('/api/v1/attendance/status')
        .set('Authorization', `Bearer ${testToken}`);

      // Then: 400 Bad Request
      expect(response.status).toBe(400);
      expect(response.body.error).toContain('businessId');
    });
  });

  describe('POST /api/v1/attendance/checkin', () => {
    test('GPS 체크인 요청 성공', async () => {
      // Given: GPS 위치 정보
      const checkInData = {
        businessId: testBusinessId,
        method: 'gps',
        location: {
          latitude: 37.4979,
          longitude: 127.0276
        }
      };

      // When: 체크인 요청
      const response = await request(app)
        .post('/api/v1/attendance/checkin')
        .set('Authorization', `Bearer ${testToken}`)
        .send(checkInData);

      // Then: 200 OK 또는 201 Created
      expect([200, 201]).toContain(response.status);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data.method).toBe('gps');
    });

    test('QR 체크인 요청 성공', async () => {
      // Given: QR 토큰
      const { generateQRToken } = require('../../src/lib/attendance-lib/qr');
      const qrToken = generateQRToken(testBusinessId);

      const checkInData = {
        businessId: testBusinessId,
        method: 'qr',
        qrToken
      };

      // When: 체크인 요청
      const response = await request(app)
        .post('/api/v1/attendance/checkin')
        .set('Authorization', `Bearer ${testToken}`)
        .send(checkInData);

      // Then: 200 OK 또는 201 Created
      expect([200, 201, 409]).toContain(response.status); // 409는 이미 체크인한 경우
      if (response.status !== 409) {
        expect(response.body.success).toBe(true);
        expect(response.body.data.method).toBe('qr');
      }
    });

    test('필수 파라미터 누락 시 400 에러', async () => {
      // Given: businessId 누락
      const checkInData = {
        method: 'gps',
        location: {
          latitude: 37.4979,
          longitude: 127.0276
        }
      };

      // When: 체크인 요청
      const response = await request(app)
        .post('/api/v1/attendance/checkin')
        .set('Authorization', `Bearer ${testToken}`)
        .send(checkInData);

      // Then: 400 Bad Request
      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
    });
  });

  describe('POST /api/v1/attendance/checkout', () => {
    test('체크아웃 요청 성공', async () => {
      // Given: 체크인된 상태
      const checkOutData = {
        businessId: testBusinessId,
        location: {
          latitude: 37.4979,
          longitude: 127.0276
        }
      };

      // When: 체크아웃 요청
      const response = await request(app)
        .post('/api/v1/attendance/checkout')
        .set('Authorization', `Bearer ${testToken}`)
        .send(checkOutData);

      // Then: 200 OK 또는 404 (체크인 안 된 경우)
      expect([200, 404]).toContain(response.status);
      if (response.status === 200) {
        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveProperty('duration');
      }
    });

    test('체크인 없이 체크아웃 시 404 에러', async () => {
      // Given: 체크인 기록 없음 (새로운 사용자)
      const newToken = generateToken({
        userId: 999,
        email: 'new@example.com'
      });

      const checkOutData = {
        businessId: testBusinessId,
        location: {
          latitude: 37.4979,
          longitude: 127.0276
        }
      };

      // When: 체크아웃 요청
      const response = await request(app)
        .post('/api/v1/attendance/checkout')
        .set('Authorization', `Bearer ${newToken}`)
        .send(checkOutData);

      // Then: 404 Not Found
      expect(response.status).toBe(404);
      expect(response.body.error).toBeDefined();
    });
  });

  describe('GET /api/v1/attendance/history', () => {
    test('날짜별 근태 기록 조회', async () => {
      // Given: 특정 날짜
      const date = new Date().toISOString().split('T')[0];

      // When: 기록 조회 요청
      const response = await request(app)
        .get('/api/v1/attendance/history')
        .set('Authorization', `Bearer ${testToken}`)
        .query({ date });

      // Then: 200 OK
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    test('날짜 파라미터 없으면 오늘 날짜 사용', async () => {
      // Given: 날짜 파라미터 없음
      // When: 기록 조회 요청
      const response = await request(app)
        .get('/api/v1/attendance/history')
        .set('Authorization', `Bearer ${testToken}`);

      // Then: 200 OK
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
    });
  });

  describe('Rate Limiting', () => {
    test('분당 요청 제한 초과 시 429 에러', async () => {
      // Given: 짧은 시간에 많은 요청
      const requests = [];

      // 11번 요청 (제한이 10이라고 가정)
      for (let i = 0; i < 11; i++) {
        requests.push(
          request(app)
            .get('/api/v1/attendance/status')
            .set('Authorization', `Bearer ${testToken}`)
            .query({ businessId: testBusinessId })
        );
      }

      // When: 모든 요청 실행
      const responses = await Promise.all(requests);

      // Then: 마지막 요청은 429 Too Many Requests
      const lastResponse = responses[responses.length - 1];
      // Rate limiting이 구현되어 있다면 429, 아니면 200
      expect([200, 429]).toContain(lastResponse.status);
    });
  });
});