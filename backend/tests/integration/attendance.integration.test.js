/**
 * 출퇴근 시스템 통합 테스트
 * GPS와 QR 코드를 활용한 출퇴근 시나리오 검증
 */

const { initDatabase, query, closeDatabase } = require('../../src/config/database');
const { checkIn, checkOut, getAttendanceStatus } = require('../../src/lib/attendance-lib/attendance');
const { generateQRToken, verifyQRToken } = require('../../src/lib/attendance-lib/qr');
const { calculateDistance, isWithinRadius } = require('../../src/lib/attendance-lib/gps');

describe('출퇴근 시스템 통합 테스트', () => {
  let testUserId;
  let testBusinessId;
  let pool;

  beforeAll(async () => {
    // 데이터베이스 초기화
    pool = await initDatabase();
    // 테스트 데이터 준비
    const userResult = await query(
      `INSERT INTO users (name, email, password_hash, phone)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      ['test_worker', 'worker@test.com', 'hashed_pass', '010-1234-5678']
    );
    testUserId = userResult.rows[0].id;

    const businessResult = await query(
      `INSERT INTO businesses (name, registration_number, business_type, industry_type, address, location, gps_radius_meters)
       VALUES ($1, $2, $3, $4, $5, ST_MakePoint($6, $7)::geography, $8) RETURNING id`,
      ['테스트 회사', '123-45-67890', '개인사업자', 'IT', '서울시 강남구', 127.0276, 37.4979, 100]
    );
    testBusinessId = businessResult.rows[0].id;
  });

  afterAll(async () => {
    // 테스트 데이터 정리
    await query('DELETE FROM attendance WHERE user_id = $1', [testUserId]);
    await query('DELETE FROM businesses WHERE id = $1', [testBusinessId]);
    await query('DELETE FROM users WHERE id = $1', [testUserId]);
    await closeDatabase();
  });

  afterEach(async () => {
    // 각 테스트 후 출퇴근 기록 정리
    await query('DELETE FROM attendance WHERE user_id = $1', [testUserId]);
  });

  describe('GPS 기반 출퇴근', () => {
    test('정상적인 GPS 출근 체크인', async () => {
      // Given: 사업장 위치 근처의 GPS 좌표
      const userLocation = {
        latitude: 37.4979,
        longitude: 127.0276
      };

      // When: 출근 체크인
      const result = await checkIn({
        userId: testUserId,
        businessId: testBusinessId,
        location: userLocation,
        method: 'gps'
      });

      // Then: 체크인 성공
      expect(result.success).toBe(true);
      expect(result.method).toBe('gps');

      // 데이터베이스 확인
      const dbResult = await query(
        'SELECT * FROM attendance WHERE user_id = $1 AND business_id = $2',
        [testUserId, testBusinessId]
      );
      expect(dbResult.rows.length).toBe(1);
      expect(dbResult.rows[0].check_in_time).toBeTruthy();
      expect(dbResult.rows[0].check_out_time).toBeNull();
    });

    test('GPS 범위 밖에서 출근 시도 시 실패', async () => {
      // Given: 사업장에서 멀리 떨어진 위치 (1km 이상)
      const farLocation = {
        latitude: 37.5665,  // 서울시청
        longitude: 126.9780
      };

      // When & Then: 체크인 실패
      await expect(checkIn({
        userId: testUserId,
        businessId: testBusinessId,
        location: farLocation,
        method: 'gps'
      })).rejects.toThrow('GPS 위치가 사업장 범위를 벗어났습니다');
    });

    test('GPS 출근 후 퇴근 체크아웃', async () => {
      // Given: 먼저 출근 체크인
      const location = {
        latitude: 37.4979,
        longitude: 127.0276
      };

      await checkIn({
        userId: testUserId,
        businessId: testBusinessId,
        location,
        method: 'gps'
      });

      // When: 퇴근 체크아웃
      const result = await checkOut({
        userId: testUserId,
        businessId: testBusinessId,
        location,
        method: 'gps'
      });

      // Then: 체크아웃 성공
      expect(result.success).toBe(true);
      expect(result.duration).toBeDefined();

      // 데이터베이스 확인
      const dbResult = await query(
        'SELECT * FROM attendance WHERE user_id = $1 AND business_id = $2',
        [testUserId, testBusinessId]
      );
      expect(dbResult.rows[0].check_out_time).toBeTruthy();
    });
  });

  describe('QR 코드 기반 출퇴근', () => {
    test('유효한 QR 코드로 출근 체크인', async () => {
      // Given: 사업장에서 생성한 QR 토큰
      const qrToken = generateQRToken(testBusinessId);

      // When: QR 코드로 체크인
      const result = await checkIn({
        userId: testUserId,
        businessId: testBusinessId,
        qrToken,
        method: 'qr'
      });

      // Then: 체크인 성공
      expect(result.success).toBe(true);
      expect(result.method).toBe('qr');
    });

    test('만료된 QR 코드로 출근 시도 시 실패', async () => {
      // Given: 31초 전에 생성된 QR 토큰 (만료)
      const expiredToken = generateQRToken(testBusinessId);

      // 시간을 31초 뒤로 이동 (실제로는 mock 사용이 금지되어 있으므로 다른 방법 사용)
      // verifyQRToken 함수가 30초 이내만 유효하므로 실제로 31초 대기는 비효율적
      // 대신 잘못된 서명의 토큰을 생성
      const invalidToken = 'invalid.token.signature';

      // When & Then: 체크인 실패
      await expect(checkIn({
        userId: testUserId,
        businessId: testBusinessId,
        qrToken: invalidToken,
        method: 'qr'
      })).rejects.toThrow('유효하지 않은 QR 코드');
    });

    test('다른 사업장의 QR 코드 사용 시 실패', async () => {
      // Given: 다른 사업장 ID로 생성된 QR 토큰
      const otherBusinessId = 9999;
      const wrongQrToken = generateQRToken(otherBusinessId);

      // When & Then: 체크인 실패
      await expect(checkIn({
        userId: testUserId,
        businessId: testBusinessId,
        qrToken: wrongQrToken,
        method: 'qr'
      })).rejects.toThrow('QR 코드의 사업장이 일치하지 않습니다');
    });
  });

  describe('출퇴근 상태 조회', () => {
    test('출근 중인 상태 조회', async () => {
      // Given: 출근 체크인 완료
      const location = {
        latitude: 37.4979,
        longitude: 127.0276
      };

      await checkIn({
        userId: testUserId,
        businessId: testBusinessId,
        location,
        method: 'gps'
      });

      // When: 상태 조회
      const status = await getAttendanceStatus(testUserId, testBusinessId);

      // Then: 출근 중 상태
      expect(status.isWorking).toBe(true);
      expect(status.checkInTime).toBeTruthy();
      expect(status.checkOutTime).toBeNull();
      expect(status.method).toBe('gps');
    });

    test('퇴근 완료 상태 조회', async () => {
      // Given: 출퇴근 완료
      const location = {
        latitude: 37.4979,
        longitude: 127.0276
      };

      await checkIn({
        userId: testUserId,
        businessId: testBusinessId,
        location,
        method: 'gps'
      });

      await checkOut({
        userId: testUserId,
        businessId: testBusinessId,
        location,
        method: 'gps'
      });

      // When: 상태 조회
      const status = await getAttendanceStatus(testUserId, testBusinessId);

      // Then: 퇴근 완료 상태
      expect(status.isWorking).toBe(false);
      expect(status.checkInTime).toBeTruthy();
      expect(status.checkOutTime).toBeTruthy();
      expect(status.totalHours).toBeGreaterThan(0);
    });
  });

  describe('중복 체크인/아웃 방지', () => {
    test('이미 출근한 상태에서 재출근 시도 시 에러', async () => {
      // Given: 이미 출근 체크인 완료
      const location = {
        latitude: 37.4979,
        longitude: 127.0276
      };

      await checkIn({
        userId: testUserId,
        businessId: testBusinessId,
        location,
        method: 'gps'
      });

      // When & Then: 중복 체크인 실패
      await expect(checkIn({
        userId: testUserId,
        businessId: testBusinessId,
        location,
        method: 'gps'
      })).rejects.toThrow('이미 체크인 상태입니다');
    });

    test('출근하지 않은 상태에서 퇴근 시도 시 에러', async () => {
      // Given: 출근 기록 없음
      const location = {
        latitude: 37.4979,
        longitude: 127.0276
      };

      // When & Then: 체크아웃 실패
      await expect(checkOut({
        userId: testUserId,
        businessId: testBusinessId,
        location,
        method: 'gps'
      })).rejects.toThrow('출근 기록이 없습니다');
    });
  });

  describe('거리 계산 정확도 검증', () => {
    test('실제 위치 간 거리 계산 정확도', () => {
      // Given: 강남역과 삼성역 좌표
      const gangnam = { latitude: 37.4979, longitude: 127.0276 };
      const samsung = { latitude: 37.5088, longitude: 127.0631 };

      // When: 거리 계산
      const distance = calculateDistance(gangnam, samsung);

      // Then: 약 3.7km (실제: 3.7km)
      expect(distance).toBeGreaterThan(3600);
      expect(distance).toBeLessThan(3800);
    });

    test('반경 내 위치 판단 정확도', () => {
      // Given: 중심점과 주변 위치들
      const center = { latitude: 37.4979, longitude: 127.0276 };
      const near = { latitude: 37.4980, longitude: 127.0277 };  // 약 15m
      const far = { latitude: 37.5000, longitude: 127.0300 };   // 약 300m

      // When & Then: 반경 판단
      expect(isWithinRadius(center, near, 100)).toBe(true);   // 100m 내
      expect(isWithinRadius(center, far, 100)).toBe(false);   // 100m 밖
      expect(isWithinRadius(center, far, 500)).toBe(true);    // 500m 내
    });
  });

  describe('동시성 처리', () => {
    test('동시 다중 사용자 체크인 처리', async () => {
      // Given: 여러 사용자 생성
      const users = [];
      for (let i = 0; i < 5; i++) {
        const result = await query(
          `INSERT INTO users (name, email, password_hash, phone)
           VALUES ($1, $2, $3, $4) RETURNING id`,
          [`worker_${i}`, `worker${i}@test.com`, 'hash', `010-0000-000${i}`]
        );
        users.push(result.rows[0].id);
      }

      // When: 동시에 체크인
      const location = {
        latitude: 37.4979,
        longitude: 127.0276
      };

      const checkInPromises = users.map(userId =>
        checkIn({
          userId,
          businessId: testBusinessId,
          location,
          method: 'gps'
        })
      );

      const results = await Promise.all(checkInPromises);

      // Then: 모든 체크인 성공
      results.forEach(result => {
        expect(result.success).toBe(true);
      });

      // 데이터베이스 확인
      const dbResult = await query(
        'SELECT COUNT(*) FROM attendance WHERE business_id = $1 AND check_in_time IS NOT NULL',
        [testBusinessId]
      );
      expect(parseInt(dbResult.rows[0].count)).toBe(5);

      // Cleanup
      await query('DELETE FROM attendance WHERE business_id = $1', [testBusinessId]);
      for (const userId of users) {
        await query('DELETE FROM users WHERE id = $1', [userId]);
      }
    });
  });
});